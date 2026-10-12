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
  CandleValidationResult,
  MarketDataProvenance,
} from '../../types/index.ts';

/** Primary and fallback public Binance REST endpoints */
const BINANCE_BASE_URLS = [
  'https://data-api.binance.vision/api/v3',
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
  'https://api2.binance.com/api/v3',
  'https://api3.binance.com/api/v3',
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
      throw new Error(`Binance returned HTTP ${res.status}: ${res.statusText || 'Error'}`);
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

/** Error thrown when market data cannot be obtained from live provider */
export class MarketDataUnavailableError extends Error {
  public readonly symbol: string;
  public readonly reason: string;
  constructor(symbol: string, reason: string) {
    super(`Market data unavailable for ${symbol}: ${reason}`);
    this.name = 'MarketDataUnavailableError';
    this.symbol = symbol;
    this.reason = reason;
  }
}

/** Error thrown when market data violates numerical or integrity constraints */
export class MarketDataValidationError extends Error {
  public readonly symbol: string;
  public readonly reason: string;
  constructor(symbol: string, reason: string) {
    super(`Market data validation failed for ${symbol}: ${reason}`);
    this.name = 'MarketDataValidationError';
    this.symbol = symbol;
    this.reason = reason;
  }
}

export interface ValidateCandlesOptions {
  minCandles?: number;
  timeframe?: Timeframe;
  maxStalenessMs?: number;
  allowIncompleteLastBar?: boolean;
}

/**
 * Validates candlestick data for numerical validity, temporal ordering, and freshness.
 * Fails closed on any inconsistency (high < low, non-positive price, non-sequential timestamps, stale data).
 */
export function validateCandles(
  candles: OHLCV[],
  options: ValidateCandlesOptions = {}
): CandleValidationResult {
  const minCandles = options.minCandles ?? 30;
  const timeframe = options.timeframe ?? '15m';

  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      isValid: false,
      candles: [],
      provenance: 'REAL_PROVIDER',
      checkedCount: 0,
      error: 'Candles array is empty or undefined',
    };
  }

  if (candles.length < minCandles) {
    return {
      isValid: false,
      candles,
      provenance: 'REAL_PROVIDER',
      checkedCount: candles.length,
      error: `Insufficient candle count: received ${candles.length}, minimum required is ${minCandles}`,
    };
  }

  let prevTimestamp = -1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // Timestamp verification
    if (!Number.isFinite(c.timestamp) || c.timestamp <= 0) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} has invalid timestamp: ${c.timestamp}`,
      };
    }

    if (i > 0 && c.timestamp <= prevTimestamp) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} timestamp (${c.timestamp}) is out of order or duplicate (previous: ${prevTimestamp})`,
      };
    }
    prevTimestamp = c.timestamp;

    // Price numeric checks
    if (
      !Number.isFinite(c.open) || c.open <= 0 ||
      !Number.isFinite(c.high) || c.high <= 0 ||
      !Number.isFinite(c.low) || c.low <= 0 ||
      !Number.isFinite(c.close) || c.close <= 0
    ) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} contains non-positive or non-finite price values (O:${c.open}, H:${c.high}, L:${c.low}, C:${c.close})`,
      };
    }

    // Geometry checks
    if (c.high < c.low) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} has invalid geometry: high (${c.high}) < low (${c.low})`,
      };
    }

    if (c.high < c.open || c.high < c.close) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} has invalid high: high (${c.high}) is lower than open (${c.open}) or close (${c.close})`,
      };
    }

    if (c.low > c.open || c.low > c.close) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} has invalid low: low (${c.low}) is higher than open (${c.open}) or close (${c.close})`,
      };
    }

    // Volume checks
    if (!Number.isFinite(c.volume) || c.volume < 0) {
      return {
        isValid: false,
        candles,
        provenance: 'REAL_PROVIDER',
        checkedCount: i + 1,
        error: `Candle #${i} has invalid negative or non-finite volume: ${c.volume}`,
      };
    }
  }

  // Freshness check against latest candle
  const latestCandle = candles[candles.length - 1];
  const now = Date.now();
  const tfDurationMs: Record<Timeframe, number> = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  const duration = tfDurationMs[timeframe] || 15 * 60 * 1000;
  // Maximum delay allowed: 2 bars duration + 5 min publication grace
  const maxDelay = options.maxStalenessMs ?? (duration * 2 + 5 * 60 * 1000);

  if (now - latestCandle.timestamp > maxDelay) {
    return {
      isValid: false,
      candles,
      provenance: 'REAL_PROVIDER',
      checkedCount: candles.length,
      isStale: true,
      error: `Candle data is stale: latest candle timestamp is ${new Date(latestCandle.timestamp).toISOString()} (${Math.round((now - latestCandle.timestamp) / 60000)}m ago; max allowed is ${Math.round(maxDelay / 60000)}m)`,
    };
  }

  return {
    isValid: true,
    candles,
    provenance: 'REAL_PROVIDER',
    checkedCount: candles.length,
  };
}

/**
 * Fetch and strictly validate live Binance klines.
 * Fails closed: throws MarketDataValidationError or MarketDataUnavailableError if invalid or unreachable.
 */
export async function fetchValidatedKlines(
  symbol: string,
  interval: Timeframe = '15m',
  limit: number = 80,
  options?: ValidateCandlesOptions
): Promise<CandleValidationResult> {
  try {
    const rawKlines = await fetchKlines(symbol, interval, limit);
    const validation = validateCandles(rawKlines, {
      minCandles: Math.min(30, limit),
      timeframe: interval,
      ...options,
    });
    if (!validation.isValid) {
      throw new MarketDataValidationError(symbol, validation.error || 'Candle validation failed');
    }
    return validation;
  } catch (err: unknown) {
    if (err instanceof MarketDataValidationError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new MarketDataUnavailableError(symbol, message);
  }
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
