// ─── Phase 25: Multi-Timeframe Confluence Engine Tests ───────────────
// Verifies 15M + 1H + 4H alignment, candle compression, and counter-trend circuit breaker

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  compressKlines,
  analyzeTimeframeTrend,
  evaluateMultiTimeframeConfluence,
} from '../ta/multi-timeframe.ts';
import {
  assignSignalStatus,
  generateSignalFromCandidate,
  detectSetup,
} from '../services/signal-engine.ts';
import { runTechnicalAnalysis } from '../ta/index.ts';
import type { OHLCV, MarketCandidate, TechnicalAnalysisResult } from '../../types/index.ts';

function createSyntheticCandles(params: {
  count: number;
  basePrice: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
  volatilityPct?: number;
}): OHLCV[] {
  const { count, basePrice, trend, volatilityPct = 0.5 } = params;
  const candles: OHLCV[] = [];
  let price = basePrice;
  const now = Date.now();
  const stepMs = 15 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const drift = trend === 'UP' ? 0.35 : trend === 'DOWN' ? -0.35 : 0;
    const change = price * ((drift + (Math.sin(i / 2) * volatilityPct)) / 100);
    const open = price;
    price = open + change;
    const high = Math.max(open, price) * 1.004;
    const low = Math.min(open, price) * 0.996;
    const close = price;

    candles.push({
      timestamp: now - (count - i) * stepMs,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.abs(Math.sin(i)) * 500,
      quoteVolume: (1000 + Math.abs(Math.sin(i)) * 500) * close,
    });
  }

  return candles;
}

describe('Phase 25: Multi-Timeframe Confluence Engine', () => {

  describe('Candle Compression Engine', () => {
    test('accurately compresses 15m candles into 1h candles (factor = 4)', () => {
      const klines15m = createSyntheticCandles({
        count: 16,
        basePrice: 100,
        trend: 'UP',
      });

      const klines1h = compressKlines(klines15m, 4);

      assert.strictEqual(klines1h.length, 4);
      // First 1h candle should start at first 15m open
      assert.strictEqual(klines1h[0].open, klines15m[0].open);
      // First 1h candle should close at 4th 15m close
      assert.strictEqual(klines1h[0].close, klines15m[3].close);
      // High should be max high of the first 4 candles
      const maxHigh = Math.max(...klines15m.slice(0, 4).map((c) => c.high));
      assert.strictEqual(klines1h[0].high, maxHigh);
      // Low should be min low of the first 4 candles
      const minLow = Math.min(...klines15m.slice(0, 4).map((c) => c.low));
      assert.strictEqual(klines1h[0].low, minLow);
      // Volume should sum the 4 candles
      const volSum = klines15m.slice(0, 4).reduce((sum, c) => sum + c.volume, 0);
      assert.strictEqual(klines1h[0].volume, volSum);
    });

    test('returns empty array when input is empty', () => {
      assert.deepStrictEqual(compressKlines([], 4), []);
    });
  });

  describe('Timeframe Trend Analyzer', () => {
    test('identifies BULLISH alignment on strong uptrending series', () => {
      const bullKlines = createSyntheticCandles({
        count: 90,
        basePrice: 50,
        trend: 'UP',
      });

      const trend = analyzeTimeframeTrend(bullKlines, '1h');
      assert.strictEqual(trend.timeframe, '1h');
      assert.strictEqual(trend.alignment, 'BULLISH');
      assert.strictEqual(trend.direction, 'BULLISH');
      assert.ok(trend.ema20 > trend.ema50);
      assert.strictEqual(trend.isAboveEma200, true);
    });

    test('identifies BEARISH alignment on downtrending series', () => {
      const bearKlines = createSyntheticCandles({
        count: 90,
        basePrice: 150,
        trend: 'DOWN',
      });

      const trend = analyzeTimeframeTrend(bearKlines, '1h');
      assert.strictEqual(trend.timeframe, '1h');
      assert.strictEqual(trend.alignment, 'BEARISH');
      assert.strictEqual(trend.direction, 'BEARISH');
      assert.ok(trend.ema20 < trend.ema50);
      assert.strictEqual(trend.isAboveEma200, false);
    });
  });

  describe('Confluence Evaluator & Score Weighting', () => {
    test('awards FULL_CONFLUENCE bonus (+10) when 15m, 1h, and 4h are all bullish', () => {
      const klines15m = createSyntheticCandles({ count: 80, basePrice: 100, trend: 'UP' });
      const klines1h = createSyntheticCandles({ count: 90, basePrice: 90, trend: 'UP' });
      const klines4h = createSyntheticCandles({ count: 60, basePrice: 80, trend: 'UP' });

      const mtf = evaluateMultiTimeframeConfluence({
        symbol: 'SOL/USDT',
        klines15m,
        klines1h,
        klines4h,
      });

      assert.strictEqual(mtf.alignment, 'FULL_CONFLUENCE');
      assert.strictEqual(mtf.isCounterTrendWarning, false);
      assert.strictEqual(mtf.scoreBonus, 10);
      assert.strictEqual(mtf.recommendation, 'STRONG_ALIGNMENT');
      assert.ok(mtf.confluenceScore >= 75);
      assert.ok(mtf.summary.includes('Full Bullish MTF Alignment'));
    });

    test('flags COUNTER_TREND and penalizes (-18) when 15m bounce fights a 1h/4h downtrend', () => {
      // 15m short-term bounce
      const klines15m = createSyntheticCandles({ count: 80, basePrice: 100, trend: 'UP' });
      // 1h and 4h are in steep downtrend below EMA 200
      const klines1h = createSyntheticCandles({ count: 90, basePrice: 140, trend: 'DOWN' });
      const klines4h = createSyntheticCandles({ count: 60, basePrice: 180, trend: 'DOWN' });

      const mtf = evaluateMultiTimeframeConfluence({
        symbol: 'AVAX/USDT',
        klines15m,
        klines1h,
        klines4h,
      });

      assert.strictEqual(mtf.alignment, 'COUNTER_TREND');
      assert.strictEqual(mtf.isCounterTrendWarning, true);
      assert.strictEqual(mtf.scoreBonus, -18);
      assert.strictEqual(mtf.recommendation, 'AVOID_COUNTER_TREND');
      assert.ok(mtf.confluenceScore <= 45);
      assert.ok(mtf.summary.includes('Counter-Trend Warning'));
    });
  });

  describe('Signal Engine Status & Circuit Breaker Integration', () => {
    test('blocks BUY_NOW status and forces WAIT_FOR_CONFIRMATION when MTF counter-trend warning triggers', () => {
      const klines15m = createSyntheticCandles({ count: 80, basePrice: 100, trend: 'UP' });
      const ta = runTechnicalAnalysis('NEAR/USDT', klines15m, '15m');
      const setup = detectSetup(ta, 100.0);
      assert.ok(setup !== null);

      const mtfWarning = {
        tf15m: { timeframe: '15m' as const, direction: 'BULLISH' as const, ema20: 101, ema50: 99, ema200: null, isAboveEma200: null, alignment: 'BULLISH' as const },
        tf1h: { timeframe: '1h' as const, direction: 'BEARISH' as const, ema20: 98, ema50: 105, ema200: 110, isAboveEma200: false, alignment: 'BEARISH' as const },
        alignment: 'COUNTER_TREND' as const,
        confluenceScore: 35,
        isCounterTrendWarning: true,
        scoreBonus: -18,
        recommendation: 'AVOID_COUNTER_TREND' as const,
        summary: 'Counter-trend warning',
      };

      // Even with tradeScore 80 inside the entry zone, status must NOT be BUY_NOW!
      const status = assignSignalStatus(80, 'A', setup.preferredEntry, setup, 'BULL', undefined, mtfWarning);
      assert.strictEqual(status, 'WAIT_FOR_CONFIRMATION');
    });

    test('generateSignalFromCandidate applies MTF score bonus, rationale tag, and attaches mtfAnalysis', () => {
      const klines15m = createSyntheticCandles({ count: 80, basePrice: 100, trend: 'UP' });
      const klines1h = createSyntheticCandles({ count: 90, basePrice: 90, trend: 'UP' });
      const ta = runTechnicalAnalysis('LINK/USDT', klines15m, '15m');
      const mtf = evaluateMultiTimeframeConfluence({
        symbol: 'LINK/USDT',
        klines15m,
        klines1h,
      });

      const candidate: MarketCandidate = {
        symbol: 'LINK/USDT',
        name: 'Chainlink',
        price: 100.0,
        change24h: 4.2,
        volume24h: 50_000_000,
        volumeRatio: 1.8,
        liquidity: 85,
        candidateScore: 82,
        marketRegime: 'BULL',
        reasonSelected: 'Volume Breakout',
      };

      const signal = generateSignalFromCandidate({
        candidate,
        ta,
        mtfAnalysis: mtf,
      });

      assert.ok(signal.mtfAnalysis);
      assert.strictEqual(signal.mtfAnalysis.alignment, 'FULL_CONFLUENCE');
      assert.ok(signal.rationale?.includes('MTF: Full 15M+1H+4H Bullish Confluence'));
    });
  });

});
