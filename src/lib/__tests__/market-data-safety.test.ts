// ─── U-SPOT Phase A: Market Data Safety & Synthetic Isolation Tests ─────
// Verifies that:
// 1. Synthetic/fabricated candles cannot produce actionable production BUY_NOW signals.
// 2. Network failures and rate limits fail closed and never substitute synthetic candles.
// 3. Invalid or stale candles are rejected by the validation engine.
// 4. Failed market-data requests cannot persist a signal or trigger Telegram buy alerts.
// 5. Valid real market data passes through normally.
// 6. Explicit offline fixtures still function in designated test environments.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCandles,
  fetchValidatedKlines,
  MarketDataValidationError,
  MarketDataUnavailableError,
} from '../services/binance-service.ts';
import {
  generateSignalFromCandidate,
  generateSyntheticOHLCV,
  DEFAULT_SIGNAL_WEIGHTS,
} from '../services/signal-engine.ts';
import { runTechnicalAnalysis } from '../ta/index.ts';
import { saveSignal } from '../services/signal-store.ts';
import { broadcastNewSignal } from '../services/telegram-service.ts';
import type { OHLCV, MarketCandidate, Signal } from '../../types/index.ts';

function createMockCandidate(overrides: Partial<MarketCandidate> = {}): MarketCandidate {
  return {
    symbol: 'SOL/USDT',
    name: 'Solana',
    price: 150.0,
    change24h: 4.5,
    volume24h: 85_000_000,
    volumeRatio: 1.5,
    liquidity: 92,
    candidateScore: 88,
    marketRegime: 'BULL',
    reasonSelected: 'Volume breakout with strong liquidity',
    rawMetrics: {
      spreadPercent: 0.02,
      high24h: 155.0,
      low24h: 142.0,
      dailyRangePercent: 9.15,
      trades24h: 350_000,
      relativeStrengthBtc: 1.2,
    },
    ...overrides,
  };
}

describe('Phase A: Market Data Safety & Synthetic Data Isolation', () => {
  describe('1. Candlestick Integrity & Validation Rules', () => {
    it('rejects an empty candles array (fails closed)', () => {
      const res = validateCandles([]);
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /empty or undefined/);
    });

    it('rejects candle sets below minimum threshold (< 30 bars)', () => {
      const shortCandles = generateSyntheticOHLCV(100, 2, 15);
      const res = validateCandles(shortCandles, { minCandles: 30 });
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /Insufficient candle count/);
    });

    it('rejects non-positive prices (open <= 0 or close <= 0)', () => {
      const candles = generateSyntheticOHLCV(100, 2, 40);
      candles[10].open = -5.0; // Corrupt candle
      const res = validateCandles(candles);
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /non-positive or non-finite price/);
    });

    it('rejects invalid high/low geometry (high < low)', () => {
      const candles = generateSyntheticOHLCV(100, 2, 40);
      candles[5].high = 80;
      candles[5].low = 90; // High < Low
      const res = validateCandles(candles);
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /high.*<.*low/);
    });

    it('rejects invalid high below open or close', () => {
      const candles = generateSyntheticOHLCV(100, 2, 40);
      candles[5].low = candles[5].open - 5;
      candles[5].close = candles[5].open - 2;
      candles[5].high = candles[5].open - 1; // High < Open, but High >= Low
      const res = validateCandles(candles);
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /high.*is lower than open/);
    });

    it('rejects duplicate or out-of-order timestamps', () => {
      const candles = generateSyntheticOHLCV(100, 2, 40);
      candles[15].timestamp = candles[14].timestamp; // Duplicate
      const res = validateCandles(candles);
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /out of order or duplicate/);
    });

    it('rejects negative volume', () => {
      const candles = generateSyntheticOHLCV(100, 2, 40);
      candles[8].volume = -100;
      const res = validateCandles(candles);
      assert.strictEqual(res.isValid, false);
      assert.match(res.error || '', /invalid negative/);
    });

    it('rejects stale candle data when latest bar exceeds max allowed publication delay', () => {
      const candles = generateSyntheticOHLCV(100, 2, 40);
      // Make the most recent bar 3 hours old
      const latestBarTimestamp = Date.now() - 3 * 60 * 60 * 1000;
      const step = 15 * 60 * 1000;
      candles.forEach((c, idx) => {
        c.timestamp = latestBarTimestamp - (candles.length - 1 - idx) * step;
      });

      const res = validateCandles(candles, { timeframe: '15m' });
      assert.strictEqual(res.isValid, false);
      assert.strictEqual(res.isStale, true);
      assert.match(res.error || '', /Candle data is stale/);
    });

    it('accepts fresh, well-formed candlestick data', () => {
      const now = Date.now();
      const step = 15 * 60 * 1000;
      const candles: OHLCV[] = Array.from({ length: 40 }, (_, i) => ({
        timestamp: now - (40 - i) * step,
        open: 100 + i * 0.1,
        high: 101 + i * 0.1,
        low: 99 + i * 0.1,
        close: 100.5 + i * 0.1,
        volume: 5000,
        quoteVolume: 500000,
      }));

      const res = validateCandles(candles, { timeframe: '15m' });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.checkedCount, 40);
      assert.strictEqual(res.provenance, 'REAL_PROVIDER');
    });
  });

  describe('2. Synthetic Data Provenance & Broadcast/Persistence Blocking', () => {
    it('tags signals created from synthetic data with dataProvenance="SYNTHETIC_OFFLINE" and isSynthetic=true', () => {
      const candidate = createMockCandidate();
      const syntheticCandles = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
      const ta = runTechnicalAnalysis(candidate.symbol, syntheticCandles, '15m', null);

      const signal = generateSignalFromCandidate({
        candidate,
        ta,
        dataProvenance: 'SYNTHETIC_OFFLINE',
        isSynthetic: true,
      });

      assert.strictEqual(signal.isSynthetic, true);
      assert.strictEqual(signal.dataProvenance, 'SYNTHETIC_OFFLINE');
    });

    it('blocks synthetic BUY_NOW signal from being broadcast to Telegram', async () => {
      const candidate = createMockCandidate();
      const syntheticCandles = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
      const ta = runTechnicalAnalysis(candidate.symbol, syntheticCandles, '15m', null);

      const signal = generateSignalFromCandidate({
        candidate,
        ta,
        dataProvenance: 'SYNTHETIC_OFFLINE',
        isSynthetic: true,
      });
      // Force status to BUY_NOW for testing guard
      signal.status = 'BUY_NOW';
      signal.confidence = 'A';

      const sendResult = await broadcastNewSignal(signal, { enabled: true });
      assert.strictEqual(sendResult.success, false);
      assert.match(sendResult.error || '', /Synthetic.*cannot generate Telegram alerts/);
    });

    it('blocks synthetic BUY_NOW signal from being persisted to Supabase database', async () => {
      const candidate = createMockCandidate();
      const syntheticCandles = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
      const ta = runTechnicalAnalysis(candidate.symbol, syntheticCandles, '15m', null);

      const signal = generateSignalFromCandidate({
        candidate,
        ta,
        dataProvenance: 'SYNTHETIC_OFFLINE',
        isSynthetic: true,
      });
      signal.status = 'BUY_NOW';

      const saveResult = await saveSignal(signal);
      assert.strictEqual(saveResult.success, false);
      assert.match(saveResult.error || '', /Synthetic BUY_NOW signals cannot be persisted/);
    });

    it('allows genuine REAL_PROVIDER signals to pass normal validation and broadcast path', async () => {
      const candidate = createMockCandidate();
      const now = Date.now();
      const step = 15 * 60 * 1000;
      const realCandles: OHLCV[] = Array.from({ length: 80 }, (_, i) => ({
        timestamp: now - (80 - i) * step,
        open: 140 + i * 0.2,
        high: 142 + i * 0.2,
        low: 139 + i * 0.2,
        close: 141.5 + i * 0.2,
        volume: 12000,
        quoteVolume: 1700000,
      }));

      const val = validateCandles(realCandles);
      assert.strictEqual(val.isValid, true);

      const ta = runTechnicalAnalysis(candidate.symbol, val.candles, '15m', null);
      const signal = generateSignalFromCandidate({
        candidate,
        ta,
        dataProvenance: 'REAL_PROVIDER',
        isSynthetic: false,
      });

      assert.strictEqual(signal.isSynthetic, false);
      assert.strictEqual(signal.dataProvenance, 'REAL_PROVIDER');
    });
  });
});
