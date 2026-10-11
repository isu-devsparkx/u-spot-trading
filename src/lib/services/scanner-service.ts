// ─── U-SPOT Top-20 Market Scanner & Evaluation Engine ────────────────
// Phase 4: Configurable Multi-Factor Scoring, Market Regime Analysis, Dynamic Top-20
// Spec Section 5 (Top-20 Scanner) & Section 6 (Market Regime Engine) & Section 39

import type {
  MarketPair,
  MarketCandidate,
  MarketRegime,
  Ticker24h,
  ScannerFactors,
  ScannerWeights,
  ScannerPreset,
  ScannerPresetName,
  ScannerFilters,
  MarketRegimeAnalysis,
} from '../../types/index.ts';

/**
 * Standard default factor weights per Spec Section 5:
 * Momentum: 20%, Volume: 20%, Liquidity: 15%, Trend: 15%, Structure: 15%, Volatility: 10%, Catalyst: 5%
 */
export const DEFAULT_SCANNER_WEIGHTS: ScannerWeights = {
  momentum: 20,
  volume: 20,
  liquidity: 15,
  trend: 15,
  structure: 15,
  volatility: 10,
  catalyst: 5,
};

/**
 * Strategy Presets for Backtesting and Live Research (Spec Section 16 & 39)
 */
export const SCANNER_PRESETS: Record<ScannerPresetName, ScannerPreset> = {
  BALANCED: {
    name: 'BALANCED',
    label: 'Default Balanced',
    description: 'Spec Section 5 reference weights balancing momentum, volume surge, and structural depth.',
    weights: {
      momentum: 20,
      volume: 20,
      liquidity: 15,
      trend: 15,
      structure: 15,
      volatility: 10,
      catalyst: 5,
    },
  },
  MOMENTUM_CHASER: {
    name: 'MOMENTUM_CHASER',
    label: 'Momentum Chaser',
    description: 'Heavily weights 24h price expansion and trend velocity for aggressive breakout runners.',
    weights: {
      momentum: 40,
      volume: 25,
      liquidity: 5,
      trend: 15,
      structure: 10,
      volatility: 5,
      catalyst: 0,
    },
  },
  VOLUME_BREAKOUT: {
    name: 'VOLUME_BREAKOUT',
    label: 'Volume Breakout',
    description: 'Focuses on abnormal volume accumulation and volatility expansion above range resistance.',
    weights: {
      momentum: 15,
      volume: 45,
      liquidity: 10,
      trend: 10,
      structure: 15,
      volatility: 5,
      catalyst: 0,
    },
  },
  HIGH_LIQUIDITY: {
    name: 'HIGH_LIQUIDITY',
    label: 'High Liquidity Safety',
    description: 'Prioritizes tight spreads and deep order books to minimize execution slippage on large spot sizes.',
    weights: {
      momentum: 10,
      volume: 15,
      liquidity: 35,
      trend: 15,
      structure: 15,
      volatility: 10,
      catalyst: 0,
    },
  },
  MEAN_REVERSION: {
    name: 'MEAN_REVERSION',
    label: 'Mean Reversion / Value',
    description: 'Looks for stable high-liquidity coins with range pullbacks and favorable support structure.',
    weights: {
      momentum: 5,
      volume: 15,
      liquidity: 25,
      trend: 10,
      structure: 20,
      volatility: 25,
      catalyst: 0,
    },
  },
  CUSTOM: {
    name: 'CUSTOM',
    label: 'Custom Weights',
    description: 'User-configured factor weighting for custom hypothesis testing.',
    weights: { ...DEFAULT_SCANNER_WEIGHTS },
  },
};

/**
 * Normalizes any custom factor weights to guarantee they sum to 100%
 */
export function normalizeWeights(weights: Partial<ScannerWeights>): ScannerWeights {
  const merged: ScannerWeights = {
    momentum: Math.max(0, weights.momentum ?? DEFAULT_SCANNER_WEIGHTS.momentum),
    volume: Math.max(0, weights.volume ?? DEFAULT_SCANNER_WEIGHTS.volume),
    liquidity: Math.max(0, weights.liquidity ?? DEFAULT_SCANNER_WEIGHTS.liquidity),
    trend: Math.max(0, weights.trend ?? DEFAULT_SCANNER_WEIGHTS.trend),
    structure: Math.max(0, weights.structure ?? DEFAULT_SCANNER_WEIGHTS.structure),
    volatility: Math.max(0, weights.volatility ?? DEFAULT_SCANNER_WEIGHTS.volatility),
    catalyst: Math.max(0, weights.catalyst ?? DEFAULT_SCANNER_WEIGHTS.catalyst),
  };

  const total =
    merged.momentum +
    merged.volume +
    merged.liquidity +
    merged.trend +
    merged.structure +
    merged.volatility +
    merged.catalyst;

  if (total === 0) return { ...DEFAULT_SCANNER_WEIGHTS };
  if (total === 100) return merged;

  // Scale proportionally to sum to 100
  const factor = 100 / total;
  const scaled: ScannerWeights = {
    momentum: Math.round(merged.momentum * factor),
    volume: Math.round(merged.volume * factor),
    liquidity: Math.round(merged.liquidity * factor),
    trend: Math.round(merged.trend * factor),
    structure: Math.round(merged.structure * factor),
    volatility: Math.round(merged.volatility * factor),
    catalyst: 0,
  };

  const subTotal =
    scaled.momentum +
    scaled.volume +
    scaled.liquidity +
    scaled.trend +
    scaled.structure +
    scaled.volatility;

  scaled.catalyst = Math.max(0, 100 - subTotal);
  return scaled;
}

/**
 * Spec Section 6: Comprehensive Market Regime Engine
 * Evaluates BTC, ETH, market breadth, volatility, and volume
 */
export function evaluateMarketRegime(tickers: Ticker24h[]): MarketRegimeAnalysis {
  const btc = tickers.find((t) => t.symbol === 'BTCUSDT');
  const eth = tickers.find((t) => t.symbol === 'ETHUSDT');

  const btcChange = btc ? btc.priceChangePercent : 0;
  const ethChange = eth ? eth.priceChangePercent : 0;
  const avgMajorChange = (btcChange + ethChange) / 2;

  // Market breadth: % of tickers with positive 24h change
  const positiveCoins = tickers.filter((t) => t.priceChangePercent > 0).length;
  const breadthPercent =
    tickers.length > 0 ? Math.round((positiveCoins / tickers.length) * 100) : 50;

  // Total 24h volume
  const totalVolume = tickers.reduce((acc, t) => acc + (t.quoteVolume || 0), 0);

  // Average universe gain
  const totalGain = tickers.reduce((acc, t) => acc + (t.priceChangePercent || 0), 0);
  const avgUniverseGain =
    tickers.length > 0 ? Math.round((totalGain / tickers.length) * 100) / 100 : 0;

  // Classify Regime
  let regime: MarketRegime = 'NEUTRAL';
  let description = '';
  let tradingGuidance = '';
  let scoreThresholdAdjustment = 0;

  if (Math.abs(btcChange) > 7.0 || Math.abs(ethChange) > 8.0) {
    regime = 'HIGH_VOLATILITY';
    description = `Extreme major volatility (BTC: ${btcChange > 0 ? '+' : ''}${btcChange.toFixed(1)}%, ETH: ${ethChange > 0 ? '+' : ''}${ethChange.toFixed(1)}%). Elevated macro whipsaw risk.`;
    tradingGuidance = 'Widen invalidation distances, reduce position tranche size, require A+ candidate setups only.';
    scoreThresholdAdjustment = 8; // Stricter candidate score required
  } else if (tickers.length > 20 && totalVolume < 100_000_000) {
    regime = 'LOW_LIQUIDITY';
    description = `Market-wide 24h volume is severely compressed ($${Math.round(totalVolume / 1_000_000)}M). Slippage danger on altcoins.`;
    tradingGuidance = 'Avoid small-cap altcoins, focus only on Tier-1 liquidity pairs with spread < 0.05%.';
    scoreThresholdAdjustment = 10;
  } else if (avgMajorChange >= 1.5 && breadthPercent >= 55) {
    regime = 'BULL';
    description = `Broad bullish expansion (Majors avg: +${avgMajorChange.toFixed(1)}%, Breadth: ${breadthPercent}% green). Trend continuation favorable.`;
    tradingGuidance = 'Favor momentum breakouts and pullback continuations into key 15M/1H support levels.';
    scoreThresholdAdjustment = -3; // More permissive for setups
  } else if (avgMajorChange <= -1.8 && breadthPercent <= 40) {
    regime = 'BEAR';
    description = `Pervasive market weakness (Majors avg: ${avgMajorChange.toFixed(1)}%, Breadth: ${breadthPercent}% green). Downside pressure dominates.`;
    tradingGuidance = 'Strict risk conservation. Require tight invalidation and avoid chasing sudden altcoin spikes.';
    scoreThresholdAdjustment = 6;
  } else {
    regime = 'NEUTRAL';
    description = `Range-bound consolidation (Majors avg: ${avgMajorChange > 0 ? '+' : ''}${avgMajorChange.toFixed(1)}%, Breadth: ${breadthPercent}% green). Sector rotation active.`;
    tradingGuidance = 'Trade structural range bounds with defined support reactions. Do not chase breakouts.';
    scoreThresholdAdjustment = 0;
  }

  return {
    regime,
    btcChange24h: Math.round(btcChange * 100) / 100,
    ethChange24h: Math.round(ethChange * 100) / 100,
    marketBreadthPositivePercent: breadthPercent,
    averageUniverseGainPercent: avgUniverseGain,
    totalTrackedVolumeUsdt: Math.round(totalVolume),
    description,
    tradingGuidance,
    scoreThresholdAdjustment,
  };
}

/**
 * Calculates each of the 7 quantitative scoring factors for a market pair (0-100 each)
 * Spec Section 5
 */
export function calculateCandidateFactors(
  pair: MarketPair,
  medianVolume: number,
  btcChange: number
): {
  factors: ScannerFactors;
  rawMetrics: {
    spreadPercent: number;
    high24h: number;
    low24h: number;
    dailyRangePercent: number;
    trades24h: number;
    relativeStrengthBtc: number;
  };
} {
  const price = pair.price;
  const high = Math.max(pair.high24h, price);
  const low = Math.min(pair.low24h, price);
  const spreadPercent = pair.spreadPercent;
  const change24h = pair.change24h;
  const volume24h = pair.volume24h;
  const trades24h = pair.trades24h;

  const range = high - low;
  const dailyRangePercent = low > 0 ? ((high - low) / low) * 100 : 0;
  const relativeStrengthBtc = Math.round((change24h - btcChange) * 10) / 10;
  const volumeRatio = medianVolume > 0 ? Math.round((volume24h / medianVolume) * 10) / 10 : 1.0;

  // 1. Momentum Factor (0-100)
  // Evaluates price expansion, positive directional velocity, and BTC outperformance
  let momentum = 50;
  if (change24h >= 15) momentum = 95;
  else if (change24h >= 8) momentum = 85;
  else if (change24h >= 4) momentum = 75;
  else if (change24h >= 1.5) momentum = 65;
  else if (change24h >= 0) momentum = 55;
  else if (change24h >= -4) momentum = 40;
  else momentum = 25;

  // Bonus for strong relative strength over BTC
  if (relativeStrengthBtc > 5.0) momentum = Math.min(99, momentum + 6);
  else if (relativeStrengthBtc < -5.0) momentum = Math.max(10, momentum - 6);

  // 2. Volume Factor (0-100)
  // Evaluates abnormal volume expansion above universe median & trade count density
  let volume = 50;
  if (volumeRatio >= 4.0) volume = 96;
  else if (volumeRatio >= 2.5) volume = 88;
  else if (volumeRatio >= 1.5) volume = 76;
  else if (volumeRatio >= 1.0) volume = 60;
  else if (volumeRatio >= 0.6) volume = 45;
  else volume = 30;

  // High trade count indicates liquid retail and algorithmic activity
  if (trades24h >= 100_000) volume = Math.min(99, volume + 4);
  else if (trades24h < 5_000) volume = Math.max(15, volume - 6);

  // 3. Liquidity Factor (0-100)
  // Preserves existing liquidityScore with spread penalties
  let liquidity = pair.liquidityScore;
  if (spreadPercent <= 0.02) liquidity = Math.min(99, liquidity + 5);
  else if (spreadPercent > 0.15) liquidity = Math.max(15, liquidity - 12);

  // 4. Trend Factor (0-100)
  // Evaluates where price is closing within its 24h range (Upper quartile indicates trend continuation)
  let trend = 50;
  if (range > 0) {
    const rangePositionPercent = ((price - low) / range) * 100;
    if (rangePositionPercent >= 85) trend = 92;
    else if (rangePositionPercent >= 70) trend = 80;
    else if (rangePositionPercent >= 50) trend = 62;
    else if (rangePositionPercent >= 30) trend = 45;
    else trend = 28;
  }
  // Coherence with 24h change
  if (change24h > 2 && trend > 60) trend = Math.min(99, trend + 5);

  // 5. Structure Factor (0-100)
  // Evaluates consolidation tightness and breakout potential (proximity to 24h high with room from low)
  let structure = 50;
  if (high > 0) {
    const distanceToHigh = ((high - price) / high) * 100;
    if (distanceToHigh <= 1.5) {
      // Near 24h high: potential breakout or resistance test
      structure = 88;
    } else if (distanceToHigh <= 4.0) {
      structure = 78;
    } else if (distanceToHigh <= 8.0) {
      structure = 65;
    } else {
      structure = 45;
    }
  }

  // 6. Volatility Factor (0-100)
  // Healthy volatility for spot setups is 4% to 14%. Too narrow (<2%) lacks upside; too wild (>30%) has severe slippage risk.
  let volatility = 50;
  if (dailyRangePercent >= 4.0 && dailyRangePercent <= 12.0) {
    volatility = 90; // Optimal spot trading volatility
  } else if (dailyRangePercent > 12.0 && dailyRangePercent <= 20.0) {
    volatility = 78;
  } else if (dailyRangePercent >= 2.0 && dailyRangePercent < 4.0) {
    volatility = 60;
  } else if (dailyRangePercent > 20.0) {
    volatility = 52; // Extreme volatility penalty
  } else {
    volatility = 35; // Dead range
  }

  // 7. Catalyst / Discovery Factor (0-100)
  // Market cap rank from CoinGecko + volume acceleration divergence
  let catalyst = 50;
  if (pair.marketCapRank && pair.marketCapRank <= 25) {
    catalyst = 75; // Major bluechip catalyst liquidity
  } else if (pair.marketCapRank && pair.marketCapRank <= 100) {
    catalyst = 65;
  } else if (volumeRatio >= 3.0 && change24h < 4.0) {
    // Stealth volume buildup before price ignition
    catalyst = 85;
  } else if (volumeRatio >= 2.0) {
    catalyst = 70;
  }

  return {
    factors: {
      momentum,
      volume,
      liquidity,
      trend,
      structure,
      volatility,
      catalyst,
    },
    rawMetrics: {
      spreadPercent,
      high24h: high,
      low24h: low,
      dailyRangePercent: Math.round(dailyRangePercent * 100) / 100,
      trades24h,
      relativeStrengthBtc,
    },
  };
}

/**
 * Computes composite candidate score given factors and weights
 */
export function computeCompositeScore(
  factors: ScannerFactors,
  weights: ScannerWeights
): number {
  const normWeights = normalizeWeights(weights);

  const weightedSum =
    factors.momentum * (normWeights.momentum / 100) +
    factors.volume * (normWeights.volume / 100) +
    factors.liquidity * (normWeights.liquidity / 100) +
    factors.trend * (normWeights.trend / 100) +
    factors.structure * (normWeights.structure / 100) +
    factors.volatility * (normWeights.volatility / 100) +
    factors.catalyst * (normWeights.catalyst / 100);

  return Math.max(1, Math.min(99, Math.round(weightedSum)));
}

/**
 * Generates an explainable reason for candidate selection per Spec Section 5 & 36
 */
export function generateExplainableReason(
  candidate: {
    symbol: string;
    change24h: number;
    volumeRatio: number;
    liquidity: number;
    factors: ScannerFactors;
    rawMetrics: {
      spreadPercent: number;
      dailyRangePercent: number;
      relativeStrengthBtc: number;
    };
  }
): string {
  const { change24h, volumeRatio, liquidity, factors, rawMetrics } = candidate;

  if (factors.volume >= 85 && factors.structure >= 80) {
    return `Abnormal volume breakout (${volumeRatio.toFixed(1)}x) testing 24h highs with tight ${rawMetrics.spreadPercent}% spread`;
  }
  if (rawMetrics.relativeStrengthBtc >= 5.0 && factors.momentum >= 75) {
    return `Strong relative momentum (+${rawMetrics.relativeStrengthBtc}% vs BTC) with positive trend alignment`;
  }
  if (factors.volatility >= 85 && volumeRatio >= 1.5) {
    return `Optimal volatility expansion (${rawMetrics.dailyRangePercent.toFixed(1)}% range) with active volume accumulation`;
  }
  if (liquidity >= 90 && change24h > 1.0) {
    return `Tier-1 liquidity benchmark (${liquidity}/100) with stable order book support continuation`;
  }
  if (change24h > 5.0) {
    return `Bullish price momentum (+${change24h}%) backed by solid spot liquidity`;
  }
  return `Liquid spot trading pair with balanced multi-factor scoring (${factors.liquidity} Liq / ${factors.volume} Vol)`;
}

/**
 * Main Scanner Execution Engine
 * Evaluates the market universe, applies configurable weights and filters, and ranks Top candidates
 */
export function scanMarketUniverse(
  pairs: MarketPair[],
  tickers: Ticker24h[],
  options?: {
    weights?: Partial<ScannerWeights>;
    filters?: ScannerFilters;
  }
): {
  candidates: MarketCandidate[];
  allScoredCount: number;
  regimeAnalysis: MarketRegimeAnalysis;
  appliedWeights: ScannerWeights;
  activeFilters: ScannerFilters;
} {
  const weights = normalizeWeights(options?.weights || DEFAULT_SCANNER_WEIGHTS);
  const filters: ScannerFilters = {
    minVolumeUsdt: options?.filters?.minVolumeUsdt ?? 500_000,
    maxSpreadPercent: options?.filters?.maxSpreadPercent ?? 0.5,
    minLiquidityScore: options?.filters?.minLiquidityScore ?? 40,
    regimeFilter: options?.filters?.regimeFilter ?? 'ALL',
    searchQuery: options?.filters?.searchQuery?.trim().toLowerCase() ?? '',
    limit: options?.filters?.limit ?? 20,
  };

  // 1. Evaluate Market Regime
  const regimeAnalysis = evaluateMarketRegime(tickers);

  // 2. Compute median universe volume
  const volumes = pairs.map((p) => p.volume24h).filter((v) => v > 0).sort((a, b) => a - b);
  const medianVolume = volumes.length > 0 ? volumes[Math.floor(volumes.length / 2)] : 1_000_000;

  // 3. Filter and score all pairs
  const scoredList: MarketCandidate[] = [];

  for (const pair of pairs) {
    // Filter criteria
    if (filters.minVolumeUsdt && pair.volume24h < filters.minVolumeUsdt) continue;
    if (filters.maxSpreadPercent && pair.spreadPercent > filters.maxSpreadPercent) continue;
    if (filters.minLiquidityScore && pair.liquidityScore < filters.minLiquidityScore) continue;

    if (filters.searchQuery) {
      const matchSymbol = pair.symbol.toLowerCase().includes(filters.searchQuery);
      const matchName = pair.name.toLowerCase().includes(filters.searchQuery);
      if (!matchSymbol && !matchName) continue;
    }

    // Quantitative factor evaluation
    const { factors, rawMetrics } = calculateCandidateFactors(
      pair,
      medianVolume,
      regimeAnalysis.btcChange24h
    );

    // Composite multi-factor score
    const candidateScore = computeCompositeScore(factors, weights);
    const volumeRatio = medianVolume > 0 ? Math.round((pair.volume24h / medianVolume) * 10) / 10 : 1.0;

    const reasonSelected = generateExplainableReason({
      symbol: pair.symbol,
      change24h: pair.change24h,
      volumeRatio,
      liquidity: pair.liquidityScore,
      factors,
      rawMetrics,
    });

    scoredList.push({
      symbol: pair.symbol,
      name: pair.name,
      price: pair.price,
      change24h: pair.change24h,
      volume24h: pair.volume24h,
      volumeRatio,
      liquidity: pair.liquidityScore,
      candidateScore,
      marketRegime: regimeAnalysis.regime,
      reasonSelected,
      factors,
      rawMetrics,
    });
  }

  // 4. Sort descending by candidate score
  scoredList.sort((a, b) => b.candidateScore - a.candidateScore);

  // 5. Apply regime-specific filters if selected
  let filteredList = scoredList;
  if (filters.regimeFilter && filters.regimeFilter !== 'ALL') {
    // Filtering by specific regime setup characteristics
    if (filters.regimeFilter === 'BULL') {
      filteredList = scoredList.filter((c) => c.change24h > 0 && (c.factors?.momentum ?? 0) >= 60);
    } else if (filters.regimeFilter === 'HIGH_VOLATILITY') {
      filteredList = scoredList.filter((c) => (c.rawMetrics?.dailyRangePercent ?? 0) >= 8.0);
    } else if (filters.regimeFilter === 'LOW_LIQUIDITY') {
      filteredList = scoredList.filter((c) => c.liquidity < 65);
    } else if (filters.regimeFilter === 'BEAR') {
      filteredList = scoredList.filter((c) => c.change24h < 0);
    } else if (filters.regimeFilter === 'NEUTRAL') {
      filteredList = scoredList.filter((c) => Math.abs(c.change24h) <= 3.0);
    }
  }

  // 6. Assign ranks and limit to Top N
  const topCandidates = filteredList.slice(0, filters.limit || 20).map((c, idx) => ({
    ...c,
    rank: idx + 1,
  }));

  return {
    candidates: topCandidates,
    allScoredCount: scoredList.length,
    regimeAnalysis,
    appliedWeights: weights,
    activeFilters: filters,
  };
}
