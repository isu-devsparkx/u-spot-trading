// ─── U-SPOT Phase 10: Evaluation Engine Tests ─────────────────────────
// Tests post-trade evaluation, MFE/MAE, realized R, fees & slippage,
// SL failure diagnostics, counterfactuals, and review templates

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  classifySignalResult,
  calculateFilledAverageEntry,
  calculateRealizedR,
  calculateNetPnl,
  calculateMfeMae,
  calculateTimeToEvent,
  diagnoseSlFailureCause,
  performCounterfactualAnalysis,
  generatePostTradeReport,
  evaluateSignalOutcome,
  DEFAULT_EVALUATION_CONFIG,
} from '../services/evaluation-service.ts';
import type {
  SignalHistoryRecord,
  SignalLifecycleEvent,
} from '../../types/index.ts';

function createMockSignal(overrides: Partial<SignalHistoryRecord> = {}): SignalHistoryRecord {
  const baseTime = Date.now() - 3600000; // 1 hour ago
  return {
    signalId: `TEST-EVAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: 'SOL/USDT',
    direction: 'BUY',
    createdAt: new Date(baseTime).toISOString(),
    strategyVersion: 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 85,
    tradeScore: 82,
    setupType: 'PULLBACK_CONTINUATION',
    entryZone: { low: 148.0, high: 152.0 },
    preferredEntry: 150.0,
    actualEntry: 150.0,
    dca1: 144.0,
    dca2: 138.0,
    stopLoss: 135.0,
    tp1: 158.0,
    tp2: 165.0,
    tp3: 175.0,
    riskPercent: 0.75,
    maxLoss: 2.25,
    initialAllocation: 22.5,
    dca1Allocation: 33.75,
    dca2Allocation: 45.0,
    maxDeployed: 101.25,
    riskReward: 2.5,
    confidence: 'A',
    status: 'WATCH',
    lifecycle: 'CLOSED',
    expiresAt: new Date(baseTime + 14400000).toISOString(),
    dca1Hit: false,
    dca2Hit: false,
    mfe: 5.33,
    mae: -1.2,
    finalResult: null,
    realizedReturn: null,
    realizedR: null,
    fees: null,
    slippage: null,
    evaluationText: null,
    tradeScoreBreakdown: {
      trend: 80,
      momentum: 75,
      volume: 70,
      volatility: 65,
      structure: 85,
      liquidity: 78,
      regime: 70,
      total: 82,
    },
    ...overrides,
  };
}

describe('Phase 10: Signal Result Classification (Spec Section 18)', () => {
  test('classifies FULL_TP when TP3 event exists', () => {
    const signal = createMockSignal();
    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'ENTRY', timestamp: new Date().toISOString(), price: 150 },
      { eventId: 'e2', signalId: signal.signalId, eventType: 'TP1', timestamp: new Date().toISOString(), price: 158 },
      { eventId: 'e3', signalId: signal.signalId, eventType: 'TP2', timestamp: new Date().toISOString(), price: 165 },
      { eventId: 'e4', signalId: signal.signalId, eventType: 'TP3', timestamp: new Date().toISOString(), price: 175 },
    ];
    const result = classifySignalResult(signal, events);
    assert.strictEqual(result, 'FULL_TP');
  });

  test('classifies PARTIAL_TP_THEN_SL when TP1 hit then SL hit', () => {
    const signal = createMockSignal();
    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'ENTRY', timestamp: new Date().toISOString(), price: 150 },
      { eventId: 'e2', signalId: signal.signalId, eventType: 'TP1', timestamp: new Date().toISOString(), price: 158 },
      { eventId: 'e3', signalId: signal.signalId, eventType: 'SL', timestamp: new Date().toISOString(), price: 135 },
    ];
    const result = classifySignalResult(signal, events);
    assert.strictEqual(result, 'PARTIAL_TP_THEN_SL');
  });

  test('classifies SL when stopped out with no TPs hit', () => {
    const signal = createMockSignal();
    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'ENTRY', timestamp: new Date().toISOString(), price: 150 },
      { eventId: 'e2', signalId: signal.signalId, eventType: 'SL', timestamp: new Date().toISOString(), price: 135 },
    ];
    const result = classifySignalResult(signal, events);
    assert.strictEqual(result, 'SL');
  });

  test('classifies EXPIRED when signal expired before entry', () => {
    const signal = createMockSignal({ lifecycle: 'EXPIRED' });
    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'EXPIRED', timestamp: new Date().toISOString(), price: null },
    ];
    const result = classifySignalResult(signal, events);
    assert.strictEqual(result, 'EXPIRED');
  });

  test('classifies INDETERMINATE candle collision without lower-tf data (Spec Section 17)', () => {
    const signal = createMockSignal();
    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'INDETERMINATE', timestamp: new Date().toISOString(), price: 145 },
    ];
    const result = classifySignalResult(signal, events);
    assert.strictEqual(result, 'INDETERMINATE');
  });
});

describe('Phase 10: Realized R & PnL Accounting (Spec Sections 16, 18, 32)', () => {
  test('calculates correct Realized R for FULL_TP with 30/30/40 weighting', () => {
    // Entry: 100, SL: 90 (unit risk R = 10)
    // TP1: 110 (+1R, 30%), TP2: 120 (+2R, 30%), TP3: 130 (+3R, 40%)
    // Expected Realized R = 0.3(1) + 0.3(2) + 0.4(3) = 0.3 + 0.6 + 1.2 = 2.10 R
    const signal = createMockSignal({
      actualEntry: 100,
      stopLoss: 90,
      tp1: 110,
      tp2: 120,
      tp3: 130,
      initialAllocation: 50,
      maxDeployed: 50,
    });

    const { realizedR, grossReturnPct } = calculateRealizedR(signal, 'FULL_TP');
    assert.strictEqual(realizedR, 2.1);
    assert.strictEqual(grossReturnPct, 21.0);
  });

  test('calculates correct Realized R for PARTIAL_TP_THEN_SL', () => {
    // Entry: 100, SL: 90 (unit risk R = 10)
    // TP1: 110 (+1R, 30%), SL: 90 (-1R, 70%)
    // Expected Realized R = 0.3(+1) + 0.7(-1) = 0.3 - 0.7 = -0.40 R
    const signal = createMockSignal({
      actualEntry: 100,
      stopLoss: 90,
      tp1: 110,
      tp2: 120,
      tp3: 130,
      initialAllocation: 50,
      maxDeployed: 50,
    });

    const { realizedR } = calculateRealizedR(signal, 'PARTIAL_TP_THEN_SL');
    assert.strictEqual(realizedR, -0.4);
  });

  test('calculates -1.0 R for direct Stop Loss', () => {
    const signal = createMockSignal({
      actualEntry: 100,
      stopLoss: 90,
      initialAllocation: 50,
      maxDeployed: 50,
    });

    const { realizedR } = calculateRealizedR(signal, 'SL');
    assert.strictEqual(realizedR, -1.0);
  });

  test('calculates 0.0 R for expired / invalidated signals', () => {
    const signal = createMockSignal();
    const { realizedR, grossReturnPct } = calculateRealizedR(signal, 'EXPIRED');
    assert.strictEqual(realizedR, 0);
    assert.strictEqual(grossReturnPct, 0);
  });

  test('calculates Net P&L factoring in slippage without arbitrary fees', () => {
    const deployedCapital = 100; // 100 USDT
    const grossReturnPct = 10;   // +10% gross profit ($10)
    const { grossPnlUsdt, netPnlUsdt, feesUsdt, slippageUsdt } = calculateNetPnl(
      deployedCapital,
      grossReturnPct,
      DEFAULT_EVALUATION_CONFIG
    );

    assert.strictEqual(grossPnlUsdt, 10.0);
    // Fees are 0 (removed as exact rates vary)
    assert.strictEqual(feesUsdt, 0);
    // Slippage: 0.05% = $0.05
    assert.strictEqual(slippageUsdt, 0.05);
    // Net PnL = 10.00 - 0.05 = $9.95
    assert.strictEqual(netPnlUsdt, 9.95);
  });

  test('accounts for volume-weighted DCA entry in average entry price', () => {
    // Initial: $20 @ 100 -> 0.2 coins
    // DCA1:    $30 @ 90  -> 0.3333 coins
    // Total:   $50 / 0.5333 coins = $93.75 avg entry
    const signal = createMockSignal({
      actualEntry: 100,
      initialAllocation: 20,
      dca1: 90,
      dca1Allocation: 30,
      dca1Hit: true,
      dca2Hit: false,
    });

    const { averageEntry, deployedCapital } = calculateFilledAverageEntry(signal);
    assert.strictEqual(deployedCapital, 50);
    assert.strictEqual(Number(averageEntry.toFixed(2)), 93.75);
  });
});

describe('Phase 10: Maximum Favorable / Adverse Excursions (Spec Section 22)', () => {
  test('calculates MFE and MAE relative to average entry price', () => {
    const signal = createMockSignal({
      actualEntry: 100,
      stopLoss: 90,
      mfe: 8.0,
      mae: -2.5,
    });

    const klines = [
      { high: 109.5, low: 96.0 }, // Higher high: 109.5 -> MFE = 9.5%
      { high: 104.0, low: 95.0 }, // Lower low: 95.0 -> MAE = -5.0%
    ];

    const { mfe, mae } = calculateMfeMae(signal, [], klines);
    assert.strictEqual(mfe, 9.5);
    assert.strictEqual(mae, -5.0);
  });
});

describe('Phase 10: Time-to-Event Analytics (Spec Section 23)', () => {
  test('accurately calculates elapsed duration for entry, TP and SL events', () => {
    const t0 = Date.now() - 3600000; // 1 hour ago
    const signal = createMockSignal({
      createdAt: new Date(t0).toISOString(),
    });

    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'ENTRY', timestamp: new Date(t0 + 300000).toISOString(), price: 150 }, // +5 min
      { eventId: 'e2', signalId: signal.signalId, eventType: 'TP1', timestamp: new Date(t0 + 1200000).toISOString(), price: 158 },  // +20 min
    ];

    const timeToEvent = calculateTimeToEvent(signal, events);
    assert.strictEqual(timeToEvent.timeToEntryMs, 300000);
    assert.strictEqual(timeToEvent.timeToTp1Ms, 1200000);
    assert.strictEqual(timeToEvent.timeToSlMs, null);
  });
});

describe('Phase 10: SL Failure Diagnostics (Spec Section 19 & 20)', () => {
  test('diagnoses MARKET_REGIME_FAILURE on sharp BTC reversal', () => {
    const signal = createMockSignal();
    const result = diagnoseSlFailureCause(signal, {
      btcChangePct: -3.2,
      marketRegimeShift: 'BEAR',
    });

    assert.strictEqual(result.primaryCause, 'MARKET_REGIME_FAILURE');
    assert.ok(result.evidenceSummary.includes('BTC moved -3.2%'));
  });

  test('diagnoses FALSE_BREAKOUT for failed breakout retest setups', () => {
    const signal = createMockSignal({
      mfe: 0.4,
      setupType: 'BREAKOUT_RETEST',
      tradeScoreBreakdown: {
        trend: 70,
        momentum: 70,
        volume: 70,
        volatility: 60,
        structure: 80,
        liquidity: 70,
        regime: 65,
        total: 75,
      },
    });

    const result = diagnoseSlFailureCause(signal, {
      btcChangePct: 0.2, // BTC neutral
    });

    assert.strictEqual(result.primaryCause, 'FALSE_BREAKOUT');
  });

  test('diagnoses MOMENTUM_FAILURE on RSI drop and MACD deterioration', () => {
    const signal = createMockSignal();
    const result = diagnoseSlFailureCause(signal, {
      btcChangePct: 0.1,
      indicatorsAtExit: {
        rsi: 34,
        macdHist: -1.2,
      },
    });

    assert.strictEqual(result.primaryCause, 'MOMENTUM_FAILURE');
  });

  test('returns UNKNOWN with honest evidence when data is inconclusive (Spec Section 19)', () => {
    const signal = createMockSignal();
    const result = diagnoseSlFailureCause(signal, {});
    assert.strictEqual(result.primaryCause, 'UNKNOWN');
    assert.ok(result.evidenceSummary.includes('Cause cannot be determined'));
  });
});

describe('Phase 10: Counterfactual Analysis (Spec Section 21)', () => {
  test('labels APPROPRIATE_STOP when price plunged further after SL', () => {
    // SL: 100. Price dropped to 95 (-5%)
    const signal = createMockSignal({ stopLoss: 100, actualEntry: 110, tp1: 120 });
    const postExitKlines = [
      { high: 99, low: 95, close: 96 },
    ];

    const { stopTightnessLabel, counterfactualNote } = performCounterfactualAnalysis(signal, postExitKlines);
    assert.strictEqual(stopTightnessLabel, 'APPROPRIATE_STOP');
    assert.ok(counterfactualNote.includes('SL protected capital'));
  });

  test('labels POTENTIALLY_TIGHT when price wicked SL and reached TP1', () => {
    // SL: 100, TP1: 120. Post-SL price dipped to 99.5 then rebounded to 122
    const signal = createMockSignal({ stopLoss: 100, actualEntry: 110, tp1: 120 });
    const postExitKlines = [
      { high: 105, low: 99.5, close: 104 },
      { high: 122, low: 103, close: 121 },
    ];

    const { stopTightnessLabel, counterfactualNote } = performCounterfactualAnalysis(signal, postExitKlines);
    assert.strictEqual(stopTightnessLabel, 'POTENTIALLY_TIGHT');
    assert.ok(counterfactualNote.includes('Potentially too-tight stop'));
  });

  test('labels INSUFFICIENT_DATA when post-exit klines are missing', () => {
    const signal = createMockSignal();
    const { stopTightnessLabel } = performCounterfactualAnalysis(signal, []);
    assert.strictEqual(stopTightnessLabel, 'INSUFFICIENT_DATA');
  });
});

describe('Phase 10: Post-Trade Review Templates (Spec Section 46 & 47)', () => {
  test('generates winning trade review report conforming to Spec Section 46', () => {
    const signal = createMockSignal({
      actualEntry: 150.0,
      dca1: 144.0,
      dca2: 138.0,
      stopLoss: 135.0,
      tp1: 158.0,
      tp2: 165.0,
      tp3: 175.0,
    });

    const report = generatePostTradeReport(signal, {
      finalResult: 'FULL_TP',
      realizedR: 2.1,
      mfe: 16.67,
      mae: -0.5,
      netPnlUsdt: 21.25,
      feesUsdt: 0.20,
      slippageUsdt: 0.05,
    });

    assert.ok(report.includes('## Result'));
    assert.ok(report.includes('FULL_TP'));
    assert.ok(report.includes('## Planned'));
    assert.ok(report.includes('## Actual'));
    assert.ok(report.includes('+2.10R'));
    assert.ok(report.includes('## Strategy Modules'));
    assert.ok(report.includes('Setup behaved according to the original thesis'));
  });

  test('generates losing trade review report conforming to Spec Section 47', () => {
    const signal = createMockSignal({
      actualEntry: 150.0,
      stopLoss: 135.0,
      taSummary: 'BTC fell 3.1% within 25 minutes.',
    });

    const report = generatePostTradeReport(signal, {
      finalResult: 'SL',
      realizedR: -1.0,
      mfe: 0.8,
      mae: -10.0,
      netPnlUsdt: -2.25,
      slFailurePrimaryCause: 'MARKET_REGIME_FAILURE',
      stopTightnessLabel: 'APPROPRIATE_STOP',
      counterfactualNote: 'Price continued lower to 128.00 after exit.',
    });

    assert.ok(report.includes('## Result\nSL'));
    assert.ok(report.includes('## Primary Reason\nMARKET_REGIME_FAILURE'));
    assert.ok(report.includes('## Stop Assessment\nAPPROPRIATE_STOP'));
    assert.ok(report.includes('SL protected capital and the original thesis was invalidated'));
  });
});

describe('Phase 10: End-to-End evaluateSignalOutcome Orchestration', () => {
  test('orchestrates full evaluation pipeline for completed trade', () => {
    const signal = createMockSignal({
      actualEntry: 100,
      stopLoss: 90,
      tp1: 110,
      tp2: 120,
      tp3: 130,
      initialAllocation: 50,
      maxDeployed: 50,
      dca1Hit: false,
      dca2Hit: false,
    });

    const events: SignalLifecycleEvent[] = [
      { eventId: 'e1', signalId: signal.signalId, eventType: 'ENTRY', timestamp: new Date(Date.now() - 1800000).toISOString(), price: 100 },
      { eventId: 'e2', signalId: signal.signalId, eventType: 'TP1', timestamp: new Date(Date.now() - 600000).toISOString(), price: 110 },
      { eventId: 'e3', signalId: signal.signalId, eventType: 'TP2', timestamp: new Date(Date.now() - 100000).toISOString(), price: 120 },
      { eventId: 'e4', signalId: signal.signalId, eventType: 'TP3', timestamp: new Date().toISOString(), price: 130 },
    ];

    const evaluation = evaluateSignalOutcome(signal, { events });

    assert.strictEqual(evaluation.signalId, signal.signalId);
    assert.strictEqual(evaluation.finalResult, 'FULL_TP');
    assert.strictEqual(evaluation.realizedR, 2.1);
    assert.strictEqual(evaluation.grossPnlUsdt, 10.5);
    assert.ok(evaluation.netPnlUsdt! > 10.0);
    assert.strictEqual(evaluation.feesUsdt, 0);
    assert.ok(evaluation.timeToEvent.timeToEntryMs! >= 0);
    assert.ok(evaluation.timeToEvent.timeToTp1Ms! >= 0);
    assert.ok(evaluation.evaluationText.length > 50);
  });
});
