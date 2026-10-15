// ─── U-SPOT Post-Trade Evaluation Engine ──────────────────────────────
// Phase 10: History Evaluation & Post-Trade Analytics
// Spec Sections:
//   - 16: Signal History / Evaluation Table
//   - 17: TP/SL Determination
//   - 18: Signal Result Types
//   - 19: SL Failure Analysis (Root Causes)
//   - 20: SL Analysis Examples
//   - 21: SL Counterfactual Analysis
//   - 22: Maximum Favorable / Adverse Excursion (MFE / MAE)
//   - 23: Time-to-Event Tracking
//   - 32: Fees and Slippage (Gross vs Net P&L)
//   - 46: Post-Trade Review Template
//   - 47: Losing Signal Review Template

import type {
  SignalHistoryRecord,
  SignalLifecycleEvent,
  SignalEvaluation,
  SignalResult,
  SlFailureCause,
  StopTightnessLabel,
  TimeToEvent,
  OHLCV,
} from '../../types/index.ts';

/** Configuration for execution fee & slippage modeling (Spec Section 32) */
export interface EvaluationConfig {
  makerFeeRate?: number; // Default: 0.10% (0.0010)
  takerFeeRate?: number; // Default: 0.10% (0.0010)
  slippageRate?: number; // Default: 0.05% (0.0005)
  spreadRate?: number;   // Default: 0.02% (0.0002)
}

/** Default execution settings (fees excluded as exact rates vary across VIP tiers and promotions) */
export const DEFAULT_EVALUATION_CONFIG: Required<EvaluationConfig> = {
  makerFeeRate: 0,
  takerFeeRate: 0,
  slippageRate: 0.0005, // 0.05% estimated slippage
  spreadRate: 0.0002,   // 0.02% average spread
};

/** Contextual market inputs for post-trade diagnosis */
export interface EvaluationContext {
  events?: SignalLifecycleEvent[];
  recentKlines?: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    openTime?: number;
    closeTime?: number;
  }>;
  btcChangePct?: number | null;
  postExitKlines?: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  marketRegimeShift?: string | null;
  indicatorsAtExit?: {
    rsi?: number;
    macdHist?: number;
    atrRatio?: number;
    volumeRatio?: number;
    structureBroke?: boolean;
    spreadPct?: number;
  };
}

/**
 * Derives or verifies the precise SignalResult category (Spec Section 18)
 */
export function classifySignalResult(
  signal: SignalHistoryRecord,
  events: SignalLifecycleEvent[] = []
): SignalResult {
  // 1. Strictly evaluate discrete event history in chronological order if available
  if (events && events.length > 0) {
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let hasTp1 = false;
    let hasTp2 = false;
    let hasTp3 = false;
    let hasSl = false;
    let closedResult: SignalResult | null = null;

    for (const e of sorted) {
      if (closedResult) break; // Trade was already closed; ignore subsequent ghost events

      if (e.eventType === 'INDETERMINATE') {
        closedResult = 'INDETERMINATE';
        break;
      }
      if (e.eventType === 'CANCELLED') {
        closedResult = 'CANCELLED';
        break;
      }
      if (e.eventType === 'INVALIDATED') {
        closedResult = 'INVALIDATED_BEFORE_ENTRY';
        break;
      }
      if (e.eventType === 'EXPIRED') {
        closedResult = 'EXPIRED';
        break;
      }
      if (e.eventType === 'MANUAL_EXIT') {
        closedResult = 'MANUAL_EXIT';
        break;
      }
      if (e.eventType === 'TP1') {
        hasTp1 = true;
      }
      if (e.eventType === 'TP2') {
        hasTp2 = true;
      }
      if (e.eventType === 'TP3') {
        hasTp3 = true;
        closedResult = 'FULL_TP';
        break;
      }
      if (e.eventType === 'SL') {
        hasSl = true;
        // Spec Section 13, 26 & Phase 24: If trailing stop hits after TP2, position is closed
        // with profit locked as TP2_REACHED. If SL/Breakeven hits after TP1, PARTIAL_TP_THEN_SL.
        closedResult = hasTp2 ? 'TP2_REACHED' : (hasTp1 ? 'PARTIAL_TP_THEN_SL' : 'SL');
        break;
      }
    }

    if (closedResult) {
      return closedResult;
    }

    if (hasTp3) return 'FULL_TP';
    if (hasTp2) return 'TP2_REACHED';
    if (hasTp1) return 'TP1_ONLY';
    if (hasSl) return 'SL';
  }

  // 2. Fallback: If already explicitly classified and not a generic string, respect it
  if (
    signal.finalResult &&
    signal.finalResult !== ('CLOSED' as unknown) &&
    signal.finalResult !== ('COMPLETED' as unknown)
  ) {
    return signal.finalResult;
  }

  // Fallback checks from signal state flags
  if (signal.lifecycle === 'EXPIRED') return 'EXPIRED';
  if (signal.lifecycle === 'INVALIDATED') return 'INVALIDATED_BEFORE_ENTRY';
  if (signal.lifecycle === 'CANCELLED') return 'CANCELLED';

  return 'INDETERMINATE';
}

/**
 * Calculates volume-weighted average entry price and total capital deployed
 */
export function calculateFilledAverageEntry(signal: SignalHistoryRecord): {
  averageEntry: number;
  deployedCapital: number;
} {
  const entryPrice = signal.actualEntry || signal.preferredEntry || signal.entryZone.low;
  let totalCost = signal.initialAllocation;
  let totalCoins = signal.initialAllocation / entryPrice;

  if (signal.dca1Hit && signal.dca1Allocation > 0) {
    totalCost += signal.dca1Allocation;
    totalCoins += signal.dca1Allocation / signal.dca1;
  }

  if (signal.dca2Hit && signal.dca2Allocation > 0) {
    totalCost += signal.dca2Allocation;
    totalCoins += signal.dca2Allocation / signal.dca2;
  }

  const averageEntry = totalCoins > 0 ? totalCost / totalCoins : entryPrice;
  return { averageEntry, deployedCapital: totalCost };
}

/**
 * Computes exact Realized R and weighted return percentage (Spec Section 16 & 18)
 * Tranche weights: TP1: 30%, TP2: 30%, TP3/Remainder: 40%
 */
export function calculateRealizedR(
  signal: SignalHistoryRecord,
  result: SignalResult,
  events: SignalLifecycleEvent[] = []
): {
  realizedR: number;
  grossReturnPct: number;
  exitSummary: string;
} {
  // Non-executed signals produce 0 R
  if (
    result === 'EXPIRED' ||
    result === 'INVALIDATED_BEFORE_ENTRY' ||
    result === 'CANCELLED' ||
    result === 'INDETERMINATE'
  ) {
    return {
      realizedR: 0,
      grossReturnPct: 0,
      exitSummary: 'No position filled (0.0R)',
    };
  }

  const { averageEntry } = calculateFilledAverageEntry(signal);
  const stopPrice = signal.stopLoss;
  const unitRisk = Math.max(0.00000001, averageEntry - stopPrice);

  // Extract exit prices from events if recorded, otherwise use planned levels
  const tp1Event = events.find((e) => e.eventType === 'TP1');
  const tp2Event = events.find((e) => e.eventType === 'TP2');
  const tp3Event = events.find((e) => e.eventType === 'TP3');
  const slEvent = events.find((e) => e.eventType === 'SL');

  const tp1Price = tp1Event?.price || signal.tp1;
  const tp2Price = tp2Event?.price || signal.tp2;
  const tp3Price = tp3Event?.price || signal.tp3;
  const slPrice = slEvent?.price || stopPrice;

  let weightedExitPrice = 0;
  let summary = '';

  switch (result) {
    case 'FULL_TP':
    case 'TP3_REACHED':
      // 30% @ TP1, 30% @ TP2, 40% @ TP3
      weightedExitPrice = 0.30 * tp1Price + 0.30 * tp2Price + 0.40 * tp3Price;
      summary = 'Full TP reached (30% TP1, 30% TP2, 40% TP3)';
      break;

    case 'TP2_REACHED':
      // 30% @ TP1, 30% @ TP2, 40% assumed closed at TP2
      weightedExitPrice = 0.30 * tp1Price + 0.70 * tp2Price;
      summary = 'TP2 reached (30% TP1, 70% TP2)';
      break;

    case 'TP1_ONLY':
      // 30% @ TP1, remaining 70% closed at breakeven/TP1
      weightedExitPrice = 0.30 * tp1Price + 0.70 * averageEntry;
      summary = 'TP1 reached (30% TP1, 70% breakeven exit)';
      break;

    case 'PARTIAL_TP_THEN_SL':
      // 30% @ TP1, remaining 70% stopped out at SL
      weightedExitPrice = 0.30 * tp1Price + 0.70 * slPrice;
      summary = 'Partial TP1 hit (30%), balance liquidated at SL (70%)';
      break;

    case 'SL':
      // 100% liquidated at SL
      weightedExitPrice = slPrice;
      summary = 'Stop Loss liquidated 100% (-1.0R)';
      break;

    case 'MANUAL_EXIT': {
      const exitPrice = events.find((e) => e.eventType === 'MANUAL_EXIT')?.price || averageEntry;
      weightedExitPrice = exitPrice;
      summary = 'Manual early exit';
      break;
    }

    default:
      weightedExitPrice = averageEntry;
      summary = 'Neutral exit';
      break;
  }

  const grossReturnPct = ((weightedExitPrice - averageEntry) / averageEntry) * 100;
  const realizedR = (weightedExitPrice - averageEntry) / unitRisk;

  return {
    realizedR: Number(realizedR.toFixed(2)),
    grossReturnPct: Number(grossReturnPct.toFixed(2)),
    exitSummary: summary,
  };
}

/**
 * Calculates net P&L with realistic fees and slippage (Spec Section 32)
 */
export function calculateNetPnl(
  deployedCapital: number,
  grossReturnPct: number,
  config: EvaluationConfig = {}
): {
  grossPnlUsdt: number;
  netPnlUsdt: number;
  feesUsdt: number;
  slippageUsdt: number;
  realizedReturnPercent: number;
} {
  const cfg = { ...DEFAULT_EVALUATION_CONFIG, ...config };

  if (deployedCapital <= 0) {
    return {
      grossPnlUsdt: 0,
      netPnlUsdt: 0,
      feesUsdt: 0,
      slippageUsdt: 0,
      realizedReturnPercent: 0,
    };
  }

  const grossPnlUsdt = deployedCapital * (grossReturnPct / 100);

  // Fees removed per requirement: exact fees cannot be predetermined across user accounts
  const feesUsdt = 0;

  // Slippage applied on trade volume
  const slippageUsdt = deployedCapital * cfg.slippageRate;

  const netPnlUsdt = grossPnlUsdt - slippageUsdt;
  const realizedReturnPercent = (netPnlUsdt / deployedCapital) * 100;

  return {
    grossPnlUsdt: Number(grossPnlUsdt.toFixed(2)),
    netPnlUsdt: Number(netPnlUsdt.toFixed(2)),
    feesUsdt: Number(feesUsdt.toFixed(2)),
    slippageUsdt: Number(slippageUsdt.toFixed(2)),
    realizedReturnPercent: Number(realizedReturnPercent.toFixed(2)),
  };
}

/**
 * Calculates Maximum Favorable and Adverse Excursions (Spec Section 22)
 */
export function calculateMfeMae(
  signal: SignalHistoryRecord,
  events: SignalLifecycleEvent[] = [],
  klines: Array<{ high: number; low: number }> = []
): { mfe: number; mae: number } {
  const { averageEntry } = calculateFilledAverageEntry(signal);

  // If already tracked on signal, use it as baseline
  let highest = signal.mfe ? averageEntry * (1 + signal.mfe / 100) : averageEntry;
  let lowest = signal.mae ? averageEntry * (1 + signal.mae / 100) : averageEntry;

  // Refine with klines if provided
  for (const k of klines) {
    if (k.high > highest) highest = k.high;
    if (k.low < lowest) lowest = k.low;
  }

  // Refine with discrete event prices
  for (const e of events) {
    if (e.price && e.price > 0) {
      if (e.price > highest) highest = e.price;
      if (e.price < lowest) lowest = e.price;
    }
  }

  const mfe = ((highest - averageEntry) / averageEntry) * 100;
  const mae = ((lowest - averageEntry) / averageEntry) * 100;

  return {
    mfe: Number(Math.max(0, mfe).toFixed(2)),
    mae: Number(Math.min(0, mae).toFixed(2)),
  };
}

/**
 * Calculates Time-to-Event metrics in milliseconds from signal creation (Spec Section 23)
 */
export function calculateTimeToEvent(
  signal: SignalHistoryRecord,
  events: SignalLifecycleEvent[] = []
): TimeToEvent {
  const creationTime = new Date(signal.createdAt).getTime();

  const getElapsed = (eventType: string): number | null => {
    const ev = events.find((e) => e.eventType === eventType);
    if (!ev) return null;
    const evTime = new Date(ev.timestamp).getTime();
    return Math.max(0, evTime - creationTime);
  };

  return {
    timeToEntryMs: getElapsed('ENTRY'),
    timeToDca1Ms: getElapsed('DCA1'),
    timeToDca2Ms: getElapsed('DCA2'),
    timeToTp1Ms: getElapsed('TP1'),
    timeToTp2Ms: getElapsed('TP2'),
    timeToTp3Ms: getElapsed('TP3'),
    timeToSlMs: getElapsed('SL'),
    timeToExpiryMs: getElapsed('EXPIRED'),
  };
}

/**
 * Diagnoses root causes of Stop Loss hits (Spec Sections 19 & 20)
 * Uses market evidence, indicator shifts, and setup dynamics
 */
export function diagnoseSlFailureCause(
  signal: SignalHistoryRecord,
  context: EvaluationContext = {}
): {
  primaryCause: SlFailureCause;
  secondaryCauses: SlFailureCause[];
  evidenceSummary: string;
} {
  const causes: SlFailureCause[] = [];
  const evidences: string[] = [];

  const { btcChangePct, marketRegimeShift, indicatorsAtExit, recentKlines } = context;

  // 1. Check Market Regime Failure (BTC reversal or broad market collapse)
  if (
    (btcChangePct !== null && btcChangePct !== undefined && btcChangePct <= -1.8) ||
    marketRegimeShift === 'BEAR' ||
    marketRegimeShift === 'HIGH_VOLATILITY'
  ) {
    causes.push('MARKET_REGIME_FAILURE');
    evidences.push(
      `Broad market reversal detected (BTC moved ${btcChangePct ? `${btcChangePct.toFixed(1)}%` : 'bearish'} during trade).`
    );
  }

  // 2. Check False Breakout (Breakout setup where price immediately reversed below entry)
  if (
    signal.setupType === 'BREAKOUT_RETEST' &&
    (signal.mfe === null || signal.mfe === undefined || signal.mfe < 1.0)
  ) {
    causes.push('FALSE_BREAKOUT');
    evidences.push('Breakout retest failed to sustain upward momentum and fell back below breakout level.');
  }

  // 3. Check Liquidity Sweep Failure
  if (
    signal.setupType === 'LIQUIDITY_SWEEP' &&
    indicatorsAtExit?.structureBroke
  ) {
    causes.push('LIQUIDITY_SWEEP_FAILURE');
    evidences.push('Expected liquidity sweep continuation failed to hold support.');
  }

  // 4. Check Weak Volume
  if (
    (indicatorsAtExit?.volumeRatio !== undefined && indicatorsAtExit.volumeRatio < 0.85) ||
    (signal.tradeScoreBreakdown?.volume !== undefined &&
      signal.tradeScoreBreakdown.volume < 45)
  ) {
    causes.push('WEAK_VOLUME');
    evidences.push('Trade suffered from declining buyer volume and insufficient follow-through.');
  }

  // 5. Check Momentum Failure (RSI drop or MACD deterioration)
  if (
    (indicatorsAtExit?.rsi !== undefined && indicatorsAtExit.rsi < 40) ||
    (indicatorsAtExit?.macdHist !== undefined && indicatorsAtExit.macdHist < 0) ||
    (signal.tradeScoreBreakdown?.momentum !== undefined &&
      signal.tradeScoreBreakdown.momentum < 45)
  ) {
    causes.push('MOMENTUM_FAILURE');
    evidences.push('Momentum deteriorated rapidly after entry with RSI/MACD negative divergence.');
  }

  // 6. Check Structure Failure (Higher-low invalidated)
  if (indicatorsAtExit?.structureBroke) {
    causes.push('STRUCTURE_FAILURE');
    evidences.push('Local market structure broke downward with lower swing lows.');
  }

  // 7. Check Excessive Volatility (ATR expansion)
  if (indicatorsAtExit?.atrRatio !== undefined && indicatorsAtExit.atrRatio > 1.8) {
    causes.push('EXCESSIVE_VOLATILITY');
    evidences.push('Sudden ATR volatility expansion triggered stop loss prematurely.');
  }

  // 8. Check Slippage & Spread
  if (indicatorsAtExit?.spreadPct !== undefined && indicatorsAtExit.spreadPct > 0.35) {
    causes.push('SLIPPAGE_SPREAD');
    evidences.push('Wider-than-normal bid/ask spread increased effective stop distance.');
  }

  // 9. Inspect recent klines for rapid candle dump
  if (recentKlines && recentKlines.length >= 3) {
    const last = recentKlines[recentKlines.length - 1];
    const prev = recentKlines[recentKlines.length - 2];
    const drop = ((last.close - prev.open) / prev.open) * 100;
    if (drop < -4.0 && !causes.includes('EXCESSIVE_VOLATILITY')) {
      causes.push('EXCESSIVE_VOLATILITY');
      evidences.push(`Abrupt downward candle drop of ${drop.toFixed(1)}% flushed out stop loss.`);
    }
  }

  // Default if data is inconclusive (Spec Section 19: never invent an explanation)
  if (causes.length === 0) {
    return {
      primaryCause: 'UNKNOWN',
      secondaryCauses: [],
      evidenceSummary: 'Cause cannot be determined with available market data (Spec Section 19).',
    };
  }

  const primaryCause = causes[0];
  const secondaryCauses = causes.slice(1);
  const evidenceSummary = evidences.join(' ');

  return {
    primaryCause,
    secondaryCauses,
    evidenceSummary,
  };
}

/**
 * Performs Stop Loss Counterfactual Analysis (Spec Section 21)
 * Evaluates what happened to price after Stop Loss was executed:
 * - Did price drop further? -> APPROPRIATE_STOP or STRUCTURAL_INVALIDATION
 * - Did price sweep and immediately rebound to TP? -> POTENTIALLY_TIGHT
 * - Did price linger at stop? -> POTENTIALLY_WIDE
 */
export function performCounterfactualAnalysis(
  signal: SignalHistoryRecord,
  postExitKlines: Array<{ high: number; low: number; close: number }> = []
): {
  stopTightnessLabel: StopTightnessLabel;
  counterfactualNote: string;
} {
  if (!postExitKlines || postExitKlines.length === 0) {
    return {
      stopTightnessLabel: 'INSUFFICIENT_DATA',
      counterfactualNote: 'No post-trade price data available yet to perform counterfactual analysis.',
    };
  }

  const stopPrice = signal.stopLoss;
  const tp1 = signal.tp1;
  const entry = signal.actualEntry || signal.preferredEntry || signal.entryZone.low;

  let lowestPostPrice = Number.POSITIVE_INFINITY;
  let highestPostPrice = Number.NEGATIVE_INFINITY;

  for (const candle of postExitKlines) {
    if (candle.low < lowestPostPrice) lowestPostPrice = candle.low;
    if (candle.high > highestPostPrice) highestPostPrice = candle.high;
  }

  // Check if price recovered back to entry or TP1 after stopping out
  if (highestPostPrice >= tp1) {
    const sweepPct = (((stopPrice - lowestPostPrice) / stopPrice) * 100).toFixed(1);
    return {
      stopTightnessLabel: 'POTENTIALLY_TIGHT',
      counterfactualNote: `Potentially too-tight stop. Price dipped ${sweepPct}% below SL before recovering to ${highestPostPrice.toFixed(4)} (TP1 reached).`,
    };
  }

  if (highestPostPrice >= entry) {
    return {
      stopTightnessLabel: 'POTENTIALLY_TIGHT',
      counterfactualNote: `Potentially tight stop. Price dipped below SL but recovered back to entry (${entry.toFixed(4)}).`,
    };
  }

  // Check if price continued lower below SL by > 1.5%
  if (lowestPostPrice < stopPrice * 0.985) {
    const dropPct = (((stopPrice - lowestPostPrice) / stopPrice) * 100).toFixed(1);
    return {
      stopTightnessLabel: 'APPROPRIATE_STOP',
      counterfactualNote: `SL protected capital. Price continued down -${dropPct}% after exit to ${lowestPostPrice.toFixed(4)}. Original thesis was invalidated.`,
    };
  }

  // Price consolidated tightly around SL level
  return {
    stopTightnessLabel: 'POTENTIALLY_WIDE',
    counterfactualNote: 'Price stalled near stop level without decisive directional follow-through.',
  };
}

/**
 * Formats duration in milliseconds into human-readable string (e.g. "24m 12s", "3h 45m")
 */
export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return 'N/A';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Generates structured Markdown post-trade evaluation report (Spec Sections 46 & 47)
 */
export function generatePostTradeReport(
  signal: SignalHistoryRecord,
  evaluation: Partial<SignalEvaluation>
): string {
  const result = evaluation.finalResult || signal.finalResult || 'INDETERMINATE';
  const isLoss = result === 'SL' || result === 'PARTIAL_TP_THEN_SL';

  if (!isLoss) {
    // Spec Section 46: Winning / Profit Review Template
    return [
      `## Result`,
      `${result}`,
      ``,
      `## Planned`,
      `Entry: ${(signal.preferredEntry || signal.entryZone.low).toFixed(4)}`,
      `DCA1: ${signal.dca1.toFixed(4)}`,
      `DCA2: ${signal.dca2.toFixed(4)}`,
      `SL: ${signal.stopLoss.toFixed(4)}`,
      `TP1: ${signal.tp1.toFixed(4)}`,
      `TP2: ${signal.tp2.toFixed(4)}`,
      `TP3: ${signal.tp3.toFixed(4)}`,
      ``,
      `## Actual`,
      `Entry: ${(signal.actualEntry || signal.preferredEntry || signal.entryZone.low).toFixed(4)}`,
      signal.dca1Hit ? `DCA1: ${signal.dca1.toFixed(4)} (Filled)` : null,
      signal.dca2Hit ? `DCA2: ${signal.dca2.toFixed(4)} (Filled)` : null,
      result.startsWith('TP') || result === 'FULL_TP'
        ? `TP1: ${signal.tp1.toFixed(4)}`
        : null,
      result === 'TP2_REACHED' || result === 'FULL_TP'
        ? `TP2: ${signal.tp2.toFixed(4)}`
        : null,
      result === 'FULL_TP' ? `TP3: ${signal.tp3.toFixed(4)}` : null,
      ``,
      `## Realized Outcome`,
      `Realized R: ${evaluation.realizedR !== undefined && evaluation.realizedR !== null && evaluation.realizedR > 0 ? `+${evaluation.realizedR.toFixed(2)}R` : `${evaluation.realizedR ?? 0}R`}`,
      `Net P&L: ${evaluation.netPnlUsdt !== undefined && evaluation.netPnlUsdt !== null && evaluation.netPnlUsdt > 0 ? `+$${evaluation.netPnlUsdt.toFixed(2)}` : `$${evaluation.netPnlUsdt ?? 0}`}`,
      `Slippage: $${(evaluation.slippageUsdt ?? 0).toFixed(2)}`,
      ``,
      `## MFE / MAE`,
      `MFE: +${(evaluation.mfe ?? 0).toFixed(2)}%`,
      `MAE: ${(evaluation.mae ?? 0).toFixed(2)}%`,
      ``,
      `## Strategy Modules`,
      `Trend: ${signal.tradeScoreBreakdown?.trend && signal.tradeScoreBreakdown.trend >= 50 ? 'PASS' : 'WARN'}`,
      `Momentum: ${signal.tradeScoreBreakdown?.momentum && signal.tradeScoreBreakdown.momentum >= 50 ? 'PASS' : 'WARN'}`,
      `Volume: ${signal.tradeScoreBreakdown?.volume && signal.tradeScoreBreakdown.volume >= 50 ? 'PASS' : 'WARN'}`,
      `Structure: ${signal.tradeScoreBreakdown?.structure && signal.tradeScoreBreakdown.structure >= 50 ? 'PASS' : 'WARN'}`,
      `Liquidity: ${signal.tradeScoreBreakdown?.liquidity && signal.tradeScoreBreakdown.liquidity >= 50 ? 'PASS' : 'WARN'}`,
      ``,
      `## Evaluation`,
      `Setup behaved according to the original thesis. Risk rules preserved capital.`,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  // Spec Section 47: Losing Signal Review Template
  return [
    `## Result`,
    `${result}`,
    ``,
    `## Primary Reason`,
    `${evaluation.slFailurePrimaryCause || 'UNKNOWN'}`,
    ``,
    `## Evidence`,
    `${signal.taSummary || 'Technical structure deteriorated after entry.'}`,
    ``,
    `## Stop Assessment`,
    `${evaluation.stopTightnessLabel || 'APPROPRIATE_STOP'}`,
    ``,
    `## Counterfactual`,
    `${evaluation.counterfactualNote || 'Stop loss protected capital.'}`,
    ``,
    `## Realized Outcome`,
    `Realized R: ${evaluation.realizedR ?? -1.0}R`,
    `Net P&L: -$${Math.abs(evaluation.netPnlUsdt ?? 0).toFixed(2)}`,
    `Slippage: $${(evaluation.slippageUsdt ?? 0).toFixed(2)}`,
    ``,
    `## MFE / MAE`,
    `MFE: +${(evaluation.mfe ?? 0).toFixed(2)}%`,
    `MAE: ${(evaluation.mae ?? 0).toFixed(2)}%`,
    ``,
    `## Evaluation`,
    `SL protected capital and the original thesis was invalidated.`,
  ].join('\n');
}

/**
 * Master evaluation function: Orchestrates comprehensive post-trade evaluation
 * for any completed signal (Spec Phase 10 Deliverable)
 */
export function evaluateSignalOutcome(
  signal: SignalHistoryRecord,
  context: EvaluationContext = {},
  config: EvaluationConfig = {}
): SignalEvaluation {
  const evaluatedAt = new Date().toISOString();
  const events = context.events || [];

  // 1. Result Classification (Spec Section 18)
  const finalResult = classifySignalResult(signal, events);

  // 2. Realized R and Weighted Return (Spec Section 16 & 18)
  const { realizedR, grossReturnPct } = calculateRealizedR(signal, finalResult, events);

  // 3. Deployed Capital & Net P&L Accounting (Spec Section 32)
  const { deployedCapital } = calculateFilledAverageEntry(signal);
  const { grossPnlUsdt, netPnlUsdt, feesUsdt, slippageUsdt, realizedReturnPercent } =
    calculateNetPnl(deployedCapital, grossReturnPct, config);

  // 4. Maximum Favorable & Adverse Excursions (Spec Section 22)
  const { mfe, mae } = calculateMfeMae(signal, events, context.recentKlines);

  // 5. Time-to-Event Analytics (Spec Section 23)
  const timeToEvent = calculateTimeToEvent(signal, events);

  // 6. Stop Loss Failure Causality (Spec Sections 19 & 20)
  let slFailurePrimaryCause: SlFailureCause | null = null;
  let slFailureSecondaryCauses: SlFailureCause[] = [];

  if (finalResult === 'SL' || finalResult === 'PARTIAL_TP_THEN_SL') {
    const slAnalysis = diagnoseSlFailureCause(signal, context);
    slFailurePrimaryCause = slAnalysis.primaryCause;
    slFailureSecondaryCauses = slAnalysis.secondaryCauses;
  }

  // 7. Counterfactual Analysis (Spec Section 21)
  let stopTightnessLabel: StopTightnessLabel | null = null;
  let counterfactualNote: string | null = null;

  if (finalResult === 'SL' || finalResult === 'PARTIAL_TP_THEN_SL') {
    const counterfactual = performCounterfactualAnalysis(signal, context.postExitKlines);
    stopTightnessLabel = counterfactual.stopTightnessLabel;
    counterfactualNote = counterfactual.counterfactualNote;
  }

  // 8. Generate Post-Trade Review Report (Spec Sections 46 & 47)
  const partialEval: Partial<SignalEvaluation> = {
    finalResult,
    realizedR,
    grossPnlUsdt,
    netPnlUsdt,
    feesUsdt,
    slippageUsdt,
    realizedReturnPercent,
    mfe,
    mae,
    slFailurePrimaryCause,
    slFailureSecondaryCauses,
    stopTightnessLabel,
    counterfactualNote,
  };

  const evaluationText = generatePostTradeReport(signal, partialEval);

  return {
    signalId: signal.signalId,
    evaluatedAt,
    finalResult,
    mfe,
    mae,
    realizedReturnPercent,
    realizedR,
    grossPnlUsdt,
    netPnlUsdt,
    feesUsdt,
    slippageUsdt,
    timeToEvent,
    slFailurePrimaryCause,
    slFailureSecondaryCauses,
    stopTightnessLabel,
    counterfactualNote,
    evaluationText,
  };
}
