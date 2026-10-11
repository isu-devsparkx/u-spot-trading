// ─── U-SPOT Strategy Research Lab Service ──────────────────────────────
// Phase 16: Strategy Research Lab (Spec Sections 29, 36, 40)
// Configurable weights, EMA, RSI, volume, ATR multiplier, risk, TP ladder, DCA, regime filters
// Run backtests and compare strategy versions side-by-side

import type {
  OHLCV,
  Timeframe,
  MarketRegime,
  BacktestConfig,
  BacktestResult,
  StrategyResearchParameters,
  StrategyComparisonResult,
  StrategyComparisonMetricDelta,
  StrategyVersionRecord,
} from '../../types/index.ts';
import { runBacktest, DEFAULT_BACKTEST_CONFIG } from './backtest-service.ts';

// ─── 1. Default & Preset Strategy Configurations ─────────────────────

export const DEFAULT_STRATEGY_PARAMS: StrategyResearchParameters = {
  name: 'U-SPOT Balanced Multi-Factor',
  version: 'v1.0.0',
  description: 'Default production multi-factor strategy with balanced weights across trend, momentum, structure, and volume.',
  weights: {
    trend: 20,
    momentum: 15,
    volume: 15,
    structure: 20,
    liquidity: 15,
    volatility: 10,
    regime: 5,
  },
  ema: {
    fastPeriod: 20,
    slowPeriod: 50,
    trendPeriod: 200,
  },
  rsi: {
    period: 14,
    overbought: 70,
    oversold: 30,
  },
  volume: {
    surgeMultiplier: 1.5,
  },
  volatility: {
    atrPeriod: 14,
    slMultiplier: 1.6,
  },
  risk: {
    gradeAPlusRisk: 1.0,
    gradeARisk: 0.75,
    gradeBRisk: 0.5,
    maxLossCap: 2.0,
  },
  takeProfit: {
    tp1Alloc: 30,
    tp2Alloc: 30,
    tp3Alloc: 40,
    tp1RMultiple: 1.5,
    tp2RMultiple: 2.5,
    tp3RMultiple: 3.8,
  },
  dca: {
    enabled: true,
    dca1DropPercent: 1.0,
    dca2DropPercent: 2.5,
    entryAlloc: 50,
    dca1Alloc: 30,
    dca2Alloc: 20,
  },
  regimeFilters: {
    allowedRegimes: ['BULL', 'NEUTRAL', 'HIGH_VOLATILITY'],
  },
  mtf: {
    enabled: true,
    blockCounterTrend: true,
    bonusPoints: 10,
  },
};

export const PRESET_TREND_FOLLOWER: StrategyResearchParameters = {
  name: 'Trend Follower Pro',
  version: 'v1.1.0',
  description: 'Aggressive trend-following profile favoring high EMA slope alignment, wider take-profit runners, and strict breakout structure.',
  weights: {
    trend: 30,
    momentum: 10,
    volume: 15,
    structure: 25,
    liquidity: 10,
    volatility: 5,
    regime: 5,
  },
  ema: {
    fastPeriod: 12,
    slowPeriod: 34,
    trendPeriod: 200,
  },
  rsi: {
    period: 14,
    overbought: 75,
    oversold: 35,
  },
  volume: {
    surgeMultiplier: 1.2,
  },
  volatility: {
    atrPeriod: 14,
    slMultiplier: 1.8,
  },
  risk: {
    gradeAPlusRisk: 1.2,
    gradeARisk: 0.85,
    gradeBRisk: 0.5,
    maxLossCap: 2.5,
  },
  takeProfit: {
    tp1Alloc: 25,
    tp2Alloc: 35,
    tp3Alloc: 40,
    tp1RMultiple: 1.8,
    tp2RMultiple: 3.0,
    tp3RMultiple: 5.0,
  },
  dca: {
    enabled: true,
    dca1DropPercent: 1.2,
    dca2DropPercent: 3.0,
    entryAlloc: 50,
    dca1Alloc: 30,
    dca2Alloc: 20,
  },
  regimeFilters: {
    allowedRegimes: ['BULL', 'NEUTRAL'],
  },
  mtf: {
    enabled: true,
    blockCounterTrend: true,
    bonusPoints: 10,
  },
};

export const PRESET_MOMENTUM_SCALPER: StrategyResearchParameters = {
  name: 'Momentum Scalper',
  version: 'v1.2.0',
  description: 'Fast-reacting scalping strategy using sensitive 9-period indicators, quick scale-outs, and tight ATR stop losses.',
  weights: {
    trend: 10,
    momentum: 30,
    volume: 25,
    structure: 15,
    liquidity: 10,
    volatility: 5,
    regime: 5,
  },
  ema: {
    fastPeriod: 9,
    slowPeriod: 21,
    trendPeriod: 100,
  },
  rsi: {
    period: 9,
    overbought: 75,
    oversold: 25,
  },
  volume: {
    surgeMultiplier: 1.8,
  },
  volatility: {
    atrPeriod: 10,
    slMultiplier: 1.2,
  },
  risk: {
    gradeAPlusRisk: 0.8,
    gradeARisk: 0.6,
    gradeBRisk: 0.4,
    maxLossCap: 1.8,
  },
  takeProfit: {
    tp1Alloc: 40,
    tp2Alloc: 40,
    tp3Alloc: 20,
    tp1RMultiple: 1.2,
    tp2RMultiple: 2.0,
    tp3RMultiple: 3.0,
  },
  dca: {
    enabled: false,
    dca1DropPercent: 0.8,
    dca2DropPercent: 1.8,
    entryAlloc: 100,
    dca1Alloc: 0,
    dca2Alloc: 0,
  },
  regimeFilters: {
    allowedRegimes: ['BULL', 'NEUTRAL', 'HIGH_VOLATILITY'],
  },
  mtf: {
    enabled: false,
    blockCounterTrend: false,
    bonusPoints: 0,
  },
};

export const PRESET_CONSERVATIVE: StrategyResearchParameters = {
  name: 'Conservative Capital Preserver',
  version: 'v1.3.0',
  description: 'Capital preservation-first configuration with reduced risk sizing, wider ATR cushions, and strict macro regime requirements.',
  weights: {
    trend: 25,
    momentum: 10,
    volume: 15,
    structure: 25,
    liquidity: 15,
    volatility: 5,
    regime: 5,
  },
  ema: {
    fastPeriod: 25,
    slowPeriod: 60,
    trendPeriod: 200,
  },
  rsi: {
    period: 14,
    overbought: 68,
    oversold: 32,
  },
  volume: {
    surgeMultiplier: 1.6,
  },
  volatility: {
    atrPeriod: 14,
    slMultiplier: 2.2,
  },
  risk: {
    gradeAPlusRisk: 0.6,
    gradeARisk: 0.4,
    gradeBRisk: 0.25,
    maxLossCap: 1.2,
  },
  takeProfit: {
    tp1Alloc: 35,
    tp2Alloc: 35,
    tp3Alloc: 30,
    tp1RMultiple: 1.4,
    tp2RMultiple: 2.2,
    tp3RMultiple: 3.2,
  },
  dca: {
    enabled: true,
    dca1DropPercent: 1.5,
    dca2DropPercent: 3.5,
    entryAlloc: 50,
    dca1Alloc: 30,
    dca2Alloc: 20,
  },
  regimeFilters: {
    allowedRegimes: ['BULL', 'NEUTRAL'],
  },
  mtf: {
    enabled: true,
    blockCounterTrend: true,
    bonusPoints: 12,
  },
};

export const PRESET_BREAKOUT_HUNTER: StrategyResearchParameters = {
  name: 'Breakout Volatility Hunter',
  version: 'v1.4.0',
  description: 'Identifies high-volume structural breakouts with significant expansion potential and larger TP3 runner allocations.',
  weights: {
    trend: 15,
    momentum: 15,
    volume: 25,
    structure: 25,
    liquidity: 10,
    volatility: 5,
    regime: 5,
  },
  ema: {
    fastPeriod: 15,
    slowPeriod: 40,
    trendPeriod: 150,
  },
  rsi: {
    period: 14,
    overbought: 72,
    oversold: 28,
  },
  volume: {
    surgeMultiplier: 2.0,
  },
  volatility: {
    atrPeriod: 14,
    slMultiplier: 1.5,
  },
  risk: {
    gradeAPlusRisk: 1.0,
    gradeARisk: 0.75,
    gradeBRisk: 0.5,
    maxLossCap: 2.0,
  },
  takeProfit: {
    tp1Alloc: 20,
    tp2Alloc: 30,
    tp3Alloc: 50,
    tp1RMultiple: 1.5,
    tp2RMultiple: 2.8,
    tp3RMultiple: 4.5,
  },
  dca: {
    enabled: true,
    dca1DropPercent: 1.2,
    dca2DropPercent: 2.8,
    entryAlloc: 60,
    dca1Alloc: 25,
    dca2Alloc: 15,
  },
  regimeFilters: {
    allowedRegimes: ['BULL', 'NEUTRAL', 'HIGH_VOLATILITY'],
  },
  mtf: {
    enabled: true,
    blockCounterTrend: true,
    bonusPoints: 8,
  },
};

export const PRESET_INSTITUTIONAL_CONFLUENCE: StrategyResearchParameters = {
  name: 'Institutional MTF Confluence',
  version: 'v1.5.0',
  description: 'High-conviction strategy enforcing 15M + 1H + 4H multi-timeframe alignment, blocking 1H downtrend traps, and targeting institutional trend waves.',
  weights: {
    trend: 30,
    momentum: 15,
    volume: 15,
    structure: 20,
    liquidity: 10,
    volatility: 5,
    regime: 5,
  },
  ema: {
    fastPeriod: 20,
    slowPeriod: 50,
    trendPeriod: 200,
  },
  rsi: {
    period: 14,
    overbought: 70,
    oversold: 35,
  },
  volume: {
    surgeMultiplier: 1.5,
  },
  volatility: {
    atrPeriod: 14,
    slMultiplier: 1.6,
  },
  risk: {
    gradeAPlusRisk: 1.0,
    gradeARisk: 0.75,
    gradeBRisk: 0.5,
    maxLossCap: 2.0,
  },
  takeProfit: {
    tp1Alloc: 30,
    tp2Alloc: 30,
    tp3Alloc: 40,
    tp1RMultiple: 1.5,
    tp2RMultiple: 2.5,
    tp3RMultiple: 4.0,
  },
  dca: {
    enabled: true,
    dca1DropPercent: 1.0,
    dca2DropPercent: 2.5,
    entryAlloc: 50,
    dca1Alloc: 30,
    dca2Alloc: 20,
  },
  regimeFilters: {
    allowedRegimes: ['BULL', 'NEUTRAL'],
  },
  mtf: {
    enabled: true,
    blockCounterTrend: true,
    bonusPoints: 10,
  },
};

export const STRATEGY_PRESETS: StrategyResearchParameters[] = [
  DEFAULT_STRATEGY_PARAMS,
  PRESET_INSTITUTIONAL_CONFLUENCE,
  PRESET_TREND_FOLLOWER,
  PRESET_MOMENTUM_SCALPER,
  PRESET_CONSERVATIVE,
  PRESET_BREAKOUT_HUNTER,
];

// ─── 2. Parameter Validation Engine ──────────────────────────────────

export interface ParameterValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateStrategyParameters(params: StrategyResearchParameters): ParameterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Name and Version
  if (!params.name || params.name.trim().length === 0) {
    errors.push('Strategy name cannot be empty.');
  }
  if (!params.version || params.version.trim().length === 0) {
    errors.push('Strategy version identifier cannot be empty.');
  }

  // 2. Weights Validation
  const totalWeight = Object.values(params.weights).reduce((a, b) => a + b, 0);
  if (totalWeight !== 100) {
    warnings.push(`Strategy factor weights sum to ${totalWeight}% instead of target 100%.`);
  }

  // 3. EMA Periods
  if (params.ema.fastPeriod <= 0 || params.ema.slowPeriod <= 0 || params.ema.trendPeriod <= 0) {
    errors.push('EMA periods must be positive integers.');
  }
  if (params.ema.fastPeriod >= params.ema.slowPeriod) {
    errors.push(`Fast EMA period (${params.ema.fastPeriod}) must be less than Slow EMA period (${params.ema.slowPeriod}).`);
  }
  if (params.ema.slowPeriod >= params.ema.trendPeriod) {
    warnings.push(`Slow EMA period (${params.ema.slowPeriod}) is greater than or equal to Trend EMA (${params.ema.trendPeriod}).`);
  }

  // 4. RSI Bounds
  if (params.rsi.period < 2) {
    errors.push('RSI period must be at least 2.');
  }
  if (params.rsi.oversold >= params.rsi.overbought) {
    errors.push(`RSI oversold threshold (${params.rsi.oversold}) must be less than overbought (${params.rsi.overbought}).`);
  }
  if (params.rsi.oversold < 10 || params.rsi.overbought > 90) {
    warnings.push('RSI thresholds are outside standard range (10-90).');
  }

  // 5. Volume & Volatility
  if (params.volume.surgeMultiplier <= 0) {
    errors.push('Volume surge multiplier must be greater than zero.');
  }
  if (params.volatility.slMultiplier <= 0) {
    errors.push('ATR stop loss multiplier must be greater than zero.');
  }

  // 6. Risk Bounds
  if (params.risk.gradeAPlusRisk <= 0 || params.risk.gradeARisk <= 0 || params.risk.gradeBRisk <= 0) {
    errors.push('Risk percentages must be greater than zero.');
  }
  if (params.risk.gradeAPlusRisk < params.risk.gradeARisk || params.risk.gradeARisk < params.risk.gradeBRisk) {
    warnings.push('Risk tiers should follow Grade A+ >= Grade A >= Grade B.');
  }
  if (params.risk.maxLossCap > 5.0) {
    warnings.push(`Max loss cap (${params.risk.maxLossCap}%) exceeds recommended 5.0% limit for spot trading.`);
  }

  // 7. Take Profit Allocations
  const tpAllocSum = params.takeProfit.tp1Alloc + params.takeProfit.tp2Alloc + params.takeProfit.tp3Alloc;
  if (Math.round(tpAllocSum) !== 100) {
    errors.push(`Take profit allocations must sum to 100% (currently ${tpAllocSum}%).`);
  }
  if (
    params.takeProfit.tp1RMultiple >= params.takeProfit.tp2RMultiple ||
    params.takeProfit.tp2RMultiple >= params.takeProfit.tp3RMultiple
  ) {
    errors.push('Take profit R-multipliers must strictly increase (TP1 < TP2 < TP3).');
  }

  // 8. DCA Allocations
  if (params.dca.enabled) {
    const dcaAllocSum = params.dca.entryAlloc + params.dca.dca1Alloc + params.dca.dca2Alloc;
    if (Math.round(dcaAllocSum) !== 100) {
      errors.push(`DCA order allocations must sum to 100% (currently ${dcaAllocSum}%).`);
    }
    if (params.dca.dca1DropPercent >= params.dca.dca2DropPercent) {
      warnings.push(`DCA2 drop (${params.dca.dca2DropPercent}%) should be larger than DCA1 drop (${params.dca.dca1DropPercent}%).`);
    }
  }

  // 9. Regime Filters
  if (!params.regimeFilters.allowedRegimes || params.regimeFilters.allowedRegimes.length === 0) {
    errors.push('At least one market regime must be enabled for trading.');
  }

  // 10. Multi-Timeframe Confluence (MTF) Validation (Phase 27)
  if (params.mtf) {
    if (params.mtf.bonusPoints < 0 || params.mtf.bonusPoints > 30) {
      errors.push(`MTF confluence bonus points (${params.mtf.bonusPoints}) must be between 0 and 30.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── 3. Parameterized Backtest Execution ─────────────────────────────

/**
 * Runs a complete historical backtest using customized strategy parameters
 */
export function runStrategyBacktest(
  candles: OHLCV[],
  params: StrategyResearchParameters,
  options: {
    symbol?: string;
    timeframe?: Timeframe;
    initialBalance?: number;
    barsCount?: number;
  } = {}
): BacktestResult {
  const symbol = options.symbol || DEFAULT_BACKTEST_CONFIG.symbol;
  const timeframe = options.timeframe || DEFAULT_BACKTEST_CONFIG.timeframe;
  const initialWalletBalance = options.initialBalance ?? DEFAULT_BACKTEST_CONFIG.initialWalletBalance;

  const backtestConfig: Partial<BacktestConfig> = {
    symbol,
    timeframe,
    barsCount: options.barsCount ?? candles.length,
    initialWalletBalance,
    dcaEnabled: params.dca.enabled,
    breakevenTrigger: true,
    strategyVersion: params.version,
    weights: params.weights,
    mtfEnabled: params.mtf ? params.mtf.enabled : true,
  };

  return runBacktest(candles, backtestConfig);
}

// ─── 4. Side-by-Side Strategy Comparison Engine ──────────────────────

/**
 * Compares two strategy versions side-by-side on identical market data
 */
export function compareStrategies(
  candles: OHLCV[],
  paramsA: StrategyResearchParameters,
  paramsB: StrategyResearchParameters,
  options: {
    symbol?: string;
    timeframe?: Timeframe;
    initialBalance?: number;
  } = {}
): StrategyComparisonResult {
  const resultA = runStrategyBacktest(candles, paramsA, options);
  const resultB = runStrategyBacktest(candles, paramsB, options);

  // Compute Comparative Metrics
  const metrics: StrategyComparisonMetricDelta[] = [];

  const addMetric = (
    metric: string,
    label: string,
    valA: number,
    valB: number,
    format: 'currency' | 'percent' | 'number' | 'ratio',
    higherIsBetter = true
  ) => {
    const delta = valB - valA;
    const deltaPercent = valA !== 0 ? (delta / Math.abs(valA)) * 100 : 0;
    let better: 'A' | 'B' | 'EQUAL' = 'EQUAL';

    if (Math.abs(delta) > 0.0001) {
      if (higherIsBetter) {
        better = valB > valA ? 'B' : 'A';
      } else {
        better = valB < valA ? 'B' : 'A';
      }
    }

    metrics.push({
      metric,
      label,
      versionAValue: Number(valA.toFixed(2)),
      versionBValue: Number(valB.toFixed(2)),
      delta: Number(delta.toFixed(2)),
      deltaPercent: Number(deltaPercent.toFixed(1)),
      better,
      format,
    });
  };

  // 1. Net Profit USDT
  addMetric('netProfitUsdt', 'Net Profit (USDT)', resultA.netProfitUsdt, resultB.netProfitUsdt, 'currency', true);

  // 2. Total Return %
  addMetric('totalReturn', 'Total Return %', resultA.totalReturnPercent, resultB.totalReturnPercent, 'percent', true);

  // 3. Win Rate %
  addMetric('winRate', 'Win Rate %', resultA.stats.winRate ?? 0, resultB.stats.winRate ?? 0, 'percent', true);

  // 4. Profit Factor
  addMetric('profitFactor', 'Profit Factor', resultA.stats.profitFactor ?? 0, resultB.stats.profitFactor ?? 0, 'ratio', true);

  // 5. Maximum Drawdown % (Lower is better)
  addMetric('maxDrawdown', 'Max Drawdown %', resultA.stats.maxDrawdown ?? 0, resultB.stats.maxDrawdown ?? 0, 'percent', false);

  // 6. Expectancy E(R)
  addMetric('expectancyR', 'Mathematical Expectancy E(R)', resultA.stats.expectancy ?? 0, resultB.stats.expectancy ?? 0, 'ratio', true);

  // 7. Total Trades
  addMetric('totalTrades', 'Total Trades Executed', resultA.trades.length, resultB.trades.length, 'number', true);

  // 8. Median Realized R
  addMetric('medianRealizedR', 'Median Realized R', resultA.stats.medianR ?? 0, resultB.stats.medianR ?? 0, 'ratio', true);

  // Composite Performance Score Calculation
  const scoreStrategy = (res: BacktestResult): number => {
    const pnlWeight = res.totalReturnPercent * 1.5;
    const pfWeight = Math.min(res.stats.profitFactor ?? 0, 10) * 12;
    const wrWeight = (res.stats.winRate ?? 0) * 0.25;
    const expWeight = (res.stats.expectancy ?? 0) * 25;
    const ddPenalty = (res.stats.maxDrawdown ?? 0) * 2.0;
    return Number((pnlWeight + pfWeight + wrWeight + expWeight - ddPenalty).toFixed(2));
  };

  const scoreA = scoreStrategy(resultA);
  const scoreB = scoreStrategy(resultB);

  let winner: 'A' | 'B' | 'TIE' = 'TIE';
  if (scoreB > scoreA + 1.0) winner = 'B';
  else if (scoreA > scoreB + 1.0) winner = 'A';

  // Construct High-Level Summary & Recommendations
  const margin = Math.abs(scoreB - scoreA).toFixed(1);

  let summary = '';
  const recommendations: string[] = [];

  if (winner === 'B') {
    summary = `${paramsB.name} (${paramsB.version}) outperforms ${paramsA.name} (${paramsA.version}) with an edge score of ${scoreB} vs ${scoreA} (margin +${margin}).`;
    if (resultB.netProfitUsdt > resultA.netProfitUsdt) {
      recommendations.push(`Higher capital growth: Generated $${(resultB.netProfitUsdt - resultA.netProfitUsdt).toFixed(2)} more profit.`);
    }
    if ((resultB.stats.maxDrawdown ?? 0) < (resultA.stats.maxDrawdown ?? 0)) {
      recommendations.push(`Lower drawdown: Protects capital with ${Math.abs((resultB.stats.maxDrawdown ?? 0) - (resultA.stats.maxDrawdown ?? 0)).toFixed(1)}% less maximum drawdown.`);
    }
    const winRateB = resultB.stats.winRate ?? 0;
    const winRateA = resultA.stats.winRate ?? 0;
    if (winRateB > winRateA) {
      recommendations.push(`Higher strike rate: ${winRateB.toFixed(1)}% vs ${winRateA.toFixed(1)}%.`);
    }
  } else if (winner === 'A') {
    summary = `${paramsA.name} (${paramsA.version}) maintains a stronger statistical profile than ${paramsB.name} (${paramsB.version}) with an edge score of ${scoreA} vs ${scoreB} (margin +${margin}).`;
    if ((resultA.stats.maxDrawdown ?? 0) < (resultB.stats.maxDrawdown ?? 0)) {
      recommendations.push(`Superior risk control: Version A experienced lower peak-to-trough drawdown.`);
    }
    const pfA = resultA.stats.profitFactor ?? 0;
    const pfB = resultB.stats.profitFactor ?? 0;
    if (pfA > pfB) {
      recommendations.push(`Higher profitability per dollar risked (Profit Factor ${pfA.toFixed(2)} vs ${pfB.toFixed(2)}).`);
    }
  } else {
    summary = `Both strategy versions produce comparable statistical performance over the simulated ${candles.length} bars.`;
    recommendations.push('Consider testing over a broader sample of bars (e.g. 500+ bars) or different market regimes to establish a clearer statistical separation.');
  }

  return {
    versionA: { config: paramsA, result: resultA },
    versionB: { config: paramsB, result: resultB },
    metrics,
    winner,
    scoreA,
    scoreB,
    summary,
    recommendations,
    comparedAt: new Date().toISOString(),
  };
}

// ─── 5. Conversion Helpers for Database Persistence ──────────────────

/**
 * Converts rich StrategyResearchParameters to StrategyVersionRecord for database storage
 */
export function strategyParamsToVersionRecord(
  params: StrategyResearchParameters,
  isActive = false
): StrategyVersionRecord {
  return {
    version: params.version,
    createdAt: new Date().toISOString(),
    description: `${params.name}: ${params.description}`,
    weights: params.weights,
    parameters: {
      name: params.name,
      ema: params.ema,
      rsi: params.rsi,
      volume: params.volume,
      volatility: params.volatility,
      risk: params.risk,
      takeProfit: params.takeProfit,
      dca: params.dca,
      regimeFilters: params.regimeFilters,
      mtf: params.mtf,
    },
    isActive,
  };
}

/**
 * Reconstructs StrategyResearchParameters from StrategyVersionRecord
 */
export function versionRecordToStrategyParams(
  record: StrategyVersionRecord
): StrategyResearchParameters {
  const p = (record.parameters || {}) as Partial<StrategyResearchParameters>;
  return {
    name: (p.name as string) || `Strategy ${record.version}`,
    version: record.version,
    description: record.description || 'Custom strategy configuration',
    weights: record.weights || DEFAULT_STRATEGY_PARAMS.weights,
    ema: p.ema || DEFAULT_STRATEGY_PARAMS.ema,
    rsi: p.rsi || DEFAULT_STRATEGY_PARAMS.rsi,
    volume: p.volume || DEFAULT_STRATEGY_PARAMS.volume,
    volatility: p.volatility || DEFAULT_STRATEGY_PARAMS.volatility,
    risk: p.risk || DEFAULT_STRATEGY_PARAMS.risk,
    takeProfit: p.takeProfit || DEFAULT_STRATEGY_PARAMS.takeProfit,
    dca: p.dca || DEFAULT_STRATEGY_PARAMS.dca,
    regimeFilters: p.regimeFilters || DEFAULT_STRATEGY_PARAMS.regimeFilters,
    mtf: p.mtf || DEFAULT_STRATEGY_PARAMS.mtf,
  };
}
