// ─── U-SPOT Signal Generation Engine ────────────────────────────────
// Phase 6: Multi-Factor Trade Scoring, Setup Detection, Dynamic SL/TP/DCA, and Position Sizing Integration
// Spec Sections: 9 (Signal Engine), 10 (Trade Score), 11 (Entry Engine),
//                12 (Stop Loss Engine), 13 (Take Profit Engine), 14 (Risk Sizing)

import type {
  Signal,
  SignalStatus,
  SignalWeights,
  SetupType,
  ConfidenceGrade,
  MarketCandidate,
  MarketRegime,
  TechnicalAnalysisResult,
  OHLCV,
  OrderBook,
  SetupEvaluation,
  MultiTimeframeAnalysis,
} from '../../types/index.ts';
import { calculatePositionSize, getDefaultRiskForGrade } from '../risk-engine.ts';
import { runTechnicalAnalysis } from '../ta/index.ts';

/**
 * Default Trade Score Weights per Spec Section 10:
 * Trend: 20, Momentum: 15, Volume: 15, Structure: 20, Liquidity: 15, Volatility: 10, Regime: 5 = 100
 */
export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  trend: 20,
  momentum: 15,
  volume: 15,
  structure: 20,
  liquidity: 15,
  volatility: 10,
  regime: 5,
};

/**
 * Format numeric values to appropriate decimal precision based on magnitude
 */
export function roundPrice(value: number): number {
  if (value >= 1000) return Math.round(value * 100) / 100;
  if (value >= 1) return Math.round(value * 1000) / 1000;
  if (value >= 0.01) return Math.round(value * 10000) / 10000;
  return Math.round(value * 1000000) / 1000000;
}

/**
 * Score market regime between 0 and 100 for trade scoring
 */
export function getRegimeScore(regime: MarketRegime): number {
  switch (regime) {
    case 'BULL':
      return 100;
    case 'NEUTRAL':
      return 65;
    case 'HIGH_VOLATILITY':
      return 45;
    case 'LOW_LIQUIDITY':
      return 25;
    case 'BEAR':
      return 15;
    default:
      return 50;
  }
}

/**
 * Compute the multi-factor Trade Score (0-100) per Spec Section 10
 */
export function computeTradeScore(
  ta: TechnicalAnalysisResult,
  regime: MarketRegime,
  weights: SignalWeights = DEFAULT_SIGNAL_WEIGHTS
): {
  tradeScore: number;
  breakdown: {
    trend: number;
    momentum: number;
    volume: number;
    structure: number;
    liquidity: number;
    volatility: number;
    regime: number;
    total: number;
  };
} {
  const regimeScore = getRegimeScore(regime);

  const trendContrib = (ta.trend.score / 100) * weights.trend;
  const momentumContrib = (ta.momentum.score / 100) * weights.momentum;
  const volumeContrib = (ta.volume.score / 100) * weights.volume;
  const structureContrib = (ta.structure.score / 100) * weights.structure;
  const liquidityContrib = (ta.liquidity.score / 100) * weights.liquidity;
  const volatilityContrib = (ta.volatility.score / 100) * weights.volatility;
  const regimeContrib = (regimeScore / 100) * weights.regime;

  const totalRaw =
    trendContrib +
    momentumContrib +
    volumeContrib +
    structureContrib +
    liquidityContrib +
    volatilityContrib +
    regimeContrib;

  const tradeScore = Math.min(100, Math.max(0, Math.round(totalRaw)));

  return {
    tradeScore,
    breakdown: {
      trend: Math.round(trendContrib * 10) / 10,
      momentum: Math.round(momentumContrib * 10) / 10,
      volume: Math.round(volumeContrib * 10) / 10,
      structure: Math.round(structureContrib * 10) / 10,
      liquidity: Math.round(liquidityContrib * 10) / 10,
      volatility: Math.round(volatilityContrib * 10) / 10,
      regime: Math.round(regimeContrib * 10) / 10,
      total: tradeScore,
    },
  };
}

/**
 * Determine Setup Confidence Grade per Spec Section 1 & 10
 * - A+: Trade score >= 85
 * - A: 75 <= Trade score < 85
 * - B: 60 <= Trade score < 75
 * - BELOW_THRESHOLD: Trade score < 60
 */
export function determineConfidenceGrade(tradeScore: number): ConfidenceGrade {
  if (tradeScore >= 85) return 'A+';
  if (tradeScore >= 75) return 'A';
  if (tradeScore >= 60) return 'B';
  return 'BELOW_THRESHOLD';
}

/**
 * Setup Detection Engine (Spec Section 11)
 * Detects 5 setup types in hierarchical order:
 * 1. BREAKOUT_RETEST
 * 2. LIQUIDITY_SWEEP
 * 3. PULLBACK_CONTINUATION
 * 4. TREND_CONTINUATION
 * 5. SUPPORT_REACTION
 */
/**
 * Calculates a structural stop loss anchored to swing pivot lows or nearest support,
 * padded with an ATR volatility buffer (0.55x - 0.75x ATR) to avoid wick sweeps,
 * avoiding psychological round numbers and equal-low hunts.
 */
/**
 * Calculates a structural stop loss anchored to swing pivot lows, nearest support,
 * or order book bid walls, padded with an ATR volatility buffer (0.55x - 0.75x ATR)
 * to avoid wick sweeps, avoiding psychological round numbers and equal-low hunts.
 */
export function calculateStructuralStopLoss(params: {
  preferredEntry: number;
  atr: number;
  structuralAnchor?: number | null;
  swingLows?: Array<{ price: number }>;
  bidWallPrice?: number | null;
  bufferMultiplier?: number;
  maxRiskPercent?: number;
  minRiskPercent?: number;
}): number {
  const {
    preferredEntry,
    atr,
    structuralAnchor = null,
    swingLows = [],
    bidWallPrice = null,
    bufferMultiplier = 0.55,
    maxRiskPercent = 5.5,
    minRiskPercent = 1.2,
  } = params;

  // 1. Identify valid structural low below preferred entry
  let anchor = structuralAnchor;
  if (swingLows && swingLows.length > 0) {
    const validSwingLows = swingLows
      .map((s) => s.price)
      .filter((p) => p < preferredEntry && p > 0);
    if (validSwingLows.length > 0) {
      const nearestSwingLow = Math.max(...validSwingLows);
      if (anchor === null || anchor >= preferredEntry || anchor <= 0) {
        anchor = nearestSwingLow;
      } else {
        // Choose the lower anchor to protect against stop hunts between levels
        anchor = Math.min(anchor, nearestSwingLow);
      }
    }
  }

  // Phase 23: If a high-volume bid wall is stationed below entry, anchor behind it
  if (bidWallPrice && bidWallPrice < preferredEntry && bidWallPrice > 0) {
    if (anchor === null || anchor >= preferredEntry || anchor <= 0) {
      anchor = bidWallPrice;
    } else {
      anchor = Math.min(anchor, bidWallPrice);
    }
  }

  // Fallback to entry minus standard percentage if no valid anchor below entry
  if (anchor === null || anchor >= preferredEntry || anchor <= 0) {
    anchor = preferredEntry * 0.965;
  }

  // 2. Apply ATR volatility buffer below structure
  const buffer = Math.max(atr * bufferMultiplier, preferredEntry * 0.004);
  let rawSl = anchor - buffer;

  // 3. Boundary guardrails: enforce minRiskPercent and maxRiskPercent
  const minSl = preferredEntry * (1 - maxRiskPercent / 100);
  const maxSl = preferredEntry * (1 - minRiskPercent / 100);

  rawSl = Math.max(minSl, Math.min(rawSl, maxSl));

  // 4. Anti-Round Number offset: avoid equal round number stop clusters (e.g. .00, .50)
  let adjustedSl = rawSl;
  if (adjustedSl >= 10) {
    const frac = adjustedSl - Math.floor(adjustedSl);
    const cents = Math.round(frac * 100);
    if (cents === 0 || cents === 50) {
      // Offset downwards by 0.06% of price or at least $0.05
      adjustedSl -= Math.max(adjustedSl * 0.0006, 0.05);
    }
  } else if (adjustedSl >= 0.1) {
    const frac = adjustedSl * 100 - Math.floor(adjustedSl * 100);
    if (Math.abs(frac) < 0.05 || Math.abs(frac - 0.5) < 0.05) {
      adjustedSl -= adjustedSl * 0.0006;
    }
  }

  // Ensure stopLoss remains strictly within minSl and maxSl
  adjustedSl = Math.max(minSl, Math.min(adjustedSl, maxSl));

  return roundPrice(adjustedSl);
}

/**
 * Computes dynamic take profit targets. If immediate overhead resistance or order book
 * ask wall is detected between 1.15R and 1.55R, TP1 is dynamically placed slightly below it
 * (0.998x) to front-run sell walls and trigger the Breakeven Stop Ratchet before rejection.
 */
export function calculateDynamicTakeProfits(params: {
  preferredEntry: number;
  stopLoss: number;
  nearestResistance?: number | null;
  nearestAskWall?: number | null;
  defaultRMultipliers?: { tp1: number; tp2: number; tp3: number };
}): {
  risk: number;
  dca1: number;
  dca2: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
} {
  const {
    preferredEntry,
    stopLoss,
    nearestResistance = null,
    nearestAskWall = null,
    defaultRMultipliers = { tp1: 1.5, tp2: 2.6, tp3: 4.0 },
  } = params;

  const risk = Math.max(preferredEntry - stopLoss, preferredEntry * 0.005);
  const dca1 = roundPrice(preferredEntry - risk * 0.382);
  const dca2 = roundPrice(preferredEntry - risk * 0.72);

  let tp1 = roundPrice(preferredEntry + risk * defaultRMultipliers.tp1);

  // Dynamic Resistance & Ask Wall-Aware TP1 adjustment:
  // Identify the closest overhead barrier (either structural resistance or order book ask wall)
  const barriers: number[] = [];
  if (nearestResistance !== null && nearestResistance > preferredEntry) {
    barriers.push(nearestResistance);
  }
  if (nearestAskWall !== null && nearestAskWall > preferredEntry) {
    barriers.push(nearestAskWall);
  }
  const effectiveBarrier = barriers.length > 0 ? Math.min(...barriers) : null;

  if (effectiveBarrier !== null) {
    const rDistance = (effectiveBarrier - preferredEntry) / risk;
    if (rDistance >= 1.15 && rDistance <= 1.55) {
      const frontRunTarget = roundPrice(effectiveBarrier * 0.998);
      if (frontRunTarget > preferredEntry + risk * 1.1) {
        tp1 = frontRunTarget;
      }
    }
  }

  // Ensure strictly ascending TP levels
  let tp2 = roundPrice(preferredEntry + risk * defaultRMultipliers.tp2);
  let tp3 = roundPrice(preferredEntry + risk * defaultRMultipliers.tp3);

  if (tp2 <= tp1) {
    tp2 = roundPrice(tp1 + risk * 0.9);
  }
  if (tp3 <= tp2) {
    tp3 = roundPrice(tp2 + risk * 1.2);
  }

  const riskReward = Math.round(((tp2 - preferredEntry) / risk) * 10) / 10;

  return {
    risk,
    dca1,
    dca2,
    tp1,
    tp2,
    tp3,
    riskReward,
  };
}

/**
 * Strict Spot Long Trade Geometry Enforcer
 * Enforces fundamental spot trading invariants:
 * stopLoss < dca2 < dca1 < entryZone.low <= preferredEntry <= entryZone.high < tp1 < tp2 < tp3
 *
 * Specifically:
 * - entryZone.high must never exceed or equal tp1 (clamped to at most tp1 * 0.985)
 * - entryZone.low must be strictly less than entryZone.high
 * - stopLoss must be strictly less than entryZone.low
 * - DCA1 and DCA2 must be properly tiered between stopLoss and entryZone.low
 */
export function enforceSetupGeometry(
  setup: SetupEvaluation,
  currentPrice: number
): SetupEvaluation {
  if (!setup) return setup;

  // 1. Ensure preferredEntry is positive
  const preferredEntry = setup.preferredEntry > 0 ? setup.preferredEntry : currentPrice;

  // 2. Ensure stopLoss is below preferredEntry
  let stopLoss = setup.stopLoss;
  if (stopLoss >= preferredEntry) {
    stopLoss = roundPrice(preferredEntry * 0.95);
  }

  // 3. Ensure Take Profits are strictly ascending and above preferredEntry
  let tp1 = setup.tp1;
  let tp2 = setup.tp2;
  let tp3 = setup.tp3;

  const unitRisk = Math.max(preferredEntry * 0.01, preferredEntry - stopLoss);
  if (tp1 <= preferredEntry) {
    tp1 = roundPrice(preferredEntry + unitRisk * 1.5);
  }
  if (tp2 <= tp1) {
    tp2 = roundPrice(tp1 + unitRisk * 0.9);
  }
  if (tp3 <= tp2) {
    tp3 = roundPrice(tp2 + unitRisk * 1.2);
  }

  // 4. Strict Spot Long Invariant: Entry Zone High MUST be strictly below TP1
  // A spot long trade can NEVER have an entry level >= TP1
  const maxEntryHigh = roundPrice(tp1 * 0.985);

  let highBound = Math.min(setup.entryZone.high, maxEntryHigh);
  if (highBound < preferredEntry) {
    highBound = Math.min(preferredEntry, maxEntryHigh);
  }

  let lowBound = setup.entryZone.low;
  if (lowBound >= highBound) {
    lowBound = roundPrice(Math.min(preferredEntry * 0.995, highBound * 0.995));
  }

  // 5. Ensure stopLoss is below entryZone.low
  if (stopLoss >= lowBound) {
    stopLoss = roundPrice(lowBound * 0.97);
  }

  // 6. Ensure DCA1 and DCA2 are strictly tiered: stopLoss < dca2 < dca1 < lowBound
  let dca1 = setup.dca1;
  let dca2 = setup.dca2;
  const dcaSpan = lowBound - stopLoss;

  if (dca1 >= lowBound || dca1 <= stopLoss) {
    dca1 = roundPrice(lowBound - dcaSpan * 0.382);
  }
  if (dca2 >= dca1 || dca2 <= stopLoss) {
    dca2 = roundPrice(lowBound - dcaSpan * 0.72);
  }

  const finalRisk = Math.max(0.000001, preferredEntry - stopLoss);
  const riskReward = Math.round(((tp2 - preferredEntry) / finalRisk) * 10) / 10;

  return {
    ...setup,
    preferredEntry,
    entryZone: {
      low: roundPrice(lowBound),
      high: roundPrice(highBound),
    },
    stopLoss,
    dca1,
    dca2,
    tp1,
    tp2,
    tp3,
    riskReward,
  };
}

/**
 * Setup Detection Engine (Spec Section 11)
 * Detects 5 setup types in hierarchical order:
 * 1. BREAKOUT_RETEST
 * 2. LIQUIDITY_SWEEP
 * 3. PULLBACK_CONTINUATION
 * 4. TREND_CONTINUATION
 * 5. SUPPORT_REACTION
 */
export function detectSetup(
  ta: TechnicalAnalysisResult,
  price: number
): SetupEvaluation | null {
  const currentPrice = price > 0 ? price : ta.currentPrice;
  const atr = ta.volatility.atr > 0 ? ta.volatility.atr : currentPrice * 0.025;

  const bidWallPrice = ta.liquidity?.nearestBidWall?.price ?? null;
  const askWallPrice = ta.liquidity?.nearestAskWall?.price ?? null;

  // 1. BREAKOUT_RETEST: Bullish BOS detected and price testing or near broken structure level
  if (
    ta.structure.breakOfStructure.detected &&
    ta.structure.breakOfStructure.type === 'BULLISH_BOS' &&
    ta.structure.breakOfStructure.level !== null
  ) {
    const level = ta.structure.breakOfStructure.level;
    const preferredEntry = roundPrice(level * 1.002);
    const lowBound = roundPrice(level * 0.995);
    const highBound = roundPrice(Math.max(level * 1.015, currentPrice * 1.002));

    // Structural Stop Loss below broken resistance or nearest support / bid wall minus 0.55x ATR buffer
    const stopLoss = calculateStructuralStopLoss({
      preferredEntry,
      atr,
      structuralAnchor: ta.structure.nearestSupport
        ? Math.min(ta.structure.nearestSupport, level)
        : level,
      swingLows: ta.structure.swingLows,
      bidWallPrice,
      bufferMultiplier: 0.55,
      maxRiskPercent: 5.5,
    });

    const { risk, dca1, dca2, tp1, tp2, tp3, riskReward } = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: ta.structure.nearestResistance,
      nearestAskWall: askWallPrice,
      defaultRMultipliers: { tp1: 1.5, tp2: 2.6, tp3: 4.0 },
    });

    return enforceSetupGeometry({
      setupType: 'BREAKOUT_RETEST',
      entryZone: { low: lowBound, high: highBound },
      preferredEntry,
      stopLoss,
      dca1,
      dca2,
      tp1,
      tp2,
      tp3,
      riskReward,
      confirmationCondition: `Hold above broken resistance structure at ${level.toFixed(
        2
      )} with 15M candle confirmation.`,
      rationale: `Bullish Break of Structure (BOS) at ${level.toFixed(
        2
      )}. Testing broken resistance as newly established support.`,
    }, currentPrice);
  }

  // 2. LIQUIDITY_SWEEP: Wick sweep of swing low followed by rejection
  if (
    ta.structure.liquiditySweep.detected &&
    ta.structure.liquiditySweep.type === 'SWEEP_LOW' &&
    ta.structure.liquiditySweep.level !== null
  ) {
    const sweepLevel = ta.structure.liquiditySweep.level;
    const lowBound = roundPrice(sweepLevel);
    const highBound = roundPrice(sweepLevel * 1.018);
    const preferredEntry = roundPrice(sweepLevel * 1.006);

    const stopLoss = calculateStructuralStopLoss({
      preferredEntry,
      atr,
      structuralAnchor: sweepLevel,
      swingLows: ta.structure.swingLows,
      bidWallPrice,
      bufferMultiplier: 0.55,
      maxRiskPercent: 5.0,
    });

    const { risk, dca1, dca2, tp1, tp2, tp3, riskReward } = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: ta.structure.nearestResistance,
      nearestAskWall: askWallPrice,
      defaultRMultipliers: { tp1: 1.6, tp2: 2.8, tp3: 4.2 },
    });

    return enforceSetupGeometry({
      setupType: 'LIQUIDITY_SWEEP',
      entryZone: { low: lowBound, high: highBound },
      preferredEntry,
      stopLoss,
      dca1,
      dca2,
      tp1,
      tp2,
      tp3,
      riskReward,
      confirmationCondition: `Immediate reclaim of liquidity sweep level at ${sweepLevel.toFixed(
        2
      )} with buyer absorption wicks.`,
      rationale: `Liquidity sweep below prior swing low at ${sweepLevel.toFixed(
        2
      )} absorbed by aggressive buyers.`,
    }, currentPrice);
  }

  // 3. PULLBACK_CONTINUATION: Bullish trend with retracement into EMA 20/50 support
  if (
    (ta.trend.direction === 'BULLISH' || ta.trend.alignment === 'BULLISH') &&
    (ta.trend.distanceEma20Percent < 2.5 || ta.momentum.rsi < 55)
  ) {
    const emaSupport = Math.min(
      ta.trend.ema20 > 0 ? ta.trend.ema20 : currentPrice,
      ta.trend.ema50 > 0 ? ta.trend.ema50 : currentPrice
    );
    // Pullback limit entry anchored to EMA 20 or discount retest
    const preferredEntry = roundPrice(
      ta.trend.ema20 > 0 && ta.trend.ema20 <= currentPrice ? ta.trend.ema20 : currentPrice * 0.996
    );
    const lowBound = roundPrice(Math.min(emaSupport * 0.995, currentPrice * 0.99));
    const highBound = roundPrice(
      Math.max(currentPrice * 1.005, (ta.trend.ema20 > 0 ? ta.trend.ema20 : currentPrice) * 1.01)
    );

    // Stop loss placed below EMA 50 or nearest support / bid wall minus 0.55x ATR buffer
    const baseSupport =
      ta.structure.nearestSupport ||
      (ta.trend.ema50 > 0 ? ta.trend.ema50 : preferredEntry * 0.96);
    const stopLoss = calculateStructuralStopLoss({
      preferredEntry,
      atr,
      structuralAnchor: baseSupport,
      swingLows: ta.structure.swingLows,
      bidWallPrice,
      bufferMultiplier: 0.55,
      maxRiskPercent: 5.5,
    });

    const { risk, dca1, dca2, tp1, tp2, tp3, riskReward } = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: ta.structure.nearestResistance,
      nearestAskWall: askWallPrice,
      defaultRMultipliers: { tp1: 1.5, tp2: 2.5, tp3: 3.8 },
    });

    return enforceSetupGeometry({
      setupType: 'PULLBACK_CONTINUATION',
      entryZone: { low: lowBound, high: highBound },
      preferredEntry,
      stopLoss,
      dca1,
      dca2,
      tp1,
      tp2,
      tp3,
      riskReward,
      confirmationCondition: `Bullish bounce off EMA 20 (${ta.trend.ema20.toFixed(
        2
      )})/EMA 50 support cluster.`,
      rationale: `Bullish trend pullback offering value entry near moving average support with RSI reset.`,
    }, currentPrice);
  }

  // 4. TREND_CONTINUATION: Healthy uptrend, HH/HL, positive volume
  if (
    ta.trend.direction === 'BULLISH' &&
    ta.structure.structureTrend === 'UPTREND' &&
    ta.volume.volumeTrend !== 'CONTRACTING'
  ) {
    // Pullback discount entry: wait for micro retest rather than market chase
    const pullbackTarget =
      ta.trend.ema20 > 0 && ta.trend.ema20 < currentPrice
        ? Math.max(ta.trend.ema20, currentPrice * 0.995)
        : currentPrice * 0.995;
    const preferredEntry = roundPrice(pullbackTarget);
    const lowBound = roundPrice(Math.min(pullbackTarget * 0.994, currentPrice * 0.992));
    const highBound = roundPrice(Math.max(currentPrice * 1.008, preferredEntry * 1.008));

    const support =
      ta.structure.nearestSupport ||
      (ta.trend.ema50 > 0 ? ta.trend.ema50 : preferredEntry * 0.96);
    const stopLoss = calculateStructuralStopLoss({
      preferredEntry,
      atr,
      structuralAnchor: support,
      swingLows: ta.structure.swingLows,
      bidWallPrice,
      bufferMultiplier: 0.55,
      maxRiskPercent: 5.2,
    });

    const { risk, dca1, dca2, tp1, tp2, tp3, riskReward } = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: ta.structure.nearestResistance,
      nearestAskWall: askWallPrice,
      defaultRMultipliers: { tp1: 1.4, tp2: 2.4, tp3: 3.6 },
    });

    return enforceSetupGeometry({
      setupType: 'TREND_CONTINUATION',
      entryZone: { low: lowBound, high: highBound },
      preferredEntry,
      stopLoss,
      dca1,
      dca2,
      tp1,
      tp2,
      tp3,
      riskReward,
      confirmationCondition: `Continuation above ${preferredEntry.toFixed(
        2
      )} with sustaining buy volume.`,
      rationale: `High-momentum trend continuation with aligned moving averages and positive volume delta.`,
    }, currentPrice);
  }

  // 5. SUPPORT_REACTION: Clean reaction at major support level or oversold bounce
  if (
    (ta.structure.nearestSupport !== null &&
      currentPrice <= ta.structure.nearestSupport * 1.025) ||
    ta.momentum.rsi < 45
  ) {
    const support = ta.structure.nearestSupport || currentPrice * 0.975;
    const preferredEntry = roundPrice(support * 1.004);
    const lowBound = roundPrice(support * 0.992);
    const highBound = roundPrice(Math.max(support * 1.018, currentPrice * 1.004));

    const stopLoss = calculateStructuralStopLoss({
      preferredEntry,
      atr,
      structuralAnchor: support,
      swingLows: ta.structure.swingLows,
      bidWallPrice,
      bufferMultiplier: 0.6,
      maxRiskPercent: 5.5,
    });

    const { risk, dca1, dca2, tp1, tp2, tp3, riskReward } = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: ta.structure.nearestResistance,
      nearestAskWall: askWallPrice,
      defaultRMultipliers: { tp1: 1.5, tp2: 2.5, tp3: 3.7 },
    });

    return enforceSetupGeometry({
      setupType: 'SUPPORT_REACTION',
      entryZone: { low: lowBound, high: highBound },
      preferredEntry,
      stopLoss,
      dca1,
      dca2,
      tp1,
      tp2,
      tp3,
      riskReward,
      confirmationCondition: `Demand absorption candle holding key support at ${support.toFixed(
        2
      )}.`,
      rationale: `Price reached significant support shelf with signs of seller exhaustion and RSI bounce.`,
    }, currentPrice);
  }

  // Fallback: Default to TREND_CONTINUATION if overall bias is bullish, else null (NO TRADE)
  if (ta.overallBias === 'BULLISH') {
    const pullbackTarget =
      ta.trend.ema20 > 0 && ta.trend.ema20 < currentPrice
        ? Math.max(ta.trend.ema20, currentPrice * 0.995)
        : currentPrice * 0.995;
    const preferredEntry = roundPrice(pullbackTarget);
    const lowBound = roundPrice(Math.min(pullbackTarget * 0.992, currentPrice * 0.99));
    const highBound = roundPrice(Math.max(currentPrice * 1.008, preferredEntry * 1.008));
    const stopLoss = calculateStructuralStopLoss({
      preferredEntry,
      atr,
      structuralAnchor: ta.structure.nearestSupport,
      swingLows: ta.structure.swingLows,
      bidWallPrice,
      bufferMultiplier: 0.6,
      maxRiskPercent: 5.5,
    });
    const { risk, dca1, dca2, tp1, tp2, tp3, riskReward } = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: ta.structure.nearestResistance,
      nearestAskWall: askWallPrice,
      defaultRMultipliers: { tp1: 1.5, tp2: 2.5, tp3: 3.8 },
    });

    return enforceSetupGeometry({
      setupType: 'TREND_CONTINUATION',
      entryZone: { low: lowBound, high: highBound },
      preferredEntry,
      stopLoss,
      dca1,
      dca2,
      tp1,
      tp2,
      tp3,
      riskReward,
      confirmationCondition: `15M momentum follow-through above ${preferredEntry.toFixed(2)}.`,
      rationale: `General bullish market bias supported by technical indicators.`,
    }, currentPrice);
  }

  return null; // No valid trade setup
}

/**
 * Assign Signal Status (Spec Section 9 & 10)
 * Statuses: BUY_NOW, WAIT_FOR_CONFIRMATION, WATCH, AVOID, NO_TRADE
 * Phase 23: Evaluates Order Book Imbalance and Immediate Ask Wall Overhang
 * Phase 25: Multi-Timeframe Confluence Filter (blocks counter-trend false breakouts)
 */
export function assignSignalStatus(
  tradeScore: number,
  confidence: ConfidenceGrade,
  price: number,
  setup: SetupEvaluation | null,
  regime: MarketRegime,
  liquidity?: TechnicalAnalysisResult['liquidity'],
  mtf?: MultiTimeframeAnalysis
): SignalStatus {
  if (!setup || confidence === 'BELOW_THRESHOLD' || tradeScore < 55) {
    return 'NO_TRADE';
  }

  // Phase 25: Multi-Timeframe Counter-Trend Circuit Breaker
  // If 1h/4h are in a severe downtrend or price is trapped below 1h EMA 200, strictly block BUY_NOW
  if (mtf?.isCounterTrendWarning) {
    if (tradeScore < 70) {
      return 'AVOID';
    }
    return 'WAIT_FOR_CONFIRMATION';
  }

  // Bear regime with moderate score requires conservative approach
  if (regime === 'BEAR' && tradeScore < 78) {
    return 'AVOID';
  }

  if (regime === 'LOW_LIQUIDITY' && tradeScore < 70) {
    return 'AVOID';
  }

  // Phase 23: Heavy overhead ask wall & extreme sell-side imbalance filter
  // If order book is heavily sell-skewed (imbalance <= -0.30) and an immediate ask wall blocks price (< 1.2%)
  if (
    liquidity &&
    liquidity.orderBookImbalance <= -0.30 &&
    liquidity.nearestAskWall &&
    liquidity.nearestAskWall.percentFromPrice <= 1.2
  ) {
    return 'WAIT_FOR_CONFIRMATION';
  }

  // Check if current price is inside or near the entry zone
  const inEntryZone =
    price >= setup.entryZone.low && price <= setup.entryZone.high;

  if (inEntryZone) {
    if (tradeScore >= 75) {
      return 'BUY_NOW';
    }
    return 'WAIT_FOR_CONFIRMATION';
  }

  // If price is above entry zone (waiting for retest)
  if (price > setup.entryZone.high) {
    if (tradeScore >= 70) {
      return 'WAIT_FOR_CONFIRMATION';
    }
    return 'WATCH';
  }

  // Below entry zone
  if (tradeScore >= 70) {
    return 'WAIT_FOR_CONFIRMATION';
  }
  return 'WATCH';
}

/**
 * Generate a complete Signal from a Candidate and its Technical Analysis
 * Spec Sections 9, 10, 11, 12, 13, 14
 */
export function generateSignalFromCandidate(params: {
  candidate: MarketCandidate;
  ta: TechnicalAnalysisResult;
  mtfAnalysis?: MultiTimeframeAnalysis;
  walletBalance?: number;
  weights?: SignalWeights;
  signalIdOverride?: string;
  timestamp?: number;
}): Signal {
  const {
    candidate,
    ta,
    mtfAnalysis,
    walletBalance = 300, // Spec Section 1 default 300 USDT
    weights = DEFAULT_SIGNAL_WEIGHTS,
    signalIdOverride,
    timestamp = Date.now(),
  } = params;

  // 1. Calculate multi-factor Trade Score
  const { tradeScore: baseScore, breakdown: baseBreakdown } = computeTradeScore(
    ta,
    candidate.marketRegime,
    weights
  );

  // Phase 25: Apply Multi-Timeframe Confluence bonus or penalty
  const mtfBonus = mtfAnalysis ? mtfAnalysis.scoreBonus : 0;
  const tradeScore = Math.min(100, Math.max(0, baseScore + mtfBonus));
  const breakdown = {
    ...baseBreakdown,
    total: tradeScore,
  };

  // 2. Determine confidence grade
  const confidence = determineConfidenceGrade(tradeScore);

  // 3. Detect Setup
  const setup = detectSetup(ta, candidate.price);

  // 4. Assign Status (with order book imbalance, ask wall checks, & MTF counter-trend filter)
  const status = assignSignalStatus(
    tradeScore,
    confidence,
    candidate.price,
    setup,
    candidate.marketRegime,
    ta.liquidity,
    mtfAnalysis
  );

  // If setup detection yielded null (e.g. bearish/unsafe), construct NO_TRADE signal
  const defaultEntry = roundPrice(candidate.price);
  const defaultAtr = ta.volatility.atr > 0 ? ta.volatility.atr : defaultEntry * 0.03;
  const safeStopLoss = calculateStructuralStopLoss({
    preferredEntry: defaultEntry,
    atr: defaultAtr,
    structuralAnchor: ta.structure.nearestSupport,
    swingLows: ta.structure.swingLows,
    bidWallPrice: ta.liquidity?.nearestBidWall?.price,
    bufferMultiplier: 0.6,
    maxRiskPercent: 5.5,
  });
  const safeTakeProfits = calculateDynamicTakeProfits({
    preferredEntry: defaultEntry,
    stopLoss: safeStopLoss,
    nearestResistance: ta.structure.nearestResistance,
    nearestAskWall: ta.liquidity?.nearestAskWall?.price,
    defaultRMultipliers: { tp1: 1.5, tp2: 2.8, tp3: 4.2 },
  });

  const fallbackSetup: SetupEvaluation = {
    setupType: 'SUPPORT_REACTION',
    entryZone: { low: roundPrice(defaultEntry * 0.98), high: roundPrice(Math.min(defaultEntry * 1.005, safeTakeProfits.tp1 * 0.985)) },
    preferredEntry: defaultEntry,
    stopLoss: safeStopLoss,
    dca1: safeTakeProfits.dca1,
    dca2: safeTakeProfits.dca2,
    tp1: safeTakeProfits.tp1,
    tp2: safeTakeProfits.tp2,
    tp3: safeTakeProfits.tp3,
    riskReward: safeTakeProfits.riskReward,
    confirmationCondition: 'No active trade setup. Waiting for clear market structure.',
    rationale: 'Conditions below tradeable threshold.',
  };

  const safeSetup: SetupEvaluation = enforceSetupGeometry(setup || fallbackSetup, candidate.price);

  // 5. Integrate Risk Engine for Position Sizing (Spec Section 1 & 14)
  const riskPercent = getDefaultRiskForGrade(confidence);
  const positionSizing = calculatePositionSize({
    walletBalance,
    riskPercent,
    entryPrice: safeSetup.preferredEntry,
    stopLossPrice: safeSetup.stopLoss,
    dca1Price: safeSetup.dca1,
    dca2Price: safeSetup.dca2,
    takeProfits: {
      tp1: safeSetup.tp1,
      tp2: safeSetup.tp2,
      tp3: safeSetup.tp3,
    },
  });

  const signalId =
    signalIdOverride ||
    `SIG-${new Date(timestamp).getFullYear()}-${String(
      Math.floor(Math.random() * 9000) + 1000
    )}`;

  // Default expiry is 4 hours after generation (Spec Section 7 & 9)
  const createdAtIso = new Date(timestamp).toISOString();
  const expiresAtIso = new Date(timestamp + 4 * 60 * 60 * 1000).toISOString();

  return {
    signalId,
    symbol: candidate.symbol,
    direction: 'BUY',
    createdAt: createdAtIso,
    strategyVersion: 'v1.0-phase6',
    marketRegime: candidate.marketRegime,
    candidateScore: candidate.candidateScore,
    tradeScore,
    setupType: safeSetup.setupType,
    entryZone: safeSetup.entryZone,
    preferredEntry: safeSetup.preferredEntry,
    dca1: safeSetup.dca1,
    dca2: safeSetup.dca2,
    stopLoss: safeSetup.stopLoss,
    tp1: safeSetup.tp1,
    tp2: safeSetup.tp2,
    tp3: safeSetup.tp3,
    riskPercent,
    maxLoss: positionSizing.isValid ? positionSizing.plannedLossAtSlUsdt : 0,
    initialAllocation: positionSizing.isValid
      ? positionSizing.initialAllocation
      : 0,
    dca1Allocation: positionSizing.isValid ? positionSizing.dca1Allocation : 0,
    dca2Allocation: positionSizing.isValid ? positionSizing.dca2Allocation : 0,
    maxDeployed: positionSizing.isValid ? positionSizing.maxDeployed : 0,
    riskReward: safeSetup.riskReward,
    confidence,
    status,
    lifecycle: 'CREATED',
    expiresAt: expiresAtIso,
    exchange: 'Binance Spot',
    confirmationCondition: safeSetup.confirmationCondition,
    rationale: mtfAnalysis
      ? mtfAnalysis.alignment === 'FULL_CONFLUENCE'
        ? `[MTF: Full 15M+1H+4H Bullish Confluence (${mtfAnalysis.confluenceScore}/100)] ${safeSetup.rationale}`
        : mtfAnalysis.isCounterTrendWarning
        ? `[MTF Warning: Counter-Trend 1H/4H Downtrend - Caution Required] ${safeSetup.rationale}`
        : safeSetup.rationale
      : safeSetup.rationale,
    tradeScoreBreakdown: breakdown,
    taSummary: ta.summary,
    mtfAnalysis,
  };
}

/**
 * Generate synthetic OHLCV bars when external live API is rate-limited or offline
 */
export function generateSyntheticOHLCV(
  basePrice: number,
  change24h: number,
  count: number = 80
): OHLCV[] {
  const bars: OHLCV[] = [];
  const now = Date.now();
  const intervalMs = 15 * 60 * 1000; // 15m
  const startPrice = basePrice / (1 + change24h / 100);
  const trendStep = (basePrice - startPrice) / count;

  let current = startPrice;
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * intervalMs;
    const wave = Math.sin((i / count) * Math.PI * 4) * (basePrice * 0.008);
    const noise = (Math.sin(i * 1.5) * (basePrice * 0.005));
    const open = current;
    current = Math.max(0.0001, current + trendStep + wave * 0.2 + noise * 0.3);
    const high = Math.max(open, current) + basePrice * 0.006;
    const low = Math.min(open, current) - basePrice * 0.006;
    const close = current;
    const volume = 50000 + Math.abs(Math.sin(i)) * 120000;

    bars.push({
      timestamp: time,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume: Math.round(volume),
      quoteVolume: Math.round(volume * close),
    });
  }

  // Ensure last bar close matches basePrice
  if (bars.length > 0) {
    bars[bars.length - 1].close = basePrice;
  }

  return bars;
}

/**
 * Evaluate Market Signals for a list of candidates
 * Generates signals, sorts by priority, and returns summary metrics
 */
export function evaluateSignalsForCandidates(
  candidates: MarketCandidate[],
  options?: {
    walletBalance?: number;
    weights?: SignalWeights;
  }
): {
  signals: Signal[];
  summary: {
    totalEvaluated: number;
    buyNowCount: number;
    waitForConfirmationCount: number;
    watchCount: number;
    noTradeCount: number;
    averageTradeScore: number;
    topGrade: ConfidenceGrade;
  };
} {
  const walletBalance = options?.walletBalance ?? 300;
  const weights = options?.weights ?? DEFAULT_SIGNAL_WEIGHTS;

  const signals: Signal[] = [];

  for (const candidate of candidates) {
    // Generate synthetic or fetched klines for analysis
    const candles = generateSyntheticOHLCV(candidate.price, candidate.change24h);
    const ta = runTechnicalAnalysis(candidate.symbol, candles, '15m', null);

    const signal = generateSignalFromCandidate({
      candidate,
      ta,
      walletBalance,
      weights,
    });

    signals.push(signal);
  }

  // Sort signals: BUY_NOW first, then WAIT_FOR_CONFIRMATION, then WATCH, ordered by tradeScore descending
  const statusPriority: Record<SignalStatus, number> = {
    BUY_NOW: 5,
    WAIT_FOR_CONFIRMATION: 4,
    WATCH: 3,
    SELL_EXIT: 2,
    AVOID: 1,
    NO_TRADE: 0,
  };

  signals.sort((a, b) => {
    const priorityDiff =
      (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return b.tradeScore - a.tradeScore;
  });

  // Calculate summary metrics
  const buyNowCount = signals.filter((s) => s.status === 'BUY_NOW').length;
  const waitForConfirmationCount = signals.filter(
    (s) => s.status === 'WAIT_FOR_CONFIRMATION'
  ).length;
  const watchCount = signals.filter((s) => s.status === 'WATCH').length;
  const noTradeCount = signals.filter(
    (s) => s.status === 'NO_TRADE' || s.status === 'AVOID'
  ).length;

  const totalScore = signals.reduce((acc, s) => acc + s.tradeScore, 0);
  const averageTradeScore =
    signals.length > 0 ? Math.round(totalScore / signals.length) : 0;

  const topGrade = signals.length > 0 ? signals[0].confidence : 'BELOW_THRESHOLD';

  return {
    signals,
    summary: {
      totalEvaluated: signals.length,
      buyNowCount,
      waitForConfirmationCount,
      watchCount,
      noTradeCount,
      averageTradeScore,
      topGrade,
    },
  };
}
