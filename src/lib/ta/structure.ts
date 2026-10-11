// ─── U-SPOT Market Structure Module ──────────────────────────────────
// Phase 5: Technical Analysis — Swings, HH/HL/LH/LL, BOS, CHoCH, Sweeps & S/R
// Spec Section 8.5 (Structure Module)

import type { OHLCV, StructureAnalysis, SwingPivot } from '../../types/index.ts';

/**
 * Finds swing pivot highs and lows using a fractal window
 */
export function findSwingPivots(
  klines: OHLCV[],
  leftBars: number = 2,
  rightBars: number = 2
): { swingHighs: SwingPivot[]; swingLows: SwingPivot[] } {
  const swingHighs: SwingPivot[] = [];
  const swingLows: SwingPivot[] = [];

  const n = klines.length;
  if (n < leftBars + rightBars + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = leftBars; i < n - rightBars; i++) {
    const current = klines[i];

    // Check Swing High
    let isHigh = true;
    for (let j = 1; j <= leftBars; j++) {
      if (klines[i - j].high >= current.high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let j = 1; j <= rightBars; j++) {
        if (klines[i + j].high > current.high) {
          isHigh = false;
          break;
        }
      }
    }

    if (isHigh) {
      swingHighs.push({
        price: current.high,
        timestamp: current.timestamp,
        index: i,
        type: 'HIGH',
      });
    }

    // Check Swing Low
    let isLow = true;
    for (let j = 1; j <= leftBars; j++) {
      if (klines[i - j].low <= current.low) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let j = 1; j <= rightBars; j++) {
        if (klines[i + j].low < current.low) {
          isLow = false;
          break;
        }
      }
    }

    if (isLow) {
      swingLows.push({
        price: current.low,
        timestamp: current.timestamp,
        index: i,
        type: 'LOW',
      });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Main Market Structure Analysis Evaluator
 * Spec Section 8.5
 */
export function analyzeStructure(klines: OHLCV[]): StructureAnalysis {
  if (!klines || klines.length < 5) {
    return {
      swingHighs: [],
      swingLows: [],
      latestHighType: null,
      latestLowType: null,
      structureTrend: 'RANGING',
      breakOfStructure: { detected: false, type: null, level: null },
      changeOfCharacter: { detected: false, type: null, level: null },
      liquiditySweep: { detected: false, type: null, level: null },
      nearestSupport: null,
      nearestResistance: null,
      score: 50,
      description: 'Insufficient candlestick data for structure analysis',
    };
  }

  const { swingHighs, swingLows } = findSwingPivots(klines, 2, 2);
  const currentBar = klines[klines.length - 1];
  const currentPrice = currentBar.close;

  // 1. Classify HH / LH and HL / LL
  let latestHighType: StructureAnalysis['latestHighType'] = null;
  if (swingHighs.length >= 2) {
    const h1 = swingHighs[swingHighs.length - 2];
    const h2 = swingHighs[swingHighs.length - 1];
    latestHighType = h2.price >= h1.price ? 'HH' : 'LH';
  }

  let latestLowType: StructureAnalysis['latestLowType'] = null;
  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2];
    const l2 = swingLows[swingLows.length - 1];
    latestLowType = l2.price >= l1.price ? 'HL' : 'LL';
  }

  // 2. Structure Trend
  let structureTrend: StructureAnalysis['structureTrend'] = 'RANGING';
  if (latestHighType === 'HH' && latestLowType === 'HL') {
    structureTrend = 'UPTREND';
  } else if (latestHighType === 'LH' && latestLowType === 'LL') {
    structureTrend = 'DOWNTREND';
  } else {
    structureTrend = 'RANGING';
  }

  // 3. Nearest Support & Resistance levels from recent swing pivots
  let nearestSupport: number | null = null;
  let nearestResistance: number | null = null;

  for (let i = swingLows.length - 1; i >= 0; i--) {
    if (swingLows[i].price < currentPrice) {
      if (nearestSupport === null || swingLows[i].price > nearestSupport) {
        nearestSupport = swingLows[i].price;
        break;
      }
    }
  }

  for (let i = swingHighs.length - 1; i >= 0; i--) {
    if (swingHighs[i].price > currentPrice) {
      if (nearestResistance === null || swingHighs[i].price < nearestResistance) {
        nearestResistance = swingHighs[i].price;
        break;
      }
    }
  }

  // 4. Break of Structure (BOS) detection
  // Bullish BOS: Price cleanly breaks above the most recent swing high
  const breakOfStructure: StructureAnalysis['breakOfStructure'] = {
    detected: false,
    type: null,
    level: null,
  };

  const lastSwingHigh = swingHighs[swingHighs.length - 1];
  const lastSwingLow = swingLows[swingLows.length - 1];

  if (lastSwingHigh && currentPrice > lastSwingHigh.price) {
    breakOfStructure.detected = true;
    breakOfStructure.type = 'BULLISH_BOS';
    breakOfStructure.level = lastSwingHigh.price;
  } else if (lastSwingLow && currentPrice < lastSwingLow.price) {
    breakOfStructure.detected = true;
    breakOfStructure.type = 'BEARISH_BOS';
    breakOfStructure.level = lastSwingLow.price;
  }

  // 5. Change of Character (CHoCH) detection
  // Bullish CHoCH: In a downtrend, price breaks above the previous lower high
  const changeOfCharacter: StructureAnalysis['changeOfCharacter'] = {
    detected: false,
    type: null,
    level: null,
  };

  if (latestHighType === 'LH' && lastSwingHigh && currentPrice > lastSwingHigh.price) {
    changeOfCharacter.detected = true;
    changeOfCharacter.type = 'BULLISH_CHOCH';
    changeOfCharacter.level = lastSwingHigh.price;
  } else if (latestLowType === 'HL' && lastSwingLow && currentPrice < lastSwingLow.price) {
    changeOfCharacter.detected = true;
    changeOfCharacter.type = 'BEARISH_CHOCH';
    changeOfCharacter.level = lastSwingLow.price;
  }

  // 6. Liquidity Sweep Detection (Wick Sweep)
  // Candle pierces swing low/high with wick, but closes inside
  const liquiditySweep: StructureAnalysis['liquiditySweep'] = {
    detected: false,
    type: null,
    level: null,
  };

  if (lastSwingLow && currentBar.low < lastSwingLow.price && currentBar.close > lastSwingLow.price) {
    liquiditySweep.detected = true;
    liquiditySweep.type = 'SWEEP_LOW';
    liquiditySweep.level = lastSwingLow.price;
  } else if (lastSwingHigh && currentBar.high > lastSwingHigh.price && currentBar.close < lastSwingHigh.price) {
    liquiditySweep.detected = true;
    liquiditySweep.type = 'SWEEP_HIGH';
    liquiditySweep.level = lastSwingHigh.price;
  }

  // 7. Structure Score (0-100)
  let score = 50;
  let description = '';

  if (liquiditySweep.detected && liquiditySweep.type === 'SWEEP_LOW') {
    score = 92; // Prime institutional liquidity sweep reversal
    description = `Bullish liquidity sweep of prior swing low ($${liquiditySweep.level}). Buyer rejection confirmed`;
  } else if (changeOfCharacter.detected && changeOfCharacter.type === 'BULLISH_CHOCH') {
    score = 90; // Major trend reversal confirmation
    description = `Bullish Change of Character (CHoCH) above $${changeOfCharacter.level} breaking bearish structure`;
  } else if (breakOfStructure.detected && breakOfStructure.type === 'BULLISH_BOS') {
    score = 86;
    description = `Bullish Break of Structure (BOS) breaking above $${breakOfStructure.level}`;
  } else if (structureTrend === 'UPTREND') {
    score = 80;
    description = `Classic bullish market structure (${latestHighType} / ${latestLowType}) in active uptrend`;
  } else if (liquiditySweep.detected && liquiditySweep.type === 'SWEEP_HIGH') {
    score = 30; // Bearish wick sweep rejection
    description = `Bearish liquidity sweep / upper wick rejection at $${liquiditySweep.level}`;
  } else if (structureTrend === 'DOWNTREND') {
    score = 25;
    description = `Bearish market structure with lower highs and lower lows (${latestHighType} / ${latestLowType})`;
  } else {
    score = 52;
    description = `Range-bound market structure between support ($${nearestSupport ?? 'N/A'}) and resistance ($${nearestResistance ?? 'N/A'})`;
  }

  return {
    swingHighs,
    swingLows,
    latestHighType,
    latestLowType,
    structureTrend,
    breakOfStructure,
    changeOfCharacter,
    liquiditySweep,
    nearestSupport: nearestSupport ? Math.round(nearestSupport * 10000) / 10000 : null,
    nearestResistance: nearestResistance ? Math.round(nearestResistance * 10000) / 10000 : null,
    score,
    description,
  };
}
