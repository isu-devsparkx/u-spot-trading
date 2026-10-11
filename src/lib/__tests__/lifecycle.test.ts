import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  evaluateSignalLifecycleStep,
  calculatePositionAverage,
  processActiveSignalsLifecycle,
} from '../services/lifecycle-service.ts';
import { saveSignal, getSignalById } from '../services/signal-store.ts';
import type { SignalHistoryRecord } from '../../types/index.ts';

function createMockSignal(overrides: Partial<SignalHistoryRecord> = {}): SignalHistoryRecord {
  return {
    signalId: `TEST-LIFE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: 'SOL/USDT',
    direction: 'BUY',
    createdAt: new Date().toISOString(),
    strategyVersion: 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 85,
    tradeScore: 82,
    setupType: 'PULLBACK_CONTINUATION',
    entryZone: { low: 148.0, high: 152.0 },
    preferredEntry: 150.0,
    dca1: 144.0,
    dca2: 139.0,
    stopLoss: 135.0,
    tp1: 158.0,
    tp2: 165.0,
    tp3: 175.0,
    riskPercent: 1.0,
    maxLoss: 3.0,
    initialAllocation: 40.0,
    dca1Allocation: 24.0,
    dca2Allocation: 16.0,
    maxDeployed: 80.0,
    riskReward: 2.5,
    confidence: 'A+',
    status: 'WAIT_FOR_CONFIRMATION',
    lifecycle: 'CREATED',
    expiresAt: new Date(Date.now() + 14400000).toISOString(), // 4h from now
    actualEntry: null,
    dca1Hit: false,
    dca2Hit: false,
    finalResult: null,
    mfe: null,
    mae: null,
    realizedReturn: null,
    realizedR: null,
    fees: null,
    slippage: null,
    evaluationText: null,
    ...overrides,
  };
}

describe('Phase 9: Signal Lifecycle Tracking Engine', () => {

  test('calculatePositionAverage computes weighted entries for single, DCA1, and DCA2 tranches', () => {
    const base = createMockSignal({ actualEntry: 150.0, initialAllocation: 40.0 });
    const single = calculatePositionAverage(base);
    assert.strictEqual(single.averageEntryPrice, 150.0);
    assert.strictEqual(single.totalDeployedUsdt, 40.0);

    // After DCA 1 (24 USDT at $144)
    const withDca1 = createMockSignal({
      actualEntry: 150.0,
      initialAllocation: 40.0,
      dca1: 144.0,
      dca1Allocation: 24.0,
      dca1Hit: true,
    });
    const avg1 = calculatePositionAverage(withDca1);
    assert.strictEqual(avg1.totalDeployedUsdt, 64.0);
    // 40/150 = 0.26666, 24/144 = 0.16666, total = 0.43333 -> 64 / 0.43333 = 147.69
    assert.ok(avg1.averageEntryPrice < 150.0 && avg1.averageEntryPrice > 144.0);
    assert.strictEqual(Math.round(avg1.averageEntryPrice * 100) / 100, 147.69);

    // After DCA 2 (16 USDT at $139)
    const withDca2 = createMockSignal({
      ...withDca1,
      dca2: 139.0,
      dca2Allocation: 16.0,
      dca2Hit: true,
    });
    const avg2 = calculatePositionAverage(withDca2);
    assert.strictEqual(avg2.totalDeployedUsdt, 80.0);
    assert.ok(avg2.averageEntryPrice < avg1.averageEntryPrice);
  });

  test('Pre-Entry: Signal remains CREATED if price has not touched entry zone', () => {
    const sig = createMockSignal();
    const { updatedSignal, events } = evaluateSignalLifecycleStep(sig, { price: 155.0 });

    assert.strictEqual(updatedSignal.lifecycle, 'CREATED');
    assert.strictEqual(events.length, 0);
  });

  test('Pre-Entry: Signal expires when current time exceeds expiresAt', () => {
    const expiredSig = createMockSignal({
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    });

    const { updatedSignal, events, transitions } = evaluateSignalLifecycleStep(expiredSig, {
      price: 153.0,
    });

    assert.strictEqual(updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(updatedSignal.finalResult, 'EXPIRED');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'EXPIRED');
    assert.strictEqual(transitions.length, 1);
  });

  test('Pre-Entry: Invalidation triggers if price breaks below stop loss before entry', () => {
    const sig = createMockSignal({ stopLoss: 135.0 });
    const { updatedSignal, events } = evaluateSignalLifecycleStep(sig, {
      price: 134.0,
      low: 133.5,
    });

    assert.strictEqual(updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(updatedSignal.finalResult, 'INVALIDATED_BEFORE_ENTRY');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'INVALIDATED');
  });

  test('Entry: Triggers ENTRY when price enters entry zone [$148 - $152]', () => {
    const sig = createMockSignal({ preferredEntry: 150.0 });
    const { updatedSignal, events, transitions } = evaluateSignalLifecycleStep(sig, {
      price: 149.5,
      low: 149.0,
      high: 151.0,
    });

    assert.strictEqual(updatedSignal.lifecycle, 'ACTIVE');
    assert.strictEqual(updatedSignal.actualEntry, 149.5);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'ENTRY');
    assert.strictEqual(transitions[0].newLifecycle, 'ACTIVE');
  });

  test('Active: DCA 1 triggers when price pulls back to dca1 level', () => {
    const activeSig = createMockSignal({
      lifecycle: 'ACTIVE',
      actualEntry: 150.0,
      dca1: 144.0,
    });

    const { updatedSignal, events } = evaluateSignalLifecycleStep(activeSig, {
      price: 143.5,
      low: 143.0,
      high: 148.0,
    });

    assert.strictEqual(updatedSignal.dca1Hit, true);
    assert.strictEqual(updatedSignal.lifecycle, 'DCA1_TRIGGERED');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'DCA1');
  });

  test('Active: DCA 2 triggers sequentially after DCA 1 when price reaches dca2 level', () => {
    const dca1Sig = createMockSignal({
      lifecycle: 'DCA1_TRIGGERED',
      actualEntry: 150.0,
      dca1Hit: true,
      dca1: 144.0,
      dca2: 139.0,
    });

    const { updatedSignal, events } = evaluateSignalLifecycleStep(dca1Sig, {
      price: 138.5,
      low: 138.0,
      high: 142.0,
    });

    assert.strictEqual(updatedSignal.dca2Hit, true);
    assert.strictEqual(updatedSignal.lifecycle, 'DCA2_TRIGGERED');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'DCA2');
  });

  test('Active: Stop Loss liquidates position and records SL result', () => {
    const activeSig = createMockSignal({
      lifecycle: 'ACTIVE',
      actualEntry: 150.0,
      stopLoss: 135.0,
    });

    const { updatedSignal, events } = evaluateSignalLifecycleStep(activeSig, {
      price: 134.5,
      low: 134.0,
      high: 140.0,
    });

    assert.strictEqual(updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(updatedSignal.finalResult, 'SL');
    assert.strictEqual(updatedSignal.realizedR, -1.0);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, 'SL');
  });

  test('Active: Stop Loss after partial TP records PARTIAL_TP_THEN_SL', () => {
    const tp1Sig = createMockSignal({
      lifecycle: 'TP1_HIT',
      actualEntry: 150.0,
      finalResult: 'TP1_ONLY',
      stopLoss: 135.0,
    });

    const { updatedSignal, events } = evaluateSignalLifecycleStep(tp1Sig, {
      price: 134.0,
      low: 133.0,
    });

    assert.strictEqual(updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(updatedSignal.finalResult, 'PARTIAL_TP_THEN_SL');
    assert.ok(updatedSignal.realizedR! >= 0);
  });

  test('Active: Spec Section 17 Indeterminate resolution when candle spans both SL and TP1', () => {
    const activeSig = createMockSignal({
      lifecycle: 'ACTIVE',
      actualEntry: 150.0,
      stopLoss: 135.0,
      tp1: 158.0,
    });

    const { updatedSignal, events } = evaluateSignalLifecycleStep(activeSig, {
      price: 145.0,
      low: 134.0, // Touches SL
      high: 160.0, // Touches TP1
    });

    assert.strictEqual(updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(updatedSignal.finalResult, 'INDETERMINATE');
    assert.strictEqual(events[0].eventType, 'INDETERMINATE');
  });

  test('Active: Sequential Take Profits hit TP1, TP2, and FULL_TP on TP3', () => {
    let sig = createMockSignal({
      lifecycle: 'ACTIVE',
      actualEntry: 150.0,
      tp1: 158.0,
      tp2: 165.0,
      tp3: 175.0,
    });

    // Step 1: Hit TP1 (159.0)
    const step1 = evaluateSignalLifecycleStep(sig, { price: 159.0, high: 159.5, low: 151.0 });
    assert.strictEqual(step1.updatedSignal.lifecycle, 'TP1_HIT');
    assert.strictEqual(step1.updatedSignal.finalResult, 'TP1_ONLY');
    assert.strictEqual(step1.events[0].eventType, 'TP1');

    sig = step1.updatedSignal;

    // Step 2: Hit TP2 (166.0)
    const step2 = evaluateSignalLifecycleStep(sig, { price: 166.0, high: 167.0, low: 158.0 });
    assert.strictEqual(step2.updatedSignal.lifecycle, 'TP2_HIT');
    assert.strictEqual(step2.updatedSignal.finalResult, 'TP2_REACHED');
    assert.strictEqual(step2.events[0].eventType, 'TP2');

    sig = step2.updatedSignal;

    // Step 3: Hit TP3 (176.0) -> Full Close
    const step3 = evaluateSignalLifecycleStep(sig, { price: 176.0, high: 177.0, low: 165.0 });
    assert.strictEqual(step3.updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(step3.updatedSignal.finalResult, 'FULL_TP');
    assert.ok(step3.updatedSignal.realizedR! > 1.5);
    assert.strictEqual(step3.events[0].eventType, 'TP3');
  });

  test('Batch Runner: processActiveSignalsLifecycle sweeps signals against price map', async () => {
    const testSig = createMockSignal({
      symbol: 'LTC/USDT',
      entryZone: { low: 80.0, high: 84.0 },
      preferredEntry: 82.0,
      stopLoss: 75.0,
      tp1: 88.0,
      tp2: 92.0,
      tp3: 100.0,
      lifecycle: 'CREATED',
    });

    await saveSignal(testSig);

    const summary = await processActiveSignalsLifecycle({
      'LTC/USDT': { price: 81.5, low: 81.0, high: 83.0 },
    });

    assert.ok(summary);
    assert.strictEqual(typeof summary.processedCount, 'number');
    assert.ok(summary.processedCount >= 1);

    // Verify signal transitioned in store
    const updated = await getSignalById(testSig.signalId);
    assert.ok(updated);
    assert.strictEqual(updated.lifecycle, 'ACTIVE');
    assert.strictEqual(updated.actualEntry, 81.5);
  });

  test('Phase 24: Trailing Stop ratchets stop to TP1 on TP2 hit, trails upward on highs, and closes with locked profit', () => {
    let sig = createMockSignal({
      lifecycle: 'ACTIVE',
      actualEntry: 150.0,
      stopLoss: 135.0,
      tp1: 158.0,
      tp2: 165.0,
      tp3: 175.0,
    });

    // 1. Hit TP1 at 159.0
    const step1 = evaluateSignalLifecycleStep(sig, { price: 159.0, high: 159.5, low: 151.0 });
    assert.strictEqual(step1.updatedSignal.lifecycle, 'TP1_HIT');
    assert.strictEqual(step1.updatedSignal.finalResult, 'TP1_ONLY');
    sig = step1.updatedSignal;

    // 2. Hit TP2 at 166.0 (high: 166.0, low: 155.0)
    const step2 = evaluateSignalLifecycleStep(sig, { price: 166.0, high: 166.0, low: 155.0 });
    assert.strictEqual(step2.updatedSignal.lifecycle, 'TP2_HIT');
    assert.strictEqual(step2.updatedSignal.finalResult, 'TP2_REACHED');
    assert.ok(step2.updatedSignal.trailingStopPrice! >= 158.0);
    assert.strictEqual(step2.updatedSignal.trailingStopPrice, 158.0);
    sig = step2.updatedSignal;

    // 3. Candle pushes higher to 172.0 (below TP3: 175.0)
    // Dynamic trail candidate: 172.0 - 15 * 0.75 = 160.75
    const step3 = evaluateSignalLifecycleStep(sig, { price: 170.0, high: 172.0, low: 162.0 });
    assert.strictEqual(step3.updatedSignal.lifecycle, 'TP2_HIT');
    assert.strictEqual(step3.updatedSignal.trailingStopPrice, 160.75);
    sig = step3.updatedSignal;

    // 4. Pullback touches ratcheted trailing stop (160.75)
    const step4 = evaluateSignalLifecycleStep(sig, { price: 160.0, high: 162.0, low: 160.0 });
    assert.strictEqual(step4.updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(step4.updatedSignal.finalResult, 'TP2_REACHED');
    assert.strictEqual(step4.updatedSignal.realizedR, 0.75);
    assert.ok(step4.updatedSignal.evaluationText?.includes('Trailing Stop'));
    assert.strictEqual(step4.events[0].metadata?.isTrailingStopWin, true);
  });

  test('invalidates setup before entry if price rallies to TP1 without filling entry zone', () => {
    const sig = createMockSignal({
      lifecycle: 'CREATED',
      preferredEntry: 100.0,
      entryZone: { low: 98.0, high: 101.0 },
      stopLoss: 95.0,
      tp1: 106.0,
      tp2: 110.0,
      tp3: 115.0,
    });

    // Candle rallies to 107.0 (above TP1) while candleLow is 102.0 (never touches entryZone [98, 101])
    const step = evaluateSignalLifecycleStep(sig, { price: 106.5, high: 107.0, low: 102.0 });

    assert.strictEqual(step.updatedSignal.lifecycle, 'CLOSED');
    assert.strictEqual(step.updatedSignal.finalResult, 'INVALIDATED_BEFORE_ENTRY');
    assert.strictEqual(step.updatedSignal.realizedR, 0);
    assert.ok(
      typeof step.events[0].metadata?.reason === 'string'
        ? (step.events[0].metadata.reason as string).includes('TP1')
        : step.updatedSignal.evaluationText?.includes('TP1')
    );
  });

  test('strictly prevents TP1 trigger when postDcaAvg is greater than or equal to TP1', () => {
    const corruptSig = createMockSignal({
      lifecycle: 'ACTIVE',
      actualEntry: 110.0, // Erroneously filled above TP1
      stopLoss: 95.0,
      tp1: 105.0,
      tp2: 112.0,
      tp3: 120.0,
    });

    // Candle touches 108.0 (>= tp1 105.0, but < actualEntry 110.0)
    const step = evaluateSignalLifecycleStep(corruptSig, { price: 108.0, high: 108.5, low: 106.0 });

    // Must NOT trigger TP1 because average entry (110.0) is higher than TP1 (105.0)
    assert.notStrictEqual(step.updatedSignal.finalResult, 'TP1_ONLY');
    assert.notStrictEqual(step.updatedSignal.lifecycle, 'TP1_HIT');
  });

});
