// ─── U-SPOT CoinGecko Market Discovery Service ──────────────────────
// Phase 3: Market cap rankings, global crypto volume & discovery
// Free-first architecture (Spec Section 35), rate-limit tolerant

export interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number;
  marketCapUsd: number;
  volume24hUsd: number;
  priceChange24hPercent: number;
}

export interface CoinGeckoGlobal {
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  btcDominancePercent: number;
  activeCryptocurrencies: number;
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// In-memory cache with long TTLs to respect free tier rate limits
let marketsCache: { data: CoinGeckoMarket[]; timestamp: number } | null = null;
let globalCache: { data: CoinGeckoGlobal; timestamp: number } | null = null;

const MARKETS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const GLOBAL_CACHE_TTL = 15 * 60 * 1000;  // 15 minutes

/**
 * Fetch top cryptocurrencies ranked by market capitalization
 */
export async function fetchCoinGeckoMarkets(limit: number = 100): Promise<CoinGeckoMarket[]> {
  if (marketsCache && Date.now() - marketsCache.timestamp < MARKETS_CACHE_TTL) {
    return marketsCache.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(
        100,
        limit
      )}&page=1&sparkline=false`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    );

    clearTimeout(timeout);

    if (res.ok) {
      const raw = await res.json();
      const parsed: CoinGeckoMarket[] = raw.map((c: any) => ({
        id: c.id,
        symbol: String(c.symbol).toUpperCase(),
        name: c.name,
        marketCapRank: c.market_cap_rank ?? 999,
        marketCapUsd: c.market_cap ?? 0,
        volume24hUsd: c.total_volume ?? 0,
        priceChange24hPercent: c.price_change_percentage_24h ?? 0,
      }));

      marketsCache = { data: parsed, timestamp: Date.now() };
      return parsed;
    }

    if (res.status === 429) {
      console.warn('CoinGecko rate limited (429). Using existing cache or fallback.');
    }
  } catch (error) {
    console.warn('Failed to fetch from CoinGecko:', error);
  }

  // Return stale cache if available
  if (marketsCache) return marketsCache.data;

  // Fallback top list
  return [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', marketCapRank: 1, marketCapUsd: 1.6e12, volume24hUsd: 4e10, priceChange24hPercent: 2.1 },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', marketCapRank: 2, marketCapUsd: 3.2e11, volume24hUsd: 2e10, priceChange24hPercent: 1.8 },
    { id: 'binancecoin', symbol: 'BNB', name: 'BNB', marketCapRank: 4, marketCapUsd: 1e11, volume24hUsd: 1.5e9, priceChange24hPercent: 0.9 },
    { id: 'solana', symbol: 'SOL', name: 'Solana', marketCapRank: 5, marketCapUsd: 9.8e10, volume24hUsd: 4e9, priceChange24hPercent: 4.5 },
    { id: 'ripple', symbol: 'XRP', name: 'XRP', marketCapRank: 6, marketCapUsd: 9.5e10, volume24hUsd: 5e9, priceChange24hPercent: 3.2 },
  ];
}

/**
 * Fetch global crypto market overview
 */
export async function fetchCoinGeckoGlobal(): Promise<CoinGeckoGlobal | null> {
  if (globalCache && Date.now() - globalCache.timestamp < GLOBAL_CACHE_TTL) {
    return globalCache.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${COINGECKO_BASE}/global`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()).data;
      const parsed: CoinGeckoGlobal = {
        totalMarketCapUsd: data.total_market_cap?.usd ?? 0,
        totalVolume24hUsd: data.total_volume?.usd ?? 0,
        btcDominancePercent: data.market_cap_percentage?.btc ?? 55,
        activeCryptocurrencies: data.active_cryptocurrencies ?? 10000,
      };

      globalCache = { data: parsed, timestamp: Date.now() };
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to fetch CoinGecko global data:', error);
  }

  return globalCache ? globalCache.data : null;
}

/**
 * Health check for CoinGecko ping and latency
 */
export async function checkCoinGeckoHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${COINGECKO_BASE}/ping`, {
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Date.now() - start;
    return { connected: res.ok, latencyMs };
  } catch {
    return { connected: false, latencyMs: Date.now() - start };
  }
}
