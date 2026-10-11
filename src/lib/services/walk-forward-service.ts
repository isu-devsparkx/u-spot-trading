// ─── U-SPOT Walk-Forward Validation Engine (Phase 14) ───────────────────
// Implements In-Sample training, Out-of-Sample testing, rolling windows,
// Walk-Forward Efficiency (WFE) computation, and overfitting detection.
// Spec Ref: Phase 14 & Sections 30, 31, 32, 33

import type {
  OHLCV,
  SignalWeights,
  StrategyParamCandidate,
  WalkForwardConfig,
  WalkForwardWindowResult,
  WalkForwardResult,
  WalkForwardMtfAlphaMetric,
  RobustnessGrade,
  BacktestResult,
  EquityPoint,
} from '../../types/index.ts';
import { runBacktest } from './backtest-service.ts';

// ─── Default Strategy Candidates for In-Sample Optimization ───────────

export const DEFAULT_WALK_FORWARD_CANDIDATES: StrategyParamCandidate[] = [
  {
    name: 'Trend Follower',
    description: 'Emphasizes EMA trend alignment and market structure stability',
    weights: {
      trend: 30,
      momentum: 20,
      volume: 15,
      volatility: 10,
      liquidity: 5,
      structure: 15,
      regime: 5,
    },
  },
  {
    name: 'Momentum Scalper',
    description: 'Prioritizes Wilder RSI momentum and volume surge confirmation',
    weights: {
      trend: 15,
      momentum: 35,
      volume: 25,
      volatility: 10,
      liquidity: 5,
      structure: 5,
      regime: 5,
    },
  },
  {
    name: 'Structure & Liquidity',
    description: 'Capitalizes on liquidity wick sweeps and Break of Structure (BOS)',
    weights: {
      trend: 10,
      momentum: 15,
      volume: 15,
      volatility: 10,
      liquidity: 20,
      structure: 25,
      regime: 5,
    },
  },
  {
    name: 'Balanced Multi-Factor',
    description: 'Equalized weighting across all 7 core technical pillars',
    weights: {
      trend: 18,
      momentum: 16,
      volume: 15,
      volatility: 14,
      liquidity: 12,
      structure: 15,
      regime: 10,
    },
  },
];

// ─── MTF Parameter Grid Candidates for Multi-Timeframe Optimization ───

export const DEFAULT_MTF_GRID_CANDIDATES: StrategyParamCandidate[] = [
  {
    name: 'Institutional MTF Confluence',
    description: 'Higher-timeframe 1H/4H trend filter with strict counter-trend trap blocker and +10 bonus',
    weights: {
      trend: 25,
      structure: 25,
      momentum: 15,
      volume: 15,
      liquidity: 10,
      volatility: 5,
      regime: 5,
    },
    mtf: {
      enabled: true,
      blockCounterTrend: true,
      bonusPoints: 10,
    },
  },
  {
    name: 'Trend Follower (MTF Filtered)',
    description: 'EMA trend alignment backed by 1H/4H macro trend verification',
    weights: {
      trend: 30,
      momentum: 20,
      volume: 15,
      volatility: 10,
      liquidity: 5,
      structure: 15,
      regime: 5,
    },
    mtf: {
      enabled: true,
      blockCounterTrend: true,
      bonusPoints: 8,
    },
  },
  {
    name: 'Trend Follower (Raw Single TF)',
    description: 'Baseline EMA trend follower without MTF confirmation',
    weights: {
      trend: 30,
      momentum: 20,
      volume: 15,
      volatility: 10,
      liquidity: 5,
      structure: 15,
      regime: 5,
    },
    mtf: {
      enabled: false,
      blockCounterTrend: false,
      bonusPoints: 0,
    },
  },
  {
    name: 'Momentum Scalper (MTF Filtered)',
    description: 'RSI & Volume surges verified against higher timeframe momentum',
    weights: {
      trend: 15,
      momentum: 35,
      volume: 25,
      volatility: 10,
      liquidity: 5,
      structure: 5,
      regime: 5,
    },
    mtf: {
      enabled: true,
      blockCounterTrend: true,
      bonusPoints: 6,
    },
  },
  {
    name: 'Momentum Scalper (Raw Single TF)',
    description: 'Fast RSI scalp entries without higher timeframe trend filter',
    weights: {
      trend: 15,
      momentum: 35,
      volume: 25,
      volatility: 10,
      liquidity: 5,
      structure: 5,
      regime: 5,
    },
    mtf: {
      enabled: false,
      blockCounterTrend: false,
      bonusPoints: 0,
    },
  },
  {
    name: 'Structure & Liquidity (MTF Filtered)',
    description: 'Key order blocks and wick sweeps aligned with 1H macro market direction',
    weights: {
      trend: 10,
      momentum: 15,
      volume: 15,
      volatility: 10,
      liquidity: 20,
      structure: 25,
      regime: 5,
    },
    mtf: {
      enabled: true,
      blockCounterTrend: true,
      bonusPoints: 12,
    },
  },
];

/**
 * Generates an expanded candidate grid pairing each input strategy with both MTF-filtered and Raw single-TF variants.
 */
export function generateMtfGridCandidates(
  baseCandidates: StrategyParamCandidate[] = DEFAULT_WALK_FORWARD_CANDIDATES
): StrategyParamCandidate[] {
  const grid: StrategyParamCandidate[] = [];
  for (const c of baseCandidates) {
    // 1. MTF-Filtered variant
    grid.push({
      ...c,
      name: `${c.name} (MTF)`,
      description: `${c.description || ''} [MTF Confluence Active]`,
      mtf: {
        enabled: true,
        blockCounterTrend: true,
        bonusPoints: c.mtf?.bonusPoints ?? 10,
      },
    });
    // 2. Raw Single-TF variant
    grid.push({
      ...c,
      name: `${c.name} (Raw)`,
      description: `${c.description || ''} [Single-Timeframe Baseline]`,
      mtf: {
        enabled: false,
        blockCounterTrend: false,
        bonusPoints: 0,
      },
    });
  }
  return grid;
}

export const DEFAULT_WALK_FORWARD_CONFIG: WalkForwardConfig = {
  symbol: 'SOL/USDT',
  timeframe: '15m',
  totalBars: 300,
  initialBalance: 300,
  windowCount: 3,
  trainRatio: 0.70, // 70% In-Sample, 30% Out-Of-Sample per window
  candidates: DEFAULT_WALK_FORWARD_CANDIDATES,
  includeFees: true,
  slippagePercent: 0.05,
  mtfOptimization: false,
};

// ─── Window Generation Helper ─────────────────────────────────────────

export interface WindowPartition {
  windowIndex: number;
  trainCandles: OHLCV[];
  testCandles: OHLCV[];
  trainRange: {
    startBar: number;
    endBar: number;
    startTime: number;
    endTime: number;
    barsCount: number;
  };
  testRange: {
    startBar: number;
    endBar: number;
    startTime: number;
    endTime: number;
    barsCount: number;
  };
}

/**
 * Splits historical candles into rolling walk-forward train/test windows.
 * Guarantees zero overlap between each window's train and test partitions,
 * with test data occurring strictly forward in time.
 */
export function generateWalkForwardWindows(
  candles: OHLCV[],
  windowCount: number = 3,
  trainRatio: number = 0.70
): WindowPartition[] {
  const total = candles.length;
  if (total < 60) {
    throw new Error(`Insufficient candles for walk-forward validation (minimum 60 required, got ${total})`);
  }

  const safeWindowCount = Math.max(1, Math.min(windowCount, 6));
  const safeTrainRatio = Math.max(0.50, Math.min(trainRatio, 0.85));

  // Determine window size such that windows can step sequentially
  // For W windows with ~50% overlap or sequential step
  const minWindowSize = 50;
  let windowSize = Math.max(minWindowSize, Math.floor(total / (safeWindowCount * 0.5 + 0.5)));
  if (windowSize > total) {
    windowSize = total;
  }

  const step = safeWindowCount > 1
    ? Math.max(10, Math.floor((total - windowSize) / (safeWindowCount - 1)))
    : 0;

  const partitions: WindowPartition[] = [];

  for (let w = 0; w < safeWindowCount; w++) {
    const startIdx = w * step;
    const endIdx = Math.min(total, startIdx + windowSize);
    const windowSlice = candles.slice(startIdx, endIdx);

    if (windowSlice.length < 30) {
      continue;
    }

    const trainLen = Math.floor(windowSlice.length * safeTrainRatio);
    const trainSlice = windowSlice.slice(0, trainLen);
    const testSlice = windowSlice.slice(trainLen);

    if (trainSlice.length === 0 || testSlice.length === 0) {
      continue;
    }

    partitions.push({
      windowIndex: w + 1,
      trainCandles: trainSlice,
      testCandles: testSlice,
      trainRange: {
        startBar: startIdx,
        endBar: startIdx + trainLen - 1,
        startTime: trainSlice[0].timestamp,
        endTime: trainSlice[trainSlice.length - 1].timestamp,
        barsCount: trainSlice.length,
      },
      testRange: {
        startBar: startIdx + trainLen,
        endBar: endIdx - 1,
        startTime: testSlice[0].timestamp,
        endTime: testSlice[testSlice.length - 1].timestamp,
        barsCount: testSlice.length,
      },
    });
  }

  return partitions;
}

// ─── Candidate Evaluation & In-Sample Scoring ─────────────────────────

/**
 * Objective scoring function to rank parameter candidate in In-Sample period.
 * Balances net profit, profit factor, and expectancy.
 */
function calculateCandidateScore(result: BacktestResult): number {
  if (result.trades.length === 0) return -100;

  const netPnl = result.netProfitUsdt;
  const pf = Math.min(result.stats.profitFactor, 5.0);
  const winRate = result.stats.winRate ?? 0;
  const expR = result.stats.expectancy ?? 0;

  // Composite objective function: reward profit + quality, penalize negative drift
  return (netPnl * 1.5) + (pf * 10) + (winRate * 0.2) + (expR * 15);
}

// ─── Walk-Forward Efficiency (WFE) Calculation ────────────────────────

/**
 * Calculates Walk-Forward Efficiency (WFE):
 * WFE = (Out-of-Sample Return % / In-Sample Return %) * 100
 * Robust systems generally target WFE >= 50-60%.
 */
export function calculateWindowEfficiency(
  isReturn: number,
  oosReturn: number
): number {
  // If both positive, return actual ratio
  if (isReturn > 0 && oosReturn > 0) {
    const rawRatio = (oosReturn / isReturn) * 100;
    return Number(Math.min(200, Math.max(0, rawRatio)).toFixed(2));
  }

  // If In-Sample was profitable but Out-Of-Sample lost money -> 0% efficiency
  if (isReturn > 0 && oosReturn <= 0) {
    return 0;
  }

  // If In-Sample lost money but Out-Of-Sample made money -> 100% bonus
  if (isReturn <= 0 && oosReturn > 0) {
    return 100;
  }

  // If both lost money -> negative efficiency capped at -50%
  return -25;
}

/**
 * Evaluates the overall Robustness Grade across all windows
 */
export function determineRobustnessGrade(
  overallWFE: number,
  avgOosPnl: number,
  profitableWindowsCount: number,
  totalWindows: number
): RobustnessGrade {
  const profitableRatio = totalWindows > 0 ? profitableWindowsCount / totalWindows : 0;

  if (overallWFE >= 65 && profitableRatio >= 0.75 && avgOosPnl > 0) {
    return 'HIGHLY_ROBUST';
  }
  if (overallWFE >= 50 && profitableRatio >= 0.50 && avgOosPnl >= 0) {
    return 'ROBUST';
  }
  if (overallWFE >= 25 || profitableRatio >= 0.33) {
    return 'FRAGILE';
  }
  return 'OVERFIT';
}

// ─── Main Walk-Forward Execution Engine ────────────────────────────────

/**
 * Executes full Walk-Forward Validation across sequential historical partitions.
 */
export function runWalkForwardValidation(
  candles: OHLCV[],
  userConfig?: Partial<WalkForwardConfig>
): WalkForwardResult {
  const isMtfOptimization = Boolean(userConfig?.mtfOptimization);
  let resolvedCandidates: StrategyParamCandidate[];
  if (userConfig?.candidates && userConfig.candidates.length > 0) {
    resolvedCandidates = userConfig.candidates;
  } else if (isMtfOptimization) {
    resolvedCandidates = DEFAULT_MTF_GRID_CANDIDATES;
  } else {
    resolvedCandidates = DEFAULT_WALK_FORWARD_CANDIDATES;
  }

  const config: WalkForwardConfig = {
    ...DEFAULT_WALK_FORWARD_CONFIG,
    ...userConfig,
    mtfOptimization: isMtfOptimization,
    candidates: resolvedCandidates,
  };

  const partitions = generateWalkForwardWindows(
    candles,
    config.windowCount,
    config.trainRatio
  );

  const windowResults: WalkForwardWindowResult[] = [];
  const candidates = config.candidates!;

  for (const partition of partitions) {
    // ─── 1. In-Sample (IS) Training Phase ───
    let bestCandidate = candidates[0];
    let bestScore = -Infinity;
    let bestIsResult: BacktestResult | null = null;

    for (const candidate of candidates) {
      const isResult = runBacktest(partition.trainCandles, {
        symbol: config.symbol,
        timeframe: config.timeframe,
        barsCount: partition.trainCandles.length,
        initialWalletBalance: config.initialBalance,
        weights: candidate.weights,
        mtfEnabled: candidate.mtf ? candidate.mtf.enabled : (isMtfOptimization || true),
        makerFeeRate: config.includeFees ? 0.001 : 0,
        takerFeeRate: config.includeFees ? 0.001 : 0,
        slippageRate: config.slippagePercent ? config.slippagePercent / 100 : 0.0005,
      });

      const score = calculateCandidateScore(isResult);
      if (score > bestScore || !bestIsResult) {
        bestScore = score;
        bestCandidate = candidate;
        bestIsResult = isResult;
      }
    }

    // ─── 2. Out-of-Sample (OOS) Testing Phase ───
    // Test strictly using the optimal candidate weights chosen during training
    const oosResult = runBacktest(partition.testCandles, {
      symbol: config.symbol,
      timeframe: config.timeframe,
      barsCount: partition.testCandles.length,
      initialWalletBalance: config.initialBalance,
      weights: bestCandidate.weights,
      mtfEnabled: bestCandidate.mtf ? bestCandidate.mtf.enabled : (isMtfOptimization || true),
      makerFeeRate: config.includeFees ? 0.001 : 0,
      takerFeeRate: config.includeFees ? 0.001 : 0,
      slippageRate: config.slippagePercent ? config.slippagePercent / 100 : 0.0005,
    });

    const isReturn = bestIsResult!.totalReturnPercent;
    const oosReturn = oosResult.totalReturnPercent;
    const windowWFE = calculateWindowEfficiency(isReturn, oosReturn);
    const degradation = Number(Math.max(0, isReturn - oosReturn).toFixed(2));
    const isRobust = windowWFE >= 50 && oosResult.netProfitUsdt >= 0;

    windowResults.push({
      windowIndex: partition.windowIndex,
      trainRange: partition.trainRange,
      testRange: partition.testRange,
      selectedCandidate: bestCandidate,
      inSampleResult: bestIsResult!,
      outOfSampleResult: oosResult,
      windowEfficiency: windowWFE,
      degradationPercent: degradation,
      isRobust,
    });
  }

  // ─── 3. Aggregate Statistical Diagnostics ───
  const windowCount = windowResults.length;
  if (windowCount === 0) {
    throw new Error('No valid walk-forward windows could be evaluated.');
  }

  let totalWFE = 0;
  let totalIsReturn = 0;
  let totalOosReturn = 0;
  let totalIsWinRate = 0;
  let totalOosWinRate = 0;
  let totalIsPF = 0;
  let totalOosPF = 0;
  let totalIsPnl = 0;
  let totalOosPnl = 0;
  let profitableOosCount = 0;

  for (const w of windowResults) {
    totalWFE += w.windowEfficiency;
    totalIsReturn += w.inSampleResult.totalReturnPercent;
    totalOosReturn += w.outOfSampleResult.totalReturnPercent;
    totalIsWinRate += w.inSampleResult.stats.winRate ?? 0;
    totalOosWinRate += w.outOfSampleResult.stats.winRate ?? 0;
    totalIsPF += w.inSampleResult.stats.profitFactor;
    totalOosPF += w.outOfSampleResult.stats.profitFactor;
    totalIsPnl += w.inSampleResult.netProfitUsdt;
    totalOosPnl += w.outOfSampleResult.netProfitUsdt;
    if (w.outOfSampleResult.netProfitUsdt > 0) {
      profitableOosCount++;
    }
  }

  const overallWFE = Number((totalWFE / windowCount).toFixed(2));
  const avgInSampleReturn = Number((totalIsReturn / windowCount).toFixed(2));
  const avgOutOfSampleReturn = Number((totalOosReturn / windowCount).toFixed(2));
  const avgInSampleWinRate = Number((totalIsWinRate / windowCount).toFixed(2));
  const avgOutOfSampleWinRate = Number((totalOosWinRate / windowCount).toFixed(2));
  const avgInSampleProfitFactor = Number((totalIsPF / windowCount).toFixed(2));
  const avgOutOfSampleProfitFactor = Number((totalOosPF / windowCount).toFixed(2));
  const inSampleTotalPnl = Number(totalIsPnl.toFixed(2));
  const outOfSampleTotalPnl = Number(totalOosPnl.toFixed(2));

  const robustnessGrade = determineRobustnessGrade(
    overallWFE,
    outOfSampleTotalPnl / windowCount,
    profitableOosCount,
    windowCount
  );

  // ─── 4. Build Continuous Out-Of-Sample Equity Curve ───
  const combinedCurve: EquityPoint[] = [];
  let runningWallet = config.initialBalance;
  let pointIdx = 0;
  let peakWallet = runningWallet;

  combinedCurve.push({
    index: pointIdx++,
    timestamp: windowResults[0]?.testRange.startTime || Date.now(),
    equityUsdt: runningWallet,
    runningR: 0,
    drawdownPercent: 0,
  });

  for (const w of windowResults) {
    for (const t of w.outOfSampleResult.trades) {
      runningWallet = Number((runningWallet + t.netPnlUsdt).toFixed(2));
      if (runningWallet > peakWallet) peakWallet = runningWallet;
      const dd = peakWallet > 0 ? ((peakWallet - runningWallet) / peakWallet) * 100 : 0;

      combinedCurve.push({
        index: pointIdx++,
        timestamp: t.exitTime,
        equityUsdt: runningWallet,
        runningR: t.realizedR,
        drawdownPercent: Number(dd.toFixed(2)),
      });
    }
  }

  // ─── 5. Formulate Actionable Recommendations ───
  const recommendations: string[] = [];

  if (robustnessGrade === 'HIGHLY_ROBUST') {
    recommendations.push(
      'Strategy demonstrates exceptional out-of-sample persistence. High confidence for live deployment.'
    );
  } else if (robustnessGrade === 'ROBUST') {
    recommendations.push(
      'Healthy Walk-Forward Efficiency (>=50%). Strategy parameters generalise effectively without severe overfitting.'
    );
  } else if (robustnessGrade === 'FRAGILE') {
    recommendations.push(
      'Moderate out-of-sample degradation detected. Consider increasing structure/trend weights or widening entry stop distances.'
    );
  } else {
    recommendations.push(
      'Warning: Strategy suffers from curve-fitting. In-Sample edge fails to translate to Out-Of-Sample data. Do not deploy without retuning.'
    );
  }

  if (avgOutOfSampleWinRate < avgInSampleWinRate - 15) {
    recommendations.push(
      `Win rate drops sharply from ${avgInSampleWinRate}% (IS) to ${avgOutOfSampleWinRate}% (OOS). Tighten filter criteria.`
    );
  }

  if (outOfSampleTotalPnl > 0) {
    recommendations.push(
      `Net Out-Of-Sample profit across ${windowCount} windows is +${outOfSampleTotalPnl} USDT.`
    );
  }

  // ─── 6. Compute MTF Alpha Metric (Phase 28) ───
  let mtfAlphaMetric: WalkForwardMtfAlphaMetric | undefined;
  const hasMtfContext = isMtfOptimization || resolvedCandidates.some((c) => c.mtf !== undefined);

  if (hasMtfContext) {
    const mtfWindows = windowResults.filter(
      (w) => w.selectedCandidate.mtf?.enabled === true
    );
    const rawWindows = windowResults.filter(
      (w) => !w.selectedCandidate.mtf || w.selectedCandidate.mtf.enabled === false
    );

    const avgMtfWfe = mtfWindows.length > 0
      ? Number((mtfWindows.reduce((acc, w) => acc + w.windowEfficiency, 0) / mtfWindows.length).toFixed(2))
      : overallWFE;
    const avgRawWfe = rawWindows.length > 0
      ? Number((rawWindows.reduce((acc, w) => acc + w.windowEfficiency, 0) / rawWindows.length).toFixed(2))
      : 0;

    const wfeDelta = Number((avgMtfWfe - avgRawWfe).toFixed(2));
    const isMtfSuperior = mtfWindows.length >= rawWindows.length || wfeDelta >= 0;

    let drawdownSavedUsdt = 0;
    for (const w of mtfWindows) {
      const avoidedLossCount = Math.max(
        0,
        (w.inSampleResult.trades.filter((t) => t.realizedR < 0).length) -
          (w.outOfSampleResult.trades.filter((t) => t.realizedR < 0).length)
      );
      drawdownSavedUsdt += avoidedLossCount * (config.initialBalance * 0.015);
    }

    mtfAlphaMetric = {
      isMtfSuperior,
      avgMtfWfe,
      avgRawWfe,
      wfeDelta,
      counterTrendDrawdownSavedUsdt: Number(drawdownSavedUsdt.toFixed(2)),
      summary: isMtfSuperior
        ? `MTF Confluence chosen in ${mtfWindows.length}/${windowResults.length} rolling windows. Out-of-sample efficiency delta: ${wfeDelta >= 0 ? '+' : ''}${wfeDelta}% WFE.`
        : `Single-timeframe momentum was optimal in ${rawWindows.length}/${windowResults.length} windows under short-term ranging regimes.`,
    };

    recommendations.push(mtfAlphaMetric.summary);
  }

  return {
    config,
    windows: windowResults,
    overallWFE,
    robustnessGrade,
    avgInSampleReturn,
    avgOutOfSampleReturn,
    avgInSampleWinRate,
    avgOutOfSampleWinRate,
    avgInSampleProfitFactor,
    avgOutOfSampleProfitFactor,
    inSampleTotalPnl,
    outOfSampleTotalPnl,
    combinedOutOfSampleCurve: combinedCurve,
    mtfAlphaMetric,
    recommendations,
    executedAt: new Date().toISOString(),
  };
}
