// ─── U-SPOT Auto-Adaptive Volatility ATR Sizing & Dynamic Target Scaling (Phase 42) ───
// Dynamically expands or contracts DCA tranches, structural SL buffers, and TP ladders
// based on shifting real-time volatility regimes (LOW, NORMAL, HIGH, EXTREME).

import type {
  AdaptiveVolatilityRegime,
  AdaptiveVolatilityMultipliers,
  AdaptiveTargetPlan,
  AdaptiveVolatilityReport,
} from '@/types';

export const REGIME_MULTIPLIERS: Record<AdaptiveVolatilityRegime, AdaptiveVolatilityMultipliers> = {
  LOW: {
    dcaStepMultiplier: 0.75,      // Tighter DCA steps to ensure fills in tight range
    slBufferMultiplier: 1.20,     // Tight stop loss buffer
    tpExpansionMultiplier: 0.85,  // Front-runs TP1 closer to secure 30% profit early
    trailingStepRatio: 0.50,
  },
  NORMAL: {
    dcaStepMultiplier: 1.00,      // Standard baseline
    slBufferMultiplier: 1.50,     // Standard 1.5x ATR buffer
    tpExpansionMultiplier: 1.00,  // Standard 1.0x TP targets
    trailingStepRatio: 0.75,
  },
  HIGH: {
    dcaStepMultiplier: 1.35,      // Wider DCA steps to catch deeper discount pullbacks
    slBufferMultiplier: 1.85,     // Expanded stop buffer preventing wick-outs
    tpExpansionMultiplier: 1.25,  // Expands TP2/TP3 to capture full volatility expansion
    trailingStepRatio: 1.00,
  },
  EXTREME: {
    dcaStepMultiplier: 1.75,      // Defensive wide steps to survive panic flushes
    slBufferMultiplier: 2.40,     // Generous stop buffer protecting against liquidation hunts
    tpExpansionMultiplier: 1.50,  // Stretched runners to ride massive momentum swings
    trailingStepRatio: 1.25,
  },
};

/**
 * Classifies volatility regime from ATR as percentage of price.
 */
export function classifyVolatilityRegime(atrPercent: number): AdaptiveVolatilityRegime {
  if (atrPercent < 1.0) return 'LOW';
  if (atrPercent <= 2.5) return 'NORMAL';
  if (atrPercent <= 5.0) return 'HIGH';
  return 'EXTREME';
}

/**
 * Retrieves the specific scaling multipliers for an active volatility regime.
 */
export function getAdaptiveMultipliers(regime: AdaptiveVolatilityRegime): AdaptiveVolatilityMultipliers {
  return REGIME_MULTIPLIERS[regime] || REGIME_MULTIPLIERS.NORMAL;
}

/**
 * Offsets a target stop price if it sits dangerously close to psychological round numbers (.00, .50).
 */
export function applyRoundNumberOffset(price: number): number {
  const rounded = Math.round(price);
  const diffFromRound = Math.abs(price - rounded);
  const diffFromHalf = Math.abs(price - (Math.floor(price) + 0.5));

  if (diffFromRound < 0.05) {
    return Math.round((price - Math.max(0.05, price * 0.0006)) * 10000) / 10000;
  }
  if (diffFromHalf < 0.05) {
    return Math.round((price - Math.max(0.04, price * 0.0005)) * 10000) / 10000;
  }
  return price;
}

export interface ComputeAdaptivePlanInput {
  symbol: string;
  entryPrice: number;
  currentPrice?: number;
  atr: number;
  atrPercent?: number;
  structuralPivotLow?: number;
  overheadResistance?: number;
  forcedRegime?: AdaptiveVolatilityRegime;
}

/**
 * Computes an end-to-end adaptive target plan adhering to strict spot hierarchy:
 * Stop Loss < DCA 2 < DCA 1 < Entry < TP1 < TP2 < TP3
 */
export function computeAdaptiveTargetPlan(input: ComputeAdaptivePlanInput): AdaptiveTargetPlan {
  const {
    symbol,
    entryPrice,
    currentPrice = entryPrice,
    atr,
    structuralPivotLow,
    overheadResistance,
    forcedRegime,
  } = input;

  const computedAtrPercent = input.atrPercent ?? (entryPrice > 0 ? (atr / entryPrice) * 100 : 2.0);
  const regime = forcedRegime || classifyVolatilityRegime(computedAtrPercent);
  const multipliers = getAdaptiveMultipliers(regime);

  // 1. Adaptive DCA Tranche Distances
  const dca1Distance = atr * 1.0 * multipliers.dcaStepMultiplier;
  const dca2Distance = atr * 1.85 * multipliers.dcaStepMultiplier;

  let adaptiveDca1Price = entryPrice - dca1Distance;
  let adaptiveDca2Price = entryPrice - dca2Distance;

  // 2. Adaptive Stop Loss Buffer
  let rawSlPrice: number;
  if (structuralPivotLow && structuralPivotLow < entryPrice) {
    // Structural pivot anchor with regime-scaled ATR buffer
    rawSlPrice = structuralPivotLow - (atr * 0.55 * multipliers.slBufferMultiplier);
  } else {
    // Pure volatility anchor
    rawSlPrice = entryPrice - (atr * 1.75 * multipliers.slBufferMultiplier);
  }

  let adaptiveSlPrice = applyRoundNumberOffset(rawSlPrice);

  // 3. Strict Spot Hierarchy Invariant Enforcement:
  // adaptiveSlPrice < adaptiveDca2Price < adaptiveDca1Price < entryPrice
  if (adaptiveDca1Price >= entryPrice) {
    adaptiveDca1Price = entryPrice * 0.995;
  }
  if (adaptiveDca2Price >= adaptiveDca1Price) {
    adaptiveDca2Price = adaptiveDca1Price * 0.993;
  }
  if (adaptiveSlPrice >= adaptiveDca2Price) {
    adaptiveSlPrice = adaptiveDca2Price * 0.992;
  }

  // Round values cleanly
  adaptiveDca1Price = Math.round(adaptiveDca1Price * 10000) / 10000;
  adaptiveDca2Price = Math.round(adaptiveDca2Price * 10000) / 10000;
  adaptiveSlPrice = Math.round(adaptiveSlPrice * 10000) / 10000;

  const unitRisk = Math.max(0.0001, entryPrice - adaptiveSlPrice);

  // 4. Adaptive Take Profit Scaling
  // TP1: Base 1.25R adjusted by expansion multiplier
  let adaptiveTp1Price = entryPrice + (unitRisk * 1.25 * multipliers.tpExpansionMultiplier);

  // Resistance wall front-running for TP1 if within range
  if (
    overheadResistance &&
    overheadResistance > entryPrice &&
    overheadResistance <= entryPrice + unitRisk * 1.6
  ) {
    // Front-run resistance wall by 0.25% to guarantee fills
    const frontrunResistance = overheadResistance * 0.9975;
    if (frontrunResistance > entryPrice) {
      adaptiveTp1Price = Math.min(adaptiveTp1Price, frontrunResistance);
    }
  }

  // TP2: Base 2.1R
  let adaptiveTp2Price = entryPrice + (unitRisk * 2.10 * multipliers.tpExpansionMultiplier);

  // TP3: Base 3.4R runner
  let adaptiveTp3Price = entryPrice + (unitRisk * 3.40 * multipliers.tpExpansionMultiplier);

  // Invariant: Entry < TP1 < TP2 < TP3
  if (adaptiveTp1Price <= entryPrice) {
    adaptiveTp1Price = entryPrice * 1.01;
  }
  if (adaptiveTp2Price <= adaptiveTp1Price) {
    adaptiveTp2Price = adaptiveTp1Price * 1.015;
  }
  if (adaptiveTp3Price <= adaptiveTp2Price) {
    adaptiveTp3Price = adaptiveTp2Price * 1.025;
  }

  adaptiveTp1Price = Math.round(adaptiveTp1Price * 10000) / 10000;
  adaptiveTp2Price = Math.round(adaptiveTp2Price * 10000) / 10000;
  adaptiveTp3Price = Math.round(adaptiveTp3Price * 10000) / 10000;

  // 5. Percentages & Risk/Reward
  const slDistancePercent = Math.round(((entryPrice - adaptiveSlPrice) / entryPrice) * 10000) / 100;
  const dca1DistancePercent = Math.round(((entryPrice - adaptiveDca1Price) / entryPrice) * 10000) / 100;
  const dca2DistancePercent = Math.round(((entryPrice - adaptiveDca2Price) / entryPrice) * 10000) / 100;
  const tp1DistancePercent = Math.round(((adaptiveTp1Price - entryPrice) / entryPrice) * 10000) / 100;
  const tp2DistancePercent = Math.round(((adaptiveTp2Price - entryPrice) / entryPrice) * 10000) / 100;
  const tp3DistancePercent = Math.round(((adaptiveTp3Price - entryPrice) / entryPrice) * 10000) / 100;

  // Blended Risk/Reward: (30% TP1 + 30% TP2 + 40% TP3) / Risk
  const expectedProfit =
    0.30 * (adaptiveTp1Price - entryPrice) +
    0.30 * (adaptiveTp2Price - entryPrice) +
    0.40 * (adaptiveTp3Price - entryPrice);
  const riskRewardRatio = Math.round((expectedProfit / unitRisk) * 100) / 100;

  // 6. Rationale & Warnings
  const warnings: string[] = [];
  if (regime === 'EXTREME') {
    warnings.push('Extreme volatility detected: DCA steps & Stop Loss buffer expanded to prevent wick liquidations.');
  }
  if (regime === 'LOW') {
    warnings.push('Low volatility compression: TP1 is front-runned closer to entry to secure profits early.');
  }
  if (slDistancePercent > 5.5) {
    warnings.push(`Wide Stop Loss distance (${slDistancePercent}%); ensure position size respects 1% max risk cap.`);
  }

  const rationale =
    `Adaptive ${regime} Volatility Plan: DCA step multiplier ${multipliers.dcaStepMultiplier}x, ` +
    `SL buffer ${multipliers.slBufferMultiplier}x, TP expansion ${multipliers.tpExpansionMultiplier}x. ` +
    `Blended R:R is 1:${riskRewardRatio}.`;

  return {
    symbol,
    currentPrice,
    entryPrice,
    regime,
    atrValue: Math.round(atr * 10000) / 10000,
    atrPercent: Math.round(computedAtrPercent * 100) / 100,
    multipliers,
    adaptiveSlPrice,
    adaptiveDca1Price,
    adaptiveDca2Price,
    adaptiveTp1Price,
    adaptiveTp2Price,
    adaptiveTp3Price,
    slDistancePercent,
    dca1DistancePercent,
    dca2DistancePercent,
    tp1DistancePercent,
    tp2DistancePercent,
    tp3DistancePercent,
    riskRewardRatio,
    rationale,
    warnings,
  };
}

/**
 * Generates an end-to-end comparison report contrasting standard fixed baseline with adaptive plan.
 */
export function generateAdaptiveVolatilityReport(
  symbol: string,
  entryPrice: number,
  atr: number,
  structuralPivotLow?: number,
  overheadResistance?: number
): AdaptiveVolatilityReport {
  // 1. Compute Active Adaptive Plan
  const plan = computeAdaptiveTargetPlan({
    symbol,
    entryPrice,
    atr,
    structuralPivotLow,
    overheadResistance,
  });

  // 2. Compute Baseline Plan (Forced NORMAL 1.0x multipliers)
  const baseline = computeAdaptiveTargetPlan({
    symbol,
    entryPrice,
    atr,
    structuralPivotLow,
    overheadResistance,
    forcedRegime: 'NORMAL',
  });

  const slExpansionDeltaPercent =
    Math.round(((baseline.adaptiveSlPrice - plan.adaptiveSlPrice) / baseline.adaptiveSlPrice) * 10000) / 100;
  const dcaDepthDeltaPercent =
    Math.round(((baseline.adaptiveDca2Price - plan.adaptiveDca2Price) / baseline.adaptiveDca2Price) * 10000) / 100;
  const tp1FrontrunDeltaPercent =
    Math.round(((plan.adaptiveTp1Price - baseline.adaptiveTp1Price) / baseline.adaptiveTp1Price) * 10000) / 100;
  const tp3ExpansionDeltaPercent =
    Math.round(((plan.adaptiveTp3Price - baseline.adaptiveTp3Price) / baseline.adaptiveTp3Price) * 10000) / 100;
  const rrImprovement =
    Math.round((plan.riskRewardRatio - baseline.riskRewardRatio) * 100) / 100;

  return {
    symbol,
    timestamp: Date.now(),
    currentPrice: entryPrice,
    plan,
    baselinePlan: {
      slPrice: baseline.adaptiveSlPrice,
      dca1Price: baseline.adaptiveDca1Price,
      dca2Price: baseline.adaptiveDca2Price,
      tp1Price: baseline.adaptiveTp1Price,
      tp2Price: baseline.adaptiveTp2Price,
      tp3Price: baseline.adaptiveTp3Price,
      riskRewardRatio: baseline.riskRewardRatio,
    },
    comparison: {
      slExpansionDeltaPercent,
      dcaDepthDeltaPercent,
      tp1FrontrunDeltaPercent,
      tp3ExpansionDeltaPercent,
      rrImprovement,
    },
  };
}
