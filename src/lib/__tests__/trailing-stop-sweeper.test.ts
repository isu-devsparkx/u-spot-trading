import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSignalLifecycleStep,
  processActiveSignalsLifecycle,
} from '../services/lifecycle-service.ts';
import { saveSignal, getSignalById } from '../services/signal-store.ts';
import type { SignalHistoryRecord } from '../../types/index.ts';

function createMockActiveTrade(overrides: Partial<SignalHistoryRecord> = {}): SignalHistoryRecord {
  return {
    signalId: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    symbol: 'SOL/USDT',
    direction: 'BUY',
    createdAt: new Date().toISOString(),
    strategyVersion: 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 85,
    setupType: 'TREND_CONTINUATION',
    entryZone: { low: 99.0, high: 101.0 },
    preferredEntry: 100.0,
    actualEntry: 100.0,
    stopLoss: 95.0, // unitRisk = 5.0
    dca1: 97.0,
    dca2: 95.5,
    tp1: 106.0, // +1.2R
    tp2: 112.5, // +2.5R
    tp3: 119.0, // +3.8R
    tradeScore: 88,
    riskPercent: 1.0,
    maxLoss: 10.0,
    initialAllocation: 100.0,
    dca1Allocation: 50.0,
    dca2Allocation: 30.0,
    maxDeployed: 180.0,
    riskReward: 2.5,
    confidence: 'A+',
    status: 'BUY_NOW',
    lifecycle: 'ACTIVE',
    expiresAt: new Date(Date.now() + 14400000).toISOString(),
    dca1Hit: false,
    dca2Hit: false,
    finalResult: null,
    mfe: 0,
    mae: 0,
    realizedReturn: null,
    realizedR: null,
    fees: 0,
    slippage: 0,
    evaluationText: null,
    ...overrides,
  };
}

describe('Phase 26: Dynamic ATR Trailing Stops on Active Trade Live Sweeper', () => {
  test('Post-TP1 Dynamic Trailing Stop Ratchet: elevates trailing stop above breakeven when price surges towards TP2', () => {
    // 1. Trade enters and hits TP1 (30% scale out at $106.00)
    const baseSignal = createMockActiveTrade();
    const tp1Tick = { price: 106.5, high: 106.5, low: 100.0 };
    const step1 = evaluateSignalLifecycleStep(baseSignal, tp1Tick);
    
    assert.equal(step1.updatedSignal.lifecycle, 'TP1_HIT');
    assert.equal(step1.updatedSignal.finalResult, 'TP1_ONLY');
    
    // 2. Next tick surges to $108.50 (entry=100, unitRisk=5, so 108.50 >= 100 + 5 * 1.25 = 106.25)
    // dynamicTrailCandidate = 108.50 - 5 * 0.85 = 108.50 - 4.25 = 104.25
    // Trailing stop should elevate to $104.25, well above breakeven ($100.00)!
    const surgeTick = { price: 108.0, high: 108.5, low: 106.0 };
    const step2 = evaluateSignalLifecycleStep(step1.updatedSignal, surgeTick);

    assert.ok(step2.updatedSignal.trailingStopPrice !== undefined);
    assert.ok(step2.updatedSignal.trailingStopPrice! >= 104.25);
    assert.ok(step2.updatedSignal.trailingStopPrice! > step2.updatedSignal.actualEntry!);
  });

  test('Protected Exit at Elevated Post-TP1 Trailing Stop: locks in positive R and preserves TP1_ONLY outcome', () => {
    // Trade has TP1 hit and trailing stop ratcheted to $104.25
    const elevatedSignal = createMockActiveTrade({
      lifecycle: 'TP1_HIT',
      finalResult: 'TP1_ONLY',
      trailingStopPrice: 104.25,
      actualEntry: 100.0,
      stopLoss: 95.0,
      tp1: 106.0,
    });

    // Price pulls back and hits $104.00 (below trailing stop $104.25)
    const pullbackTick = { price: 104.0, high: 105.0, low: 103.8 };
    const result = evaluateSignalLifecycleStep(elevatedSignal, pullbackTick);

    assert.equal(result.updatedSignal.lifecycle, 'CLOSED');
    assert.equal(result.updatedSignal.finalResult, 'TP1_ONLY');
    // Realized R: 30% of TP1 (+6) + 70% of Trailing (+4.25) = 1.8 + 2.975 = 4.775 / 5.0 = +0.96R
    assert.ok(result.updatedSignal.realizedR !== null && result.updatedSignal.realizedR > 0.8);
    assert.ok(result.updatedSignal.evaluationText?.includes('Trailing Stop'));
    
    // Check transition event metadata
    const slEvent = result.events.find((e) => e.eventType === 'SL');
    assert.ok(slEvent);
    assert.equal(slEvent?.metadata?.isTrailingStopWin, true);
  });

  test('Post-TP2 Trailing Stop Ratchet: elevates trailing stop above TP1 with unit risk buffer', () => {
    const tp2Signal = createMockActiveTrade({
      lifecycle: 'TP1_HIT',
      finalResult: 'TP1_ONLY',
      actualEntry: 100.0,
      stopLoss: 95.0,
      tp1: 106.0,
      tp2: 112.5,
      tp3: 119.0,
    });

    // Price hits TP2 at $113.00
    const tp2Tick = { price: 113.0, high: 113.0, low: 106.0 };
    const step1 = evaluateSignalLifecycleStep(tp2Signal, tp2Tick);

    assert.equal(step1.updatedSignal.lifecycle, 'TP2_HIT');
    assert.equal(step1.updatedSignal.finalResult, 'TP2_REACHED');
    assert.ok(step1.updatedSignal.trailingStopPrice! >= 106.0); // At least TP1

    // Candle high extends to $116.00 (unitRisk = 5, dynamic = 116 - 5 * 0.75 = 112.25)
    const extendTick = { price: 115.5, high: 116.0, low: 112.5 };
    const step2 = evaluateSignalLifecycleStep(step1.updatedSignal, extendTick);

    assert.ok(step2.updatedSignal.trailingStopPrice! >= 112.25);
    assert.ok(step2.updatedSignal.trailingStopPrice! > step1.updatedSignal.tp1);
  });

  test('Live Sweeper Persistence & Ratchet Event: generates TRAILING_STOP_RATCHET and persists to database', async () => {
    const signal = createMockActiveTrade({
      symbol: 'ETH/USDT',
      lifecycle: 'TP1_HIT',
      finalResult: 'TP1_ONLY',
      actualEntry: 100.0,
      stopLoss: 95.0,
      tp1: 106.0,
      trailingStopPrice: 100.0, // currently at breakeven
    });
    await saveSignal(signal);

    // Mock high price tick that pushes trailing stop from 100.0 to 104.25
    const mockPrices = {
      ETHUSDT: { price: 108.0, high: 108.5, low: 107.0 },
    };

    const summary = await processActiveSignalsLifecycle(mockPrices);
    assert.ok(summary.processedCount > 0);

    // Verify signal in store has the elevated trailing stop saved
    const persisted = await getSignalById(signal.signalId);
    assert.ok(persisted);
    assert.ok(persisted.trailingStopPrice! >= 104.0);

    // Verify a transition or ratchet event was triggered
    const ratchetTransition = summary.transitions.find(
      (t) => t.event.eventType === 'TRAILING_STOP_RATCHET'
    );
    assert.ok(ratchetTransition);
    assert.ok(ratchetTransition.message.includes('Trailing stop elevated'));
  });
});
