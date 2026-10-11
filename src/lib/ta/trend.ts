// ─── U-SPOT Trend Analysis Module ────────────────────────────────────
// Phase 5: Technical Analysis — EMA 20, 50, 200, Alignment, Distance & Transitions
// Spec Section 8.1 (Trend Module)

import type { OHLCV, TrendAnalysis } from '../../types/index.ts';

/**
 * Calculates Exponential Moving Average (EMA) series
 */
export function calculateEMASeries(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  if (values.length < period) {
    // If not enough data, simple average
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return values.map(() => avg);
  }

  const k = 2 / (period + 1);
  const emaSeries: number[] = new Array(values.length);

  // Initial SMA for the first `period` bars
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
    emaSeries[i] = sum / (i + 1);
  }
  emaSeries[period - 1] = sum / period;

  // Compute EMA onwards
  for (let i = period; i < values.length; i++) {
    emaSeries[i] = values[i] * k + emaSeries[i - 1] * (1 - k);
  }

  return emaSeries;
}

/**
 * Gets latest EMA value for a period
 */
export function calculateLatestEMA(values: number[], period: number): number {
  const series = calculateEMASeries(values, period);
  return series.length > 0 ? series[series.length - 1] : 0;
}

/**
 * Evaluates trend structure, alignment, distance, and score
 * Spec Section 8.1
 */
export function analyzeTrend(klines: OHLCV[]): TrendAnalysis {
  if (!klines || klines.length === 0) {
    return {
      ema20: 0,
      ema50: 0,
      ema200: null,
      alignment: 'NEUTRAL',
      distanceEma20Percent: 0,
      distanceEma50Percent: 0,
      distanceEma200Percent: null,
      direction: 'NEUTRAL',
      score: 50,
      description: 'Insufficient candlestick data for trend analysis',
    };
  }

  const closes = klines.map((k) => k.close);
  const currentPrice = closes[closes.length - 1];

  const ema20 = calculateLatestEMA(closes, 20);
  const ema50 = calculateLatestEMA(closes, 50);
  const ema200 = closes.length >= 100 ? calculateLatestEMA(closes, 200) : null;

  // Previous bar EMAs for transition detection
  const prevCloses = closes.slice(0, -1);
  const prevEma20 = calculateLatestEMA(prevCloses, 20);
  const prevEma50 = calculateLatestEMA(prevCloses, 50);

  // Distance percentages
  const distanceEma20Percent =
    ema20 > 0 ? Math.round(((currentPrice - ema20) / ema20) * 10000) / 100 : 0;
  const distanceEma50Percent =
    ema50 > 0 ? Math.round(((currentPrice - ema50) / ema50) * 10000) / 100 : 0;
  const distanceEma200Percent =
    ema200 && ema200 > 0
      ? Math.round(((currentPrice - ema200) / ema200) * 10000) / 100
      : null;

  // Crossover transitions
  const isGoldenCross = prevEma20 <= prevEma50 && ema20 > ema50;
  const isDeathCross = prevEma20 >= prevEma50 && ema20 < ema50;

  // Alignment classification
  let alignment: TrendAnalysis['alignment'] = 'NEUTRAL';
  let direction: TrendAnalysis['direction'] = 'NEUTRAL';
  let score = 50;
  let description = '';

  const isBullStack =
    ema20 > ema50 && (ema200 === null || ema50 > ema200 || currentPrice > ema200);
  const isBearStack =
    ema20 < ema50 && (ema200 === null || ema50 < ema200 || currentPrice < ema200);

  if (isGoldenCross) {
    alignment = 'TRANSITION';
    direction = 'BULLISH';
    score = 82;
    description = 'Golden Cross confirmed: EMA 20 crossed above EMA 50';
  } else if (isDeathCross) {
    alignment = 'TRANSITION';
    direction = 'BEARISH';
    score = 25;
    description = 'Death Cross confirmed: EMA 20 crossed below EMA 50';
  } else if (isBullStack) {
    alignment = 'BULLISH';
    direction = 'BULLISH';

    // Scoring nuance based on pullback vs overextension
    if (distanceEma20Percent >= 0 && distanceEma20Percent <= 2.5) {
      score = 92; // Ideal spot entry: bullish trend with price testing EMA 20 support
      description = `Strong bullish alignment (EMA 20 > 50). Price resting near EMA 20 (+${distanceEma20Percent}%)`;
    } else if (distanceEma20Percent > 2.5 && distanceEma20Percent <= 6.0) {
      score = 85;
      description = `Bullish trend continuation. Price ${distanceEma20Percent}% above EMA 20`;
    } else if (distanceEma20Percent > 6.0) {
      score = 68; // Overextended
      description = `Extended bullish momentum (+${distanceEma20Percent}% above EMA 20). Caution: high pullback probability`;
    } else if (currentPrice >= ema50) {
      score = 78; // Pullback into EMA 50 support
      description = 'Healthy pullback into EMA 50 support within broader bullish structure';
    } else {
      score = 60;
      description = 'Bullish moving average stack, but price is dipping below EMA 50';
    }
  } else if (isBearStack) {
    alignment = 'BEARISH';
    direction = 'BEARISH';
    score = 25;
    description = `Bearish alignment (EMA 20 < 50). Price ${distanceEma20Percent}% from EMA 20`;
  } else {
    alignment = 'NEUTRAL';
    direction = 'NEUTRAL';
    score = 50;
    description = 'Ranging/compressing moving averages with no dominant trend';
  }

  return {
    ema20: Math.round(ema20 * 10000) / 10000,
    ema50: Math.round(ema50 * 10000) / 10000,
    ema200: ema200 ? Math.round(ema200 * 10000) / 10000 : null,
    alignment,
    distanceEma20Percent,
    distanceEma50Percent,
    distanceEma200Percent,
    direction,
    score,
    description,
  };
}
