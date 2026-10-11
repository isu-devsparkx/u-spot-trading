// ─── U-SPOT Phase 16: Strategy Research Lab Unit Tests ───────────────
// Spec Section 29 (Strategy Comparison), 36 (Strategy Parameter Tuning), 40 (Persistence)

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_STRATEGY_PARAMS,
  PRESET_TREND_FOLLOWER,
  PRESET_MOMENTUM_SCALPER,
  PRESET_CONSERVATIVE,
  PRESET_BREAKOUT_HUNTER,
  STRATEGY_PRESETS,
  validateStrategyParameters,
  runStrategyBacktest,
  compareStrategies,
  strategyParamsToVersionRecord,
  versionRecordToStrategyParams,
} from '../services/strategy-service.ts';
import { generateSyntheticOHLCV } from '../services/signal-engine.ts';
import type { StrategyResearchParameters } from '../../types/index.ts';

describe('Phase 16: Strategy Research Lab', () => {
  describe('Parameter Validation Engine', () => {
    it('validates default strategy parameters with zero errors', () => {
      const result = validateStrategyParameters(DEFAULT_STRATEGY_PARAMS);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('validates all built-in strategy presets successfully', () => {
      for (const preset of STRATEGY_PRESETS) {
        const result = validateStrategyParameters(preset);
        assert.strictEqual(result.valid, true, `Preset ${preset.name} should be valid`);
        assert.strictEqual(result.errors.length, 0, `Preset ${preset.name} should have 0 errors`);
      }
    });

    it('rejects invalid EMA relationships (fast >= slow)', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        ema: { fastPeriod: 50, slowPeriod: 20, trendPeriod: 200 },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Fast EMA period')));
    });

    it('rejects invalid RSI boundaries (oversold >= overbought)', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        rsi: { period: 14, overbought: 30, oversold: 70 },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('RSI oversold threshold')));
    });

    it('rejects take profit allocations that do not sum to 100%', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        takeProfit: {
          ...DEFAULT_STRATEGY_PARAMS.takeProfit,
          tp1Alloc: 30,
          tp2Alloc: 30,
          tp3Alloc: 30, // Sums to 90%
        },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Take profit allocations must sum to 100%')));
    });

    it('rejects non-increasing take profit R-multipliers', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        takeProfit: {
          ...DEFAULT_STRATEGY_PARAMS.takeProfit,
          tp1RMultiple: 2.5,
          tp2RMultiple: 2.0, // Decreasing
          tp3RMultiple: 3.5,
        },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Take profit R-multipliers must strictly increase')));
    });

    it('rejects DCA allocations that do not sum to 100% when enabled', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        dca: {
          ...DEFAULT_STRATEGY_PARAMS.dca,
          enabled: true,
          entryAlloc: 50,
          dca1Alloc: 30,
          dca2Alloc: 10, // Sums to 90%
        },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('DCA order allocations must sum to 100%')));
    });

    it('warns when scoring factor weights do not sum to 100%', () => {
      const unalignedWeights: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        weights: {
          trend: 25,
          momentum: 25,
          volume: 25,
          structure: 25,
          liquidity: 10,
          volatility: 10,
          regime: 5, // Sums to 125%
        },
      };
      const result = validateStrategyParameters(unalignedWeights);
      assert.strictEqual(result.valid, true); // Still valid with warning
      assert.ok(result.warnings.some((w) => w.includes('weights sum to 125%')));
    });
  });

  describe('Parameterized Backtesting Engine', () => {
    it('executes a simulation using custom strategy parameters without errors', () => {
      const candles = generateSyntheticOHLCV(150, 4, 150);
      const result = runStrategyBacktest(candles, PRESET_TREND_FOLLOWER, {
        symbol: 'SOL/USDT',
        timeframe: '15m',
        initialBalance: 300,
      });

      assert.ok(result);
      assert.strictEqual(result.initialBalance, 300);
      assert.strictEqual(typeof result.netProfitUsdt, 'number');
      assert.strictEqual(typeof result.totalReturnPercent, 'number');
      assert.ok(Array.isArray(result.trades));
      assert.ok(Array.isArray(result.equityCurve));
      assert.strictEqual(result.config.strategyVersion, PRESET_TREND_FOLLOWER.version);
    });
  });

  describe('Side-by-Side Strategy Comparison Engine', () => {
    it('evaluates two strategy versions on identical candles and computes comparative metrics', () => {
      const candles = generateSyntheticOHLCV(150, 5, 200);
      const comparison = compareStrategies(
        candles,
        DEFAULT_STRATEGY_PARAMS,
        PRESET_TREND_FOLLOWER,
        {
          symbol: 'SOL/USDT',
          timeframe: '15m',
          initialBalance: 300,
        }
      );

      assert.ok(comparison);
      assert.strictEqual(comparison.versionA.config.name, DEFAULT_STRATEGY_PARAMS.name);
      assert.strictEqual(comparison.versionB.config.name, PRESET_TREND_FOLLOWER.name);

      // Verify Metrics Structure
      assert.ok(comparison.metrics.length >= 8);
      const metricNames = comparison.metrics.map((m) => m.metric);
      assert.ok(metricNames.includes('netProfitUsdt'));
      assert.ok(metricNames.includes('winRate'));
      assert.ok(metricNames.includes('profitFactor'));
      assert.ok(metricNames.includes('maxDrawdown'));
      assert.ok(metricNames.includes('expectancyR'));

      // Verify Winner and Score Assignment
      assert.ok(['A', 'B', 'TIE'].includes(comparison.winner));
      assert.strictEqual(typeof comparison.scoreA, 'number');
      assert.strictEqual(typeof comparison.scoreB, 'number');

      // Verify Summary and Recommendations
      assert.ok(comparison.summary.length > 0);
      assert.ok(Array.isArray(comparison.recommendations));
    });
  });

  describe('Strategy Version Record Conversion', () => {
    it('accurately converts strategy parameters to database record format and back', () => {
      const record = strategyParamsToVersionRecord(PRESET_MOMENTUM_SCALPER, true);
      assert.strictEqual(record.version, PRESET_MOMENTUM_SCALPER.version);
      assert.strictEqual(record.isActive, true);
      assert.deepStrictEqual(record.weights, PRESET_MOMENTUM_SCALPER.weights);

      const reconstructed = versionRecordToStrategyParams(record);
      assert.strictEqual(reconstructed.name, PRESET_MOMENTUM_SCALPER.name);
      assert.strictEqual(reconstructed.version, PRESET_MOMENTUM_SCALPER.version);
      assert.deepStrictEqual(reconstructed.ema, PRESET_MOMENTUM_SCALPER.ema);
      assert.deepStrictEqual(reconstructed.rsi, PRESET_MOMENTUM_SCALPER.rsi);
      assert.deepStrictEqual(reconstructed.takeProfit, PRESET_MOMENTUM_SCALPER.takeProfit);
      assert.deepStrictEqual(reconstructed.dca, PRESET_MOMENTUM_SCALPER.dca);
    });
  });
});
