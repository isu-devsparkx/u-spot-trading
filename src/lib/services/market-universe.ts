// ─── U-SPOT Market Universe & Discovery Engine ──────────────────────
// Phase 3: Blends Binance spot data with CoinGecko discovery
// Spec Section 4 (Market Universe) & Section 5 (Top-20 Scanner)

import type {
  MarketPair,
  MarketCandidate,
  MarketUniverseSummary,
  MarketRegime,
  Ticker24h,
} from '../../types/index.ts';
import {
  fetchAllTickers24h,
  toDisplaySymbol,
  STABLECOINS,
} from './binance-service.ts';
import {
  fetchCoinGeckoMarkets,
  fetchCoinGeckoGlobal,
  type CoinGeckoMarket,
} from './coingecko-service.ts';
import {
  scanMarketUniverse,
  evaluateMarketRegime,
} from './scanner-service.ts';

/** Cache for market universe */
let universeCache: {
  summary: MarketUniverseSummary;
  pairs: MarketPair[];
  candidates: MarketCandidate[];
  timestamp: number;
} | null = null;

const UNIVERSE_CACHE_TTL = 15 * 1000; // 15 seconds

/**
 * Determine broader market regime from BTC & ETH price action
 * Spec Section 6: Bull, Neutral, Bear, High Volatility, Low Liquidity
 */
export function determineMarketRegime(tickers: Ticker24h[]): MarketRegime {
  return evaluateMarketRegime(tickers).regime;
}

/**
 * Build the active trading universe and Top 20 Candidates
 */
export async function getMarketUniverse(forceRefresh: boolean = false): Promise<{
  summary: MarketUniverseSummary;
  pairs: MarketPair[];
  candidates: MarketCandidate[];
}> {
  if (
    !forceRefresh &&
    universeCache &&
    Date.now() - universeCache.timestamp < UNIVERSE_CACHE_TTL
  ) {
    return universeCache;
  }

  // 1. Fetch live 24h tickers from Binance
  let tickers: Ticker24h[] = [];
  let source: MarketUniverseSummary['source'] = 'binance';

  try {
    tickers = await fetchAllTickers24h();
  } catch (error) {
    console.warn('Failed to fetch Binance tickers for universe, using fallback:', error);
    source = 'fallback';
  }

  // 2. Fetch CoinGecko market cap rankings
  let geckoMarkets: CoinGeckoMarket[] = [];
  try {
    geckoMarkets = await fetchCoinGeckoMarkets(100);
    if (source === 'binance' && geckoMarkets.length > 0) {
      source = 'hybrid';
    }
  } catch {
    // Non-fatal if CoinGecko is unreachable
  }

  const geckoMap = new Map<string, CoinGeckoMarket>();
  for (const gm of geckoMarkets) {
    geckoMap.set(gm.symbol, gm);
  }

  // 3. Filter pairs per Spec Section 4
  // - available spot market
  // - minimum 24h volume ($500k USDT)
  // - acceptable spread (<= 0.5%)
  // - excludes stablecoins
  const filteredPairs: MarketPair[] = [];
  let totalVolume24hUsdt = 0;

  for (const t of tickers) {
    if (STABLECOINS.has(t.baseAsset)) continue;
    if (t.quoteVolume < 500_000) continue; // Minimum $500k volume
    if (t.spreadPercent > 0.5) continue;   // Avoid illiquid wide spreads

    totalVolume24hUsdt += t.quoteVolume;

    // Calculate liquidity score (0-100)
    let liquidityScore = 50;
    if (t.quoteVolume >= 50_000_000) liquidityScore += 30;
    else if (t.quoteVolume >= 10_000_000) liquidityScore += 20;
    else if (t.quoteVolume >= 2_000_000) liquidityScore += 10;

    if (t.spreadPercent <= 0.03) liquidityScore += 20;
    else if (t.spreadPercent <= 0.08) liquidityScore += 10;
    else if (t.spreadPercent > 0.2) liquidityScore -= 15;

    liquidityScore = Math.max(10, Math.min(99, Math.round(liquidityScore)));

    const gecko = geckoMap.get(t.baseAsset);

    filteredPairs.push({
      symbol: toDisplaySymbol(t.symbol),
      rawSymbol: t.symbol,
      name: gecko ? gecko.name : t.baseAsset,
      baseAsset: t.baseAsset,
      quoteAsset: 'USDT',
      price: t.price,
      change24h: Math.round(t.priceChangePercent * 100) / 100,
      high24h: t.highPrice,
      low24h: t.lowPrice,
      volume24h: Math.round(t.quoteVolume),
      trades24h: t.count,
      spreadPercent: t.spreadPercent,
      liquidityScore,
      marketCapRank: gecko?.marketCapRank,
      status: 'DATA_AVAILABLE',
      lastUpdated: t.timestamp,
    });
  }

  // 4. Calculate market-wide volume benchmark for volume ratio
  const volumes = filteredPairs.map((p) => p.volume24h).sort((a, b) => a - b);
  const medianVolume = volumes.length > 0 ? volumes[Math.floor(volumes.length / 2)] : 1_000_000;

  // 5. Score candidates per Spec Section 5
  // Score = Momentum (20%) + Volume (20%) + Liquidity (15%) + Trend (15%) + Structure (15%) + Volatility (10%) + Discovery (5%)
  const marketRegime = determineMarketRegime(tickers);

  // 5. Score candidates per Spec Section 5 using multi-factor scanner engine
  const scanResult = scanMarketUniverse(filteredPairs, tickers, {
    filters: { limit: 20 },
  });
  const top20 = scanResult.candidates;

  const summary: MarketUniverseSummary = {
    totalTracked: filteredPairs.length,
    activeSpotPairs: tickers.length,
    totalVolume24hUsdt: Math.round(totalVolume24hUsdt),
    lastUpdated: Date.now(),
    source,
  };

  const result = {
    summary,
    pairs: filteredPairs,
    candidates: top20,
    timestamp: Date.now(),
  };

  universeCache = result;
  return result;
}
