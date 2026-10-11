// ─── U-SPOT Binance Market Data Service ──────────────────────────────
// Phase 3: Live market data from Binance public REST endpoints
// Free-first architecture (Spec Section 35), Error handling (Spec Section 42)

import type {
  OHLCV,
  OrderBook,
  OrderBookEntry,
  Ticker24h,
  Timeframe,
  MarketDataStatus,
} from '../../types/index.ts';

/** Primary and fallback public Binance REST endpoints */
const BINANCE_BASE_URLS = [
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
  'https://data-api.binance.vision/api/v3',
];

/** Stablecoins and fiat-pegged tokens to filter out from trading signals */
export const STABLECOINS = new Set([
  'USDT',
  'USDC',
  'FDUSD',
  'TUSD',
  'BUSD',
  'DAI',
  'USDD',
  'EUR',
  'GBP',
  'TRY',
  'USDP',
  'AEUR',
  'WBTC', // Wrapped assets usually excluded from spot momentum setups
  'WBETH',
]);

/** Leveraged tokens to filter out per Spec Section 2 */
const LEVERAGED_SUFFIXES = ['UP', 'DOWN', 'BULL', 'BEAR'];

/** In-memory cache store */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getFromCache<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setInCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/** Format symbol to raw Binance format e.g. "SOL/USDT" -> "SOLUSDT" */
export function toRawSymbol(symbol: string): string {
  return symbol.replace('/', '').toUpperCase();
}

/** Format raw Binance symbol to display format e.g. "SOLUSDT" -> "SOL/USDT" */
export function toDisplaySymbol(rawSymbol: string): string {
  if (!rawSymbol) return '';
  if (rawSymbol.includes('/')) {
    return rawSymbol.toUpperCase();
  }
  if (rawSymbol.endsWith('USDT')) {
    const base = rawSymbol.slice(0, -4);
    return `${base}/USDT`;
  }
  return rawSymbol;
}

/** Extract base asset from USDT pair */
export function getBaseAsset(rawSymbol: string): string {
  if (rawSymbol.endsWith('USDT')) {
    return rawSymbol.slice(0, -4);
  }
  return rawSymbol;
}

/** Resilient fetch with fallback endpoints and timeout */
async function fetchWithFallback<T>(path: string, timeoutMs: number = 8000): Promise<T> {
  let lastError: Error | null = null;

  for (const baseUrl of BINANCE_BASE_URLS) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'U-SPOT-Research-Platform/1.0',
        },
      });

      clearTimeout(id);

      if (res.ok) {
        return (await res.json()) as T;
      }
      if (res.status === 429 || res.status === 418) {
        throw new Error(`Binance Rate Limited (${res.status})`);
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('All Binance endpoints failed');
}

/** Raw Binance 24hr Ticker response shape */
interface RawBinanceTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

/** Raw Binance ExchangeInfo Symbol shape */
interface RawExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed: boolean;
  permissions?: string[];
}

interface RawExchangeInfo {
  symbols: RawExchangeSymbol[];
}

/**
 * Fetch all verified spot trading symbols trading against USDT
 */
export async function fetchSpotSymbols(): Promise<string[]> {
  const cacheKey = 'binance_spot_symbols';
  const cached = getFromCache<string[]>(cacheKey, 60 * 60 * 1000); // 1 hour TTL
  if (cached) return cached;

  try {
    const info = await fetchWithFallback<RawExchangeInfo>('/exchangeInfo');
    const validSymbols = info.symbols
      .filter((s) => {
        if (s.quoteAsset !== 'USDT') return false;
        if (s.status !== 'TRADING') return false;
        if (s.isSpotTradingAllowed === false) return false;
        if (STABLECOINS.has(s.baseAsset)) return false;
        if (LEVERAGED_SUFFIXES.some((suf) => s.baseAsset.endsWith(suf))) return false;
        return true;
      })
      .map((s) => s.symbol);

    setInCache(cacheKey, validSymbols);
    return validSymbols;
  } catch (error) {
    console.error('Failed to fetch Binance exchangeInfo, using fallback symbols:', error);
    // Fallback top liquid pairs
    return [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'XRPUSDT',
      'BNBUSDT',
      'DOGEUSDT',
      'ADAUSDT',
      'AVAXUSDT',
      'SUIUSDT',
      'LINKUSDT',
      'NEARUSDT',
      'APTUSDT',
      'DOTUSDT',
      'RENDERUSDT',
      'INJUSDT',
      'FETUSDT',
      'AAVEUSDT',
      'TIAUSDT',
      'SEIUSDT',
      'ATOMUSDT',
    ];
  }
}

/**
 * Fetch 24-hour ticker statistics for all pairs
 */
export async function fetchAllTickers24h(): Promise<Ticker24h[]> {
  const cacheKey = 'binance_all_tickers_24h';
  const cached = getFromCache<Ticker24h[]>(cacheKey, 10 * 1000); // 10s TTL
  if (cached) return cached;

  try {
    const rawTickers = await fetchWithFallback<RawBinanceTicker[]>('/ticker/24hr');
    const validSpotSet = new Set(await fetchSpotSymbols());

    const tickers: Ticker24h[] = [];

    for (const raw of rawTickers) {
      if (!raw.symbol.endsWith('USDT')) continue;
      if (validSpotSet.size > 0 && !validSpotSet.has(raw.symbol)) continue;

      const lastPrice = parseFloat(raw.lastPrice) || 0;
      const bidPrice = parseFloat(raw.bidPrice) || 0;
      const askPrice = parseFloat(raw.askPrice) || 0;
      const quoteVolume = parseFloat(raw.quoteVolume) || 0;

      // Filter out dust volume (< 100,000 USDT in 24h)
      if (quoteVolume < 100_000 || lastPrice <= 0) continue;

      const spreadPercent =
        askPrice > 0 && bidPrice > 0
          ? ((askPrice - bidPrice) / askPrice) * 100
          : 0;

      tickers.push({
        symbol: raw.symbol,
        baseAsset: getBaseAsset(raw.symbol),
        quoteAsset: 'USDT',
        price: lastPrice,
        priceChange: parseFloat(raw.priceChange) || 0,
        priceChangePercent: parseFloat(raw.priceChangePercent) || 0,
        highPrice: parseFloat(raw.highPrice) || 0,
        lowPrice: parseFloat(raw.lowPrice) || 0,
        volume: parseFloat(raw.volume) || 0,
        quoteVolume,
        bidPrice,
        askPrice,
        spreadPercent: Math.round(spreadPercent * 1000) / 1000,
        count: raw.count,
        timestamp: raw.closeTime || Date.now(),
      });
    }

    setInCache(cacheKey, tickers);
    return tickers;
  } catch (error) {
    console.error('Failed to fetch 24h tickers:', error);
    throw error;
  }
}

/**
 * Fetch 24-hour ticker statistics for a single symbol
 */
export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const rawSymbol = toRawSymbol(symbol);
  const cacheKey = `binance_ticker_${rawSymbol}`;
  const cached = getFromCache<Ticker24h>(cacheKey, 5 * 1000); // 5s TTL
  if (cached) return cached;

  const raw = await fetchWithFallback<RawBinanceTicker>(`/ticker/24hr?symbol=${rawSymbol}`);

  const lastPrice = parseFloat(raw.lastPrice) || 0;
  const bidPrice = parseFloat(raw.bidPrice) || 0;
  const askPrice = parseFloat(raw.askPrice) || 0;
  const spreadPercent =
    askPrice > 0 && bidPrice > 0
      ? ((askPrice - bidPrice) / askPrice) * 100
      : 0;

  const ticker: Ticker24h = {
    symbol: raw.symbol,
    baseAsset: getBaseAsset(raw.symbol),
    quoteAsset: 'USDT',
    price: lastPrice,
    priceChange: parseFloat(raw.priceChange) || 0,
    priceChangePercent: parseFloat(raw.priceChangePercent) || 0,
    highPrice: parseFloat(raw.highPrice) || 0,
    lowPrice: parseFloat(raw.lowPrice) || 0,
    volume: parseFloat(raw.volume) || 0,
    quoteVolume: parseFloat(raw.quoteVolume) || 0,
    bidPrice,
    askPrice,
    spreadPercent: Math.round(spreadPercent * 1000) / 1000,
    count: raw.count,
    timestamp: raw.closeTime || Date.now(),
  };

  setInCache(cacheKey, ticker);
  return ticker;
}

/**
 * Fetch historical OHLCV candlestick bars
 * Timeframes supported per Spec Section 7: '5m', '15m', '1h', '4h', '1d'
 */
export async function fetchKlines(
  symbol: string,
  interval: Timeframe = '15m',
  limit: number = 100,
  startTime?: number,
  endTime?: number
): Promise<OHLCV[]> {
  const rawSymbol = toRawSymbol(symbol);
  const cacheKey = `binance_klines_${rawSymbol}_${interval}_${limit}_${startTime || ''}_${endTime || ''}`;
  const cached = getFromCache<OHLCV[]>(cacheKey, 15 * 1000); // 15s TTL
  if (cached) return cached;

  let url = `/klines?symbol=${rawSymbol}&interval=${interval}&limit=${limit}`;
  if (startTime) url += `&startTime=${startTime}`;
  if (endTime) url += `&endTime=${endTime}`;

  const rawKlines = await fetchWithFallback<Array<Array<string | number>>>(url);

  const klines: OHLCV[] = rawKlines.map((k) => ({
    timestamp: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
    quoteVolume: parseFloat(String(k[7])),
    trades: Number(k[8]),
  }));

  setInCache(cacheKey, klines);
  return klines;
}

/** Raw Binance Depth response */
interface RawBinanceDepth {
  lastUpdateId: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

/**
 * Fetch live order book depth and liquidity metrics
 */
export async function fetchOrderBook(
  symbol: string,
  limit: number = 20
): Promise<OrderBook> {
  const rawSymbol = toRawSymbol(symbol);
  const cacheKey = `binance_depth_${rawSymbol}_${limit}`;
  const cached = getFromCache<OrderBook>(cacheKey, 3 * 1000); // 3s TTL
  if (cached) return cached;

  const raw = await fetchWithFallback<RawBinanceDepth>(
    `/depth?symbol=${rawSymbol}&limit=${limit}`
  );

  const bids: OrderBookEntry[] = raw.bids.map(([price, qty]) => [
    parseFloat(price),
    parseFloat(qty),
  ]);

  const asks: OrderBookEntry[] = raw.asks.map(([price, qty]) => [
    parseFloat(price),
    parseFloat(qty),
  ]);

  const bestBid = bids[0]?.[0] ?? 0;
  const bestAsk = asks[0]?.[0] ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPercent =
    bestAsk > 0 && spread > 0 ? (spread / bestAsk) * 100 : 0;

  // Calculate top-of-book depth in USDT
  const bidDepthUsdt = bids.reduce((acc, [p, q]) => acc + p * q, 0);
  const askDepthUsdt = asks.reduce((acc, [p, q]) => acc + p * q, 0);

  // Liquidity score 0-100: Higher depth & tighter spread = higher score
  let liquidityScore = 50;
  if (spreadPercent <= 0.05) liquidityScore += 30;
  else if (spreadPercent <= 0.15) liquidityScore += 15;
  else if (spreadPercent > 0.5) liquidityScore -= 30;

  const totalDepth = bidDepthUsdt + askDepthUsdt;
  if (totalDepth >= 500_000) liquidityScore += 20;
  else if (totalDepth >= 100_000) liquidityScore += 10;
  else if (totalDepth < 20_000) liquidityScore -= 20;

  liquidityScore = Math.max(0, Math.min(100, Math.round(liquidityScore)));

  const orderBook: OrderBook = {
    symbol: toDisplaySymbol(rawSymbol),
    bids,
    asks,
    spread: Math.round(spread * 10000) / 10000,
    spreadPercent: Math.round(spreadPercent * 1000) / 1000,
    bidDepthUsdt: Math.round(bidDepthUsdt),
    askDepthUsdt: Math.round(askDepthUsdt),
    liquidityScore,
    timestamp: Date.now(),
  };

  setInCache(cacheKey, orderBook);
  return orderBook;
}

/**
 * Health check to verify Binance connectivity and latency
 */
export async function checkBinanceHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  serverTime?: number;
}> {
  const start = Date.now();
  try {
    const data = await fetchWithFallback<{ serverTime: number }>('/time', 4000);
    const latencyMs = Date.now() - start;
    return { connected: true, latencyMs, serverTime: data.serverTime };
  } catch {
    return { connected: false, latencyMs: Date.now() - start };
  }
}
