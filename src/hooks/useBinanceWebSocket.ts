'use client';

// ─── U-SPOT Binance WebSocket React Hooks (Phase 29) ───────────────────
// Real-time hooks for Order Book Depth, Wall Detection, and Live Price Tickers

import { useState, useEffect, useRef } from 'react';
import type {
  LiveDepthStreamPayload,
  LiveTickerStreamPayload,
  LiveTradeTick,
  TradeFlowStats,
  WebSocketConnectionState,
  WebSocketTelemetry,
  ConnectionQuality,
  OrderBookWall,
  WatchlistTickerItem,
} from '@/types';
import {
  getBinanceWsManager,
  DEFAULT_WATCHLIST_SYMBOLS,
  formatWatchlistTickerItem,
} from '@/lib/services/binance-websocket';
import {
  computeTradeFlowStats,
  generateSyntheticTrades,
} from '@/lib/services/time-and-sales';

export interface UseLiveOrderBookResult {
  depth: LiveDepthStreamPayload | null;
  depthImbalance: number;
  bidWalls: OrderBookWall[];
  askWalls: OrderBookWall[];
  spread: number;
  spreadPercent: number;
  connectionState: WebSocketConnectionState;
  isLiveWs: boolean;
  isLoading: boolean;
}

/**
 * Hook to stream real-time top-20 order book depth and wall detections (100ms)
 */
export function useLiveOrderBook(
  symbol: string,
  options: { enabled?: boolean } = {}
): UseLiveOrderBookResult {
  const { enabled = true } = options;
  const [depth, setDepth] = useState<LiveDepthStreamPayload | null>(null);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('CONNECTING');
  const [isLoading, setIsLoading] = useState(true);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !symbol) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const manager = getBinanceWsManager();

    // 1. Listen for connection status changes
    const unsubStatus = manager.onStatusChange((status) => {
      setConnectionState(status);
    });

    // 2. Subscribe to live WebSocket depth stream
    const unsubDepth = manager.subscribeDepth(symbol, (payload) => {
      setDepth(payload);
      setIsLoading(false);
    });

    // 3. Fallback: REST polling if WebSocket is offline or blocked
    const cleanSym = symbol.replace('/', '').toUpperCase();
    const pollFallback = async () => {
      try {
        const res = await fetch(`/api/markets/${cleanSym}/depth?limit=20`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.orderBook) {
            setDepth((prev) => {
              if (prev && manager.getConnectionState() === 'CONNECTED') {
                return prev; // Favor live WebSocket data over polled data
              }
              const ob = data.orderBook;
              const bidDepth = ob.bidDepthUsdt || 0;
              const askDepth = ob.askDepthUsdt || 0;
              const total = bidDepth + askDepth;
              const depthImbalance = total > 0 ? (bidDepth - askDepth) / total : 0;

              return {
                symbol,
                lastUpdateId: ob.timestamp || Date.now(),
                bids: ob.bids || [],
                asks: ob.asks || [],
                bestBid: ob.bids?.[0]?.[0] || 0,
                bestAsk: ob.asks?.[0]?.[0] || 0,
                spread: ob.spread || 0,
                spreadPercent: ob.spreadPercent || 0,
                bidDepthUsdt: bidDepth,
                askDepthUsdt: askDepth,
                depthImbalance: Number(depthImbalance.toFixed(3)),
                bidWalls: [],
                askWalls: [],
                timestamp: ob.timestamp || Date.now(),
              };
            });
            setIsLoading(false);
          }
        }
      } catch {
        // Silently handle offline poll failures
      }
    };

    pollFallback();
    fallbackTimerRef.current = setInterval(pollFallback, 5000);

    return () => {
      unsubStatus();
      unsubDepth();
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [symbol, enabled]);

  const isLiveWs = connectionState === 'CONNECTED' && depth !== null;

  return {
    depth,
    depthImbalance: depth?.depthImbalance ?? 0,
    bidWalls: depth?.bidWalls ?? [],
    askWalls: depth?.askWalls ?? [],
    spread: depth?.spread ?? 0,
    spreadPercent: depth?.spreadPercent ?? 0,
    connectionState,
    isLiveWs,
    isLoading,
  };
}

export interface UseLiveTickerResult {
  ticker: LiveTickerStreamPayload | null;
  livePrice: number | null;
  priceChangePercent: number | null;
  tickDirection: 'UP' | 'DOWN' | 'EQUAL';
  connectionState: WebSocketConnectionState;
  isLiveWs: boolean;
}

/**
 * Hook to stream real-time price ticks and 24h market stats
 */
export function useLiveTicker(
  symbol: string,
  options: { enabled?: boolean; initialPrice?: number } = {}
): UseLiveTickerResult {
  const { enabled = true, initialPrice } = options;
  const [ticker, setTicker] = useState<LiveTickerStreamPayload | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(initialPrice ?? null);
  const [tickDirection, setTickDirection] = useState<'UP' | 'DOWN' | 'EQUAL'>('EQUAL');
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('CONNECTING');
  const prevPriceRef = useRef<number | null>(initialPrice ?? null);

  useEffect(() => {
    if (!enabled || !symbol) return;

    const manager = getBinanceWsManager();

    const unsubStatus = manager.onStatusChange((status) => {
      setConnectionState(status);
    });

    const unsubTicker = manager.subscribeTicker(symbol, (payload) => {
      const newPrice = payload.price;
      const prev = prevPriceRef.current;

      if (prev !== null) {
        if (newPrice > prev) setTickDirection('UP');
        else if (newPrice < prev) setTickDirection('DOWN');
        else setTickDirection('EQUAL');
      }

      prevPriceRef.current = newPrice;
      setTicker(payload);
      setLivePrice(newPrice);
    });

    return () => {
      unsubStatus();
      unsubTicker();
    };
  }, [symbol, enabled]);

  const isLiveWs = connectionState === 'CONNECTED' && ticker !== null;

  return {
    ticker,
    livePrice,
    priceChangePercent: ticker?.priceChangePercent ?? null,
    tickDirection,
    connectionState,
    isLiveWs,
  };
}

export interface UseMultiAssetTickerResult {
  tickers: Record<string, WatchlistTickerItem>;
  tickerList: WatchlistTickerItem[];
  connectionState: WebSocketConnectionState;
  isLiveWs: boolean;
  isLoading: boolean;
  topGainer: WatchlistTickerItem | null;
  topLoser: WatchlistTickerItem | null;
  totalVolumeUsdt: number;
}

/**
 * Hook to stream real-time price tickers across multiple watchlist universe pairs
 * with instant REST bootstrap, live tick flashing, and statistical aggregates.
 */
export function useMultiAssetTicker(
  symbols: string[] = DEFAULT_WATCHLIST_SYMBOLS,
  options: { enabled?: boolean; pollingFallbackIntervalMs?: number } = {}
): UseMultiAssetTickerResult {
  const { enabled = true, pollingFallbackIntervalMs = 8000 } = options;
  const [tickers, setTickers] = useState<Record<string, WatchlistTickerItem>>({});
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('CONNECTING');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const tickersRef = useRef<Record<string, WatchlistTickerItem>>({});
  const resetTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      setIsLoading(false);
      return;
    }

    const manager = getBinanceWsManager();

    // 1. Connection status listener
    const unsubStatus = manager.onStatusChange((status) => {
      setConnectionState(status);
    });

    // 2. Initial REST load to avoid empty strip
    const loadInitialSnapshot = async () => {
      try {
        const res = await fetch('/api/markets');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.pairs)) {
            const nextMap: Record<string, WatchlistTickerItem> = { ...tickersRef.current };
            for (const p of data.pairs) {
              const sym = p.symbol;
              if (symbols.includes(sym) && !nextMap[sym]) {
                const baseAsset = sym.includes('/') ? sym.split('/')[0] : sym.replace('USDT', '');
                nextMap[sym] = {
                  symbol: sym,
                  baseAsset,
                  price: p.price || 0,
                  priceChangePercent: p.priceChangePercent || 0,
                  priceChange: p.priceChange || 0,
                  highPrice: p.high24h || p.price || 0,
                  lowPrice: p.low24h || p.price || 0,
                  volume: p.volume24h || 0,
                  quoteVolume: p.quoteVolume24h || (p.price * (p.volume24h || 0)),
                  tickDirection: 'EQUAL',
                  lastUpdated: Date.now(),
                };
              }
            }
            if (Object.keys(nextMap).length > 0) {
              tickersRef.current = nextMap;
              setTickers({ ...nextMap });
            }
          }
        }
      } catch {
        // Silent catch for initial load
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialSnapshot();

    // 3. Fallback REST polling if disconnected
    if (pollingFallbackIntervalMs > 0) {
      fallbackTimerRef.current = setInterval(() => {
        if (manager.getConnectionState() !== 'CONNECTED') {
          loadInitialSnapshot();
        }
      }, pollingFallbackIntervalMs);
    }

    // 4. Multi-asset WebSocket subscription
    const unsubWs = manager.subscribeMultiTickers(symbols, (payload) => {
      const sym = payload.symbol;
      const prev = tickersRef.current[sym];
      const updated = formatWatchlistTickerItem(payload, prev);

      tickersRef.current = {
        ...tickersRef.current,
        [sym]: updated,
      };
      setTickers({ ...tickersRef.current });
      setIsLoading(false);

      // Reset tick direction to EQUAL after flash duration (1200ms)
      if (resetTimersRef.current[sym]) {
        clearTimeout(resetTimersRef.current[sym]);
      }
      resetTimersRef.current[sym] = setTimeout(() => {
        if (tickersRef.current[sym]) {
          tickersRef.current = {
            ...tickersRef.current,
            [sym]: {
              ...tickersRef.current[sym],
              tickDirection: 'EQUAL',
            },
          };
          setTickers({ ...tickersRef.current });
        }
      }, 1200);
    });

    return () => {
      unsubStatus();
      unsubWs();
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      Object.values(resetTimersRef.current).forEach(clearTimeout);
      resetTimersRef.current = {};
    };
  }, [symbols.join(','), enabled, pollingFallbackIntervalMs]);

  // Maintain stable list order according to input symbols array
  const tickerList = symbols
    .map((sym) => tickers[sym])
    .filter((item): item is WatchlistTickerItem => Boolean(item));

  let topGainer: WatchlistTickerItem | null = null;
  let topLoser: WatchlistTickerItem | null = null;
  let totalVolumeUsdt = 0;

  for (const item of tickerList) {
    totalVolumeUsdt += item.quoteVolume || item.price * item.volume;
    if (!topGainer || item.priceChangePercent > topGainer.priceChangePercent) {
      topGainer = item;
    }
    if (!topLoser || item.priceChangePercent < topLoser.priceChangePercent) {
      topLoser = item;
    }
  }

  const isLiveWs = connectionState === 'CONNECTED';

  return {
    tickers,
    tickerList,
    connectionState,
    isLiveWs,
    isLoading,
    topGainer,
    topLoser,
    totalVolumeUsdt,
  };
}

// ─── Phase 34: Time & Sales (Live Trades Stream @trade) Hook ─────────

export interface UseLiveTradesOptions {
  maxHistory?: number;
  enabled?: boolean;
  basePrice?: number;
}

export interface UseLiveTradesResult {
  trades: LiveTradeTick[];
  flowStats: TradeFlowStats;
  connectionState: WebSocketConnectionState;
  isLiveWs: boolean;
  isLoading: boolean;
  isPaused: boolean;
  togglePause: () => void;
  clearTrades: () => void;
}

/**
 * Hook to stream real-time Time & Sales executed trades (@trade) (Phase 34)
 */
export function useLiveTrades(
  symbol: string,
  options: UseLiveTradesOptions = {}
): UseLiveTradesResult {
  const { maxHistory = 50, enabled = true, basePrice = 0 } = options;
  const [trades, setTrades] = useState<LiveTradeTick[]>([]);
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('CONNECTING');
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  useEffect(() => {
    if (!enabled || !symbol) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    // Populate initial synthetic trades if empty so tape is not blank on mount
    setTrades((prev) => {
      if (prev.length > 0 && prev[0]?.symbol === symbol) return prev;
      return generateSyntheticTrades(symbol, basePrice > 0 ? basePrice : 65000, 15);
    });

    const manager = getBinanceWsManager();

    const unsubStatus = manager.onStatusChange((status) => {
      setConnectionState(status);
    });

    const unsubTrade = manager.subscribeTrades(symbol, (tradeTick) => {
      if (isPausedRef.current) return;
      setTrades((prev) => [tradeTick, ...prev].slice(0, maxHistory));
      setIsLoading(false);
    });

    setIsLoading(false);

    return () => {
      unsubStatus();
      unsubTrade();
    };
  }, [symbol, enabled, maxHistory, basePrice]);

  const togglePause = () => setIsPaused((prev) => !prev);
  const clearTrades = () => setTrades([]);

  const flowStats = computeTradeFlowStats(trades, symbol);
  const isLiveWs = connectionState === 'CONNECTED';

  return {
    trades,
    flowStats,
    connectionState,
    isLiveWs,
    isLoading,
    isPaused,
    togglePause,
    clearTrades,
  };
}

// ─── Phase 36: WebSocket Reconnect Heartbeat Telemetry Hook ─────────

export interface UseWebSocketTelemetryResult {
  telemetry: WebSocketTelemetry;
  triggerReconnect: () => void;
  uptimeFormatted: string;
  isHealthy: boolean;
}

/**
 * Hook to stream real-time WebSocket heartbeat telemetry, RTT ping latency,
 * throughput (msgs/sec), packet count, and connection quality (Phase 36)
 */
export function useWebSocketTelemetry(): UseWebSocketTelemetryResult {
  const manager = getBinanceWsManager();
  const [telemetry, setTelemetry] = useState<WebSocketTelemetry>(() => manager.getTelemetry());

  useEffect(() => {
    const unsub = manager.onTelemetry((data) => {
      setTelemetry(data);
    });

    // Tick uptime counter every second
    const timer = setInterval(() => {
      setTelemetry((prev) => {
        if (!prev.connectedAt) return prev;
        const uptimeSeconds = Math.floor((Date.now() - prev.connectedAt) / 1000);
        return { ...prev, uptimeSeconds };
      });
    }, 1000);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const triggerReconnect = () => {
    manager.triggerReconnect();
  };

  const hours = Math.floor(telemetry.uptimeSeconds / 3600);
  const minutes = Math.floor((telemetry.uptimeSeconds % 3600) / 60);
  const seconds = telemetry.uptimeSeconds % 60;
  const uptimeFormatted =
    hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

  const isHealthy = telemetry.quality === 'EXCELLENT' || telemetry.quality === 'GOOD';

  return {
    telemetry,
    triggerReconnect,
    uptimeFormatted,
    isHealthy,
  };
}
