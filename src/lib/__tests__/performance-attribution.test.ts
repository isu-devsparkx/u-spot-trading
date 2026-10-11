// ─── U-SPOT Phase 39: PnL Performance Attribution Tests ─────────────────
// Tests for 2D Setup Type × Macro Regime attribution matrix, edge classification,
// mathematical expectancy E(R), tactical recommendations, and marginal rollups.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ALL_SETUP_TYPES,
  ALL_MARKET_REGIMES,
  normalizeRegime,
  normalizeSetup,
  classifyAttributionEdge,
  getTacticalRecommendation,
  computePerformanceAttribution,
} from '../services/performance-attribution.ts';
import type { SignalHistoryRecord, SignalEvaluation } from '../../types/index.ts';

describe('Phase 39: PnL Performance Attribution Engine', () => {
  describe('1. Normalization Utilities', () => {
    it('normalizes various market regime strings correctly', () => {
      assert.strictEqual(normalizeRegime('BULL'), 'BULL');
      assert.strictEqual(normalizeRegime('bear'), 'BEAR');
      assert.strictEqual(normalizeRegime('RANGE'), 'NEUTRAL');
      assert.strictEqual(normalizeRegime('neutral'), 'NEUTRAL');
      assert.strictEqual(normalizeRegime('VOLATILE'), 'HIGH_VOLATILITY');
      assert.strictEqual(normalizeRegime('HIGH_VOLATILITY'), 'HIGH_VOLATILITY');
      assert.strictEqual(normalizeRegime('low_liquidity'), 'LOW_LIQUIDITY');
      assert.strictEqual(normalizeRegime(null), 'NEUTRAL');
      assert.strictEqual(normalizeRegime(undefined), 'NEUTRAL');
      assert.strictEqual(normalizeRegime('UNKNOWN_REGIME'), 'NEUTRAL');
    });

    it('normalizes various setup type strings correctly', () => {
      assert.strictEqual(normalizeSetup('BREAKOUT_RETEST'), 'BREAKOUT_RETEST');
      assert.strictEqual(normalizeSetup('breakout_retest'), 'BREAKOUT_RETEST');
      assert.strictEqual(normalizeSetup('PULLBACK_EMA20'), 'PULLBACK_CONTINUATION');
      assert.strictEqual(normalizeSetup('PULLBACK_CONTINUATION'), 'PULLBACK_CONTINUATION');
      assert.strictEqual(normalizeSetup('LIQUIDITY_SWEEP'), 'LIQUIDITY_SWEEP');
      assert.strictEqual(normalizeSetup('TREND_CONTINUATION'), 'TREND_CONTINUATION');
      assert.strictEqual(normalizeSetup('SUPPORT_REACTION'), 'SUPPORT_REACTION');
      assert.strictEqual(normalizeSetup(null), 'TREND_CONTINUATION');
      assert.strictEqual(normalizeSetup(undefined), 'TREND_CONTINUATION');
    });
  });

  describe('2. Edge Classification & Tactical Recommendations', () => {
    it('classifies small sample sizes as INSUFFICIENT_DATA', () => {
      assert.strictEqual(classifyAttributionEdge(2.5, 100, 0), 'INSUFFICIENT_DATA');
      assert.strictEqual(classifyAttributionEdge(2.5, 100, 1), 'INSUFFICIENT_DATA');
      assert.strictEqual(getTacticalRecommendation('INSUFFICIENT_DATA'), 'COLLECT_MORE_DATA');
    });

    it('classifies high expectancy and high win rate as STRONG_EDGE', () => {
      const edge = classifyAttributionEdge(0.85, 65, 5);
      assert.strictEqual(edge, 'STRONG_EDGE');
      assert.strictEqual(getTacticalRecommendation(edge), 'AGGRESSIVE_SCALE');
    });

    it('classifies moderate positive expectancy as MODERATE_EDGE', () => {
      const edge = classifyAttributionEdge(0.25, 50, 4);
      assert.strictEqual(edge, 'MODERATE_EDGE');
      assert.strictEqual(getTacticalRecommendation(edge), 'STANDARD_ALLOCATION');
    });

    it('classifies marginal expectancy near zero as NEUTRAL_EDGE', () => {
      const edge = classifyAttributionEdge(0.02, 40, 4);
      assert.strictEqual(edge, 'NEUTRAL_EDGE');
      assert.strictEqual(getTacticalRecommendation(edge), 'REDUCE_SIZE_50');
    });

    it('classifies negative expectancy as NEGATIVE_EDGE', () => {
      const edge = classifyAttributionEdge(-0.45, 25, 4);
      assert.strictEqual(edge, 'NEGATIVE_EDGE');
      assert.strictEqual(getTacticalRecommendation(edge), 'AVOID_REGIME');
    });
  });

  describe('3. Empty State Handling', () => {
    it('initializes all 25 setup-regime matrix cells cleanly with zero counts', () => {
      const report = computePerformanceAttribution([], []);

      assert.strictEqual(report.totalTradesAnalyzed, 0);
      assert.strictEqual(report.completedTradesAnalyzed, 0);
      assert.strictEqual(report.totalNetPnlUsdt, 0);
      assert.strictEqual(report.cells.length, 25);
      assert.strictEqual(report.setups.length, ALL_SETUP_TYPES.length);
      assert.strictEqual(report.regimes.length, ALL_MARKET_REGIMES.length);
      assert.strictEqual(report.topAlphaGenerator, null);
      assert.strictEqual(report.topRiskDrag, null);

      for (const cell of report.cells) {
        assert.strictEqual(cell.totalSignals, 0);
        assert.strictEqual(cell.completedSignals, 0);
        assert.strictEqual(cell.expectancy, 0);
        assert.strictEqual(cell.edgeStatus, 'INSUFFICIENT_DATA');
        assert.strictEqual(cell.tacticalRecommendation, 'COLLECT_MORE_DATA');
      }
    });
  });

  describe('4. Multi-Dimensional Attribution & Edge Identification', () => {
    // Helper to generate minimal test signal
    const createSignal = (
      id: string,
      setupType: any,
      marketRegime: any,
      realizedR: number,
      netPnlUsdt: number,
      lifecycle: any = 'CLOSED',
      finalResult: any = realizedR > 0 ? 'TP2_REACHED' : 'SL'
    ): SignalHistoryRecord => ({
      signalId: id,
      symbol: 'BTC/USDT',
      direction: 'BUY',
      status: 'BUY_NOW',
      lifecycle,
      setupType,
      marketRegime,
      confidence: 'A',
      entryZone: { low: 64000, high: 66000 },
      preferredEntry: 65000,
      actualEntry: 65000,
      dca1: 63000,
      dca2: 61000,
      dca1Hit: false,
      dca2Hit: false,
      stopLoss: 63000,
      tp1: 67000,
      tp2: 69000,
      tp3: 72000,
      riskPercent: 0.75,
      maxLoss: 100,
      initialAllocation: 100,
      dca1Allocation: 150,
      dca2Allocation: 200,
      maxDeployed: 1000,
      riskReward: 2.5,
      candidateScore: 85,
      tradeScore: 82,
      strategyVersion: 'v1.0.0',
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
      finalResult,
      realizedR,
      realizedReturn: (netPnlUsdt / 1000) * 100,
      fees: 2,
      mfe: 0,
      mae: 0,
      slippage: 0,
      evaluationText: 'review',
      createdAt: new Date().toISOString(),
    });

    const createEvaluation = (
      signalId: string,
      realizedR: number,
      netPnlUsdt: number,
      mfe: number,
      mae: number
    ): SignalEvaluation => ({
      signalId,
      evaluatedAt: new Date().toISOString(),
      finalResult: realizedR > 0 ? 'TP2_REACHED' : 'SL',
      realizedR,
      realizedReturnPercent: (netPnlUsdt / 1000) * 100,
      netPnlUsdt,
      grossPnlUsdt: netPnlUsdt + 2,
      feesUsdt: 2,
      slippageUsdt: 0,
      mfe,
      mae,
      timeToEvent: {} as any,
      slFailurePrimaryCause: null,
      slFailureSecondaryCauses: [],
      stopTightnessLabel: 'APPROPRIATE_STOP',
      counterfactualNote: null,
      evaluationText: 'review',
    });

    it('accurately attributes PnL, calculates E(R), and detects top alpha generator and risk drag', () => {
      const signals: SignalHistoryRecord[] = [
        // 3 Winning Breakout Retests in BULL regime (+2.0R, +1.5R, +2.5R) -> Total Net +$600
        createSignal('sig-1', 'BREAKOUT_RETEST', 'BULL', 2.0, 200),
        createSignal('sig-2', 'BREAKOUT_RETEST', 'BULL', 1.5, 150),
        createSignal('sig-3', 'BREAKOUT_RETEST', 'BULL', 2.5, 250),

        // 2 Losing Breakout Retests in BEAR regime (-1.0R, -1.0R) -> Total Net -$200
        createSignal('sig-4', 'BREAKOUT_RETEST', 'BEAR', -1.0, -100),
        createSignal('sig-5', 'BREAKOUT_RETEST', 'BEAR', -1.0, -100),

        // 2 Moderate Pullback Continuation in BULL regime (+1.0R, +0.8R) -> Total Net +$180
        createSignal('sig-6', 'PULLBACK_CONTINUATION', 'BULL', 1.0, 100),
        createSignal('sig-7', 'PULLBACK_CONTINUATION', 'BULL', 0.8, 80),

        // 1 Pending Signal (Entry NEVER triggered) -> MUST be ignored
        {
          ...createSignal('sig-pending', 'SUPPORT_REACTION', 'BULL', 0, 0, 'CREATED', null),
          lifecycle: 'CREATED',
          actualEntry: null as any,
          finalResult: null,
          realizedR: null,
          realizedReturn: null as any,
        },
      ];

      const evaluations: SignalEvaluation[] = [
        createEvaluation('sig-1', 2.0, 200, 3.5, -0.4),
        createEvaluation('sig-2', 1.5, 150, 2.2, -0.6),
        createEvaluation('sig-3', 2.5, 250, 4.0, -0.2),
        createEvaluation('sig-4', -1.0, -100, 0.3, -2.1),
        createEvaluation('sig-5', -1.0, -100, 0.4, -2.0),
        createEvaluation('sig-6', 1.0, 100, 1.8, -0.5),
        createEvaluation('sig-7', 0.8, 80, 1.2, -0.3),
      ];

      const report = computePerformanceAttribution(signals, evaluations);

      // Verify overall totals (7 entry-triggered closed trades)
      assert.strictEqual(report.totalTradesAnalyzed, 7);
      assert.strictEqual(report.completedTradesAnalyzed, 7);
      assert.strictEqual(report.totalNetPnlUsdt, 580); // 600 - 200 + 180

      // Inspect BREAKOUT_RETEST in BULL cell
      const bullBreakout = report.matrix['BREAKOUT_RETEST']['BULL'];
      assert.strictEqual(bullBreakout.completedSignals, 3);
      assert.strictEqual(bullBreakout.winCount, 3);
      assert.strictEqual(bullBreakout.winRate, 100);
      assert.strictEqual(bullBreakout.avgRealizedR, 2.0); // (2.0 + 1.5 + 2.5) / 3
      assert.strictEqual(bullBreakout.expectancy, 2.0);
      assert.strictEqual(bullBreakout.edgeStatus, 'STRONG_EDGE');
      assert.strictEqual(bullBreakout.tacticalRecommendation, 'AGGRESSIVE_SCALE');
      assert.strictEqual(bullBreakout.netPnlUsdt, 600);

      // Inspect BREAKOUT_RETEST in BEAR cell
      const bearBreakout = report.matrix['BREAKOUT_RETEST']['BEAR'];
      assert.strictEqual(bearBreakout.completedSignals, 2);
      assert.strictEqual(bearBreakout.lossCount, 2);
      assert.strictEqual(bearBreakout.winRate, 0);
      assert.strictEqual(bearBreakout.avgRealizedR, -1.0);
      assert.strictEqual(bearBreakout.expectancy, -1.0);
      assert.strictEqual(bearBreakout.edgeStatus, 'NEGATIVE_EDGE');
      assert.strictEqual(bearBreakout.tacticalRecommendation, 'AVOID_REGIME');
      assert.strictEqual(bearBreakout.netPnlUsdt, -200);

      // Verify Top Alpha Generator is identified as BREAKOUT_RETEST in BULL
      assert.ok(report.topAlphaGenerator);
      assert.strictEqual(report.topAlphaGenerator?.setupType, 'BREAKOUT_RETEST');
      assert.strictEqual(report.topAlphaGenerator?.marketRegime, 'BULL');
      assert.strictEqual(report.topAlphaGenerator?.expectancy, 2.0);

      // Verify Top Risk Drag is identified as BREAKOUT_RETEST in BEAR
      assert.ok(report.topRiskDrag);
      assert.strictEqual(report.topRiskDrag?.setupType, 'BREAKOUT_RETEST');
      assert.strictEqual(report.topRiskDrag?.marketRegime, 'BEAR');
      assert.strictEqual(report.topRiskDrag?.expectancy, -1.0);

      // Check Marginal Setup Summary for BREAKOUT_RETEST
      const breakoutMarginal = report.setupMarginals.find(
        (s) => s.setupType === 'BREAKOUT_RETEST'
      );
      assert.ok(breakoutMarginal);
      assert.strictEqual(breakoutMarginal?.completedSignals, 5);
      assert.strictEqual(breakoutMarginal?.bestRegime, 'BULL');
      assert.strictEqual(breakoutMarginal?.worstRegime, 'BEAR');

      // Check Marginal Regime Summary for BULL
      const bullMarginal = report.regimeMarginals.find(
        (r) => r.marketRegime === 'BULL'
      );
      assert.ok(bullMarginal);
      assert.strictEqual(bullMarginal?.completedSignals, 5); // 3 breakout + 2 pullback
      assert.strictEqual(bullMarginal?.bestSetup, 'BREAKOUT_RETEST');
    });
  });
});
