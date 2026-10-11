// ─── U-SPOT Technical Analysis Unit Tests ───────────────────────────
// Phase 5: Technical Analysis Modules — Spec Section 8 (8.1 - 8.6)
// Tests: Trend, Momentum, Volume, Volatility, Market Structure, & Order Flow

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeTrend,
  calculateEMASeries,
  calculateLatestEMA,
  analyzeMomentum,
  calculateRSISeries,
  calculateMACD,
  analyzeVolume,
  analyzeVolatility,
  calculateATR,
  analyzeStructure,
  findSwingPivots,
  analyzeLiquidityFlow,
  calculateVolumeDeltaProxy,
  findOrderBookWalls,
  runTechnicalAnalysis,
} from '../ta/index.ts';

import type { OHLCV, OrderBook } from '../../types/index.ts';

/** Helper to generate synthetic candle sequences */
function generateSyntheticCandles(
  basePrice: number,
  steps: number[],
  volumes?: number[]
): OHLCV[] {
  const candles: OHLCV[] = [];
  let current = basePrice;
  const now = Date.now();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const open = current;
    const close = current + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.3;
    const low = Math.min(open, close) - Math.abs(step) * 0.3;
    const volume = volumes ? volumes[i] ?? 1000 : 1000;

    candles.push({
      timestamp: now - (steps.length - i) * 60000,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume: volume * close,
    });

    current = close;
  }

  return candles;
}

describe('TA: Trend Module (Spec Section 8.1)', () => {
  it('calculates exponential moving average (EMA) series correctly', () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const emaSeries = calculateEMASeries(values, 5);

    assert.equal(emaSeries.length, values.length);
    // Values are strictly increasing, so EMA should be strictly increasing
    for (let i = 1; i < emaSeries.length; i++) {
      assert.ok(emaSeries[i] > emaSeries[i - 1]);
    }

    const latestEma = calculateLatestEMA(values, 5);
    assert.equal(latestEma, emaSeries[emaSeries.length - 1]);
  });

  it('detects BULLISH trend alignment (EMA 20 > 50) and positive distance', () => {
    // 50 candles uptrend followed by 10 candles gentle consolidation near EMA 20
    const upSteps = new Array(50).fill(1.0);
    const consolidSteps = new Array(10).fill(0.1);
    const klines = generateSyntheticCandles(100, [...upSteps, ...consolidSteps]);

    const trend = analyzeTrend(klines);
    assert.equal(trend.alignment, 'BULLISH');
    assert.equal(trend.direction, 'BULLISH');
    assert.ok(trend.ema20 > trend.ema50);
    assert.ok(trend.distanceEma20Percent >= 0);
    assert.ok(trend.score >= 70);
  });

  it('detects BEARISH trend alignment (EMA 20 < 50)', () => {
    // 60 candles in a sustained downtrend
    const steps = new Array(60).fill(-1.5);
    const klines = generateSyntheticCandles(200, steps);

    const trend = analyzeTrend(klines);
    assert.equal(trend.alignment, 'BEARISH');
    assert.equal(trend.direction, 'BEARISH');
    assert.ok(trend.ema20 < trend.ema50);
    assert.ok(trend.score <= 35);
  });
});

describe('TA: Momentum Module (Spec Section 8.2)', () => {
  it('calculates RSI 14 bounded between 0 and 100', () => {
    // 30 candles rising strongly
    const steps = new Array(30).fill(2.0);
    const klines = generateSyntheticCandles(50, steps);
    const closes = klines.map((k) => k.close);

    const rsiSeries = calculateRSISeries(closes, 14);
    const latestRsi = rsiSeries[rsiSeries.length - 1];

    assert.ok(latestRsi >= 0 && latestRsi <= 100);
    assert.ok(latestRsi > 70, `RSI for strong bull run should be > 70, got ${latestRsi}`);
  });

  it('calculates MACD lines and detects crossovers', () => {
    // U-turn pattern: falling then strong rally
    const downSteps = new Array(25).fill(-1.0);
    const upSteps = new Array(15).fill(3.0);
    const klines = generateSyntheticCandles(100, [...downSteps, ...upSteps]);
    const closes = klines.map((k) => k.close);

    const macd = calculateMACD(closes);
    assert.ok(typeof macd.macd === 'number');
    assert.ok(typeof macd.signal === 'number');
    assert.ok(typeof macd.histogram === 'number');
    // Strong turnaround should yield a positive histogram or crossover
    assert.ok(macd.histogram > 0 || macd.cross === 'BULLISH_CROSS');
  });

  it('evaluates momentum state with RSI and MACD integration', () => {
    // 35 bars with healthy upward slope and minor pullbacks (RSI in 55-72 zone)
    const pattern = [1.0, 0.8, 0.9, -0.4, 1.1, 0.7, -0.3];
    const steps = [...pattern, ...pattern, ...pattern, ...pattern, ...pattern];
    const klines = generateSyntheticCandles(100, steps);

    const momentum = analyzeMomentum(klines);
    assert.ok(momentum.rsi >= 50);
    assert.ok(momentum.score >= 60);
    assert.ok(momentum.description.length > 5);
  });
});

describe('TA: Volume Module (Spec Section 8.3)', () => {
  it('calculates volume moving average and volume ratio correctly', () => {
    const steps = new Array(25).fill(0.5);
    // Baseline volume 1000, final bar volume 3500 (3.5x spike)
    const volumes = new Array(24).fill(1000).concat([3500]);
    const klines = generateSyntheticCandles(100, steps, volumes);

    const volume = analyzeVolume(klines);
    assert.equal(volume.currentVolume, 3500);
    assert.ok(volume.volumeRatio >= 2.5);
    assert.equal(volume.isVolumeSpike, true);
    assert.ok(volume.score >= 85, `Volume spike on up-bar should yield high score, got ${volume.score}`);
  });

  it('detects expanding volume trend', () => {
    const steps = [1, 1, 1, 1, 1];
    const volumes = [1000, 1500, 2200, 3100, 4500]; // Strictly accelerating
    const klines = generateSyntheticCandles(100, steps, volumes);

    const volume = analyzeVolume(klines);
    assert.equal(volume.volumeTrend, 'EXPANDING');
  });
});

describe('TA: Volatility Module (Spec Section 8.4)', () => {
  it('calculates 14-period ATR and dynamic risk distances', () => {
    const steps = [
      1.5, -1.2, 2.0, -1.8, 2.2, -1.0, 2.5, -1.5,
      1.8, -1.2, 2.0, -1.5, 2.4, -1.1, 2.0, -1.0,
    ];
    const klines = generateSyntheticCandles(100, steps);

    const volatility = analyzeVolatility(klines);
    assert.ok(volatility.atr > 0);
    assert.ok(volatility.atrPercent > 0);
    // Dynamic SL should be greater than ATR percentage
    assert.ok(
      volatility.recommendedSlDistancePercent >= volatility.atrPercent,
      'Dynamic SL should encompass ATR volatility buffer'
    );
    // DCA 1 should be tighter than DCA 2 and SL
    assert.ok(
      volatility.recommendedDca1DistancePercent < volatility.recommendedDca2DistancePercent
    );
    assert.ok(
      volatility.recommendedDca2DistancePercent < volatility.recommendedSlDistancePercent
    );
  });

  it('classifies EXTREME volatility on wild price swings', () => {
    // High percentage moves on a $10 coin (+/- $1.5 = 15% range per candle)
    const steps = [1.5, -1.4, 1.8, -1.6, 2.0, -1.8, 1.7, -1.5, 2.1, -1.8, 1.6, -1.5, 2.0, -1.7, 1.8];
    const klines = generateSyntheticCandles(10, steps);

    const volatility = analyzeVolatility(klines);
    assert.equal(volatility.volatilityRegime, 'EXTREME');
    assert.ok(volatility.score <= 50, 'Extreme volatility should be penalized for spot risk');
  });
});

describe('TA: Market Structure Module (Spec Section 8.5)', () => {
  it('identifies swing highs and swing lows using fractal pivots', () => {
    // A mountain followed by a valley: 10 -> 20 -> 10 -> 5 -> 15
    const steps = [
      2, 2, 2, 2, 2,  // Rising to ~20 (Swing High)
      -2, -2, -2, -2, // Falling to ~12
      -2, -2, -2,     // Falling to ~6 (Swing Low)
      3, 3, 3, 3,     // Rising to ~18
    ];
    const klines = generateSyntheticCandles(10, steps);

    const pivots = findSwingPivots(klines, 2, 2);
    assert.ok(pivots.swingHighs.length >= 1, 'Should find at least 1 swing high');
    assert.ok(pivots.swingLows.length >= 1, 'Should find at least 1 swing low');
  });

  it('detects Bullish Break of Structure (BOS)', () => {
    // Peak at 120, pullback to 110, then blast through 125
    const steps = [
      2, 2, 2, 2, 2,    // Up to 110
      2, 2, 2, 2, 2,    // Peak at 120 (Swing High)
      -2, -2, -2, -2,   // Pullback to 112
      -1, -1, 1, 1,     // Base
      3, 3, 3, 3, 4, 4, // Break above 120 to 128 (BOS!)
    ];
    const klines = generateSyntheticCandles(100, steps);

    const structure = analyzeStructure(klines);
    assert.equal(structure.breakOfStructure.detected, true);
    assert.equal(structure.breakOfStructure.type, 'BULLISH_BOS');
    assert.ok(structure.score >= 80);
  });

  it('detects Liquidity Sweep (Wick Sweep)', () => {
    // Establish a swing low at 95, then a candle with low = 93 but closing at 97
    const steps = [
      -1, -1, -1, -1, -1, // Down to 95 (Swing Low)
      2, 2, 2, 2,         // Up to 103
      -1, -1, -1,         // Retest
    ];
    const klines = generateSyntheticCandles(100, steps);
    const pivots = findSwingPivots(klines, 2, 2);

    if (pivots.swingLows.length > 0) {
      const priorLow = pivots.swingLows[pivots.swingLows.length - 1].price;
      // Add sweep candle: low dips below prior low, close rebounds above
      klines.push({
        timestamp: Date.now(),
        open: priorLow + 1,
        high: priorLow + 3,
        low: priorLow - 2, // Pierces below!
        close: priorLow + 2, // Closes back inside!
        volume: 5000,
        quoteVolume: 5000 * (priorLow + 2),
      });

      const structure = analyzeStructure(klines);
      assert.equal(structure.liquiditySweep.detected, true);
      assert.equal(structure.liquiditySweep.type, 'SWEEP_LOW');
      assert.ok(structure.score >= 88);
    }
  });
});

describe('TA: Liquidity & Order Flow Module (Spec Section 8.6)', () => {
  it('calculates order book depth imbalance and volume delta proxy', () => {
    const mockOrderBook: OrderBook = {
      symbol: 'SOL/USDT',
      bids: [[150, 1000], [149, 2000]], // 150k + 298k = ~448k bids
      asks: [[150.05, 500], [150.1, 1000]], // ~225k asks
      spread: 0.05,
      spreadPercent: 0.03,
      bidDepthUsdt: 448_000,
      askDepthUsdt: 225_000,
      liquidityScore: 90,
      timestamp: Date.now(),
    };

    const klines = generateSyntheticCandles(150, [1, 2, 1, 3]);
    const flow = analyzeLiquidityFlow(mockOrderBook, klines);

    assert.ok(flow.orderBookImbalance > 0, 'Bid depth exceeds ask depth, imbalance must be positive');
    assert.equal(flow.isLiquid, true);
    assert.ok(flow.score >= 70);
  });

  it('identifies high-concentration bid and ask walls from order book depth (Phase 23)', () => {
    const mockOrderBook: OrderBook = {
      symbol: 'SOL/USDT',
      bids: [
        [150.0, 50],
        [149.5, 80],
        [148.0, 1500], // Massive bid wall: 148 * 1500 = $222k
        [147.0, 60],
      ],
      asks: [
        [150.5, 40],
        [151.0, 50],
        [153.5, 1200], // Massive ask wall: 153.5 * 1200 = $184.2k
        [154.0, 30],
      ],
      spread: 0.5,
      spreadPercent: 0.33,
      bidDepthUsdt: 250_000,
      askDepthUsdt: 200_000,
      liquidityScore: 85,
      timestamp: Date.now(),
    };

    const walls = findOrderBookWalls(mockOrderBook, 150.0);
    assert.ok(walls.nearestBidWall !== null, 'Must detect nearest bid wall');
    assert.strictEqual(walls.nearestBidWall.price, 148.0);
    assert.ok(walls.nearestBidWall.volumeUsdt > 200_000);

    assert.ok(walls.nearestAskWall !== null, 'Must detect nearest ask wall');
    assert.strictEqual(walls.nearestAskWall.price, 153.5);
    assert.ok(walls.nearestAskWall.volumeUsdt > 180_000);

    const klines = generateSyntheticCandles(150, [0.1, -0.1, 0.1, -0.1]);
    const flow = analyzeLiquidityFlow(mockOrderBook, klines);
    assert.ok(flow.nearestBidWall !== null);
    assert.ok(flow.nearestAskWall !== null);
    assert.ok(flow.description.includes('Bid wall'));
  });
});

describe('TA: Unified Orchestrator (runTechnicalAnalysis)', () => {
  it('combines all 6 modules into comprehensive structured analysis', () => {
    const steps = new Array(50).fill(1.0);
    const klines = generateSyntheticCandles(100, steps);

    const result = runTechnicalAnalysis('SOL/USDT', klines, '15m', null);

    assert.equal(result.symbol, 'SOL/USDT');
    assert.equal(result.timeframe, '15m');
    assert.ok(result.compositeTechnicalScore >= 1 && result.compositeTechnicalScore <= 99);
    assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.overallBias));
    assert.ok(result.summary && result.summary.length > 10);

    // Verify all 6 module outputs are populated
    assert.ok(result.trend !== undefined);
    assert.ok(result.momentum !== undefined);
    assert.ok(result.volume !== undefined);
    assert.ok(result.volatility !== undefined);
    assert.ok(result.structure !== undefined);
    assert.ok(result.liquidity !== undefined);
  });
});
