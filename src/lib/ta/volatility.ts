// ─── U-SPOT Volatility Analysis Module ───────────────────────────────
// Phase 5: Technical Analysis — ATR 14, Volatility Regimes, & Dynamic Risk Distances
// Spec Section 8.4 (Volatility Module)

import type { OHLCV, VolatilityAnalysis } from '../../types/index.ts';

/**
 * Calculates True Range series
 * TR = max(high - low, abs(high - prevClose), abs(low - prevClose))
 */
export function calculateTrueRangeSeries(klines: OHLCV[]): number[] {
  if (klines.length === 0) return [];
  const trSeries: number[] = [klines[0].high - klines[0].low];

  for (let i = 1; i < klines.length; i++) {
    const current = klines[i];
    const prevClose = klines[i - 1].close;

    const hl = current.high - current.low;
    const hpc = Math.abs(current.high - prevClose);
    const lpc = Math.abs(current.low - prevClose);

    trSeries.push(Math.max(hl, hpc, lpc));
  }

  return trSeries;
}

/**
 * Calculates Wilder's Average True Range (ATR)
 */
export function calculateATR(klines: OHLCV[], period: number = 14): number {
  if (klines.length === 0) return 0;
  const trSeries = calculateTrueRangeSeries(klines);

  if (trSeries.length <= period) {
    const sum = trSeries.reduce((a, b) => a + b, 0);
    return sum / trSeries.length;
  }

  // Initial SMA of TR
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trSeries[i];
  }
  atr = atr / period;

  // Wilder's smoothing
  for (let i = period; i < trSeries.length; i++) {
    atr = (atr * (period - 1) + trSeries[i]) / period;
  }

  return atr;
}

/**
 * Main Volatility Analysis Evaluator
 * Spec Section 8.4: Volatility influences dynamic SL, DCA, and position risk
 */
export function analyzeVolatility(klines: OHLCV[]): VolatilityAnalysis {
  if (!klines || klines.length === 0) {
    return {
      atr: 0,
      atrPercent: 0,
      recentRange: { high: 0, low: 0, rangePercent: 0 },
      recommendedSlDistancePercent: 3.5,
      recommendedDca1DistancePercent: 1.5,
      recommendedDca2DistancePercent: 2.8,
      volatilityRegime: 'NORMAL',
      score: 50,
      description: 'Insufficient candlestick data for volatility analysis',
    };
  }

  const currentPrice = klines[klines.length - 1].close;
  const atr = calculateATR(klines, 14);

  // ATR as a percentage of current asset price
  const atrPercent =
    currentPrice > 0 ? Math.round((atr / currentPrice) * 10000) / 100 : 0;

  // Recent 20-bar high-low range
  const lookback = Math.min(20, klines.length);
  const recentBars = klines.slice(klines.length - lookback);
  const recentHigh = Math.max(...recentBars.map((b) => b.high));
  const recentLow = Math.min(...recentBars.map((b) => b.low));
  const rangePercent =
    recentLow > 0
      ? Math.round(((recentHigh - recentLow) / recentLow) * 10000) / 100
      : 0;

  // Dynamic Stop Loss distance recommendation (Spec Section 8.4: Do not use fixed SL percentage)
  // Recommended SL = 1.8x ATR, bounded between 1.8% and 12.0%
  const recommendedSlDistancePercent = Math.max(
    1.8,
    Math.min(12.0, Math.round(atrPercent * 1.8 * 100) / 100)
  );

  // Recommended DCA levels proportionally spaced within the ATR buffer
  const recommendedDca1DistancePercent =
    Math.round(recommendedSlDistancePercent * 0.45 * 100) / 100;
  const recommendedDca2DistancePercent =
    Math.round(recommendedSlDistancePercent * 0.8 * 100) / 100;

  // Volatility regime classification
  let volatilityRegime: VolatilityAnalysis['volatilityRegime'] = 'NORMAL';
  let score = 50;
  let description = '';

  if (atrPercent >= 8.0) {
    volatilityRegime = 'EXTREME';
    score = 45;
    description = `Extreme volatility (ATR ${atrPercent}% of price). High slippage danger; requires wide SL (${recommendedSlDistancePercent}%) and reduced position sizing`;
  } else if (atrPercent >= 4.0) {
    volatilityRegime = 'HIGH';
    score = 80;
    description = `High active volatility (ATR ${atrPercent}%). Substantial price movement potential; dynamic SL set to ${recommendedSlDistancePercent}%`;
  } else if (atrPercent >= 1.5) {
    volatilityRegime = 'NORMAL';
    score = 92; // Sweet spot for spot trading
    description = `Optimal volatility profile (ATR ${atrPercent}% of price). Favorable risk/reward balance; dynamic SL set to ${recommendedSlDistancePercent}%`;
  } else {
    volatilityRegime = 'LOW';
    score = 55;
    description = `Compressed volatility (ATR ${atrPercent}%). Low risk of adverse move, but upside breakout may take extended time`;
  }

  return {
    atr: Math.round(atr * 10000) / 10000,
    atrPercent,
    recentRange: {
      high: Math.round(recentHigh * 10000) / 10000,
      low: Math.round(recentLow * 10000) / 10000,
      rangePercent,
    },
    recommendedSlDistancePercent,
    recommendedDca1DistancePercent,
    recommendedDca2DistancePercent,
    volatilityRegime,
    score,
    description,
  };
}
