// ─── U-SPOT Divergence Scanner Engine Tests — Phase 37 ─────────────────
// Tests indicator series math, fractal pivot detection, regular & hidden
// divergence detection, strength scoring, multi-timeframe confluence, and Telegram integration.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMACDSeries,
  calculateOBVSeries,
  findIndicatorPivots,
  calculateDivergenceStrength,
  detectDivergenceFromPivots,
  scanSymbolTimeframeDivergences,
  evaluateMultiTimeframeConfluence,
  generateSyntheticDivergenceCandles,
} from '../services/divergence-scanner.ts';
import {
  formatDivergenceMessage,
  generateAlertKey,
  isDuplicateAlert,
  broadcastDivergenceAlert,
  clearDeduplicationCache,
} from '../services/telegram-service.ts';
import type { OHLCV, DivergencePivot, DivergenceResult, TelegramAlertPayload } from '../../types/index.ts';

test('Phase 37: Multi-Timeframe Divergence Scanner & Alert Matrix', async (t) => {
  await t.test('1. Indicator Math & Series Generation', async (t2) => {
    await t2.test('calculateMACDSeries produces matching length arrays for MACD, Signal, and Histogram', () => {
      const closes = [
        100, 102, 101, 103, 105, 104, 106, 108, 107, 109,
        110, 112, 111, 113, 115, 114, 116, 118, 117, 119,
        120, 122, 121, 123, 125, 124, 126, 128, 127, 130,
      ];
      const { macdLine, signalLine, histogram } = calculateMACDSeries(closes, 12, 26, 9);

      assert.equal(macdLine.length, closes.length);
      assert.equal(signalLine.length, closes.length);
      assert.equal(histogram.length, closes.length);
      assert.equal(typeof histogram[histogram.length - 1], 'number');
    });

    await t2.test('calculateOBVSeries calculates correct cumulative volume on up/down/flat closes', () => {
      const closes = [100, 105, 102, 102, 108];
      const volumes = [10, 20, 15, 5, 25];
      const obv = calculateOBVSeries(closes, volumes);

      assert.equal(obv.length, 5);
      assert.equal(obv[0], 10);
      assert.equal(obv[1], 10 + 20); // 30
      assert.equal(obv[2], 30 - 15); // 15
      assert.equal(obv[3], 15); // Flat -> 15
      assert.equal(obv[4], 15 + 25); // 40
    });
  });

  await t.test('2. Pivot Detection with Fractal Windows', () => {
    // Generate simple peaks and valleys
    const klines: OHLCV[] = [
      { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 10, quoteVolume: 1000 },
      { timestamp: 2, open: 100, high: 105, low: 100, close: 105, volume: 10, quoteVolume: 1050 }, // Swing High at i=1
      { timestamp: 3, open: 105, high: 102, low: 95, close: 96, volume: 10, quoteVolume: 960 },
      { timestamp: 4, open: 96, high: 98, low: 90, close: 91, volume: 10, quoteVolume: 910 }, // Swing Low at i=3
      { timestamp: 5, open: 91, high: 100, low: 91, close: 99, volume: 10, quoteVolume: 990 },
      { timestamp: 6, open: 99, high: 108, low: 99, close: 107, volume: 10, quoteVolume: 1070 }, // Swing High at i=5
      { timestamp: 7, open: 107, high: 103, low: 101, close: 102, volume: 10, quoteVolume: 1020 },
    ];
    const series = [50, 65, 45, 28, 48, 72, 55];

    const { swingHighs, swingLows } = findIndicatorPivots(klines, series, 1, 1);

    assert.ok(swingHighs.length >= 2, 'Should find at least 2 swing highs');
    assert.ok(swingLows.length >= 1, 'Should find at least 1 swing low');
    assert.equal(swingLows[0].price, 90);
    assert.equal(swingLows[0].indicatorValue, 28);
  });

  await t.test('3. Regular & Hidden Divergence Detection Algorithms', async (t3) => {
    await t3.test('detects REGULAR_BULLISH divergence (Price LL + Indicator HL)', () => {
      const priorLow: DivergencePivot = {
        barIndex: 10,
        timestamp: 1000,
        price: 50000,
        indicatorValue: 24, // Deep oversold
      };
      const recentLow: DivergencePivot = {
        barIndex: 22,
        timestamp: 2200,
        price: 49000, // Lower low
        indicatorValue: 36, // Higher low
      };

      const result = detectDivergenceFromPivots(
        'BTC/USDT',
        '15m',
        'RSI',
        [],
        [priorLow, recentLow],
        49500,
        38
      );

      assert.ok(result !== null);
      assert.equal(result.type, 'REGULAR_BULLISH');
      assert.equal(result.spotAction, 'BUY_ACCUMULATE');
      assert.ok(result.strengthScore >= 70, 'Deep oversold RSI with strong divergence should score high');
      assert.equal(result.strength, 'STRONG');
    });

    await t3.test('detects REGULAR_BEARISH divergence (Price HH + Indicator LH)', () => {
      const priorHigh: DivergencePivot = {
        barIndex: 8,
        timestamp: 800,
        price: 65000,
        indicatorValue: 78, // Overbought
      };
      const recentHigh: DivergencePivot = {
        barIndex: 20,
        timestamp: 2000,
        price: 67000, // Higher high
        indicatorValue: 68, // Lower high
      };

      const result = detectDivergenceFromPivots(
        'BTC/USDT',
        '1h',
        'RSI',
        [priorHigh, recentHigh],
        [],
        66500,
        65
      );

      assert.ok(result !== null);
      assert.equal(result.type, 'REGULAR_BEARISH');
      assert.equal(result.spotAction, 'CAUTION_TRIM');
      assert.ok(result.strengthScore >= 65);
    });

    await t3.test('detects HIDDEN_BULLISH divergence (Price HL + Indicator LL)', () => {
      const priorLow: DivergencePivot = {
        barIndex: 5,
        timestamp: 500,
        price: 55000,
        indicatorValue: 45,
      };
      const recentLow: DivergencePivot = {
        barIndex: 18,
        timestamp: 1800,
        price: 56500, // Higher low (trend continuation)
        indicatorValue: 35, // Lower low
      };

      const result = detectDivergenceFromPivots(
        'SOL/USDT',
        '4h',
        'RSI',
        [],
        [priorLow, recentLow],
        57000,
        38
      );

      assert.ok(result !== null);
      assert.equal(result.type, 'HIDDEN_BULLISH');
      assert.equal(result.spotAction, 'BUY_ACCUMULATE');
    });

    await t3.test('detects HIDDEN_BEARISH divergence (Price LH + Indicator HH)', () => {
      const priorHigh: DivergencePivot = {
        barIndex: 6,
        timestamp: 600,
        price: 180,
        indicatorValue: 60,
      };
      const recentHigh: DivergencePivot = {
        barIndex: 19,
        timestamp: 1900,
        price: 175, // Lower high (downtrend continuation)
        indicatorValue: 70, // Higher high
      };

      const result = detectDivergenceFromPivots(
        'SOL/USDT',
        '15m',
        'RSI',
        [priorHigh, recentHigh],
        [],
        174,
        68
      );

      assert.ok(result !== null);
      assert.equal(result.type, 'HIDDEN_BEARISH');
      assert.equal(result.spotAction, 'CAUTION_TRIM');
    });
  });

  await t.test('4. Strength Scoring Matrix', () => {
    const p1: DivergencePivot = { barIndex: 10, timestamp: 100, price: 100, indicatorValue: 25 };
    const p2: DivergencePivot = { barIndex: 22, timestamp: 220, price: 95, indicatorValue: 38 };

    const strong = calculateDivergenceStrength('REGULAR_BULLISH', 'RSI', p1, p2, 96, 40);
    assert.ok(strong.score >= 75);
    assert.equal(strong.strength, 'STRONG');

    const tooCloseP2: DivergencePivot = { barIndex: 11, timestamp: 110, price: 99.8, indicatorValue: 26 };
    const weak = calculateDivergenceStrength('REGULAR_BULLISH', 'RSI', p1, tooCloseP2, 99.8, 26);
    assert.ok(weak.score < strong.score);
  });

  await t.test('5. Multi-Timeframe Confluence Evaluation', () => {
    const divs: DivergenceResult[] = [
      {
        symbol: 'ETH/USDT',
        timeframe: '15m',
        indicator: 'RSI',
        type: 'REGULAR_BULLISH',
        strength: 'STRONG',
        strengthScore: 82,
        pricePivots: [
          { barIndex: 5, timestamp: 1, price: 3400, indicatorValue: 28 },
          { barIndex: 18, timestamp: 2, price: 3350, indicatorValue: 38 },
        ],
        currentPrice: 3370,
        currentIndicatorValue: 40,
        barDistance: 13,
        detectedAt: Date.now(),
        confirmationStatus: 'CONFIRMED',
        spotAction: 'BUY_ACCUMULATE',
        description: 'Test',
      },
      {
        symbol: 'ETH/USDT',
        timeframe: '1h',
        indicator: 'MACD_HISTOGRAM',
        type: 'HIDDEN_BULLISH',
        strength: 'STRONG',
        strengthScore: 80,
        pricePivots: [
          { barIndex: 4, timestamp: 1, price: 3300, indicatorValue: -15 },
          { barIndex: 16, timestamp: 2, price: 3350, indicatorValue: -25 },
        ],
        currentPrice: 3370,
        currentIndicatorValue: -10,
        barDistance: 12,
        detectedAt: Date.now(),
        confirmationStatus: 'CONFIRMED',
        spotAction: 'BUY_ACCUMULATE',
        description: 'Test',
      },
    ];

    const confluence = evaluateMultiTimeframeConfluence('ETH/USDT', divs);
    assert.ok(confluence !== null);
    assert.equal(confluence.divergenceType, 'BULLISH');
    assert.equal(confluence.timeframesInvolved.length, 2);
    assert.ok(confluence.confluenceScore >= 85, 'Confluence multiplier should boost score');
    assert.equal(confluence.dominantSentiment, 'STRONG_BUY_REVERSAL');
  });

  await t.test('6. Telegram Alert Integration & Deduplication', async (t4) => {
    clearDeduplicationCache();

    const payload: TelegramAlertPayload = {
      eventType: 'DIVERGENCE_ALERT',
      symbol: 'BTC/USDT',
      price: 61500,
      divergenceType: 'REGULAR_BULLISH',
      divergenceIndicator: 'RSI',
      divergenceTimeframe: '15m',
      divergenceStrength: 'STRONG',
      divergenceStrengthScore: 88,
      confluenceScore: 92,
      details: 'P1 $62,000 ➔ P2 $61,500 (LL) | RSI 26.5 ➔ 38.2 (HL)',
    };

    await t4.test('generates accurate deduplication key', () => {
      const key = generateAlertKey(payload);
      assert.equal(key, 'DIV_BTC/USDT_15m_RSI_REGULAR_BULLISH');
    });

    await t4.test('formats high-contrast Telegram alert message', () => {
      const msg = formatDivergenceMessage(payload);
      assert.ok(msg.includes('REGULAR BULLISH DIVERGENCE'));
      assert.ok(msg.includes('BTC/USDT'));
      assert.ok(msg.includes('Timeframe:* 15m'));
      assert.ok(msg.includes('Indicator:* RSI'));
      assert.ok(msg.includes('88/100'));
      assert.ok(msg.includes('Multi-Timeframe Confluence Score:* 92/100'));
      assert.ok(msg.includes('Potential spot accumulation zone'));
    });

    await t4.test('dispatches alert and applies 15-minute suppression window', async () => {
      const configOverride = { enabled: true, botToken: '', chatId: '' };
      const firstSend = await broadcastDivergenceAlert(payload, configOverride);
      assert.ok(firstSend.success);
      assert.equal(firstSend.mocked, true);

      // Duplicate alert should be caught
      const isDup = isDuplicateAlert(payload);
      assert.equal(isDup, true);

      const secondSend = await broadcastDivergenceAlert(payload, configOverride);
      assert.ok(secondSend.success);
      assert.equal(secondSend.deduplicated, true);
    });
  });
});
