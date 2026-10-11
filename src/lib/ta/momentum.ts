// ─── U-SPOT Momentum Analysis Module ─────────────────────────────────
// Phase 5: Technical Analysis — RSI 14, MACD (12,26,9), ROC, & Divergence Detection
// Spec Section 8.2 (Momentum Module)

import type { OHLCV, MomentumAnalysis } from '../../types/index.ts';
import { calculateEMASeries } from './trend.ts';

/**
 * Calculates Wilder's 14-period Relative Strength Index (RSI) series
 */
export function calculateRSISeries(closes: number[], period: number = 14): number[] {
  if (closes.length <= period) return closes.map(() => 50);

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  const rsiSeries: number[] = new Array(closes.length).fill(50);

  // Initial average gain & loss
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiSeries[period] = 100 - 100 / (1 + rs);

  // Wilder's smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const change = changes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiSeries[i] = 100 - 100 / (1 + rs);
  }

  return rsiSeries;
}

/**
 * Calculates Moving Average Convergence Divergence (MACD 12, 26, 9)
 */
export function calculateMACD(closes: number[]): {
  macd: number;
  signal: number;
  histogram: number;
  prevHistogram: number;
  cross: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NONE';
} {
  if (closes.length < 26) {
    return {
      macd: 0,
      signal: 0,
      histogram: 0,
      prevHistogram: 0,
      cross: 'NONE',
    };
  }

  const ema12 = calculateEMASeries(closes, 12);
  const ema26 = calculateEMASeries(closes, 26);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  const signalLine = calculateEMASeries(macdLine, 9);

  const currentMacd = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];
  const currentHist = currentMacd - currentSignal;

  const prevMacd = macdLine[macdLine.length - 2] ?? currentMacd;
  const prevSignal = signalLine[signalLine.length - 2] ?? currentSignal;
  const prevHist = prevMacd - prevSignal;

  let cross: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NONE' = 'NONE';
  if (prevHist <= 0 && currentHist > 0) {
    cross = 'BULLISH_CROSS';
  } else if (prevHist >= 0 && currentHist < 0) {
    cross = 'BEARISH_CROSS';
  }

  return {
    macd: Math.round(currentMacd * 10000) / 10000,
    signal: Math.round(currentSignal * 10000) / 10000,
    histogram: Math.round(currentHist * 10000) / 10000,
    prevHistogram: Math.round(prevHist * 10000) / 10000,
    cross,
  };
}

/**
 * Detects divergence between price pivots and RSI
 */
export function detectDivergence(
  closes: number[],
  rsiSeries: number[]
): 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE' {
  if (closes.length < 20) return 'NONE';

  const len = closes.length;
  // Look back at recent swing low/high within last 5-15 bars
  const currentPrice = closes[len - 1];
  const currentRsi = rsiSeries[len - 1];

  let lowestPricePast = closes[len - 2];
  let lowestRsiPast = rsiSeries[len - 2];
  let highestPricePast = closes[len - 2];
  let highestRsiPast = rsiSeries[len - 2];

  for (let i = len - 15; i < len - 3; i++) {
    if (i < 0) continue;
    if (closes[i] < lowestPricePast) {
      lowestPricePast = closes[i];
      lowestRsiPast = rsiSeries[i];
    }
    if (closes[i] > highestPricePast) {
      highestPricePast = closes[i];
      highestRsiPast = rsiSeries[i];
    }
  }

  // Bullish divergence: price makes lower low or equal low, but RSI makes higher low
  if (currentPrice < lowestPricePast && currentRsi > lowestRsiPast + 3.0 && currentRsi < 45) {
    return 'BULLISH_DIVERGENCE';
  }

  // Bearish divergence: price makes higher high, but RSI makes lower high
  if (currentPrice > highestPricePast && currentRsi < highestRsiPast - 3.0 && currentRsi > 65) {
    return 'BEARISH_DIVERGENCE';
  }

  return 'NONE';
}

/**
 * Main Momentum Analysis Evaluator
 * Spec Section 8.2
 */
export function analyzeMomentum(klines: OHLCV[]): MomentumAnalysis {
  if (!klines || klines.length === 0) {
    return {
      rsi: 50,
      rsiState: 'NEUTRAL',
      macd: { macd: 0, signal: 0, histogram: 0, cross: 'NONE' },
      roc: 0,
      divergence: 'NONE',
      score: 50,
      description: 'Insufficient candlestick data for momentum analysis',
    };
  }

  const closes = klines.map((k) => k.close);
  const currentPrice = closes[closes.length - 1];

  // 1. RSI
  const rsiSeries = calculateRSISeries(closes, 14);
  const currentRsi = Math.round(rsiSeries[rsiSeries.length - 1] * 10) / 10;

  let rsiState: MomentumAnalysis['rsiState'] = 'NEUTRAL';
  if (currentRsi >= 75) rsiState = 'OVERBOUGHT';
  else if (currentRsi >= 55) rsiState = 'BULLISH';
  else if (currentRsi <= 25) rsiState = 'OVERSOLD';
  else if (currentRsi <= 45) rsiState = 'BEARISH';
  else rsiState = 'NEUTRAL';

  // 2. MACD
  const macdData = calculateMACD(closes);

  // 3. Rate of Change (ROC 10 periods)
  const rocPeriod = Math.min(10, closes.length - 1);
  const pastPrice = closes[closes.length - 1 - rocPeriod];
  const roc =
    pastPrice > 0
      ? Math.round(((currentPrice - pastPrice) / pastPrice) * 10000) / 100
      : 0;

  // 4. Divergence
  const divergence = detectDivergence(closes, rsiSeries);

  // 5. Score computation (0-100)
  // Spec 8.2: Avoid simplistic "RSI below 30 = BUY". Momentum must align with trend.
  let score = 50;
  let description = '';

  if (divergence === 'BULLISH_DIVERGENCE') {
    score = 88;
    description = `Bullish RSI divergence detected (RSI ${currentRsi}) signaling potential reversal`;
  } else if (divergence === 'BEARISH_DIVERGENCE') {
    score = 30;
    description = `Bearish RSI divergence warning (RSI ${currentRsi}) indicating exhaustion`;
  } else if (macdData.cross === 'BULLISH_CROSS' && currentRsi >= 48 && currentRsi <= 68) {
    score = 92; // Bullish MACD cross in optimal RSI expansion zone
  } else if (currentRsi >= 55 && currentRsi <= 78 && macdData.histogram >= 0) {
    score = 85; // Strong bullish momentum continuation
    description = `Strong bullish momentum (RSI ${currentRsi}, positive MACD expansion)`;
  } else if (currentRsi >= 55 && roc > 0) {
    score = 75; // Bullish momentum continuation
    description = `Bullish momentum continuation (RSI ${currentRsi}, ROC +${roc}%)`;
  } else if (currentRsi > 78) {
    score = 55; // Overbought caution
    description = `Overbought RSI (${currentRsi}). Momentum remains strong but elevated pullback risk`;
  } else if (macdData.cross === 'BEARISH_CROSS') {
    score = 30;
    description = 'Bearish MACD crossover: momentum shifting downward';
  } else if (currentRsi < 40 && macdData.histogram < 0) {
    score = 25;
    description = `Bearish momentum pressure (RSI ${currentRsi}, MACD below signal)`;
  } else {
    score = 50;
    description = `Neutral momentum (RSI ${currentRsi}, ROC ${roc}%)`;
  }

  return {
    rsi: currentRsi,
    rsiState,
    macd: {
      macd: macdData.macd,
      signal: macdData.signal,
      histogram: macdData.histogram,
      cross: macdData.cross,
    },
    roc,
    divergence,
    score,
    description,
  };
}
