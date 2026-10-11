// ─── U-SPOT Technical Analysis Engine Orchestrator ──────────────────
// Phase 5: Complete multi-module technical analysis suite
// Spec Section 8 (Strategy Modules: 8.1 Trend, 8.2 Momentum, 8.3 Volume, 8.4 Volatility, 8.5 Structure, 8.6 Liquidity)

import type {
  OHLCV,
  OrderBook,
  Timeframe,
  TechnicalAnalysisResult,
} from '../../types/index.ts';

import { analyzeTrend, calculateEMASeries, calculateLatestEMA } from './trend.ts';
import { analyzeMomentum, calculateRSISeries, calculateMACD } from './momentum.ts';
import { analyzeVolume } from './volume.ts';
import { analyzeVolatility, calculateATR } from './volatility.ts';
import { analyzeStructure, findSwingPivots } from './structure.ts';
import { analyzeLiquidityFlow, calculateVolumeDeltaProxy, findOrderBookWalls } from './liquidity-flow.ts';
import { compressKlines, analyzeTimeframeTrend, evaluateMultiTimeframeConfluence } from './multi-timeframe.ts';

// Re-export all sub-modules for independent testing and usage
export {
  analyzeTrend,
  calculateEMASeries,
  calculateLatestEMA,
  analyzeMomentum,
  calculateRSISeries,
  calculateMACD,
  analyzeVolume,
  analyzeVolatility,
  calculateATR,
  analyzeStructure,
  findSwingPivots,
  analyzeLiquidityFlow,
  calculateVolumeDeltaProxy,
  findOrderBookWalls,
  compressKlines,
  analyzeTimeframeTrend,
  evaluateMultiTimeframeConfluence,
};

/**
 * Runs complete multi-module technical analysis on a series of OHLCV candles
 * Spec Section 8: Each module produces structured results
 */
export function runTechnicalAnalysis(
  symbol: string,
  klines: OHLCV[],
  timeframe: Timeframe = '15m',
  orderBook: OrderBook | null = null
): TechnicalAnalysisResult {
  const currentPrice =
    klines.length > 0 ? klines[klines.length - 1].close : 0;
  const timestamp =
    klines.length > 0 ? klines[klines.length - 1].timestamp : Date.now();

  // 1. Run each independent module
  const trend = analyzeTrend(klines);
  const momentum = analyzeMomentum(klines);
  const volume = analyzeVolume(klines);
  const volatility = analyzeVolatility(klines);
  const structure = analyzeStructure(klines);
  const liquidity = analyzeLiquidityFlow(orderBook, klines);

  // 2. Weighted composite technical score
  // Trend (25%) + Structure (25%) + Momentum (20%) + Volume (15%) + Volatility (10%) + Liquidity (5%)
  const compositeScore = Math.max(
    1,
    Math.min(
      99,
      Math.round(
        trend.score * 0.25 +
        structure.score * 0.25 +
        momentum.score * 0.20 +
        volume.score * 0.15 +
        volatility.score * 0.10 +
        liquidity.score * 0.05
      )
    )
  );

  // 3. Overall directional bias
  let overallBias: TechnicalAnalysisResult['overallBias'] = 'NEUTRAL';
  if (compositeScore >= 68 && trend.direction === 'BULLISH') {
    overallBias = 'BULLISH';
  } else if (compositeScore <= 38 || trend.direction === 'BEARISH') {
    overallBias = 'BEARISH';
  } else {
    overallBias = 'NEUTRAL';
  }

  // 4. Synthesize explainable technical summary
  const summaryParts: string[] = [];

  if (structure.changeOfCharacter.detected) {
    summaryParts.push(structure.description);
  } else if (structure.breakOfStructure.detected) {
    summaryParts.push(structure.description);
  } else if (structure.liquiditySweep.detected) {
    summaryParts.push(structure.description);
  } else {
    summaryParts.push(trend.description);
  }

  if (momentum.divergence !== 'NONE') {
    summaryParts.push(momentum.description);
  } else if (momentum.macd.cross !== 'NONE') {
    summaryParts.push(momentum.description);
  }

  if (volume.isVolumeSpike) {
    summaryParts.push(volume.description);
  }

  const summary =
    summaryParts.length > 0
      ? summaryParts.join(' — ')
      : `${trend.description}. RSI at ${momentum.rsi} with ${volatility.volatilityRegime.toLowerCase()} volatility.`;

  return {
    symbol,
    timeframe,
    timestamp,
    currentPrice,
    trend,
    momentum,
    volume,
    volatility,
    structure,
    liquidity,
    compositeTechnicalScore: compositeScore,
    overallBias,
    summary,
  };
}
