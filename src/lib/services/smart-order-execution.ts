// ─── U-SPOT Algorithmic TWAP/VWAP Smart Order Execution Service (Phase 46) ───
// Divides institutional spot entries into randomized micro-tranches over a target
// time window to minimize market impact, control slippage, and optimize VWAP fills.

import type {
  SmartOrderPlan,
  ChildOrderTranche,
  SmartExecutionAlgorithm,
  SmartExecutionStatus,
} from '@/types';

// In-memory store for active execution plans
const activePlansStore = new Map<string, SmartOrderPlan>();

export interface CreateSmartOrderPlanOptions {
  symbol: string;
  totalSizeUsdt: number;
  durationMinutes?: number;
  tranchesCount?: number;
  algorithm?: SmartExecutionAlgorithm;
  arrivalBenchmarkPrice: number;
  maxSlippageBps?: number;
}

/**
 * Initializes and schedules an algorithmic spot execution plan.
 */
export function createSmartOrderPlan(options: CreateSmartOrderPlanOptions): SmartOrderPlan {
  const {
    symbol,
    totalSizeUsdt,
    durationMinutes = 5,
    tranchesCount = 8,
    algorithm = 'TWAP',
    arrivalBenchmarkPrice,
    maxSlippageBps = 25, // 0.25% default slippage ceiling
  } = options;

  if (totalSizeUsdt <= 0) {
    throw new Error('Total execution size must be greater than zero.');
  }
  if (arrivalBenchmarkPrice <= 0) {
    throw new Error('Arrival benchmark price must be greater than zero.');
  }

  const now = Date.now();
  const planId = `SMART-${now}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const totalWindowMs = durationMinutes * 60 * 1000;
  const baseIntervalMs = Math.floor(totalWindowMs / tranchesCount);

  // Compute tranche allocation weights according to algorithm
  const rawWeights: number[] = [];
  for (let i = 0; i < tranchesCount; i++) {
    if (algorithm === 'TWAP') {
      // Even weights with slight pseudorandom jitter (+/- 4%) to prevent timing frontrunning
      const jitter = 0.96 + ((i * 37) % 9) * 0.01;
      rawWeights.push(jitter);
    } else if (algorithm === 'VWAP') {
      // U-shaped volume curve (higher execution at open and close of window)
      const uShape = 1.0 + Math.pow((i - (tranchesCount - 1) / 2) / ((tranchesCount - 1) / 2), 2) * 0.4;
      rawWeights.push(uShape);
    } else {
      // Adaptive Liquidity (smooth gradient)
      rawWeights.push(1.0 + Math.sin((i / tranchesCount) * Math.PI) * 0.2);
    }
  }

  const sumWeights = rawWeights.reduce((a, b) => a + b, 0);
  const tranches: ChildOrderTranche[] = [];
  let allocatedSoFar = 0;

  for (let i = 0; i < tranchesCount; i++) {
    const isLast = i === tranchesCount - 1;
    let trancheAlloc = isLast
      ? Math.round((totalSizeUsdt - allocatedSoFar) * 100) / 100
      : Math.round(((rawWeights[i] / sumWeights) * totalSizeUsdt) * 100) / 100;

    allocatedSoFar += trancheAlloc;

    // Time release with micro-jitter
    const targetReleaseTime = now + i * baseIntervalMs;

    tranches.push({
      trancheIndex: i + 1,
      targetReleaseTime,
      allocatedUsdt: trancheAlloc,
      executedUsdt: 0,
      executedQuantity: 0,
      executedPrice: 0,
      status: 'PENDING',
      slippageBps: 0,
    });
  }

  const plan: SmartOrderPlan = {
    planId,
    symbol,
    side: 'BUY',
    totalSizeUsdt,
    durationMinutes,
    tranchesCount,
    algorithm,
    maxSlippageBps,
    arrivalBenchmarkPrice,
    status: 'PENDING',
    tranches,
    executedTotalUsdt: 0,
    executedTotalQuantity: 0,
    averageExecutedPrice: 0,
    realizedSlippageBps: 0,
    estimatedFeeSavingsUsdt: 0,
    createdAt: now,
  };

  activePlansStore.set(planId, plan);
  return plan;
}

/**
 * Executes a single tranche against current market price, evaluating slippage ceiling protection.
 */
export function executeTrancheStep(
  plan: SmartOrderPlan,
  trancheIndex: number,
  currentMarketPrice: number
): SmartOrderPlan {
  const tranches = [...plan.tranches];
  const idx = tranches.findIndex((t) => t.trancheIndex === trancheIndex);

  if (idx === -1) {
    throw new Error(`Tranche ${trancheIndex} not found in plan ${plan.planId}`);
  }

  const targetTranche = { ...tranches[idx] };
  if (targetTranche.status === 'FILLED') {
    return plan; // Already processed
  }

  const now = Date.now();
  // Calculate slippage relative to arrival price (positive bps = paid more than arrival)
  const slippageBps = Math.round(
    ((currentMarketPrice - plan.arrivalBenchmarkPrice) / plan.arrivalBenchmarkPrice) * 10000
  );

  // Slippage ceiling guard check
  if (slippageBps > plan.maxSlippageBps) {
    targetTranche.status = 'SKIPPED_SLIPPAGE';
    targetTranche.slippageBps = slippageBps;
    tranches[idx] = targetTranche;

    const updatedPlan: SmartOrderPlan = {
      ...plan,
      tranches,
      status: 'PAUSED_SLIPPAGE',
    };
    activePlansStore.set(plan.planId, updatedPlan);
    return updatedPlan;
  }

  // Execute fill
  const executedUsdt = targetTranche.allocatedUsdt;
  const executedQuantity = executedUsdt / currentMarketPrice;

  targetTranche.status = 'FILLED';
  targetTranche.executedUsdt = executedUsdt;
  targetTranche.executedQuantity = executedQuantity;
  targetTranche.executedPrice = currentMarketPrice;
  targetTranche.slippageBps = slippageBps;
  targetTranche.filledAt = now;
  tranches[idx] = targetTranche;

  // Re-calculate plan-level weighted aggregates
  const filledTranches = tranches.filter((t) => t.status === 'FILLED');
  const executedTotalUsdt = Math.round(
    filledTranches.reduce((sum, t) => sum + t.executedUsdt, 0) * 100
  ) / 100;
  const executedTotalQuantity = filledTranches.reduce((sum, t) => sum + t.executedQuantity, 0);

  const averageExecutedPrice =
    executedTotalQuantity > 0
      ? Math.round((executedTotalUsdt / executedTotalQuantity) * 100) / 100
      : 0;


  const realizedSlippageBps =
    averageExecutedPrice > 0
      ? Math.round(
          ((averageExecutedPrice - plan.arrivalBenchmarkPrice) / plan.arrivalBenchmarkPrice) * 10000
        )
      : 0;

  // Compare against lump sum impact model
  const lumpSumImpactBps = Math.min(
    100,
    Math.max(12, Math.round((plan.totalSizeUsdt / 50000) * 18))
  );
  const alphaBps = Math.max(0, lumpSumImpactBps - realizedSlippageBps);
  const estimatedFeeSavingsUsdt = Math.round(((alphaBps / 10000) * executedTotalUsdt) * 100) / 100;

  const allProcessed = tranches.every((t) => t.status !== 'PENDING');
  const status: SmartExecutionStatus = allProcessed ? 'COMPLETED' : 'EXECUTING';

  const updatedPlan: SmartOrderPlan = {
    ...plan,
    status,
    tranches,
    executedTotalUsdt,
    executedTotalQuantity,
    averageExecutedPrice,
    realizedSlippageBps,
    estimatedFeeSavingsUsdt,
    completedAt: allProcessed ? now : undefined,
  };

  activePlansStore.set(plan.planId, updatedPlan);
  return updatedPlan;
}

/**
 * Simulates the full multi-tranche execution across an array of price ticks.
 */
export function simulateFullSmartExecution(
  options: CreateSmartOrderPlanOptions,
  priceSequence?: number[]
): SmartOrderPlan {
  let plan = createSmartOrderPlan(options);
  const count = plan.tranchesCount;

  for (let i = 1; i <= count; i++) {
    // Determine price for this step: either provided sequence or realistic micro-drift
    let stepPrice: number;
    if (priceSequence && priceSequence[i - 1] !== undefined) {
      stepPrice = priceSequence[i - 1];
    } else {
      // Natural micro-jitter within +/- 0.08%
      const drift = 1 + (Math.sin(i * 0.8) * 0.0006) + ((i % 2 === 0 ? 1 : -1) * 0.0002);
      stepPrice = Math.round(plan.arrivalBenchmarkPrice * drift * 100) / 100;
    }

    plan = executeTrancheStep(plan, i, stepPrice);
  }

  return plan;
}

/**
 * Retrieves a plan by ID.
 */
export function getSmartOrderPlanById(planId: string): SmartOrderPlan | null {
  return activePlansStore.get(planId) || null;
}

/**
 * Retrieves all stored execution plans.
 */
export function getAllSmartOrderPlans(): SmartOrderPlan[] {
  return Array.from(activePlansStore.values()).sort((a, b) => b.createdAt - a.createdAt);
}
