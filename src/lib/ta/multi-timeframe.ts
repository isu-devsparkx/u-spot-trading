// ─── U-SPOT Multi-Timeframe Confluence Engine ────────────────────────
// Phase 25: Multi-Timeframe Confluence (15M + 1H + 4H Alignment)
// Protects against 15M false breakouts by enforcing macro higher-timeframe alignment

import type {
  OHLCV,
  Timeframe,
  MultiTimeframeAnalysis,
  TimeframeTrendSummary,
  MTFAlignment,
} from '../../types/index.ts';

import { calculateLatestEMA } from './trend.ts';
import { calculateRSISeries } from './momentum.ts';

/**
 * Compresses lower-timeframe OHLCV candles into a higher timeframe series.
 * E.g. factor = 4 compresses 15m candles into 1h candles; factor = 4 on 1h yields 4h.
 */
export function compressKlines(klines: OHLCV[], factor: number): OHLCV[] {
  if (!klines || klines.length === 0 || factor <= 1) return klines || [];
  const compressed: OHLCV[] = [];

  for (let i = 0; i < klines.length; i += factor) {
    const chunk = klines.slice(i, i + factor);
    if (chunk.length === 0) continue;

    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let quoteVolume = 0;

    for (const bar of chunk) {
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
      volume += bar.volume;
      quoteVolume += bar.quoteVolume;
    }

    compressed.push({
      timestamp: chunk[chunk.length - 1].timestamp,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume,
    });
  }

  return compressed;
}

/**
 * Evaluates the trend and moving average structure for a single timeframe
 */
export function analyzeTimeframeTrend(klines: OHLCV[], tf: Timeframe): TimeframeTrendSummary {
  if (!klines || klines.length === 0) {
    return {
      timeframe: tf,
      direction: 'NEUTRAL',
      ema20: 0,
      ema50: 0,
      ema200: null,
      isAboveEma200: null,
      alignment: 'NEUTRAL',
    };
  }

  const closes = klines.map((k) => k.close);
  const currentPrice = closes[closes.length - 1];
  const ema20 = calculateLatestEMA(closes, 20);
  const ema50 = calculateLatestEMA(closes, 50);
  const ema200 = closes.length >= 80 ? calculateLatestEMA(closes, 200) : null;
  const isAboveEma200 = ema200 !== null ? currentPrice >= ema200 : null;

  const rsiSeries = calculateRSISeries(closes, 14);
  const rsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : undefined;

  let alignment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

  if (ema20 > ema50 && currentPrice >= ema50) {
    alignment = 'BULLISH';
    direction = 'BULLISH';
  } else if (ema20 < ema50 && currentPrice <= ema50) {
    alignment = 'BEARISH';
    direction = 'BEARISH';
  } else if (currentPrice > ema20 && ema20 > 0) {
    direction = 'BULLISH';
  } else if (currentPrice < ema20 && ema20 > 0) {
    direction = 'BEARISH';
  }

  return {
    timeframe: tf,
    direction,
    ema20,
    ema50,
    ema200,
    isAboveEma200,
    alignment,
    rsi,
  };
}

/**
 * Multi-Timeframe Confluence Engine (Phase 25)
 * Analyzes alignment across 15M, 1H, and 4H to ensure trades align with macro market tailwinds
 * and eliminates counter-trend fake breakouts.
 */
export function evaluateMultiTimeframeConfluence(params: {
  symbol: string;
  klines15m: OHLCV[];
  klines1h?: OHLCV[];
  klines4h?: OHLCV[];
  currentPrice?: number;
}): MultiTimeframeAnalysis {
  const { symbol, klines15m, klines1h, klines4h } = params;

  // 1. Analyze 15m timeframe
  const tf15m = analyzeTimeframeTrend(klines15m, '15m');

  // 2. Analyze 1h timeframe (use provided 1h klines or compress 15m)
  const effective1hKlines =
    klines1h && klines1h.length >= 15 ? klines1h : compressKlines(klines15m, 4);
  const tf1h = analyzeTimeframeTrend(effective1hKlines, '1h');

  // 3. Analyze 4h timeframe (use provided 4h klines or compress 1h)
  const effective4hKlines =
    klines4h && klines4h.length >= 10 ? klines4h : compressKlines(effective1hKlines, 4);
  const tf4h =
    effective4hKlines.length >= 5
      ? analyzeTimeframeTrend(effective4hKlines, '4h')
      : undefined;

  // 4. Calculate Confluence Score & Alignment
  let score = 50;

  // 15m contribution (30%)
  if (tf15m.direction === 'BULLISH') score += 15;
  else if (tf15m.direction === 'BEARISH') score -= 15;

  // 1h contribution (45% - intermediate driver)
  if (tf1h.alignment === 'BULLISH') score += 20;
  else if (tf1h.alignment === 'BEARISH') score -= 25;
  if (tf1h.isAboveEma200 === true) score += 10;
  else if (tf1h.isAboveEma200 === false) score -= 15;

  // 4h contribution (25% - macro tailwind)
  if (tf4h) {
    if (tf4h.direction === 'BULLISH') score += 10;
    else if (tf4h.direction === 'BEARISH') score -= 15;
    if (tf4h.isAboveEma200 === true) score += 5;
  }

  const confluenceScore = Math.max(0, Math.min(100, Math.round(score)));

  // 5. Determine Counter-Trend Warnings
  // Flagged when 1h is in a bear stack AND price is below 1h EMA 200, OR 1h and 4h are both BEARISH
  const is1hSevereBear =
    tf1h.alignment === 'BEARISH' && (tf1h.isAboveEma200 === false || tf1h.direction === 'BEARISH');
  const isMacroDowntrend = tf4h?.direction === 'BEARISH' && tf1h.direction === 'BEARISH';
  const isCounterTrendWarning = is1hSevereBear || isMacroDowntrend;

  let alignment: MTFAlignment = 'NEUTRAL';
  let recommendation: MultiTimeframeAnalysis['recommendation'] = 'NEUTRAL';
  let scoreBonus = 0;

  if (isCounterTrendWarning) {
    alignment = 'COUNTER_TREND';
    recommendation = 'AVOID_COUNTER_TREND';
    scoreBonus = -18;
  } else if (
    tf15m.direction === 'BULLISH' &&
    tf1h.direction === 'BULLISH' &&
    (tf4h ? tf4h.direction !== 'BEARISH' : true)
  ) {
    alignment = 'FULL_CONFLUENCE';
    recommendation = 'STRONG_ALIGNMENT';
    scoreBonus = 10;
  } else if (tf15m.direction === 'BULLISH' && tf1h.direction !== 'BEARISH') {
    alignment = 'PARTIAL_CONFLUENCE';
    recommendation = 'SUITABLE';
    scoreBonus = 4;
  } else {
    alignment = 'NEUTRAL';
    recommendation = 'NEUTRAL';
    scoreBonus = 0;
  }

  // Build descriptive summary
  let summary = '';
  if (alignment === 'FULL_CONFLUENCE') {
    summary = `Full Bullish MTF Alignment: 15M trigger supported by 1H ${tf1h.isAboveEma200 ? '(above EMA 200)' : ''} and 4H macro uptrend. High win-probability.`;
  } else if (alignment === 'PARTIAL_CONFLUENCE') {
    summary = `Partial MTF Alignment: 15M bullish trigger with neutral 1H structure. Moderate trend tailwind.`;
  } else if (alignment === 'COUNTER_TREND') {
    summary = `Counter-Trend Warning: 15M bounce is fighting a 1H/4H downtrend ${tf1h.isAboveEma200 === false ? 'below 1H EMA 200' : ''}. High risk of false breakout stop-out.`;
  } else {
    summary = `Mixed MTF signals across timeframes. Exercise disciplined position sizing.`;
  }

  return {
    tf15m,
    tf1h,
    tf4h,
    alignment,
    confluenceScore,
    isCounterTrendWarning,
    scoreBonus,
    recommendation,
    summary,
  };
}
