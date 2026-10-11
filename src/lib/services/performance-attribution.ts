// ─── U-SPOT PnL Performance Attribution Engine — Phase 39 ─────────────────
// Quant performance attribution segmented by Setup Type × Macro Regime matrix
// Spec Section 27, 28: Mathematical Expectancy E(R), Alpha Attribution & Risk Drag Analysis

import type {
  SignalHistoryRecord,
  SignalEvaluation,
  SetupType,
  MarketRegime,
  AttributionCell,
  AttributionEdgeStatus,
  TacticalRecommendation,
  SetupMarginalAttribution,
  RegimeMarginalAttribution,
  PerformanceAttributionReport,
} from '../../types/index.ts';
import { isEntryTriggered } from '../utils.ts';
import { calculateMedian } from './performance-service.ts';

export const ALL_SETUP_TYPES: SetupType[] = [
  'BREAKOUT_RETEST',
  'PULLBACK_CONTINUATION',
  'LIQUIDITY_SWEEP',
  'TREND_CONTINUATION',
  'SUPPORT_REACTION',
];

export const ALL_MARKET_REGIMES: MarketRegime[] = [
  'BULL',
  'NEUTRAL',
  'BEAR',
  'HIGH_VOLATILITY',
  'LOW_LIQUIDITY',
];

/**
 * Normalizes input market regime string to standard MarketRegime enum
 */
export function normalizeRegime(reg?: string | null): MarketRegime {
  if (!reg) return 'NEUTRAL';
  const upper = reg.trim().toUpperCase();
  if (upper === 'BULL') return 'BULL';
  if (upper === 'BEAR') return 'BEAR';
  if (upper === 'HIGH_VOLATILITY' || upper === 'VOLATILE') return 'HIGH_VOLATILITY';
  if (upper === 'LOW_LIQUIDITY') return 'LOW_LIQUIDITY';
  if (upper === 'NEUTRAL' || upper === 'RANGE' || upper === 'BREAKOUT') return 'NEUTRAL';
  return 'NEUTRAL';
}

/**
 * Normalizes input setup type string to standard SetupType enum
 */
export function normalizeSetup(setup?: string | null): SetupType {
  if (!setup) return 'TREND_CONTINUATION';
  const upper = setup.trim().toUpperCase();
  if (upper === 'BREAKOUT_RETEST') return 'BREAKOUT_RETEST';
  if (upper === 'PULLBACK_CONTINUATION' || upper === 'PULLBACK_EMA20') return 'PULLBACK_CONTINUATION';
  if (upper === 'LIQUIDITY_SWEEP') return 'LIQUIDITY_SWEEP';
  if (upper === 'TREND_CONTINUATION') return 'TREND_CONTINUATION';
  if (upper === 'SUPPORT_REACTION') return 'SUPPORT_REACTION';
  return 'TREND_CONTINUATION';
}

/**
 * Classifies the quantitative statistical edge of a setup-regime combination
 */
export function classifyAttributionEdge(
  expectancy: number,
  winRate: number,
  completedCount: number
): AttributionEdgeStatus {
  if (completedCount < 2) {
    return 'INSUFFICIENT_DATA';
  }
  if (expectancy >= 0.5 && winRate >= 55) {
    return 'STRONG_EDGE';
  }
  if (expectancy > 0.05 && winRate >= 45) {
    return 'MODERATE_EDGE';
  }
  if (expectancy >= -0.1 && expectancy <= 0.05) {
    return 'NEUTRAL_EDGE';
  }
  return 'NEGATIVE_EDGE';
}

/**
 * Translates statistical edge classification into an actionable spot trading recommendation
 */
export function getTacticalRecommendation(edgeStatus: AttributionEdgeStatus): TacticalRecommendation {
  switch (edgeStatus) {
    case 'STRONG_EDGE':
      return 'AGGRESSIVE_SCALE';
    case 'MODERATE_EDGE':
      return 'STANDARD_ALLOCATION';
    case 'NEUTRAL_EDGE':
      return 'REDUCE_SIZE_50';
    case 'NEGATIVE_EDGE':
      return 'AVOID_REGIME';
    case 'INSUFFICIENT_DATA':
    default:
      return 'COLLECT_MORE_DATA';
  }
}

interface RawCellBucket {
  setupType: SetupType;
  marketRegime: MarketRegime;
  totalSignals: number;
  completedSignals: number;
  activeSignals: number;
  winRs: number[];
  lossRs: number[];
  realizedRs: number[];
  grossProfitsUsdt: number;
  grossLossesUsdt: number;
  netPnlUsdt: number;
  mfes: number[];
  maes: number[];
}

/**
 * Computes granular 2D performance attribution matrix and marginal summaries
 * across Setup Types and Macro Market Regimes.
 */
export function computePerformanceAttribution(
  signals: SignalHistoryRecord[],
  evaluations: SignalEvaluation[] = []
): PerformanceAttributionReport {
  // Only evaluate entry-triggered signals (matching Spec Section 28 & computePerformanceStats)
  const entryTriggered = signals.filter(isEntryTriggered);

  const evalMap = new Map<string, SignalEvaluation>();
  for (const ev of evaluations) {
    evalMap.set(ev.signalId, ev);
  }

  // Initialize raw buckets for all 25 combinations
  const buckets: Record<SetupType, Record<MarketRegime, RawCellBucket>> = {} as any;
  for (const setup of ALL_SETUP_TYPES) {
    buckets[setup] = {} as any;
    for (const regime of ALL_MARKET_REGIMES) {
      buckets[setup][regime] = {
        setupType: setup,
        marketRegime: regime,
        totalSignals: 0,
        completedSignals: 0,
        activeSignals: 0,
        winRs: [],
        lossRs: [],
        realizedRs: [],
        grossProfitsUsdt: 0,
        grossLossesUsdt: 0,
        netPnlUsdt: 0,
        mfes: [],
        maes: [],
      };
    }
  }

  // Portfolio-wide accumulators
  let portfolioGrossProfits = 0;
  let portfolioGrossLosses = 0;
  let portfolioNetPnl = 0;
  const portfolioRealizedRs: number[] = [];
  const portfolioWinRs: number[] = [];
  const portfolioLossRs: number[] = [];
  let portfolioCompleted = 0;

  for (const sig of entryTriggered) {
    const setup = normalizeSetup(sig.setupType);
    const regime = normalizeRegime(sig.marketRegime);
    const bucket = buckets[setup][regime];

    bucket.totalSignals++;

    const isCompleted =
      sig.lifecycle === 'CLOSED' ||
      sig.finalResult !== null ||
      sig.lifecycle === 'EXPIRED' ||
      sig.lifecycle === 'INVALIDATED' ||
      sig.lifecycle === 'CANCELLED';

    const isActive =
      sig.lifecycle === 'ACTIVE' ||
      sig.lifecycle === 'ENTRY_TRIGGERED' ||
      sig.lifecycle === 'CREATED' ||
      sig.lifecycle === 'DCA1_TRIGGERED' ||
      sig.lifecycle === 'DCA2_TRIGGERED';

    if (isActive) bucket.activeSignals++;
    if (isCompleted) {
      bucket.completedSignals++;
      portfolioCompleted++;
    }

    const res = sig.finalResult;
    const ev = evalMap.get(sig.signalId);

    const r = ev?.realizedR ?? sig.realizedR;
    const netPnl =
      ev?.netPnlUsdt ??
      (sig.realizedReturn && sig.maxDeployed ? (sig.realizedReturn / 100) * sig.maxDeployed : 0);

    bucket.netPnlUsdt += netPnl || 0;
    portfolioNetPnl += netPnl || 0;

    const isWin =
      (r ?? 0) > 0 ||
      (res?.startsWith('TP') ?? false) ||
      res === 'FULL_TP' ||
      res === 'PARTIAL_TP_THEN_SL';

    const isLoss = ((r ?? 0) < 0 || res === 'SL') && res !== 'PARTIAL_TP_THEN_SL';

    if (r !== null && r !== undefined) {
      bucket.realizedRs.push(r);
      portfolioRealizedRs.push(r);

      if (isWin) {
        const winR = Math.max(r, 0.3);
        const grossPnl = Math.max(0, ev?.grossPnlUsdt ?? (winR * sig.maxLoss));
        bucket.winRs.push(winR);
        bucket.grossProfitsUsdt += grossPnl;
        portfolioWinRs.push(winR);
        portfolioGrossProfits += grossPnl;
      } else if (isLoss) {
        const lossPnl = Math.abs(Math.min(0, ev?.grossPnlUsdt ?? (r * sig.maxLoss)));
        bucket.lossRs.push(r);
        bucket.grossLossesUsdt += lossPnl;
        portfolioLossRs.push(r);
        portfolioGrossLosses += lossPnl;
      }
    }

    // Excursions
    const mfe = ev?.mfe ?? sig.mfe;
    const mae = ev?.mae ?? sig.mae;
    if (mfe !== null && mfe !== undefined && mfe > 0) bucket.mfes.push(mfe);
    if (mae !== null && mae !== undefined && mae < 0) bucket.maes.push(mae);
  }

  // Build Attribution Cells
  const matrix: Record<SetupType, Record<MarketRegime, AttributionCell>> = {} as any;
  const cells: AttributionCell[] = [];

  for (const setup of ALL_SETUP_TYPES) {
    matrix[setup] = {} as any;
    for (const regime of ALL_MARKET_REGIMES) {
      const b = buckets[setup][regime];
      const completed = b.completedSignals;
      const winCount = b.winRs.length;
      const lossCount = b.lossRs.length;

      const winRate = completed > 0 ? Number(((winCount / completed) * 100).toFixed(1)) : 0;
      const lossRate = completed > 0 ? Number(((lossCount / completed) * 100).toFixed(1)) : 0;

      const avgWin = winCount > 0 ? b.winRs.reduce((sum, v) => sum + v, 0) / winCount : 0;
      const avgLoss = lossCount > 0 ? Math.abs(b.lossRs.reduce((sum, v) => sum + v, 0) / lossCount) : 0;

      const winFraction = completed > 0 ? winCount / completed : 0;
      const lossFraction = completed > 0 ? lossCount / completed : 0;
      const expectancy = Number((winFraction * avgWin - lossFraction * avgLoss).toFixed(2));

      const avgRealizedR =
        b.realizedRs.length > 0
          ? Number((b.realizedRs.reduce((sum, v) => sum + v, 0) / b.realizedRs.length).toFixed(2))
          : 0;

      const medianRealizedR = calculateMedian(b.realizedRs);

      const profitFactor =
        b.grossLossesUsdt > 0
          ? Number((b.grossProfitsUsdt / b.grossLossesUsdt).toFixed(2))
          : b.grossProfitsUsdt > 0
          ? 99.9
          : 0;

      const pnlAttributionPct =
        portfolioGrossProfits > 0
          ? Number(((b.grossProfitsUsdt / portfolioGrossProfits) * 100).toFixed(1))
          : 0;

      const avgMfe =
        b.mfes.length > 0 ? Number((b.mfes.reduce((sum, v) => sum + v, 0) / b.mfes.length).toFixed(2)) : null;
      const avgMae =
        b.maes.length > 0 ? Number((b.maes.reduce((sum, v) => sum + v, 0) / b.maes.length).toFixed(2)) : null;

      const edgeStatus = classifyAttributionEdge(expectancy, winRate, completed);
      const tacticalRecommendation = getTacticalRecommendation(edgeStatus);

      const cell: AttributionCell = {
        setupType: setup,
        marketRegime: regime,
        totalSignals: b.totalSignals,
        completedSignals: completed,
        activeSignals: b.activeSignals,
        winCount,
        lossCount,
        winRate,
        lossRate,
        avgRealizedR,
        medianRealizedR,
        expectancy,
        profitFactor,
        netPnlUsdt: Number(b.netPnlUsdt.toFixed(2)),
        grossProfitsUsdt: Number(b.grossProfitsUsdt.toFixed(2)),
        grossLossesUsdt: Number(b.grossLossesUsdt.toFixed(2)),
        pnlAttributionPct,
        avgMfe,
        avgMae,
        edgeStatus,
        tacticalRecommendation,
      };

      matrix[setup][regime] = cell;
      cells.push(cell);
    }
  }

  // ─── Setup Marginal Rollups ───
  const setupMarginals: SetupMarginalAttribution[] = ALL_SETUP_TYPES.map((setup) => {
    const setupCells = cells.filter((c) => c.setupType === setup);
    const totalSignals = setupCells.reduce((sum, c) => sum + c.totalSignals, 0);
    const completedSignals = setupCells.reduce((sum, c) => sum + c.completedSignals, 0);
    const totalWins = setupCells.reduce((sum, c) => sum + c.winCount, 0);
    const totalLosses = setupCells.reduce((sum, c) => sum + c.lossCount, 0);
    const netPnlUsdt = Number(setupCells.reduce((sum, c) => sum + c.netPnlUsdt, 0).toFixed(2));

    const winRate = completedSignals > 0 ? Number(((totalWins / completedSignals) * 100).toFixed(1)) : 0;

    // Aggregate R for this setup
    const allR = entryTriggered
      .filter((s) => normalizeSetup(s.setupType) === setup)
      .map((s) => evalMap.get(s.signalId)?.realizedR ?? s.realizedR)
      .filter((r): r is number => r !== null && r !== undefined);

    const avgR = allR.length > 0 ? Number((allR.reduce((sum, v) => sum + v, 0) / allR.length).toFixed(2)) : 0;

    const setupWinRs = allR.filter((r) => r > 0);
    const setupLossRs = allR.filter((r) => r < 0);
    const setupAvgWin = setupWinRs.length > 0 ? setupWinRs.reduce((a, b) => a + b, 0) / setupWinRs.length : 0;
    const setupAvgLoss =
      setupLossRs.length > 0 ? Math.abs(setupLossRs.reduce((a, b) => a + b, 0) / setupLossRs.length) : 0;

    const winFrac = completedSignals > 0 ? totalWins / completedSignals : 0;
    const lossFrac = completedSignals > 0 ? totalLosses / completedSignals : 0;
    const expectancy = Number((winFrac * setupAvgWin - lossFrac * setupAvgLoss).toFixed(2));

    const pnlSharePct =
      portfolioGrossProfits > 0
        ? Number(
            (
              (setupCells.reduce((sum, c) => sum + c.grossProfitsUsdt, 0) / portfolioGrossProfits) *
              100
            ).toFixed(1)
          )
        : 0;

    // Find best and worst regime for this setup (among those with trades)
    const populated = setupCells.filter((c) => c.completedSignals > 0);
    let bestRegime: MarketRegime | null = null;
    let worstRegime: MarketRegime | null = null;

    if (populated.length > 0) {
      const sortedByExp = [...populated].sort((a, b) => b.expectancy - a.expectancy);
      bestRegime = sortedByExp[0].marketRegime;
      worstRegime = sortedByExp[sortedByExp.length - 1].marketRegime;
    }

    return {
      setupType: setup,
      totalSignals,
      completedSignals,
      winRate,
      avgR,
      expectancy,
      netPnlUsdt,
      pnlSharePct,
      bestRegime,
      worstRegime,
    };
  });

  // ─── Regime Marginal Rollups ───
  const regimeMarginals: RegimeMarginalAttribution[] = ALL_MARKET_REGIMES.map((regime) => {
    const regimeCells = cells.filter((c) => c.marketRegime === regime);
    const totalSignals = regimeCells.reduce((sum, c) => sum + c.totalSignals, 0);
    const completedSignals = regimeCells.reduce((sum, c) => sum + c.completedSignals, 0);
    const totalWins = regimeCells.reduce((sum, c) => sum + c.winCount, 0);
    const totalLosses = regimeCells.reduce((sum, c) => sum + c.lossCount, 0);
    const netPnlUsdt = Number(regimeCells.reduce((sum, c) => sum + c.netPnlUsdt, 0).toFixed(2));

    const winRate = completedSignals > 0 ? Number(((totalWins / completedSignals) * 100).toFixed(1)) : 0;

    const allR = entryTriggered
      .filter((s) => normalizeRegime(s.marketRegime) === regime)
      .map((s) => evalMap.get(s.signalId)?.realizedR ?? s.realizedR)
      .filter((r): r is number => r !== null && r !== undefined);

    const avgR = allR.length > 0 ? Number((allR.reduce((sum, v) => sum + v, 0) / allR.length).toFixed(2)) : 0;

    const regWinRs = allR.filter((r) => r > 0);
    const regLossRs = allR.filter((r) => r < 0);
    const regAvgWin = regWinRs.length > 0 ? regWinRs.reduce((a, b) => a + b, 0) / regWinRs.length : 0;
    const regAvgLoss =
      regLossRs.length > 0 ? Math.abs(regLossRs.reduce((a, b) => a + b, 0) / regLossRs.length) : 0;

    const winFrac = completedSignals > 0 ? totalWins / completedSignals : 0;
    const lossFrac = completedSignals > 0 ? totalLosses / completedSignals : 0;
    const expectancy = Number((winFrac * regAvgWin - lossFrac * regAvgLoss).toFixed(2));

    const pnlSharePct =
      portfolioGrossProfits > 0
        ? Number(
            (
              (regimeCells.reduce((sum, c) => sum + c.grossProfitsUsdt, 0) / portfolioGrossProfits) *
              100
            ).toFixed(1)
          )
        : 0;

    const populated = regimeCells.filter((c) => c.completedSignals > 0);
    let bestSetup: SetupType | null = null;
    let worstSetup: SetupType | null = null;

    if (populated.length > 0) {
      const sortedByExp = [...populated].sort((a, b) => b.expectancy - a.expectancy);
      bestSetup = sortedByExp[0].setupType;
      worstSetup = sortedByExp[sortedByExp.length - 1].setupType;
    }

    return {
      marketRegime: regime,
      totalSignals,
      completedSignals,
      winRate,
      avgR,
      expectancy,
      netPnlUsdt,
      pnlSharePct,
      bestSetup,
      worstSetup,
    };
  });

  // ─── Find Top Alpha Generator & Top Risk Drag ───
  const completedCells = cells.filter((c) => c.completedSignals > 0);

  // Top Alpha Generator: prefer cells with sample size >= 2 and positive expectancy
  let topAlphaGenerator: AttributionCell | null = null;
  const robustAlphaCandidates = completedCells.filter((c) => c.completedSignals >= 2 && c.expectancy > 0);
  if (robustAlphaCandidates.length > 0) {
    topAlphaGenerator = robustAlphaCandidates.reduce((best, cur) =>
      cur.expectancy > best.expectancy || (cur.expectancy === best.expectancy && cur.netPnlUsdt > best.netPnlUsdt)
        ? cur
        : best
    );
  } else if (completedCells.length > 0) {
    topAlphaGenerator = completedCells.reduce((best, cur) =>
      cur.expectancy > best.expectancy ? cur : best
    );
  }

  // Top Risk Drag: cell with deepest loss or most negative expectancy
  let topRiskDrag: AttributionCell | null = null;
  const negativeCandidates = completedCells.filter((c) => c.expectancy < 0 || c.netPnlUsdt < 0);
  if (negativeCandidates.length > 0) {
    topRiskDrag = negativeCandidates.reduce((worst, cur) =>
      cur.expectancy < worst.expectancy || (cur.expectancy === worst.expectancy && cur.netPnlUsdt < worst.netPnlUsdt)
        ? cur
        : worst
    );
  } else if (completedCells.length > 0) {
    // If none are negative, the one with lowest expectancy
    topRiskDrag = completedCells.reduce((worst, cur) =>
      cur.expectancy < worst.expectancy ? cur : worst
    );
  }

  // Portfolio overall expectancy and win rate
  const portfolioWinRate =
    portfolioCompleted > 0 ? Number(((portfolioWinRs.length / portfolioCompleted) * 100).toFixed(1)) : 0;

  const portAvgWin =
    portfolioWinRs.length > 0 ? portfolioWinRs.reduce((a, b) => a + b, 0) / portfolioWinRs.length : 0;
  const portAvgLoss =
    portfolioLossRs.length > 0 ? Math.abs(portfolioLossRs.reduce((a, b) => a + b, 0) / portfolioLossRs.length) : 0;

  const portWinFrac = portfolioCompleted > 0 ? portfolioWinRs.length / portfolioCompleted : 0;
  const portLossFrac = portfolioCompleted > 0 ? portfolioLossRs.length / portfolioCompleted : 0;
  const overallExpectancy = Number((portWinFrac * portAvgWin - portLossFrac * portAvgLoss).toFixed(2));

  return {
    totalTradesAnalyzed: entryTriggered.length,
    completedTradesAnalyzed: portfolioCompleted,
    totalNetPnlUsdt: Number(portfolioNetPnl.toFixed(2)),
    totalGrossProfitUsdt: Number(portfolioGrossProfits.toFixed(2)),
    totalGrossLossUsdt: Number(portfolioGrossLosses.toFixed(2)),
    overallExpectancy,
    overallWinRate: portfolioWinRate,
    setups: ALL_SETUP_TYPES,
    regimes: ALL_MARKET_REGIMES,
    matrix,
    cells,
    setupMarginals,
    regimeMarginals,
    topAlphaGenerator,
    topRiskDrag,
    calculatedAt: new Date().toISOString(),
  };
}
