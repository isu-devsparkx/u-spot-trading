// ─── Phase 42: Auto-Adaptive Volatility ATR Sizing Unit Tests ───────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  classifyVolatilityRegime,
  getAdaptiveMultipliers,
  applyRoundNumberOffset,
  computeAdaptiveTargetPlan,
  generateAdaptiveVolatilityReport,
  REGIME_MULTIPLIERS,
} from '../services/adaptive-volatility.ts';

describe('Auto-Adaptive Volatility ATR Sizing Service (Phase 42)', () => {
  describe('1. Volatility Regime Classification & Multipliers', () => {
    it('classifies ATR percentages into correct volatility regimes', () => {
      assert.strictEqual(classifyVolatilityRegime(0.65), 'LOW');
      assert.strictEqual(classifyVolatilityRegime(1.0), 'NORMAL');
      assert.strictEqual(classifyVolatilityRegime(2.2), 'NORMAL');
      assert.strictEqual(classifyVolatilityRegime(3.5), 'HIGH');
      assert.strictEqual(classifyVolatilityRegime(5.0), 'HIGH');
      assert.strictEqual(classifyVolatilityRegime(7.8), 'EXTREME');
    });

    it('returns exact multipliers for each regime', () => {
      assert.strictEqual(getAdaptiveMultipliers('LOW').dcaStepMultiplier, 0.75);
      assert.strictEqual(getAdaptiveMultipliers('NORMAL').slBufferMultiplier, 1.50);
      assert.strictEqual(getAdaptiveMultipliers('HIGH').tpExpansionMultiplier, 1.25);
      assert.strictEqual(getAdaptiveMultipliers('EXTREME').slBufferMultiplier, 2.40);
    });

    it('applies anti-round-number offset when stop sits near round levels', () => {
      const nearRound = applyRoundNumberOffset(100.02);
      assert.ok(nearRound < 100.0);

      const unaffected = applyRoundNumberOffset(100.27);
      assert.strictEqual(unaffected, 100.27);
    });
  });

  describe('2. Adaptive Target Plan Computation & Hierarchy Invariants', () => {
    it('strictly satisfies spot hierarchy: SL < DCA2 < DCA1 < Entry < TP1 < TP2 < TP3', () => {
      const plan = computeAdaptiveTargetPlan({
        symbol: 'SOL/USDT',
        entryPrice: 150.0,
        atr: 4.5, // 3.0% ATR -> HIGH
        structuralPivotLow: 144.0,
      });

      assert.ok(plan.adaptiveSlPrice < plan.adaptiveDca2Price);
      assert.ok(plan.adaptiveDca2Price < plan.adaptiveDca1Price);
      assert.ok(plan.adaptiveDca1Price < plan.entryPrice);
      assert.ok(plan.entryPrice < plan.adaptiveTp1Price);
      assert.ok(plan.adaptiveTp1Price < plan.adaptiveTp2Price);
      assert.ok(plan.adaptiveTp2Price < plan.adaptiveTp3Price);
      assert.strictEqual(plan.regime, 'HIGH');
      assert.ok(plan.riskRewardRatio > 1.2);
    });

    it('widens DCA tranches and expands TP targets in EXTREME volatility', () => {
      const normalPlan = computeAdaptiveTargetPlan({
        symbol: 'BTC/USDT',
        entryPrice: 65000,
        atr: 1000,
        forcedRegime: 'NORMAL',
      });

      const extremePlan = computeAdaptiveTargetPlan({
        symbol: 'BTC/USDT',
        entryPrice: 65000,
        atr: 1000,
        forcedRegime: 'EXTREME',
      });

      // DCA2 should be deeper in extreme volatility
      assert.ok(extremePlan.adaptiveDca2Price < normalPlan.adaptiveDca2Price);
      // SL should be wider in extreme volatility
      assert.ok(extremePlan.adaptiveSlPrice < normalPlan.adaptiveSlPrice);
      // TP3 runner should be higher in extreme volatility
      assert.ok(extremePlan.adaptiveTp3Price > normalPlan.adaptiveTp3Price);
      assert.ok(extremePlan.warnings.length > 0);
    });

    it('tightens targets and front-runs TP1 in LOW volatility compression', () => {
      const lowPlan = computeAdaptiveTargetPlan({
        symbol: 'ETH/USDT',
        entryPrice: 2600,
        atr: 15, // ~0.57% ATR -> LOW
      });

      assert.strictEqual(lowPlan.regime, 'LOW');
      assert.strictEqual(lowPlan.multipliers.tpExpansionMultiplier, 0.85);
      // TP1 is closer to entry
      assert.ok(lowPlan.tp1DistancePercent < 2.0);
    });

    it('front-runs overhead resistance wall when in close proximity', () => {
      const plan = computeAdaptiveTargetPlan({
        symbol: 'BNB/USDT',
        entryPrice: 600,
        atr: 10,
        overheadResistance: 615,
      });

      // TP1 should be front-run below 615
      assert.ok(plan.adaptiveTp1Price <= 615 * 0.998);
    });
  });

  describe('3. Comparison Report Generation', () => {
    it('produces detailed comparison between baseline and adaptive targets', () => {
      const report = generateAdaptiveVolatilityReport('AVAX/USDT', 30.0, 1.2);

      assert.strictEqual(report.symbol, 'AVAX/USDT');
      assert.ok(report.plan);
      assert.ok(report.baselinePlan);
      assert.ok(typeof report.comparison.slExpansionDeltaPercent === 'number');
      assert.ok(typeof report.comparison.rrImprovement === 'number');
    });
  });
});
