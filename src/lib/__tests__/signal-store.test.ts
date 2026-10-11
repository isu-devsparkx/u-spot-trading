import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  saveSignal,
  saveSignals,
  getSignalById,
  getSignals,
  saveSignalEvent,
  getSignalEvents,
  saveSignalEvaluation,
  getSignalEvaluation,
  saveMarketSnapshot,
  getLatestMarketSnapshots,
  getStrategyVersions,
  saveStrategyVersion,
  getStrategyParameters,
  saveStrategyParameter,
  getStorageStatus,
  mapSignalToDbRow,
  mapDbRowToSignalRecord,
  mapEvaluationToDbRow,
  mapDbRowToEvaluation,
} from '../services/signal-store.ts';
import type {
  Signal,
  SignalLifecycleEvent,
  SignalEvaluation,
  MarketSnapshot,
  StrategyVersionRecord,
  StrategyParameterRecord,
} from '../../types/index.ts';

function createMockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: `TEST-SIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: 'BTC/USDT',
    direction: 'BUY',
    createdAt: new Date().toISOString(),
    strategyVersion: 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 88,
    tradeScore: 84,
    setupType: 'PULLBACK_CONTINUATION',
    entryZone: { low: 62000, high: 62500 },
    preferredEntry: 62250,
    dca1: 61500,
    dca2: 60800,
    stopLoss: 60000,
    tp1: 63800,
    tp2: 65000,
    tp3: 67000,
    riskPercent: 1.0,
    maxLoss: 3.0,
    initialAllocation: 41.5,
    dca1Allocation: 24.9,
    dca2Allocation: 16.6,
    maxDeployed: 83.0,
    riskReward: 2.3,
    confidence: 'A+',
    status: 'BUY_NOW',
    lifecycle: 'CREATED',
    expiresAt: new Date(Date.now() + 14400000).toISOString(),
    exchange: 'BINANCE_SPOT',
    confirmationCondition: 'Wait for 15m candle close above EMA20',
    rationale: 'Strong bullish trend alignment with high liquidity',
    tradeScoreBreakdown: {
      trend: 20,
      momentum: 14,
      volume: 12,
      structure: 18,
      liquidity: 12,
      volatility: 8,
      regime: 5,
      total: 89,
    },
    taSummary: 'Bullish EMA alignment, RSI at 58, positive volume delta',
    ...overrides,
  };
}

describe('Phase 8: Signal Persistence (Database & Store Layer)', () => {

  test('getStorageStatus returns valid configuration details', () => {
    const status = getStorageStatus();
    assert.ok(status);
    assert.ok(['supabase', 'local_memory'].includes(status.source));
    assert.strictEqual(typeof status.configured, 'boolean');
    assert.strictEqual(typeof status.details, 'string');
  });

  test('saveSignal and getSignalById persist and retrieve a signal record', async () => {
    const mock = createMockSignal({ symbol: 'ETH/USDT', tradeScore: 89 });
    const saveRes = await saveSignal(mock);
    assert.strictEqual(saveRes.success, true);

    const fetched = await getSignalById(mock.signalId);
    assert.ok(fetched);
    assert.strictEqual(fetched.signalId, mock.signalId);
    assert.strictEqual(fetched.symbol, 'ETH/USDT');
    assert.strictEqual(fetched.tradeScore, 89);
    assert.strictEqual(fetched.confidence, 'A+');
    assert.strictEqual(fetched.status, 'BUY_NOW');
  });

  test('saveSignals batch persists multiple generated signals', async () => {
    const sig1 = createMockSignal({ symbol: 'AVAX/USDT', tradeScore: 78 });
    const sig2 = createMockSignal({ symbol: 'LINK/USDT', tradeScore: 75 });

    const batchRes = await saveSignals([sig1, sig2]);
    assert.strictEqual(batchRes.success, true);
    assert.strictEqual(batchRes.count, 2);

    const fetched1 = await getSignalById(sig1.signalId);
    const fetched2 = await getSignalById(sig2.signalId);

    assert.ok(fetched1);
    assert.strictEqual(fetched1.symbol, 'AVAX/USDT');
    assert.ok(fetched2);
    assert.strictEqual(fetched2.symbol, 'LINK/USDT');
  });

  test('getSignals applies filtering and pagination', async () => {
    const res = await getSignals({ limit: 10 });
    assert.strictEqual(res.records.length <= 10, true);
    assert.ok(res.total >= res.records.length);

    // Direction filter
    const buyRes = await getSignals({ direction: 'BUY', limit: 5 });
    for (const r of buyRes.records) {
      assert.strictEqual(r.direction, 'BUY');
    }

    // Min score filter
    const highScored = await getSignals({ minScore: 80, limit: 5 });
    for (const r of highScored.records) {
      assert.strictEqual(r.tradeScore >= 80, true);
    }

    // Only entry triggered filter
    const entryTriggeredRes = await getSignals({ onlyEntryTriggered: true, limit: 20 });
    for (const r of entryTriggeredRes.records) {
      const hasActualEntry = typeof r.actualEntry === 'number' && r.actualEntry > 0;
      const hasPostEntryLifecycle = ['ENTRY_TRIGGERED', 'ACTIVE', 'DCA1_TRIGGERED', 'DCA2_TRIGGERED', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT'].includes(r.lifecycle);
      const hasPostEntryResult = ['TP1_ONLY', 'TP2_REACHED', 'TP3_REACHED', 'FULL_TP', 'PARTIAL_TP_THEN_SL', 'SL', 'MANUAL_EXIT'].includes(r.finalResult ?? '');
      const hasRealizedR = typeof r.realizedR === 'number' && r.realizedR !== 0;
      assert.ok(hasActualEntry || hasPostEntryLifecycle || hasPostEntryResult || hasRealizedR);
    }
  });

  test('saveSignalEvent and getSignalEvents records lifecycle transitions', async () => {
    const mockSig = createMockSignal({ symbol: 'NEAR/USDT' });
    await saveSignal(mockSig);

    const event1: SignalLifecycleEvent = {
      eventId: `EVT-${Date.now()}-1`,
      signalId: mockSig.signalId,
      eventType: 'CREATED',
      timestamp: new Date().toISOString(),
      price: mockSig.preferredEntry,
    };

    const event2: SignalLifecycleEvent = {
      eventId: `EVT-${Date.now()}-2`,
      signalId: mockSig.signalId,
      eventType: 'ENTRY',
      timestamp: new Date().toISOString(),
      price: mockSig.preferredEntry,
      metadata: { filledSizeUsdt: 41.5 },
    };

    const res1 = await saveSignalEvent(event1);
    assert.strictEqual(res1.success, true);
    const res2 = await saveSignalEvent(event2);
    assert.strictEqual(res2.success, true);

    const events = await getSignalEvents(mockSig.signalId);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].eventType, 'CREATED');
    assert.strictEqual(events[1].eventType, 'ENTRY');

    // Confirm that ENTRY updated signal state
    const updatedSig = await getSignalById(mockSig.signalId);
    assert.ok(updatedSig);
    assert.strictEqual(updatedSig.actualEntry, mockSig.preferredEntry);
  });

  test('saveSignalEvaluation and getSignalEvaluation stores post-trade analytics', async () => {
    const mockSig = createMockSignal({ symbol: 'DOT/USDT' });
    await saveSignal(mockSig);

    const evaluation: SignalEvaluation = {
      signalId: mockSig.signalId,
      evaluatedAt: new Date().toISOString(),
      finalResult: 'FULL_TP',
      mfe: 6.8,
      mae: 0.9,
      realizedReturnPercent: 5.4,
      realizedR: 2.8,
      grossPnlUsdt: 8.4,
      netPnlUsdt: 8.1,
      feesUsdt: 0.25,
      slippageUsdt: 0.05,
      timeToEvent: {
        timeToEntryMs: 600000,
        timeToDca1Ms: null,
        timeToDca2Ms: null,
        timeToTp1Ms: 1800000,
        timeToTp2Ms: 3600000,
        timeToTp3Ms: 7200000,
        timeToSlMs: null,
        timeToExpiryMs: null,
      },
      slFailurePrimaryCause: null,
      slFailureSecondaryCauses: [],
      stopTightnessLabel: 'APPROPRIATE_STOP',
      counterfactualNote: null,
      evaluationText: 'Clean continuation setup with all 3 TPs hit.',
    };

    const res = await saveSignalEvaluation(evaluation);
    assert.strictEqual(res.success, true);

    const retrieved = await getSignalEvaluation(mockSig.signalId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.signalId, mockSig.signalId);
    assert.strictEqual(retrieved.finalResult, 'FULL_TP');
    assert.strictEqual(retrieved.realizedR, 2.8);
    assert.strictEqual(retrieved.mfe, 6.8);
    assert.strictEqual(retrieved.evaluationText, 'Clean continuation setup with all 3 TPs hit.');

    // Confirm signal record reflects evaluation metrics
    const updatedSig = await getSignalById(mockSig.signalId);
    assert.ok(updatedSig);
    assert.strictEqual(updatedSig.finalResult, 'FULL_TP');
    assert.strictEqual(updatedSig.realizedR, 2.8);
  });

  test('saveMarketSnapshot and getLatestMarketSnapshots stores market state', async () => {
    const snapshot: MarketSnapshot = {
      timestamp: new Date().toISOString(),
      symbol: 'SOL/USDT',
      price: 154.25,
      volume24h: 98000000,
      liquidity: 1.25,
      spread: 0.0003,
      marketRegime: 'BULL',
      indicators: { rsi: 61, atr: 3.2 },
    };

    const saveRes = await saveMarketSnapshot(snapshot);
    assert.strictEqual(saveRes.success, true);

    const snapshots = await getLatestMarketSnapshots(10);
    assert.ok(snapshots.length > 0);
    assert.strictEqual(snapshots[0].symbol, 'SOL/USDT');
    assert.strictEqual(snapshots[0].price, 154.25);
  });

  test('getStrategyVersions and saveStrategyVersion manages strategy iterations', async () => {
    const versions = await getStrategyVersions();
    assert.ok(versions.length >= 1);
    assert.strictEqual(versions.some((v) => v.version === 'v1.0.0'), true);

    const newVersion: StrategyVersionRecord = {
      version: 'v1.1.0-test',
      createdAt: new Date().toISOString(),
      description: 'Test Strategy with elevated momentum weight',
      parameters: { emaFast: 21, rsiPeriod: 14 },
      weights: {
        trend: 15,
        momentum: 25,
        volume: 15,
        structure: 20,
        liquidity: 15,
        volatility: 5,
        regime: 5,
      },
      isActive: false,
    };

    const saveRes = await saveStrategyVersion(newVersion);
    assert.strictEqual(saveRes.success, true);

    const updatedVersions = await getStrategyVersions();
    assert.strictEqual(updatedVersions.some((v) => v.version === 'v1.1.0-test'), true);
  });

  test('getStrategyParameters and saveStrategyParameter manages fine-grained parameters', async () => {
    const params = await getStrategyParameters('v1.0.0');
    assert.ok(params.length > 0);
    assert.strictEqual(params.some((p) => p.parameterKey === 'weight_trend'), true);

    const customParam: StrategyParameterRecord = {
      strategyVersion: 'v1.0.0',
      parameterKey: 'custom_test_threshold',
      parameterValue: '75',
      category: 'INDICATOR',
      description: 'Custom breakout threshold',
      minValue: 50,
      maxValue: 100,
      defaultValue: '75',
    };

    const saveRes = await saveStrategyParameter(customParam);
    assert.strictEqual(saveRes.success, true);

    const refreshed = await getStrategyParameters('v1.0.0');
    assert.strictEqual(refreshed.some((p) => p.parameterKey === 'custom_test_threshold'), true);
  });

  test('mapSignalToDbRow and mapDbRowToSignalRecord mapping preserves schema integrity', () => {
    const original = createMockSignal({ symbol: 'INJ/USDT', tradeScore: 82 });
    const dbRow = mapSignalToDbRow(original);

    assert.strictEqual(dbRow.signal_id, original.signalId);
    assert.strictEqual(dbRow.symbol, 'INJ/USDT');
    assert.strictEqual(dbRow.entry_low, original.entryZone.low);
    assert.strictEqual(dbRow.entry_high, original.entryZone.high);
    assert.strictEqual(dbRow.trade_score, 82);

    const reconstructed = mapDbRowToSignalRecord(dbRow);
    assert.strictEqual(reconstructed.signalId, original.signalId);
    assert.strictEqual(reconstructed.symbol, original.symbol);
    assert.strictEqual(reconstructed.entryZone.low, original.entryZone.low);
    assert.strictEqual(reconstructed.entryZone.high, original.entryZone.high);
    assert.strictEqual(reconstructed.tradeScore, original.tradeScore);
    assert.strictEqual(reconstructed.confidence, original.confidence);
  });

  test('mapEvaluationToDbRow and mapDbRowToEvaluation mapping preserves fields', () => {
    const evaluation: SignalEvaluation = {
      signalId: 'TEST-SIG-EVAL-01',
      evaluatedAt: new Date().toISOString(),
      finalResult: 'SL',
      mfe: 1.2,
      mae: 3.5,
      realizedReturnPercent: -3.0,
      realizedR: -1.0,
      grossPnlUsdt: -3.0,
      netPnlUsdt: -3.05,
      feesUsdt: 0.05,
      slippageUsdt: 0.01,
      timeToEvent: {
        timeToEntryMs: 120000,
        timeToDca1Ms: null,
        timeToDca2Ms: null,
        timeToTp1Ms: null,
        timeToTp2Ms: null,
        timeToTp3Ms: null,
        timeToSlMs: 900000,
        timeToExpiryMs: null,
      },
      slFailurePrimaryCause: 'FALSE_BREAKOUT',
      slFailureSecondaryCauses: ['WEAK_VOLUME'],
      stopTightnessLabel: 'APPROPRIATE_STOP',
      counterfactualNote: 'Price continued downward to -5%',
      evaluationText: 'False breakout invalidated by sudden BTC pullback',
    };

    const row = mapEvaluationToDbRow(evaluation);
    assert.strictEqual(row.signal_id, 'TEST-SIG-EVAL-01');
    assert.strictEqual(row.final_result, 'SL');
    assert.strictEqual(row.realized_r, -1.0);
    assert.strictEqual(row.sl_failure_primary_cause, 'FALSE_BREAKOUT');

    const mapped = mapDbRowToEvaluation(row);
    assert.strictEqual(mapped.signalId, 'TEST-SIG-EVAL-01');
    assert.strictEqual(mapped.finalResult, 'SL');
    assert.strictEqual(mapped.realizedR, -1.0);
    assert.strictEqual(mapped.slFailurePrimaryCause, 'FALSE_BREAKOUT');
    assert.strictEqual(mapped.timeToEvent.timeToSlMs, 900000);
  });

});
