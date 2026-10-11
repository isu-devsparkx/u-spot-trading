// ─── U-SPOT Phase 27: Strategy Lab MTF Confluence & Optimization Tests ──
// Spec Section 29 (Strategy Comparison), 36 (Strategy Parameter Tuning), Phase 27 (MTF Confluence)

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_STRATEGY_PARAMS,
  PRESET_INSTITUTIONAL_CONFLUENCE,
  PRESET_MOMENTUM_SCALPER,
  STRATEGY_PRESETS,
  validateStrategyParameters,
  runStrategyBacktest,
  compareStrategies,
  strategyParamsToVersionRecord,
  versionRecordToStrategyParams,
} from '../services/strategy-service.ts';
import { generateSyntheticOHLCV } from '../services/signal-engine.ts';
import { runBacktest } from '../services/backtest-service.ts';
import type { StrategyResearchParameters } from '../../types/index.ts';

describe('Phase 27: Strategy Lab MTF Confluence & Comparative Optimization', () => {
  describe('MTF Confluence Parameter Validation', () => {
    it('validates PRESET_INSTITUTIONAL_CONFLUENCE successfully with 0 errors', () => {
      const result = validateStrategyParameters(PRESET_INSTITUTIONAL_CONFLUENCE);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(PRESET_INSTITUTIONAL_CONFLUENCE.mtf.enabled, true);
      assert.strictEqual(PRESET_INSTITUTIONAL_CONFLUENCE.mtf.blockCounterTrend, true);
    });

    it('rejects negative MTF bonus points', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        mtf: {
          enabled: true,
          blockCounterTrend: true,
          bonusPoints: -5,
        },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('bonus points')));
    });

    it('rejects excessive MTF bonus points (> 30)', () => {
      const invalid: StrategyResearchParameters = {
        ...DEFAULT_STRATEGY_PARAMS,
        mtf: {
          enabled: true,
          blockCounterTrend: true,
          bonusPoints: 35,
        },
      };
      const result = validateStrategyParameters(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('bonus points')));
    });

    it('all registered presets in STRATEGY_PRESETS include valid MTF parameters', () => {
      for (const preset of STRATEGY_PRESETS) {
        assert.ok(preset.mtf, `Preset ${preset.name} should include mtf config`);
        assert.strictEqual(typeof preset.mtf.enabled, 'boolean');
        assert.strictEqual(typeof preset.mtf.blockCounterTrend, 'boolean');
        assert.strictEqual(typeof preset.mtf.bonusPoints, 'number');
      }
    });
  });

  describe('Backtest Engine MTF Confluence Evaluation', () => {
    it('executes backtest with MTF confluence enabled without runtime error', () => {
      const candles = generateSyntheticOHLCV(150, 4, 150);
      const result = runBacktest(candles, {
        symbol: 'SOL/USDT',
        timeframe: '15m',
        barsCount: 150,
        initialWalletBalance: 300,
        mtfEnabled: true,
      });

      assert.ok(result);
      assert.strictEqual(typeof result.initialBalance, 'number');
      assert.strictEqual(typeof result.finalBalance, 'number');
      assert.ok(Array.isArray(result.trades));
      assert.ok(result.equityCurve.length > 0);
      assert.strictEqual(result.config.mtfEnabled, true);
    });

    it('executes backtest with MTF confluence disabled without runtime error', () => {
      const candles = generateSyntheticOHLCV(150, 4, 150);
      const result = runBacktest(candles, {
        symbol: 'SOL/USDT',
        timeframe: '15m',
        barsCount: 150,
        initialWalletBalance: 300,
        mtfEnabled: false,
      });

      assert.ok(result);
      assert.strictEqual(typeof result.initialBalance, 'number');
      assert.strictEqual(typeof result.finalBalance, 'number');
      assert.ok(Array.isArray(result.trades));
      assert.ok(result.equityCurve.length > 0);
      assert.strictEqual(result.config.mtfEnabled, false);
    });

    it('runs strategy backtest with PRESET_INSTITUTIONAL_CONFLUENCE', () => {
      const candles = generateSyntheticOHLCV(150, 4, 120);
      const result = runStrategyBacktest(candles, PRESET_INSTITUTIONAL_CONFLUENCE, {
        symbol: 'SOL/USDT',
        timeframe: '15m',
        initialBalance: 300,
      });

      assert.ok(result);
      assert.strictEqual(result.config.strategyVersion, PRESET_INSTITUTIONAL_CONFLUENCE.version);
      assert.strictEqual(result.config.mtfEnabled, true);
      assert.strictEqual(typeof result.stats.expectancy, 'number');
      assert.ok(Array.isArray(result.trades));
    });
  });

  describe('Side-by-Side Comparative Optimization with MTF Presets', () => {
    it('compares Institutional MTF preset against Momentum Scalper preset', () => {
      const candles = generateSyntheticOHLCV(150, 4, 150);
      const comparison = compareStrategies(
        candles,
        PRESET_INSTITUTIONAL_CONFLUENCE,
        PRESET_MOMENTUM_SCALPER,
        {
          symbol: 'SOL/USDT',
          timeframe: '15m',
          initialBalance: 300,
        }
      );

      assert.ok(comparison);
      assert.strictEqual(comparison.versionA.config.name, PRESET_INSTITUTIONAL_CONFLUENCE.name);
      assert.strictEqual(comparison.versionB.config.name, PRESET_MOMENTUM_SCALPER.name);
      assert.ok(['A', 'B', 'TIE'].includes(comparison.winner));
      assert.strictEqual(typeof comparison.scoreA, 'number');
      assert.strictEqual(typeof comparison.scoreB, 'number');
      assert.ok(comparison.metrics.length >= 8);
      assert.ok(comparison.recommendations.length > 0);
    });
  });

  describe('Database Record Serialization with MTF Parameters', () => {
    it('serializes and deserializes MTF parameters cleanly across version records', () => {
      const record = strategyParamsToVersionRecord(PRESET_INSTITUTIONAL_CONFLUENCE, true);
      assert.strictEqual(record.version, PRESET_INSTITUTIONAL_CONFLUENCE.version);
      assert.strictEqual(record.isActive, true);

      const reconstructed = versionRecordToStrategyParams(record);
      assert.strictEqual(reconstructed.name, PRESET_INSTITUTIONAL_CONFLUENCE.name);
      assert.strictEqual(reconstructed.version, PRESET_INSTITUTIONAL_CONFLUENCE.version);
      assert.ok(reconstructed.mtf);
      assert.strictEqual(reconstructed.mtf.enabled, true);
      assert.strictEqual(reconstructed.mtf.blockCounterTrend, true);
      assert.strictEqual(reconstructed.mtf.bonusPoints, PRESET_INSTITUTIONAL_CONFLUENCE.mtf.bonusPoints);
    });
  });
});
