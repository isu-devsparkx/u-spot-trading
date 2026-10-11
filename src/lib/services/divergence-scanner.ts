// ─── U-SPOT Multi-Timeframe Divergence Scanner Engine — Phase 37 ──────
// Rigorous quantitative divergence detection across RSI, MACD, and OBV
// supporting Regular Bullish/Bearish and Hidden Bullish/Bearish divergences,
// multi-timeframe confluence scoring (15m, 1h, 4h), and matrix reporting.
// Spec Ref: Phase 37 & Technical Analysis Specifications

import type {
  OHLCV,
  DivergenceIndicatorType,
  DivergenceType,
  DivergenceStrength,
  DivergenceTimeframe,
  DivergencePivot,
  DivergenceResult,
  MultiTimeframeDivergenceConfluence,
  DivergenceMatrixRow,
  DivergenceMatrixScanReport,
} from '../../types/index.ts';
import { calculateRSISeries } from '../ta/momentum.ts';
import { calculateEMASeries } from '../ta/trend.ts';
import { fetchKlines } from './binance-service.ts';
import { DEFAULT_WATCHLIST_SYMBOLS } from './binance-websocket.ts';

// ─── Indicator Math & Series Generation ─────────────────────────────

/**
 * Calculates MACD Line, Signal Line, and Histogram series across all closes
 */
export function calculateMACDSeries(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const n = closes.length;
  if (n === 0) {
    return { macdLine: [], signalLine: [], histogram: [] };
  }

  const fastEMA = calculateEMASeries(closes, fastPeriod);
  const slowEMA = calculateEMASeries(closes, slowPeriod);

  const macdLine: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    macdLine[i] = fastEMA[i] - slowEMA[i];
  }

  const signalLine = calculateEMASeries(macdLine, signalPeriod);
  const histogram: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    histogram[i] = macdLine[i] - signalLine[i];
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Calculates On-Balance Volume (OBV) series
 */
export function calculateOBVSeries(closes: number[], volumes: number[]): number[] {
  const n = Math.min(closes.length, volumes.length);
  if (n === 0) return [];

  const obv: number[] = new Array(n);
  obv[0] = volumes[0] || 0;

  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) {
      obv[i] = obv[i - 1] + volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      obv[i] = obv[i - 1] - volumes[i];
    } else {
      obv[i] = obv[i - 1];
    }
  }

  return obv;
}

// ─── Swing Pivot Detection ──────────────────────────────────────────

/**
 * Identifies local swing high and swing low pivots paired with indicator values
 */
export function findIndicatorPivots(
  klines: OHLCV[],
  series: number[],
  leftBars: number = 2,
  rightBars: number = 2
): { swingHighs: DivergencePivot[]; swingLows: DivergencePivot[] } {
  const swingHighs: DivergencePivot[] = [];
  const swingLows: DivergencePivot[] = [];

  const n = Math.min(klines.length, series.length);
  if (n < leftBars + rightBars + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = leftBars; i < n - rightBars; i++) {
    const currentPriceLow = klines[i].low;
    const currentPriceHigh = klines[i].high;

    // Check Swing Low
    let isLow = true;
    for (let j = 1; j <= leftBars; j++) {
      if (klines[i - j].low < currentPriceLow) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let j = 1; j <= rightBars; j++) {
        if (klines[i + j].low <= currentPriceLow) {
          isLow = false;
          break;
        }
      }
    }

    if (isLow) {
      swingLows.push({
        barIndex: i,
        timestamp: klines[i].timestamp,
        price: currentPriceLow,
        indicatorValue: series[i],
      });
    }

    // Check Swing High
    let isHigh = true;
    for (let j = 1; j <= leftBars; j++) {
      if (klines[i - j].high > currentPriceHigh) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let j = 1; j <= rightBars; j++) {
        if (klines[i + j].high >= currentPriceHigh) {
          isHigh = false;
          break;
        }
      }
    }

    if (isHigh) {
      swingHighs.push({
        barIndex: i,
        timestamp: klines[i].timestamp,
        price: currentPriceHigh,
        indicatorValue: series[i],
      });
    }
  }

  return { swingHighs, swingLows };
}

// ─── Quantitative Divergence Evaluation ─────────────────────────────

/**
 * Calculates strength score (0 to 100) and grade for a detected divergence
 */
export function calculateDivergenceStrength(
  type: DivergenceType,
  indicator: DivergenceIndicatorType,
  prior: DivergencePivot,
  recent: DivergencePivot,
  currentPrice: number,
  currentIndicator: number
): { score: number; strength: DivergenceStrength } {
  if (type === 'NONE') {
    return { score: 0, strength: 'WEAK' };
  }

  let baseScore = 50;

  // 1. Pivot distance factor (ideal: 5 to 30 bars)
  const barDistance = recent.barIndex - prior.barIndex;
  if (barDistance >= 6 && barDistance <= 25) {
    baseScore += 15;
  } else if (barDistance >= 4 && barDistance <= 35) {
    baseScore += 8;
  } else {
    baseScore -= 10;
  }

  // 2. Price divergence magnitude (%)
  const priceChangePct = Math.abs((recent.price - prior.price) / prior.price) * 100;
  if (priceChangePct >= 2.0) {
    baseScore += 15;
  } else if (priceChangePct >= 0.8) {
    baseScore += 8;
  }

  // 3. Indicator extremity & magnitude
  if (indicator === 'RSI') {
    const isBullish = type === 'REGULAR_BULLISH' || type === 'HIDDEN_BULLISH';
    const minRsi = Math.min(prior.indicatorValue, recent.indicatorValue);
    const maxRsi = Math.max(prior.indicatorValue, recent.indicatorValue);
    const rsiDiff = Math.abs(recent.indicatorValue - prior.indicatorValue);

    if (isBullish) {
      if (minRsi <= 30) baseScore += 18;
      else if (minRsi <= 38) baseScore += 10;

      if (rsiDiff >= 6.0) baseScore += 12;
      else if (rsiDiff >= 3.0) baseScore += 6;
    } else {
      if (maxRsi >= 70) baseScore += 18;
      else if (maxRsi >= 62) baseScore += 10;

      if (rsiDiff >= 6.0) baseScore += 12;
      else if (rsiDiff >= 3.0) baseScore += 6;
    }
  } else if (indicator === 'MACD_HISTOGRAM' || indicator === 'MACD_LINE') {
    const histDiff = Math.abs(recent.indicatorValue - prior.indicatorValue);
    if (histDiff > 0) baseScore += 12;
  } else if (indicator === 'OBV') {
    baseScore += 10;
  }

  const boundedScore = Math.max(10, Math.min(98, Math.round(baseScore)));
  const strength: DivergenceStrength =
    boundedScore >= 75 ? 'STRONG' : boundedScore >= 50 ? 'MODERATE' : 'WEAK';

  return { score: boundedScore, strength };
}

/**
 * Detects divergence across pivots for a given indicator series
 */
export function detectDivergenceFromPivots(
  symbol: string,
  timeframe: DivergenceTimeframe,
  indicator: DivergenceIndicatorType,
  swingHighs: DivergencePivot[],
  swingLows: DivergencePivot[],
  currentPrice: number,
  currentIndicatorValue: number
): DivergenceResult | null {
  const minSeparationBars = 3;
  const maxSeparationBars = 45;

  let bestResult: DivergenceResult | null = null;
  let maxScore = -1;

  // 1. Evaluate Bullish Divergences (Swing Lows)
  if (swingLows.length >= 2) {
    const recent = swingLows[swingLows.length - 1];
    // Find matching prior pivot within valid distance
    for (let i = swingLows.length - 2; i >= 0; i--) {
      const prior = swingLows[i];
      const barDistance = recent.barIndex - prior.barIndex;
      if (barDistance < minSeparationBars || barDistance > maxSeparationBars) continue;

      let type: DivergenceType = 'NONE';

      // Regular Bullish: Price Lower Low (LL) & Indicator Higher Low (HL)
      if (recent.price < prior.price && recent.indicatorValue > prior.indicatorValue) {
        type = 'REGULAR_BULLISH';
      }
      // Hidden Bullish: Price Higher Low (HL) & Indicator Lower Low (LL)
      else if (recent.price > prior.price && recent.indicatorValue < prior.indicatorValue) {
        type = 'HIDDEN_BULLISH';
      }

      if (type !== 'NONE') {
        const { score, strength } = calculateDivergenceStrength(
          type,
          indicator,
          prior,
          recent,
          currentPrice,
          currentIndicatorValue
        );

        if (score > maxScore) {
          maxScore = score;
          const spotAction = score >= 50 ? 'BUY_ACCUMULATE' : 'WATCH';
          const typeLabel =
            type === 'REGULAR_BULLISH' ? 'Regular Bullish Reversal' : 'Hidden Bullish Continuation';

          bestResult = {
            symbol,
            timeframe,
            indicator,
            type,
            strength,
            strengthScore: score,
            pricePivots: [prior, recent],
            currentPrice,
            currentIndicatorValue,
            barDistance,
            detectedAt: Date.now(),
            confirmationStatus: barDistance >= 4 ? 'CONFIRMED' : 'UNCONFIRMED',
            spotAction,
            description: `${typeLabel} on ${indicator} (${timeframe}): Price ${prior.price.toFixed(2)} ➔ ${recent.price.toFixed(2)}, ${indicator} ${prior.indicatorValue.toFixed(1)} ➔ ${recent.indicatorValue.toFixed(1)}`,
          };
        }
        break; // Only test most recent valid pair
      }
    }
  }

  // 2. Evaluate Bearish Divergences (Swing Highs)
  if (swingHighs.length >= 2) {
    const recent = swingHighs[swingHighs.length - 1];
    for (let i = swingHighs.length - 2; i >= 0; i--) {
      const prior = swingHighs[i];
      const barDistance = recent.barIndex - prior.barIndex;
      if (barDistance < minSeparationBars || barDistance > maxSeparationBars) continue;

      let type: DivergenceType = 'NONE';

      // Regular Bearish: Price Higher High (HH) & Indicator Lower High (LH)
      if (recent.price > prior.price && recent.indicatorValue < prior.indicatorValue) {
        type = 'REGULAR_BEARISH';
      }
      // Hidden Bearish: Price Lower High (LH) & Indicator Higher High (HH)
      else if (recent.price < prior.price && recent.indicatorValue > prior.indicatorValue) {
        type = 'HIDDEN_BEARISH';
      }

      if (type !== 'NONE') {
        const { score, strength } = calculateDivergenceStrength(
          type,
          indicator,
          prior,
          recent,
          currentPrice,
          currentIndicatorValue
        );

        if (score > maxScore) {
          maxScore = score;
          const spotAction = score >= 50 ? 'CAUTION_TRIM' : 'WATCH';
          const typeLabel =
            type === 'REGULAR_BEARISH' ? 'Regular Bearish Exhaustion' : 'Hidden Bearish Continuation';

          bestResult = {
            symbol,
            timeframe,
            indicator,
            type,
            strength,
            strengthScore: score,
            pricePivots: [prior, recent],
            currentPrice,
            currentIndicatorValue,
            barDistance,
            detectedAt: Date.now(),
            confirmationStatus: barDistance >= 4 ? 'CONFIRMED' : 'UNCONFIRMED',
            spotAction,
            description: `${typeLabel} on ${indicator} (${timeframe}): Price ${prior.price.toFixed(2)} ➔ ${recent.price.toFixed(2)}, ${indicator} ${prior.indicatorValue.toFixed(1)} ➔ ${recent.indicatorValue.toFixed(1)}`,
          };
        }
        break;
      }
    }
  }

  return bestResult;
}

// ─── Single Symbol Multi-Timeframe Analysis ─────────────────────────

/**
 * Scans all supported indicators for a specific symbol and timeframe
 */
export function scanSymbolTimeframeDivergences(
  symbol: string,
  timeframe: DivergenceTimeframe,
  klines: OHLCV[]
): DivergenceResult[] {
  if (!klines || klines.length < 25) return [];

  const closes = klines.map((k) => k.close);
  const volumes = klines.map((k) => k.volume);
  const currentPrice = closes[closes.length - 1];

  const results: DivergenceResult[] = [];

  // 1. RSI 14 Divergence
  const rsiSeries = calculateRSISeries(closes, 14);
  const rsiPivots = findIndicatorPivots(klines, rsiSeries, 2, 2);
  const rsiDiv = detectDivergenceFromPivots(
    symbol,
    timeframe,
    'RSI',
    rsiPivots.swingHighs,
    rsiPivots.swingLows,
    currentPrice,
    rsiSeries[rsiSeries.length - 1]
  );
  if (rsiDiv) results.push(rsiDiv);

  // 2. MACD Histogram Divergence
  const { histogram, macdLine } = calculateMACDSeries(closes, 12, 26, 9);
  const macdHistPivots = findIndicatorPivots(klines, histogram, 2, 2);
  const macdHistDiv = detectDivergenceFromPivots(
    symbol,
    timeframe,
    'MACD_HISTOGRAM',
    macdHistPivots.swingHighs,
    macdHistPivots.swingLows,
    currentPrice,
    histogram[histogram.length - 1]
  );
  if (macdHistDiv) results.push(macdHistDiv);

  // 3. MACD Line Divergence
  const macdLinePivots = findIndicatorPivots(klines, macdLine, 2, 2);
  const macdLineDiv = detectDivergenceFromPivots(
    symbol,
    timeframe,
    'MACD_LINE',
    macdLinePivots.swingHighs,
    macdLinePivots.swingLows,
    currentPrice,
    macdLine[macdLine.length - 1]
  );
  if (macdLineDiv) results.push(macdLineDiv);

  // 4. OBV Divergence
  const obvSeries = calculateOBVSeries(closes, volumes);
  const obvPivots = findIndicatorPivots(klines, obvSeries, 2, 2);
  const obvDiv = detectDivergenceFromPivots(
    symbol,
    timeframe,
    'OBV',
    obvPivots.swingHighs,
    obvPivots.swingLows,
    currentPrice,
    obvSeries[obvSeries.length - 1]
  );
  if (obvDiv) results.push(obvDiv);

  return results;
}

/**
 * Evaluates whether multiple timeframes exhibit aligned directional divergence
 */
export function evaluateMultiTimeframeConfluence(
  symbol: string,
  allDivergences: DivergenceResult[]
): MultiTimeframeDivergenceConfluence | null {
  if (allDivergences.length === 0) return null;

  const bullishList = allDivergences.filter(
    (d) => d.type === 'REGULAR_BULLISH' || d.type === 'HIDDEN_BULLISH'
  );
  const bearishList = allDivergences.filter(
    (d) => d.type === 'REGULAR_BEARISH' || d.type === 'HIDDEN_BEARISH'
  );

  const isBullishDominant = bullishList.length >= bearishList.length;
  const candidates = isBullishDominant ? bullishList : bearishList;

  if (candidates.length === 0) return null;

  const timeframesInvolved = Array.from(new Set(candidates.map((c) => c.timeframe)));

  // Confluence requires either at least 2 timeframes or multiple indicators across timeframes
  if (timeframesInvolved.length < 2 && candidates.length < 2) {
    return null;
  }

  const alignments = candidates.map((c) => ({
    timeframe: c.timeframe,
    indicator: c.indicator,
    type: c.type,
    strengthScore: c.strengthScore,
  }));

  const avgStrength = candidates.reduce((sum, c) => sum + c.strengthScore, 0) / candidates.length;

  // Confluence multiplier: boosts score when higher timeframes confirm
  let tfMultiplier = 1.0;
  if (timeframesInvolved.includes('4h')) tfMultiplier += 0.25;
  if (timeframesInvolved.includes('1h')) tfMultiplier += 0.15;
  if (timeframesInvolved.length >= 3) tfMultiplier += 0.2;

  const confluenceScore = Math.min(99, Math.round(avgStrength * tfMultiplier));

  const hasRegular = candidates.some((c) => c.type.includes('REGULAR'));
  const dominantSentiment = isBullishDominant
    ? hasRegular
      ? 'STRONG_BUY_REVERSAL'
      : 'BULLISH_CONTINUATION'
    : hasRegular
    ? 'BEARISH_EXHAUSTION'
    : 'BEARISH_CONTINUATION';

  const directionLabel = isBullishDominant ? 'Bullish' : 'Bearish';
  const description = `Multi-timeframe ${directionLabel} confluence on ${symbol} across ${timeframesInvolved.join(', ')} (${confluenceScore}/100)`;

  return {
    symbol,
    divergenceType: isBullishDominant ? 'BULLISH' : 'BEARISH',
    alignments,
    confluenceScore,
    timeframesInvolved,
    dominantSentiment,
    description,
  };
}

// ─── Universe Scan & Matrix Assembler ───────────────────────────────

let cachedMatrixReport: DivergenceMatrixScanReport | null = null;
let lastMatrixScanTime: number = 0;
const CACHE_TTL_MS = 25 * 1000; // 25 seconds cache

/**
 * Scans a list of universe symbols across requested timeframes and builds matrix rows
 */
export async function scanUniverseDivergenceMatrix(
  symbols: string[] = DEFAULT_WATCHLIST_SYMBOLS,
  timeframes: DivergenceTimeframe[] = ['15m', '1h', '4h']
): Promise<DivergenceMatrixScanReport> {
  const now = Date.now();
  if (cachedMatrixReport && now - lastMatrixScanTime < CACHE_TTL_MS) {
    return cachedMatrixReport;
  }

  const matrixRows: DivergenceMatrixRow[] = [];
  const allConfluences: MultiTimeframeDivergenceConfluence[] = [];

  let totalBullishRegular = 0;
  let totalBearishRegular = 0;
  let totalBullishHidden = 0;
  let totalBearishHidden = 0;

  for (const symbol of symbols) {
    const row: DivergenceMatrixRow = {
      symbol,
      currentPrice: 0,
      timeframes: {},
    };

    const symbolDivergences: DivergenceResult[] = [];

    for (const tf of timeframes) {
      try {
        const klines = await fetchKlines(symbol, tf, 60);
        if (klines && klines.length > 0) {
          row.currentPrice = klines[klines.length - 1].close;
          const divs = scanSymbolTimeframeDivergences(symbol, tf, klines);

          if (divs.length > 0) {
            symbolDivergences.push(...divs);

            // Determine dominant divergence type for this timeframe
            const sortedByScore = [...divs].sort((a, b) => b.strengthScore - a.strengthScore);
            const dominant = sortedByScore[0];

            row.timeframes[tf] = {
              divergences: divs,
              dominantType: dominant.type,
              maxStrengthScore: dominant.strengthScore,
            };

            for (const d of divs) {
              if (d.type === 'REGULAR_BULLISH') totalBullishRegular++;
              else if (d.type === 'REGULAR_BEARISH') totalBearishRegular++;
              else if (d.type === 'HIDDEN_BULLISH') totalBullishHidden++;
              else if (d.type === 'HIDDEN_BEARISH') totalBearishHidden++;
            }
          }
        }
      } catch {
        // Fallback gracefully on rate-limits
      }
    }

    const confluence = evaluateMultiTimeframeConfluence(symbol, symbolDivergences);
    if (confluence) {
      row.confluence = confluence;
      allConfluences.push(confluence);
    }

    matrixRows.push(row);
  }

  const report: DivergenceMatrixScanReport = {
    timestamp: now,
    scannedSymbols: symbols.length,
    matrix: matrixRows,
    confluences: allConfluences.sort((a, b) => b.confluenceScore - a.confluenceScore),
    summary: {
      totalBullishRegular,
      totalBearishRegular,
      totalBullishHidden,
      totalBearishHidden,
      totalConfluences: allConfluences.length,
    },
  };

  cachedMatrixReport = report;
  lastMatrixScanTime = now;
  return report;
}

// ─── Synthetic Test Data Helper ─────────────────────────────────────

/**
 * Generates synthetic candles with precise divergence patterns for testing & offline mode
 */
export function generateSyntheticDivergenceCandles(
  pattern: 'REGULAR_BULLISH' | 'REGULAR_BEARISH' | 'HIDDEN_BULLISH' | 'HIDDEN_BEARISH',
  basePrice: number = 60000,
  numBars: number = 35
): OHLCV[] {
  const candles: OHLCV[] = [];
  const now = Date.now();
  const barIntervalMs = 15 * 60 * 1000;

  for (let i = 0; i < numBars; i++) {
    const timestamp = now - (numBars - i) * barIntervalMs;
    let price = basePrice;

    if (pattern === 'REGULAR_BULLISH') {
      // Prior swing low around bar 10: price 58000, severe dump
      // Recent swing low around bar 26: price 57000 (LL), but gradual rounding consolidation
      if (i >= 7 && i <= 13) {
        price = basePrice - 2000 - Math.sin((i - 7) * 0.5) * 500;
      } else if (i >= 23 && i <= 29) {
        price = basePrice - 3000 - Math.sin((i - 23) * 0.5) * 200;
      } else if (i > 13 && i < 23) {
        price = basePrice - 1000;
      } else {
        price = basePrice;
      }
    } else if (pattern === 'REGULAR_BEARISH') {
      // Prior swing high around bar 10: price 62000
      // Recent swing high around bar 26: price 64000 (HH), but weak volume
      if (i >= 7 && i <= 13) {
        price = basePrice + 2000 + Math.sin((i - 7) * 0.5) * 500;
      } else if (i >= 23 && i <= 29) {
        price = basePrice + 4000 + Math.sin((i - 23) * 0.5) * 200;
      } else if (i > 13 && i < 23) {
        price = basePrice + 1000;
      } else {
        price = basePrice;
      }
    } else {
      price = basePrice + (i % 2 === 0 ? 50 : -50);
    }

    candles.push({
      timestamp,
      open: price - 20,
      high: price + 50,
      low: price - 50,
      close: price,
      volume: 100 + i * 2,
      quoteVolume: (100 + i * 2) * price,
    });
  }

  return candles;
}
