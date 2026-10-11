// ─── Phase 15: Telegram Alerts & Notifications Unit Tests ──────────────

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { Signal } from '../../types/index.ts';
import {
  formatSignalCreatedMessage,
  formatLifecycleEventMessage,
  generateAlertKey,
  isDuplicateAlert,
  recordAlertSent,
  clearDeduplicationCache,
  dispatchTelegramAlert,
  broadcastNewSignal,
  updateTelegramConfig,
  getTelegramConfig,
  DEFAULT_TELEGRAM_CONFIG,
} from '../services/telegram-service.ts';

const mockSignal: Signal = {
  signalId: 'sig-test-101',
  symbol: 'SOL/USDT',
  direction: 'BUY',
  createdAt: new Date().toISOString(),
  strategyVersion: 'v1.0.0',
  marketRegime: 'BULL',
  candidateScore: 88,
  tradeScore: 92,
  setupType: 'BREAKOUT_RETEST',
  entryZone: { low: 147.5, high: 149.0 },
  preferredEntry: 148.2,
  dca1: 144.0,
  dca2: 140.0,
  stopLoss: 137.5,
  tp1: 154.0,
  tp2: 160.0,
  tp3: 168.0,
  riskPercent: 0.75,
  maxLoss: 2.25,
  initialAllocation: 150,
  dca1Allocation: 90,
  dca2Allocation: 60,
  maxDeployed: 300,
  riskReward: 2.5,
  confidence: 'A+',
  status: 'BUY_NOW',
  lifecycle: 'CREATED',
  expiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
};

describe('Phase 15: Telegram Alerts & Notifications', () => {
  beforeEach(() => {
    clearDeduplicationCache();
    updateTelegramConfig(DEFAULT_TELEGRAM_CONFIG);
  });

  describe('Message Formatting Engine', () => {
    it('formats a high-contrast signal creation message with complete trade plan and position sizes', () => {
      const msg = formatSignalCreatedMessage(mockSignal);

      assert.ok(msg.includes('SOL/USDT'));
      assert.ok(msg.includes('[A+]'));
      assert.ok(msg.includes('BREAKOUT_RETEST'));
      assert.ok(msg.includes('CONFIRMED (BUY NOW)'));
      // Entry & Position sizing
      assert.ok(msg.includes('148.20')); // Preferred entry
      assert.ok(msg.includes('$150.00')); // Entry allocation
      // DCA 1 & 2 levels and sizes
      assert.ok(msg.includes('144.00')); // DCA 1
      assert.ok(msg.includes('$90.00')); // DCA 1 allocation
      assert.ok(msg.includes('140.00')); // DCA 2
      assert.ok(msg.includes('$60.00')); // DCA 2 allocation
      assert.ok(msg.includes('$300.00')); // Total deployed
      // Take Profits & Sizes
      assert.ok(msg.includes('154.00')); // TP1
      assert.ok(msg.includes('160.00')); // TP2
      assert.ok(msg.includes('168.00')); // TP3
      assert.ok(msg.includes('Ratchet SL to Breakeven'));
      // Stop Loss & Risk
      assert.ok(msg.includes('137.50')); // SL
      assert.ok(msg.includes('2.25')); // Max loss
    });

    it('formats lifecycle transition alerts with appropriate details and emojis', () => {
      const entryMsg = formatLifecycleEventMessage({
        eventType: 'ENTRY_FILLED',
        symbol: 'SOL/USDT',
        price: 148.2,
      });
      assert.ok(entryMsg.includes('ENTRY TRIGGERED'));
      assert.ok(entryMsg.includes('148.20'));

      const dcaMsg = formatLifecycleEventMessage({
        eventType: 'DCA_FILLED',
        symbol: 'SOL/USDT',
        price: 144.0,
        targetReached: 'DCA1',
        details: 'Volume-weighted average entry updated to $146.50',
      });
      assert.ok(dcaMsg.includes('SAFETY TRANCHE FILLED'));
      assert.ok(dcaMsg.includes('DCA1'));

      const tpMsg = formatLifecycleEventMessage({
        eventType: 'TP_HIT',
        symbol: 'SOL/USDT',
        price: 154.0,
        targetReached: 'TP1',
        realizedR: 1.25,
        pnlUsdt: 8.75,
      });
      assert.ok(tpMsg.includes('TARGET REACHED'));
      assert.ok(tpMsg.includes('TP1'));
      assert.ok(tpMsg.includes('STOP LOSS RATCHETED TO BREAKEVEN'));
      assert.ok(tpMsg.includes('8.75'));

      const slMsg = formatLifecycleEventMessage({
        eventType: 'SL_HIT',
        symbol: 'SOL/USDT',
        price: 137.5,
        realizedR: -1.0,
        pnlUsdt: -2.25,
      });
      assert.ok(slMsg.includes('STOP LOSS TRIGGERED'));
      assert.ok(slMsg.includes('-1.00R'));
    });
  });

  describe('Duplicate Alert Protection Engine', () => {
    it('generates consistent deduplication keys', () => {
      const key1 = generateAlertKey({
        eventType: 'TP_HIT',
        signalId: 'sig-123',
        symbol: 'SOL/USDT',
        targetReached: 'TP1',
      });

      assert.strictEqual(key1, 'sig-123_TP_HIT_TP1');
    });

    it('detects and suppresses duplicate alerts within suppression window', () => {
      const payload = {
        eventType: 'ENTRY_FILLED' as const,
        signalId: 'sig-999',
        symbol: 'ETH/USDT',
        price: 3500,
      };

      assert.strictEqual(isDuplicateAlert(payload, 300000), false);
      recordAlertSent(payload);
      assert.strictEqual(isDuplicateAlert(payload, 300000), true);

      // Verify clear resets suppression
      clearDeduplicationCache();
      assert.strictEqual(isDuplicateAlert(payload, 300000), false);
    });
  });

  describe('Dispatcher & Event Preferences', () => {
    it('dispatches alerts in mock mode when credentials are not configured', async () => {
      updateTelegramConfig({ enabled: true, botToken: '', chatId: '' });

      const result = await dispatchTelegramAlert({
        eventType: 'ENTRY_FILLED',
        signalId: 'sig-test-entry',
        symbol: 'SOL/USDT',
        price: 148.2,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mocked, true);
      assert.ok(result.messageId);

      // Second dispatch should be suppressed by duplicate protection
      const dupResult = await dispatchTelegramAlert({
        eventType: 'ENTRY_FILLED',
        signalId: 'sig-test-entry',
        symbol: 'SOL/USDT',
        price: 148.2,
      });

      assert.strictEqual(dupResult.success, true);
      assert.strictEqual(dupResult.deduplicated, true);
    });

    it('blocks dispatch when specific event type is disabled in user preferences', async () => {
      updateTelegramConfig({
        enabled: true,
        events: {
          ...getTelegramConfig().events,
          onDcaFilled: false,
        },
      });

      const result = await dispatchTelegramAlert({
        eventType: 'DCA_FILLED',
        signalId: 'sig-test-dca',
        symbol: 'SOL/USDT',
        price: 144.0,
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('disabled in Telegram settings'));
    });

    it('strictly enforces that only confirmed signals are dispatched to Telegram', async () => {
      updateTelegramConfig({ enabled: true, botToken: '', chatId: '' });

      // 1. Unconfirmed signal (WAIT_FOR_CONFIRMATION) should be rejected
      const unconfirmedSignal: Signal = {
        ...mockSignal,
        signalId: 'sig-unconfirmed-1',
        status: 'WAIT_FOR_CONFIRMATION',
      };
      const unconfirmedRes = await broadcastNewSignal(unconfirmedSignal);
      assert.strictEqual(unconfirmedRes.success, false);
      assert.ok(unconfirmedRes.error?.includes('is unconfirmed'));

      // 2. Unconfirmed signal with WATCH status should be rejected
      const watchSignal: Signal = {
        ...mockSignal,
        signalId: 'sig-watch-1',
        status: 'WATCH',
      };
      const watchRes = await broadcastNewSignal(watchSignal);
      assert.strictEqual(watchRes.success, false);
      assert.ok(watchRes.error?.includes('is unconfirmed'));

      // 3. Below threshold signal should be rejected
      const belowSignal: Signal = {
        ...mockSignal,
        signalId: 'sig-below-1',
        confidence: 'BELOW_THRESHOLD',
      };
      const belowRes = await broadcastNewSignal(belowSignal);
      assert.strictEqual(belowRes.success, false);

      // 4. Confirmed BUY_NOW signal should be accepted and broadcast
      const confirmedSignal: Signal = {
        ...mockSignal,
        signalId: 'sig-confirmed-1',
        status: 'BUY_NOW',
        confidence: 'A',
      };
      const confirmedRes = await broadcastNewSignal(confirmedSignal);
      assert.strictEqual(confirmedRes.success, true);
      assert.strictEqual(confirmedRes.mocked, true);
    });

    it('broadcasts newly generated confirmed signal cleanly', async () => {
      updateTelegramConfig({ enabled: true, botToken: '', chatId: '' });

      const result = await broadcastNewSignal(mockSignal);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mocked, true);

      // Attempting immediate re-broadcast is caught by duplicate protection
      const dup = await broadcastNewSignal(mockSignal);
      assert.strictEqual(dup.success, true);
      assert.strictEqual(dup.deduplicated, true);
    });
  });
});
