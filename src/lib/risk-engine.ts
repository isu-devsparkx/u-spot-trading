// ─── U-SPOT Risk & Position Sizing Engine ───────────────────────────
// Phase 2: Mathematical risk management and position sizing
// Spec Sections: 1, 3, 14, 32, 51

import type {
  PositionSizeParams,
  PositionSizeResult,
  TrancheAllocation,
  TakeProfitTarget,
  RiskValidationWarning,
  ConfidenceGrade,
} from '../types';

/** Default capital weights when distributing across tranches */
export const TRANCHE_WEIGHTS = {
  TWO_DCA: {
    entry: 0.5814, // ~25 USDT out of 43 USDT (spec Section 14)
    dca1: 0.2326,  // ~10 USDT out of 43 USDT
    dca2: 0.186,   // ~8 USDT out of 43 USDT
  },
  ONE_DCA: {
    entry: 0.7,
    dca1: 0.3,
    dca2: 0,
  },
  SINGLE_ENTRY: {
    entry: 1.0,
    dca1: 0,
    dca2: 0,
  },
} as const;

/** Default take profit split */
export const TP_SPLIT = {
  tp1: 0.3, // 30% of position sold at TP1
  tp2: 0.3, // 30% of position sold at TP2
  tp3: 0.4, // 40% of position sold at TP3 (runner)
} as const;

/** Default exchange execution costs */
export const DEFAULT_EXECUTION_COSTS = {
  makerFeePercent: 0.1, // 0.1% Binance spot maker
  takerFeePercent: 0.1, // 0.1% Binance spot taker
  slippagePercent: 0.05, // 0.05% estimated spot slippage
} as const;

/** Round to specified decimal places */
function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Get starting risk percentage based on setup confidence grade
 * Spec Section 1: A+: 1.00%, A: 0.75%, B: 0.50%, Below threshold: 0%
 */
export function getDefaultRiskForGrade(grade: ConfidenceGrade): number {
  switch (grade) {
    case 'A+':
      return 1.0;
    case 'A':
      return 0.75;
    case 'B':
      return 0.5;
    case 'BELOW_THRESHOLD':
    default:
      return 0.0;
  }
}

/**
 * Core Position Size and Risk Calculator
 * Derives position size strictly from the distance to stop loss (invalidation),
 * accounting for fees, slippage, and optional DCA levels.
 */
export function calculatePositionSize(
  params: PositionSizeParams
): PositionSizeResult {
  const errors: string[] = [];
  const warnings: RiskValidationWarning[] = [];

  const {
    walletBalance,
    riskPercent,
    entryPrice,
    stopLossPrice,
    dca1Price,
    dca2Price,
    maxPositionPercent = 30, // Max 30% of wallet per trade by default
    costs,
    takeProfits,
  } = params;

  // ─── 1. Validation ───────────────────────────────────────────────
  if (walletBalance <= 0) {
    errors.push('Wallet balance must be greater than 0 USDT.');
  }

  if (riskPercent <= 0) {
    errors.push('Risk percentage must be greater than 0%.');
  }

  if (entryPrice <= 0) {
    errors.push('Entry price must be greater than 0.');
  }

  if (stopLossPrice <= 0) {
    errors.push('Stop loss price must be greater than 0.');
  } else if (entryPrice > 0 && stopLossPrice >= entryPrice) {
    errors.push('Stop Loss must be below Entry Price for spot BUY.');
  }

  const hasDca1 = typeof dca1Price === 'number' && dca1Price > 0;
  const hasDca2 = typeof dca2Price === 'number' && dca2Price > 0;

  if (hasDca1) {
    if (dca1Price! >= entryPrice) {
      errors.push('DCA #1 price must be below Entry price.');
    }
    if (dca1Price! <= stopLossPrice) {
      errors.push('DCA #1 price must be above Stop Loss.');
    }
  }

  if (hasDca2) {
    if (!hasDca1) {
      errors.push('Cannot set DCA #2 without setting DCA #1.');
    } else {
      if (dca2Price! >= dca1Price!) {
        errors.push('DCA #2 price must be below DCA #1 price.');
      }
      if (dca2Price! <= stopLossPrice) {
        errors.push('DCA #2 price must be above Stop Loss.');
      }
    }
  }

  // If there are fatal validation errors, return a safe zeroed result
  if (errors.length > 0) {
    const safeMaxRisk = walletBalance > 0 && riskPercent > 0
      ? round(walletBalance * (riskPercent / 100), 2)
      : 0;

    return {
      isValid: false,
      errors,
      warnings,
      walletBalance: Math.max(0, walletBalance),
      riskPercent: Math.max(0, riskPercent),
      maxRiskUsdt: safeMaxRisk,
      initialAllocation: 0,
      dca1Allocation: 0,
      dca2Allocation: 0,
      maxDeployed: 0,
      percentOfWallet: 0,
      isCappedByWallet: false,
      initialQuantity: 0,
      totalQuantity: 0,
      averageEntryPrice: 0,
      stopDistancePercent: 0,
      rawPriceLossUsdt: 0,
      estimatedFeeCostUsdt: 0,
      estimatedSlippageCostUsdt: 0,
      plannedLossAtSlUsdt: 0,
      tranches: [],
      takeProfits: [],
      totalPotentialNetProfitUsdt: 0,
      riskRewardRatio: 0,
    };
  }

  // ─── 2. Risk Budget ───────────────────────────────────────────────
  const maxRiskUsdt = round(walletBalance * (riskPercent / 100), 2);

  // Distances to SL as fractions
  const distEntry = (entryPrice - stopLossPrice) / entryPrice;
  const distDca1 = hasDca1 ? (dca1Price! - stopLossPrice) / dca1Price! : 0;
  const distDca2 = hasDca2 ? (dca2Price! - stopLossPrice) / dca2Price! : 0;

  // Fee and slippage rates
  const makerFeeRate = (costs?.makerFeePercent ?? DEFAULT_EXECUTION_COSTS.makerFeePercent) / 100;
  const takerFeeRate = (costs?.takerFeePercent ?? DEFAULT_EXECUTION_COSTS.takerFeePercent) / 100;
  const slippageRate = (costs?.slippagePercent ?? DEFAULT_EXECUTION_COSTS.slippagePercent) / 100;

  // Roundtrip execution cost: maker entry + taker stop loss + slippage on stop loss
  const roundtripCost = makerFeeRate + takerFeeRate + slippageRate;

  // ─── 3. Capital Weighting ─────────────────────────────────────────
  let weights: { entry: number; dca1: number; dca2: number };
  if (hasDca1 && hasDca2) {
    weights = TRANCHE_WEIGHTS.TWO_DCA;
  } else if (hasDca1) {
    weights = TRANCHE_WEIGHTS.ONE_DCA;
  } else {
    weights = TRANCHE_WEIGHTS.SINGLE_ENTRY;
  }

  // Blended loss per 1 USDT deployed if all tranches fill and then hit SL
  const blendedUnitLoss =
    weights.entry * (distEntry + roundtripCost) +
    weights.dca1 * (distDca1 + roundtripCost) +
    weights.dca2 * (distDca2 + roundtripCost);

  // Position size derived strictly from risk and invalidation distance
  const idealMaxDeployed = blendedUnitLoss > 0 ? maxRiskUsdt / blendedUnitLoss : 0;

  // Wallet cap constraint: do not allow position to exceed maxPositionPercent or 100% of wallet
  const maxWalletAllowed = round(
    walletBalance * (Math.min(100, Math.max(1, maxPositionPercent)) / 100),
    2
  );

  const isCappedByWallet = idealMaxDeployed > maxWalletAllowed;
  const targetDeployed = Math.min(idealMaxDeployed, maxWalletAllowed);

  // ─── 4. Tranche Allocations ───────────────────────────────────────
  let initialAllocation: number;
  let dca1Allocation: number;
  let dca2Allocation: number;

  if (hasDca1 && hasDca2) {
    initialAllocation = round(targetDeployed * weights.entry, 2);
    dca1Allocation = round(targetDeployed * weights.dca1, 2);
    dca2Allocation = round(targetDeployed * weights.dca2, 2);
  } else if (hasDca1) {
    initialAllocation = round(targetDeployed * weights.entry, 2);
    dca1Allocation = round(targetDeployed * weights.dca1, 2);
    dca2Allocation = 0;
  } else {
    initialAllocation = round(targetDeployed, 2);
    dca1Allocation = 0;
    dca2Allocation = 0;
  }

  const maxDeployed = round(initialAllocation + dca1Allocation + dca2Allocation, 2);
  const percentOfWallet = round((maxDeployed / walletBalance) * 100, 1);

  // Coin quantities
  const initialQuantity = round(initialAllocation / entryPrice, 6);
  const dca1Quantity = hasDca1 ? round(dca1Allocation / dca1Price!, 6) : 0;
  const dca2Quantity = hasDca2 ? round(dca2Allocation / dca2Price!, 6) : 0;
  const totalQuantity = round(
    initialQuantity + dca1Quantity + dca2Quantity,
    6
  );

  const averageEntryPrice =
    totalQuantity > 0 ? round(maxDeployed / totalQuantity, 4) : entryPrice;

  // ─── 5. Actual Planned Loss Breakdown ─────────────────────────────
  const rawPriceLossUsdt = round(
    initialAllocation * distEntry +
      dca1Allocation * distDca1 +
      dca2Allocation * distDca2,
    2
  );

  const estimatedFeeCostUsdt = round(
    maxDeployed * (makerFeeRate + takerFeeRate),
    2
  );

  const estimatedSlippageCostUsdt = round(maxDeployed * slippageRate, 2);

  const plannedLossAtSlUsdt = round(
    rawPriceLossUsdt + estimatedFeeCostUsdt + estimatedSlippageCostUsdt,
    2
  );

  // ─── 6. Tranches Breakdown ────────────────────────────────────────
  const tranches: TrancheAllocation[] = [
    {
      orderName: 'Entry',
      price: entryPrice,
      allocationUsdt: initialAllocation,
      quantityCoins: initialQuantity,
      percentOfTotal: maxDeployed > 0 ? round((initialAllocation / maxDeployed) * 100, 1) : 0,
      distanceToSlPercent: round(distEntry * 100, 2),
      plannedLossUsdt: round(initialAllocation * distEntry, 2),
    },
  ];

  if (hasDca1) {
    tranches.push({
      orderName: 'DCA #1',
      price: dca1Price!,
      allocationUsdt: dca1Allocation,
      quantityCoins: dca1Quantity,
      percentOfTotal: maxDeployed > 0 ? round((dca1Allocation / maxDeployed) * 100, 1) : 0,
      distanceToSlPercent: round(distDca1 * 100, 2),
      plannedLossUsdt: round(dca1Allocation * distDca1, 2),
    });
  }

  if (hasDca2) {
    tranches.push({
      orderName: 'DCA #2',
      price: dca2Price!,
      allocationUsdt: dca2Allocation,
      quantityCoins: dca2Quantity,
      percentOfTotal: maxDeployed > 0 ? round((dca2Allocation / maxDeployed) * 100, 1) : 0,
      distanceToSlPercent: round(distDca2 * 100, 2),
      plannedLossUsdt: round(dca2Allocation * distDca2, 2),
    });
  }

  // ─── 7. Take Profit Projections ───────────────────────────────────
  const tpResults: TakeProfitTarget[] = [];
  let totalPotentialNetProfitUsdt = 0;

  const tpInputs = [
    { target: 'TP1' as const, price: takeProfits?.tp1, portion: TP_SPLIT.tp1 },
    { target: 'TP2' as const, price: takeProfits?.tp2, portion: TP_SPLIT.tp2 },
    { target: 'TP3' as const, price: takeProfits?.tp3, portion: TP_SPLIT.tp3 },
  ];

  const baseEntry = totalQuantity > 0 ? averageEntryPrice : entryPrice;

  for (const item of tpInputs) {
    if (typeof item.price === 'number' && item.price > baseEntry) {
      const gainPercent = (item.price - baseEntry) / baseEntry;
      const allocatedPortionUsdt = maxDeployed * item.portion;
      const grossProfit = allocatedPortionUsdt * gainPercent;
      const exitValue = allocatedPortionUsdt * (1 + gainPercent);
      const exitFee = exitValue * takerFeeRate;
      const netProfit = round(grossProfit - exitFee, 2);

      const rMult = plannedLossAtSlUsdt > 0 ? round(netProfit / plannedLossAtSlUsdt, 2) : 0;

      tpResults.push({
        target: item.target,
        price: item.price,
        portionPercent: round(item.portion * 100, 0),
        gainPercent: round(gainPercent * 100, 2),
        grossProfitUsdt: round(grossProfit, 2),
        exitFeeUsdt: round(exitFee, 2),
        netProfitUsdt: netProfit,
        rMultiple: rMult,
      });

      totalPotentialNetProfitUsdt = round(totalPotentialNetProfitUsdt + netProfit, 2);
    }
  }

  const riskRewardRatio =
    plannedLossAtSlUsdt > 0
      ? round(totalPotentialNetProfitUsdt / plannedLossAtSlUsdt, 2)
      : 0;

  // ─── 8. Warnings & Sanity Checks ──────────────────────────────────
  if (isCappedByWallet) {
    warnings.push({
      severity: 'info',
      message: `Position size capped at ${maxPositionPercent}% of wallet (${maxWalletAllowed} USDT). Actual loss is within risk budget.`,
    });
  }

  if (maxDeployed > 0 && maxDeployed < 10) {
    warnings.push({
      severity: 'warning',
      message: `Total position size ($${maxDeployed}) is below typical exchange minimum order size ($10 USDT).`,
    });
  }

  if (distEntry > 0.2) {
    warnings.push({
      severity: 'info',
      message: `Wide stop loss (${round(distEntry * 100, 1)}%). Position size has been reduced accordingly to preserve capital.`,
    });
  }

  if (distEntry < 0.015) {
    warnings.push({
      severity: 'warning',
      message: `Very tight stop loss (${round(distEntry * 100, 1)}%). High risk of random market noise triggering premature stop.`,
    });
  }

  return {
    isValid: true,
    errors: [],
    warnings,
    walletBalance,
    riskPercent,
    maxRiskUsdt,
    initialAllocation,
    dca1Allocation,
    dca2Allocation,
    maxDeployed,
    percentOfWallet,
    isCappedByWallet,
    initialQuantity,
    totalQuantity,
    averageEntryPrice,
    stopDistancePercent: round(distEntry * 100, 2),
    rawPriceLossUsdt,
    estimatedFeeCostUsdt,
    estimatedSlippageCostUsdt,
    plannedLossAtSlUsdt,
    tranches,
    takeProfits: tpResults,
    totalPotentialNetProfitUsdt,
    riskRewardRatio,
  };
}
