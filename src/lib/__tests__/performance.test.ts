// ─── U-SPOT Phase 12: Performance & Statistical Edge Engine Tests ────
// Spec Section 27: Performance Dashboard
// Spec Section 28: Mathematical Expectancy, R-Multiples, Drawdowns, Target Hit Rates, Breakdowns

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  calculateMedian,
  calculateMaxDrawdown,
  computePerformanceStats,
} from '../services/performance-service.ts';
import type {
  SignalHistoryRecord,
  SignalEvaluation,
} from '../../types/index.ts';

function createMockSignal(overrides: Partial<SignalHistoryRecord> = {}): SignalHistoryRecord {
  return {
    signalId: `SIG-${Math.random().toString(36).substring(2, 9)}`,
    symbol: 'SOL/USDT',
    direction: 'BUY',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    strategyVersion: 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 85,
    tradeScore: 82,
    setupType: 'TREND_CONTINUATION',
    entryZone: { low: 148, high: 152 },
    preferredEntry: 150,
    actualEntry: 150,
    dca1: 145,
    dca2: 140,
    dca1Hit: false,
    dca2Hit: false,
    stopLoss: 135,
    tp1: 158,
    tp2: 165,
    tp3: 175,
    riskPercent: 0.75,
    maxLoss: 150,
    initialAllocation: 100,
    dca1Allocation: 150,
    dca2Allocation: 200,
    maxDeployed: 1000,
    riskReward: 2.5,
    confidence: 'A',
    status: 'WATCH',
    lifecycle: 'CLOSED',
    expiresAt: new Date(Date.now() + 7200000).toISOString(),
    finalResult: 'FULL_TP',
    realizedR: 2.15,
    realizedReturn: 12.5,
    mfe: 180,
    mae: 148,
    fees: 1.5,
    slippage: 0.05,
    evaluationText: 'Winning trade review',
    tradeScoreBreakdown: {
      trend: 18,
      momentum: 18,
      volume: 16,
      volatility: 12,
      structure: 12,
      liquidity: 5,
      regime: 5,
      total: 86,
    },
    ...overrides,
  };
}

function createMockEvaluation(overrides: Partial<SignalEvaluation> = {}): SignalEvaluation {
  return {
    signalId: 'SIG-TEST',
    evaluatedAt: new Date().toISOString(),
    finalResult: 'FULL_TP',
    mfe: 180,
    mae: 148,
    realizedReturnPercent: 12.5,
    realizedR: 2.15,
    grossPnlUsdt: 125,
    netPnlUsdt: 121.4,
    feesUsdt: 2.5,
    slippageUsdt: 0.8,
    timeToEvent: {
      timeToEntryMs: 120000,
      timeToDca1Ms: null,
      timeToDca2Ms: null,
      timeToTp1Ms: 900000,
      timeToTp2Ms: 1800000,
      timeToTp3Ms: 3600000,
      timeToSlMs: null,
      timeToExpiryMs: null,
    },
    slFailurePrimaryCause: null,
    slFailureSecondaryCauses: [],
    stopTightnessLabel: 'APPROPRIATE_STOP',
    counterfactualNote: null,
    evaluationText: 'Winning trade review',
    ...overrides,
  };
}

describe('Performance Engine: Math Utilities', () => {
  test('calculateMedian handles empty and odd/even arrays correctly', () => {
    assert.strictEqual(calculateMedian([]), 0);
    assert.strictEqual(calculateMedian([5]), 5);
    assert.strictEqual(calculateMedian([1, 3, 2]), 2);
    assert.strictEqual(calculateMedian([1, 2, 3, 4]), 2.5);
    assert.strictEqual(calculateMedian([-1.5, 0.5, 2.0, 3.2]), 1.25);
  });

  test('calculateMaxDrawdown computes peak-to-trough drop accurately', () => {
    // Empty
    assert.deepStrictEqual(calculateMaxDrawdown([]), { maxDrawdownR: 0, maxDrawdownPct: 0 });

    // Straight uptrend (no drawdown)
    assert.deepStrictEqual(calculateMaxDrawdown([1, 1, 1, 1]), { maxDrawdownR: 0, maxDrawdownPct: 0 });

    // Peak at 3R, drop by 2R (drawdown = 2R, 2/3 = 66.67%)
    const ddResult = calculateMaxDrawdown([1, 2, -1, -1, 3]);
    assert.strictEqual(ddResult.maxDrawdownR, 2);
    assert.strictEqual(ddResult.maxDrawdownPct, 66.67);

    // Initial loss before any gain
    const ddLossFirst = calculateMaxDrawdown([-1, -1, 3]);
    assert.strictEqual(ddLossFirst.maxDrawdownR, 2);
    assert.strictEqual(ddLossFirst.maxDrawdownPct, 100);
  });
});

describe('Performance Engine: computePerformanceStats Empty State', () => {
  test('returns safe zeroed stats when no signals exist', () => {
    const stats = computePerformanceStats([]);
    assert.strictEqual(stats.totalSignals, 0);
    assert.strictEqual(stats.activeSignals, 0);
    assert.strictEqual(stats.completedSignals, 0);
    assert.strictEqual(stats.winRate, 0);
    assert.strictEqual(stats.lossRate, 0);
    assert.strictEqual(stats.expectancy, 0);
    assert.strictEqual(stats.profitFactor, 0);
    assert.strictEqual(stats.avgR, 0);
    assert.strictEqual(stats.medianR, 0);
    assert.strictEqual(stats.maxDrawdown, 0);
    assert.strictEqual(stats.totalNetPnlUsdt, 0);
  });
});

describe('Performance Engine: Expectancy & Target Hit Rates', () => {
  test('calculates correct Mathematical Expectancy and Target Rates', () => {
    const sig1 = createMockSignal({ signalId: 'SIG-1', realizedR: 2.0, finalResult: 'FULL_TP' });
    const sig2 = createMockSignal({ signalId: 'SIG-2', realizedR: 1.0, finalResult: 'TP2_REACHED' });
    const sig3 = createMockSignal({ signalId: 'SIG-3', realizedR: -1.0, finalResult: 'SL' });
    const sig4 = createMockSignal({ signalId: 'SIG-4', realizedR: -1.0, finalResult: 'SL' });

    const evals = [
      createMockEvaluation({ signalId: 'SIG-1', realizedR: 2.0, grossPnlUsdt: 200, netPnlUsdt: 195 }),
      createMockEvaluation({ signalId: 'SIG-2', realizedR: 1.0, grossPnlUsdt: 100, netPnlUsdt: 95 }),
      createMockEvaluation({ signalId: 'SIG-3', realizedR: -1.0, grossPnlUsdt: -100, netPnlUsdt: -105, slFailurePrimaryCause: 'FALSE_BREAKOUT' }),
      createMockEvaluation({ signalId: 'SIG-4', realizedR: -1.0, grossPnlUsdt: -100, netPnlUsdt: -105, slFailurePrimaryCause: 'MARKET_REGIME_FAILURE' }),
    ];

    const stats = computePerformanceStats([sig1, sig2, sig3, sig4], evals);

    // 4 signals: 2 wins (2R, 1R), 2 losses (-1R, -1R)
    assert.strictEqual(stats.totalSignals, 4);
    assert.strictEqual(stats.completedSignals, 4);
    assert.strictEqual(stats.winCount, 2);
    assert.strictEqual(stats.lossCount, 2);
    assert.strictEqual(stats.winRate, 50.0);
    assert.strictEqual(stats.lossRate, 50.0);

    // Avg Win = 1.5R, Avg Loss = -1.0R
    assert.strictEqual(stats.avgWin, 1.5);
    assert.strictEqual(stats.avgLoss, -1.0);

    // Expectancy E(R) = (0.5 * 1.5) - (0.5 * 1.0) = 0.75 - 0.50 = +0.25 R
    assert.strictEqual(stats.expectancy, 0.25);

    // Gross profit: 300, Gross loss: 200 => Profit Factor = 1.50
    assert.strictEqual(stats.profitFactor, 1.5);

    // Avg R = (2 + 1 - 1 - 1)/4 = 0.25
    assert.strictEqual(stats.avgR, 0.25);

    // Target Hit Rates:
    // sig1 reached FULL_TP (TP1, TP2, TP3)
    // sig2 reached TP2_REACHED (TP1, TP2)
    // sig3 reached SL
    // sig4 reached SL
    // TP1 hit: 2/4 = 50%
    // TP2 hit: 2/4 = 50%
    // TP3 hit: 1/4 = 25%
    // SL hit: 2/4 = 50%
    assert.strictEqual(stats.tp1Rate, 50.0);
    assert.strictEqual(stats.tp2Rate, 50.0);
    assert.strictEqual(stats.tp3Rate, 25.0);
    assert.strictEqual(stats.slRate, 50.0);

    // Net P&L: 195 + 95 - 105 - 105 = 80
    assert.strictEqual(stats.totalNetPnlUsdt, 80);
  });

  test('handles 100% win rate edge case with high profit factor ceiling', () => {
    const sig1 = createMockSignal({ signalId: 'SIG-W1', realizedR: 2.5, finalResult: 'FULL_TP' });
    const ev1 = createMockEvaluation({ signalId: 'SIG-W1', realizedR: 2.5, grossPnlUsdt: 250, netPnlUsdt: 245 });

    const stats = computePerformanceStats([sig1], [ev1]);
    assert.strictEqual(stats.winRate, 100.0);
    assert.strictEqual(stats.lossRate, 0.0);
    assert.strictEqual(stats.profitFactor, 99.9);
    assert.strictEqual(stats.expectancy, 2.5);
    assert.strictEqual(stats.avgWin, 2.5);
    assert.strictEqual(stats.avgLoss, 0);
  });
});

describe('Performance Engine: Multi-Dimensional Breakdowns', () => {
  test('aggregates breakdowns by Market Regime, Setup Type, Confidence, Coin, and SL Reason', () => {
    const s1 = createMockSignal({
      signalId: 'S1',
      symbol: 'BTC/USDT',
      marketRegime: 'BULL',
      setupType: 'TREND_CONTINUATION',
      confidence: 'A+',
      realizedR: 3.0,
      finalResult: 'FULL_TP',
    });
    const s2 = createMockSignal({
      signalId: 'S2',
      symbol: 'ETH/USDT',
      marketRegime: 'NEUTRAL',
      setupType: 'SUPPORT_REACTION',
      confidence: 'B',
      realizedR: 1.0,
      finalResult: 'TP1_ONLY',
    });
    const s3 = createMockSignal({
      signalId: 'S3',
      symbol: 'BTC/USDT',
      marketRegime: 'BEAR',
      setupType: 'BREAKOUT_RETEST',
      confidence: 'B',
      realizedR: -1.0,
      finalResult: 'SL',
    });

    const evals = [
      createMockEvaluation({
        signalId: 'S1',
        realizedR: 3.0,
        netPnlUsdt: 300,
        stopTightnessLabel: 'APPROPRIATE_STOP',
      }),
      createMockEvaluation({
        signalId: 'S2',
        realizedR: 1.0,
        netPnlUsdt: 80,
        stopTightnessLabel: 'APPROPRIATE_STOP',
      }),
      createMockEvaluation({
        signalId: 'S3',
        realizedR: -1.0,
        netPnlUsdt: -100,
        slFailurePrimaryCause: 'LIQUIDITY_SWEEP_FAILURE',
        stopTightnessLabel: 'POTENTIALLY_TIGHT',
      }),
    ];

    const stats = computePerformanceStats([s1, s2, s3], evals);

    // Regime Breakdown
    assert.ok(stats.byMarketRegime?.['BULL']);
    assert.strictEqual(stats.byMarketRegime!['BULL'].count, 1);
    assert.strictEqual(stats.byMarketRegime!['BULL'].avgR, 3.0);
    assert.strictEqual(stats.byMarketRegime!['BULL'].winRate, 100);

    assert.ok(stats.byMarketRegime?.['NEUTRAL']);
    assert.strictEqual(stats.byMarketRegime!['NEUTRAL'].count, 1);
    assert.strictEqual(stats.byMarketRegime!['NEUTRAL'].avgR, 1.0);

    assert.ok(stats.byMarketRegime?.['BEAR']);
    assert.strictEqual(stats.byMarketRegime!['BEAR'].count, 1);
    assert.strictEqual(stats.byMarketRegime!['BEAR'].avgR, -1.0);

    // Setup Type Breakdown
    assert.ok(stats.bySetupType?.['TREND_CONTINUATION']);
    assert.strictEqual(stats.bySetupType!['TREND_CONTINUATION'].count, 1);
    assert.strictEqual(stats.bySetupType!['TREND_CONTINUATION'].winRate, 100);

    // Confidence Breakdown
    assert.ok(stats.byConfidence?.['A+']);
    assert.strictEqual(stats.byConfidence!['A+'].avgR, 3.0);
    assert.ok(stats.byConfidence?.['B']);
    assert.strictEqual(stats.byConfidence!['B'].count, 2);

    // Coin Breakdown
    assert.ok(stats.byCoin?.['BTC']);
    assert.strictEqual(stats.byCoin!['BTC'].count, 2);
    // BTC net PnL = 300 - 100 = 200
    assert.strictEqual(stats.byCoin!['BTC'].netPnlUsdt, 200);

    assert.ok(stats.byCoin?.['ETH']);
    assert.strictEqual(stats.byCoin!['ETH'].count, 1);
    assert.strictEqual(stats.byCoin!['ETH'].netPnlUsdt, 80);

    // SL Reason Breakdown
    assert.ok(stats.bySlReason?.['LIQUIDITY_SWEEP_FAILURE']);
    assert.strictEqual(stats.bySlReason!['LIQUIDITY_SWEEP_FAILURE'].count, 1);
    assert.strictEqual(stats.bySlReason!['LIQUIDITY_SWEEP_FAILURE'].percentage, 100);

    // Stop Tightness Breakdown
    assert.ok(stats.byStopTightness?.['APPROPRIATE_STOP']);
    assert.strictEqual(stats.byStopTightness!['APPROPRIATE_STOP'].count, 2);
    assert.ok(stats.byStopTightness?.['POTENTIALLY_TIGHT']);
    assert.strictEqual(stats.byStopTightness!['POTENTIALLY_TIGHT'].count, 1);
  });
});

describe('Performance Engine: Entry-Triggered Signals Isolation', () => {
  test('strictly excludes signals that never triggered market entry from analytics and expectancy', () => {
    // 2 Entry-triggered signals: 1 Win (+2R), 1 Loss (-1R)
    const triggeredWin = createMockSignal({
      signalId: 'SIG-TRIG-1',
      symbol: 'SOL/USDT',
      actualEntry: 150,
      lifecycle: 'CLOSED',
      finalResult: 'FULL_TP',
      realizedR: 2.0,
      realizedReturn: 10,
    });
    const triggeredLoss = createMockSignal({
      signalId: 'SIG-TRIG-2',
      symbol: 'SOL/USDT',
      actualEntry: 150,
      lifecycle: 'CLOSED',
      finalResult: 'SL',
      realizedR: -1.0,
      realizedReturn: -5,
    });

    // 3 Non-entry signals: unfilled expired, pre-entry cancelled, and pending created without actualEntry
    const unfilledExpired = createMockSignal({
      signalId: 'SIG-UNFILLED-1',
      symbol: 'DOGE/USDT',
      actualEntry: null,
      lifecycle: 'EXPIRED',
      finalResult: 'EXPIRED',
      realizedR: 0,
      realizedReturn: null,
    });
    const preEntryCancelled = createMockSignal({
      signalId: 'SIG-UNFILLED-2',
      symbol: 'ADA/USDT',
      actualEntry: null,
      lifecycle: 'CANCELLED',
      finalResult: 'CANCELLED',
      realizedR: 0,
      realizedReturn: null,
    });
    const pendingCreated = createMockSignal({
      signalId: 'SIG-UNFILLED-3',
      symbol: 'AVAX/USDT',
      actualEntry: null,
      lifecycle: 'CREATED',
      finalResult: null,
      realizedR: null,
      realizedReturn: null,
    });

    const allSignals = [
      triggeredWin,
      triggeredLoss,
      unfilledExpired,
      preEntryCancelled,
      pendingCreated,
    ];

    const evals = [
      createMockEvaluation({ signalId: 'SIG-TRIG-1', realizedR: 2.0, grossPnlUsdt: 200, netPnlUsdt: 195 }),
      createMockEvaluation({ signalId: 'SIG-TRIG-2', realizedR: -1.0, grossPnlUsdt: -100, netPnlUsdt: -105 }),
    ];

    const stats = computePerformanceStats(allSignals, evals);

    // Total signals counted in performance analytics MUST only be the 2 entry-triggered trades
    assert.strictEqual(stats.totalSignals, 2);
    assert.strictEqual(stats.completedSignals, 2);
    assert.strictEqual(stats.winCount, 1);
    assert.strictEqual(stats.lossCount, 1);

    // Win rate must NOT be diluted by unfilled expiries (50% rather than 20% or 25%)
    assert.strictEqual(stats.winRate, 50.0);
    assert.strictEqual(stats.lossRate, 50.0);

    // Expectancy should be (0.5 * 2.0) - (0.5 * 1.0) = +0.50R
    assert.strictEqual(stats.expectancy, 0.5);

    // DOGE, ADA, AVAX must not appear in byCoin breakdown since they never executed
    assert.strictEqual(stats.byCoin?.['DOGE'], undefined);
    assert.strictEqual(stats.byCoin?.['ADA'], undefined);
    assert.strictEqual(stats.byCoin?.['AVAX'], undefined);
    assert.ok(stats.byCoin?.['SOL']);
    assert.strictEqual(stats.byCoin!['SOL'].count, 2);
  });
});

