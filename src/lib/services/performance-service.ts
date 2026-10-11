// ─── U-SPOT Performance & Statistical Edge Engine ────────────────────
// Phase 12: Strategy Performance Dashboard & Analytics
// Spec Section 27: Performance Dashboard
// Spec Section 28: Do Not Use Win Rate Alone (Mathematical Expectancy, R-Multiples)
// Spec Section 19: SL Failure Causality Breakdown
// Spec Section 21: Stop Tightness & Counterfactual Breakdown

import type {
  SignalHistoryRecord,
  SignalEvaluation,
  PerformanceStats,
  MarketRegime,
  SetupType,
  ConfidenceGrade,
  SlFailureCause,
  StopTightnessLabel,
} from '../../types/index.ts';
import { isEntryTriggered } from '../utils.ts';
import { computePerformanceAttribution } from './performance-attribution.ts';

/**
 * Calculates mathematical median of a numeric array
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

/**
 * Calculates peak-to-trough maximum drawdown in R-multiples and percentage
 */
export function calculateMaxDrawdown(rMultiples: number[]): {
  maxDrawdownR: number;
  maxDrawdownPct: number;
} {
  if (rMultiples.length === 0) {
    return { maxDrawdownR: 0, maxDrawdownPct: 0 };
  }

  let peak = 0;
  let runningEquity = 0;
  let maxDd = 0;
  let peakAtMaxDd = 0;

  for (const r of rMultiples) {
    runningEquity += r;
    if (runningEquity > peak) {
      peak = runningEquity;
    }
    const dd = peak - runningEquity;
    if (dd > maxDd) {
      maxDd = dd;
      peakAtMaxDd = peak;
    }
  }

  // Drawdown percentage relative to peak equity at maximum drawdown (capped at 100%)
  const maxDrawdownPct =
    peakAtMaxDd > 0
      ? Math.min(100, Math.max(0, (maxDd / peakAtMaxDd) * 100))
      : maxDd > 0
      ? 100
      : 0;

  return {
    maxDrawdownR: Number(maxDd.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
  };
}

/**
 * Formats duration in milliseconds into human-readable string
 */
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Master statistical engine: Computes comprehensive performance statistics
 * and multi-segment breakdowns from historical signals and evaluations
 */
export function computePerformanceStats(
  signals: SignalHistoryRecord[],
  evaluations: SignalEvaluation[] = []
): PerformanceStats {
  // Only evaluate signals where market entry was actually triggered
  // Excludes pre-entry cancellations, pre-entry expiries, or pending signals where price never filled
  const entryTriggeredSignals = signals.filter(isEntryTriggered);

  const evalMap = new Map<string, SignalEvaluation>();
  for (const ev of evaluations) {
    evalMap.set(ev.signalId, ev);
  }

  const totalSignals = entryTriggeredSignals.length;
  if (totalSignals === 0) {
    return {
      totalSignals: 0,
      activeSignals: 0,
      completedSignals: 0,
      tp1Rate: 0,
      tp2Rate: 0,
      tp3Rate: 0,
      slRate: 0,
      expiryRate: 0,
      cancelledRate: 0,
      avgR: 0,
      medianR: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      avgWin: 0,
      avgLoss: 0,
      avgHoldingTime: '—',
      avgMfe: 0,
      avgMae: 0,
      expectancy: 0,
      totalNetPnlUsdt: 0,
      totalFeesUsdt: 0,
      winRate: 0,
      lossRate: 0,
      winCount: 0,
      lossCount: 0,
      attributionReport: computePerformanceAttribution([], []),
    };
  }

  let activeCount = 0;
  let completedCount = 0;
  let tp1Count = 0;
  let tp2Count = 0;
  let tp3Count = 0;
  let slCount = 0;
  let expiryCount = 0;
  let cancelledCount = 0;

  const realizedRs: number[] = [];
  const winRs: number[] = [];
  const lossRs: number[] = [];

  let grossProfitsUsdt = 0;
  let grossLossesUsdt = 0;
  let totalNetPnlUsdt = 0;
  let totalFeesUsdt = 0;

  const mfes: number[] = [];
  const maes: number[] = [];
  const durationsMs: number[] = [];

  // Segment accumulators
  const regimeMap = new Map<string, { count: number; rSum: number; wins: number; profits: number; losses: number }>();
  const setupMap = new Map<string, { count: number; rSum: number; wins: number; losses: number; winRSum: number; lossRSum: number }>();
  const confidenceMap = new Map<string, { count: number; rSum: number; wins: number }>();
  const coinMap = new Map<string, { count: number; rSum: number; wins: number; netPnl: number }>();
  const slReasonMap = new Map<string, number>();
  const stopTightnessMap = new Map<string, number>();

  for (const signal of entryTriggeredSignals) {
    const isCompleted =
      signal.lifecycle === 'CLOSED' ||
      signal.finalResult !== null ||
      signal.lifecycle === 'EXPIRED' ||
      signal.lifecycle === 'INVALIDATED' ||
      signal.lifecycle === 'CANCELLED';

    const isActive =
      signal.lifecycle === 'ACTIVE' ||
      signal.lifecycle === 'ENTRY_TRIGGERED' ||
      signal.lifecycle === 'CREATED' ||
      signal.lifecycle === 'DCA1_TRIGGERED' ||
      signal.lifecycle === 'DCA2_TRIGGERED';

    if (isActive) activeCount++;
    if (isCompleted) completedCount++;

    const res = signal.finalResult;
    const ev = evalMap.get(signal.signalId);

    // Target Rates
    if (res?.startsWith('TP') || res === 'FULL_TP' || res === 'PARTIAL_TP_THEN_SL') tp1Count++;
    if (res === 'TP2_REACHED' || res === 'FULL_TP') tp2Count++;
    if (res === 'FULL_TP') tp3Count++;
    if (res === 'SL') slCount++;
    if (res === 'EXPIRED' || signal.lifecycle === 'EXPIRED') expiryCount++;
    if (res === 'CANCELLED' || signal.lifecycle === 'CANCELLED') cancelledCount++;

    // R multiples & PnL
    const r = ev?.realizedR ?? signal.realizedR;
    const netPnl = ev?.netPnlUsdt ?? (signal.realizedReturn && signal.maxDeployed ? (signal.realizedReturn / 100) * signal.maxDeployed : 0);
    const fees = ev?.feesUsdt ?? signal.fees ?? 0;

    if (r !== null && r !== undefined) {
      realizedRs.push(r);
      if (r > 0 || res === 'PARTIAL_TP_THEN_SL') {
        winRs.push(Math.max(r, 0.3));
        grossProfitsUsdt += Math.max(0, ev?.grossPnlUsdt ?? (Math.max(r, 0.3) * signal.maxLoss));
      } else if (r < 0) {
        lossRs.push(r);
        grossLossesUsdt += Math.abs(Math.min(0, ev?.grossPnlUsdt ?? (r * signal.maxLoss)));
      }
    }

    totalNetPnlUsdt += netPnl || 0;
    totalFeesUsdt += fees || 0;

    // Excursions
    const mfe = ev?.mfe ?? signal.mfe;
    const mae = ev?.mae ?? signal.mae;
    if (mfe !== null && mfe !== undefined && mfe > 0) mfes.push(mfe);
    if (mae !== null && mae !== undefined && mae < 0) maes.push(mae);

    // Duration
    if (ev?.timeToEvent?.timeToSlMs) durationsMs.push(ev.timeToEvent.timeToSlMs);
    else if (ev?.timeToEvent?.timeToTp1Ms) durationsMs.push(ev.timeToEvent.timeToTp1Ms);
    else if (signal.createdAt && signal.lifecycle === 'CLOSED') {
      const ms = Math.max(0, Date.now() - new Date(signal.createdAt).getTime());
      durationsMs.push(ms);
    }

    // ─── Segment Aggregations ───
    const isWin = (r ?? 0) > 0 || (res?.startsWith('TP') ?? false) || res === 'FULL_TP' || res === 'PARTIAL_TP_THEN_SL';
    const isLoss = ((r ?? 0) < 0 || res === 'SL') && res !== 'PARTIAL_TP_THEN_SL';
    const rVal = r ?? 0;

    // 1. By Market Regime
    const reg = signal.marketRegime || 'RANGE';
    const regEntry = regimeMap.get(reg) || { count: 0, rSum: 0, wins: 0, profits: 0, losses: 0 };
    regEntry.count++;
    regEntry.rSum += rVal;
    if (isWin) {
      regEntry.wins++;
      regEntry.profits += Math.max(0, netPnl || 0);
    } else if (isLoss) {
      regEntry.losses += Math.abs(netPnl || 0);
    }
    regimeMap.set(reg, regEntry);

    // 2. By Setup Type
    const setup = signal.setupType || 'TREND_CONTINUATION';
    const setupEntry = setupMap.get(setup) || { count: 0, rSum: 0, wins: 0, losses: 0, winRSum: 0, lossRSum: 0 };
    setupEntry.count++;
    setupEntry.rSum += rVal;
    if (isWin) {
      setupEntry.wins++;
      setupEntry.winRSum += rVal;
    } else if (isLoss) {
      setupEntry.losses++;
      setupEntry.lossRSum += Math.abs(rVal);
    }
    setupMap.set(setup, setupEntry);

    // 3. By Confidence Grade
    const conf = signal.confidence || 'B';
    const confEntry = confidenceMap.get(conf) || { count: 0, rSum: 0, wins: 0 };
    confEntry.count++;
    confEntry.rSum += rVal;
    if (isWin) confEntry.wins++;
    confidenceMap.set(conf, confEntry);

    // 4. By Coin / Symbol
    const coin = signal.symbol.split('/')[0] || signal.symbol;
    const coinEntry = coinMap.get(coin) || { count: 0, rSum: 0, wins: 0, netPnl: 0 };
    coinEntry.count++;
    coinEntry.rSum += rVal;
    if (isWin) coinEntry.wins++;
    coinEntry.netPnl += netPnl || 0;
    coinMap.set(coin, coinEntry);

    // 5. By SL Failure Cause
    const slCause = ev?.slFailurePrimaryCause || (res === 'SL' ? 'UNKNOWN' : null);
    if (slCause) {
      slReasonMap.set(slCause, (slReasonMap.get(slCause) || 0) + 1);
    }

    // 6. By Stop Tightness Label
    const tightness = ev?.stopTightnessLabel;
    if (tightness) {
      stopTightnessMap.set(tightness, (stopTightnessMap.get(tightness) || 0) + 1);
    }
  }

  // ─── Mathematical Expectancy & Win Rates ───
  const completedBase = Math.max(1, completedCount);
  const winCount = winRs.length;
  const lossCount = lossRs.length;

  const winRate = Number(((winCount / completedBase) * 100).toFixed(1));
  const lossRate = Number(((lossCount / completedBase) * 100).toFixed(1));

  const avgWin = winCount > 0 ? Number((winRs.reduce((a, b) => a + b, 0) / winCount).toFixed(2)) : 0;
  const avgLoss = lossCount > 0 ? Number((lossRs.reduce((a, b) => a + b, 0) / lossCount).toFixed(2)) : 0;

  // Expectancy Formula (Spec Section 28): E(R) = (WinRate * AvgWin) - (LossRate * |AvgLoss|)
  const winFraction = winCount / completedBase;
  const lossFraction = lossCount / completedBase;
  const expectancy = Number((winFraction * avgWin - lossFraction * Math.abs(avgLoss)).toFixed(2));

  // Profit Factor Formula (Spec Section 27): Gross Profit / Gross Loss
  const profitFactor =
    grossLossesUsdt > 0
      ? Number((grossProfitsUsdt / grossLossesUsdt).toFixed(2))
      : grossProfitsUsdt > 0
      ? 99.9
      : 0;

  // Average & Median R
  const avgR =
    realizedRs.length > 0
      ? Number((realizedRs.reduce((a, b) => a + b, 0) / realizedRs.length).toFixed(2))
      : 0;
  const medianR = calculateMedian(realizedRs);

  // Drawdown
  const { maxDrawdownPct } = calculateMaxDrawdown(realizedRs);

  // Excursions
  const avgMfe =
    mfes.length > 0 ? Number((mfes.reduce((a, b) => a + b, 0) / mfes.length).toFixed(2)) : null;
  const avgMae =
    maes.length > 0 ? Number((maes.reduce((a, b) => a + b, 0) / maes.length).toFixed(2)) : null;

  // Holding duration
  const avgDurationMs =
    durationsMs.length > 0
      ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
      : null;
  const avgHoldingTime = formatDuration(avgDurationMs);

  // ─── Format Breakdowns ───
  const byMarketRegime: Record<string, { count: number; avgR: number; winRate: number; profitFactor?: number }> = {};
  for (const [k, v] of regimeMap.entries()) {
    const pf = v.losses > 0 ? Number((v.profits / v.losses).toFixed(2)) : v.profits > 0 ? 99.9 : 0;
    byMarketRegime[k] = {
      count: v.count,
      avgR: Number((v.rSum / v.count).toFixed(2)),
      winRate: Number(((v.wins / v.count) * 100).toFixed(1)),
      profitFactor: pf,
    };
  }

  const bySetupType: Record<string, { count: number; avgR: number; winRate: number; expectancy?: number }> = {};
  for (const [k, v] of setupMap.entries()) {
    const setupWinRate = v.count > 0 ? v.wins / v.count : 0;
    const setupLossRate = v.count > 0 ? v.losses / v.count : 0;
    const setupAvgWin = v.wins > 0 ? v.winRSum / v.wins : 0;
    const setupAvgLoss = v.losses > 0 ? v.lossRSum / v.losses : 0;
    const setupExp = Number((setupWinRate * setupAvgWin - setupLossRate * setupAvgLoss).toFixed(2));
    bySetupType[k] = {
      count: v.count,
      avgR: Number((v.rSum / v.count).toFixed(2)),
      winRate: Number((setupWinRate * 100).toFixed(1)),
      expectancy: setupExp,
    };
  }

  const byConfidence: Record<string, { count: number; avgR: number; winRate: number }> = {};
  for (const [k, v] of confidenceMap.entries()) {
    byConfidence[k] = {
      count: v.count,
      avgR: Number((v.rSum / v.count).toFixed(2)),
      winRate: Number(((v.wins / v.count) * 100).toFixed(1)),
    };
  }

  const byCoin: Record<string, { count: number; avgR: number; winRate: number; netPnlUsdt: number }> = {};
  for (const [k, v] of coinMap.entries()) {
    byCoin[k] = {
      count: v.count,
      avgR: Number((v.rSum / v.count).toFixed(2)),
      winRate: Number(((v.wins / v.count) * 100).toFixed(1)),
      netPnlUsdt: Number(v.netPnl.toFixed(2)),
    };
  }

  const totalSl = Math.max(1, slCount);
  const bySlReason: Record<string, { count: number; percentage: number }> = {};
  for (const [k, v] of slReasonMap.entries()) {
    bySlReason[k] = {
      count: v,
      percentage: Number(((v / totalSl) * 100).toFixed(1)),
    };
  }

  const totalTightness = Array.from(stopTightnessMap.values()).reduce((a, b) => a + b, 0) || 1;
  const byStopTightness: Record<string, { count: number; percentage: number }> = {};
  for (const [k, v] of stopTightnessMap.entries()) {
    byStopTightness[k] = {
      count: v,
      percentage: Number(((v / totalTightness) * 100).toFixed(1)),
    };
  }

  return {
    totalSignals,
    activeSignals: activeCount,
    completedSignals: completedCount,
    tp1Rate: Number(((tp1Count / completedBase) * 100).toFixed(1)),
    tp2Rate: Number(((tp2Count / completedBase) * 100).toFixed(1)),
    tp3Rate: Number(((tp3Count / completedBase) * 100).toFixed(1)),
    slRate: Number(((slCount / completedBase) * 100).toFixed(1)),
    expiryRate: Number(((expiryCount / totalSignals) * 100).toFixed(1)),
    cancelledRate: Number(((cancelledCount / totalSignals) * 100).toFixed(1)),
    avgR,
    medianR,
    profitFactor,
    maxDrawdown: maxDrawdownPct,
    avgWin,
    avgLoss,
    avgHoldingTime,
    avgMfe,
    avgMae,
    expectancy,
    totalNetPnlUsdt: Number(totalNetPnlUsdt.toFixed(2)),
    totalFeesUsdt: Number(totalFeesUsdt.toFixed(2)),
    winRate,
    lossRate,
    winCount,
    lossCount,
    byMarketRegime,
    bySetupType,
    byConfidence,
    byCoin,
    bySlReason,
    byStopTightness,
    attributionReport: computePerformanceAttribution(signals, evaluations),
  };
}
