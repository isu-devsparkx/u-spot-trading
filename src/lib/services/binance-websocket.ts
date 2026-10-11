// ─── U-SPOT Binance WebSocket Streaming Service (Phase 29) ─────────────
// Real-time Order Book Depth (@depth20@100ms) & Ticker Price Streams (@ticker)
// Free-first architecture (Spec Section 35), Sub-second liquidity & wall detection

import type {
  OrderBookEntry,
  OrderBookWall,
  LiveDepthStreamPayload,
  LiveTickerStreamPayload,
  LiveTradeTick,
  WatchlistTickerItem,
  WebSocketConnectionState,
  WebSocketTelemetry,
  ConnectionQuality,
} from '../../types/index.ts';
import { toRawSymbol, toDisplaySymbol } from './binance-service.ts';
import { parseTradePayload } from './time-and-sales.ts';
import {
  evaluateTradeImbalance,
  evaluateWallImbalance,
  dispatchOrderFlowAlert,
} from './order-flow-imbalance.ts';

export const BINANCE_WS_BASE_URL = 'wss://stream.binance.com:9443/ws';
export const BINANCE_WS_STREAM_URL = 'wss://stream.binance.com:9443/stream?streams=';

/** Default high-liquidity spot pairs for the global watchlist ticker strip */
export const DEFAULT_WATCHLIST_SYMBOLS: string[] = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'DOGE/USDT',
  'AVAX/USDT',
  'LINK/USDT',
  'NEAR/USDT',
  'SUI/USDT',
  'APT/USDT',
  'RENDER/USDT',
  'INJ/USDT',
];

/** Standard suggested high-liquidity Binance spot pairs for quick addition (Phase 33) */
export const POPULAR_UNIVERSE_SYMBOLS: string[] = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'DOGE/USDT',
  'AVAX/USDT',
  'LINK/USDT',
  'NEAR/USDT',
  'SUI/USDT',
  'APT/USDT',
  'RENDER/USDT',
  'INJ/USDT',
  'ARB/USDT',
  'OP/USDT',
  'TIA/USDT',
  'DOT/USDT',
  'ATOM/USDT',
  'FTM/USDT',
  'POL/USDT',
  'SEI/USDT',
];

/** Raw Binance WebSocket 20-level depth payload */
export interface RawWsDepth {
  lastUpdateId: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

/** Raw Binance WebSocket 24hr Ticker payload */
export interface RawWsTicker {
  e: string; // "24hrTicker"
  E: number; // Event time
  s: string; // Symbol
  p: string; // Price change
  P: string; // Price change percent
  c: string; // Last price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  b: string; // Best bid price
  a: string; // Best ask price
}

/**
 * Formats symbol and stream type to official Binance WebSocket stream identifier
 */
export function toWebSocketStreamName(
  symbol: string,
  type: 'depth' | 'ticker' | 'trade'
): string {
  const clean = toRawSymbol(symbol).replace(/[-_/]/g, '').toLowerCase();
  if (type === 'depth') {
    return `${clean}@depth20@100ms`;
  }
  if (type === 'trade') {
    return `${clean}@trade`;
  }
  return `${clean}@ticker`;
}

/**
 * Classifies connection quality based on WebSocket state and RTT latency (Phase 36)
 */
export function classifyConnectionQuality(
  state: WebSocketConnectionState,
  latencyMs: number
): ConnectionQuality {
  if (state !== 'CONNECTED') return 'OFFLINE';
  if (latencyMs <= 120) return 'EXCELLENT';
  if (latencyMs <= 280) return 'GOOD';
  if (latencyMs <= 600) return 'FAIR';
  return 'POOR';
}

/**
 * Calculates exponential backoff reconnect delay with jitter
 */
export function getReconnectDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 16000);
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

/**
 * Detects institutional liquidity concentration walls from order book levels.
 * A level is flagged as a wall if its depth volume is >= 2.5x the average level depth.
 */
export function detectOrderBookWalls(
  entries: OrderBookEntry[],
  type: 'BID' | 'ASK',
  midPrice: number,
  wallMultiplierThreshold = 2.5
): OrderBookWall[] {
  if (entries.length === 0 || midPrice <= 0) return [];

  const volumesUsdt = entries.map(([p, q]) => p * q);
  const totalVolume = volumesUsdt.reduce((a, b) => a + b, 0);
  const avgVolume = totalVolume / entries.length;

  if (avgVolume <= 0) return [];

  const walls: OrderBookWall[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [price, qty] = entries[i];
    const volUsdt = volumesUsdt[i];
    const multiple = volUsdt / avgVolume;

    if (multiple >= wallMultiplierThreshold) {
      const distancePercent =
        type === 'BID'
          ? ((midPrice - price) / midPrice) * 100
          : ((price - midPrice) / midPrice) * 100;

      walls.push({
        type,
        price: Number(price.toFixed(4)),
        quantity: Number(qty.toFixed(4)),
        volumeUsdt: Math.round(volUsdt),
        multipleOfAverage: Number(multiple.toFixed(1)),
        distancePercent: Number(Math.max(0, distancePercent).toFixed(2)),
        percentFromPrice: Number(Math.max(0, distancePercent).toFixed(2)),
      });
    }
  }

  // Sort walls by volume descending (largest first)
  return walls.sort((a, b) => b.volumeUsdt - a.volumeUsdt);
}

/**
 * Parses raw Binance depth stream payload into structured LiveDepthStreamPayload
 */
export function parseDepthPayload(
  symbol: string,
  raw: RawWsDepth
): LiveDepthStreamPayload {
  const bids: OrderBookEntry[] = (raw.bids || []).map(([p, q]) => [
    parseFloat(p),
    parseFloat(q),
  ]);
  const asks: OrderBookEntry[] = (raw.asks || []).map(([p, q]) => [
    parseFloat(p),
    parseFloat(q),
  ]);

  const bestBid = bids[0]?.[0] ?? 0;
  const bestAsk = asks[0]?.[0] ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPercent =
    bestAsk > 0 && spread > 0 ? (spread / bestAsk) * 100 : 0;

  const bidDepthUsdt = bids.reduce((acc, [p, q]) => acc + p * q, 0);
  const askDepthUsdt = asks.reduce((acc, [p, q]) => acc + p * q, 0);
  const totalDepth = bidDepthUsdt + askDepthUsdt;

  // Imbalance: -1.0 (100% Ask dominance) to +1.0 (100% Bid dominance)
  const depthImbalance =
    totalDepth > 0 ? (bidDepthUsdt - askDepthUsdt) / totalDepth : 0;

  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

  const bidWalls = detectOrderBookWalls(bids, 'BID', midPrice);
  const askWalls = detectOrderBookWalls(asks, 'ASK', midPrice);

  return {
    symbol: toDisplaySymbol(toRawSymbol(symbol)),
    lastUpdateId: raw.lastUpdateId || Date.now(),
    bids,
    asks,
    bestBid,
    bestAsk,
    spread: Number(spread.toFixed(4)),
    spreadPercent: Number(spreadPercent.toFixed(3)),
    bidDepthUsdt: Math.round(bidDepthUsdt),
    askDepthUsdt: Math.round(askDepthUsdt),
    depthImbalance: Number(depthImbalance.toFixed(3)),
    bidWalls,
    askWalls,
    timestamp: Date.now(),
  };
}

/**
 * Parses raw Binance ticker stream payload into structured LiveTickerStreamPayload
 */
export function parseTickerPayload(raw: RawWsTicker): LiveTickerStreamPayload {
  const price = parseFloat(raw.c) || 0;
  const priceChange = parseFloat(raw.p) || 0;
  const priceChangePercent = parseFloat(raw.P) || 0;
  const highPrice = parseFloat(raw.h) || 0;
  const lowPrice = parseFloat(raw.l) || 0;
  const volume = parseFloat(raw.v) || 0;
  const quoteVolume = parseFloat(raw.q) || 0;
  const bestBid = parseFloat(raw.b) || 0;
  const bestAsk = parseFloat(raw.a) || 0;

  return {
    symbol: toDisplaySymbol(raw.s),
    price,
    priceChange,
    priceChangePercent,
    highPrice,
    lowPrice,
    volume,
    quoteVolume,
    bestBid,
    bestAsk,
    timestamp: raw.E || Date.now(),
  };
}

/**
 * Converts a live ticker stream payload into a structured WatchlistTickerItem
 * with price direction determination compared to previous tick.
 */
export function formatWatchlistTickerItem(
  payload: LiveTickerStreamPayload,
  prev?: WatchlistTickerItem
): WatchlistTickerItem {
  const baseAsset = payload.symbol.includes('/')
    ? payload.symbol.split('/')[0]
    : payload.symbol.replace('USDT', '');

  let tickDirection: 'UP' | 'DOWN' | 'EQUAL' = 'EQUAL';
  if (prev && prev.price > 0) {
    if (payload.price > prev.price) tickDirection = 'UP';
    else if (payload.price < prev.price) tickDirection = 'DOWN';
    else tickDirection = 'EQUAL';
  }

  return {
    symbol: payload.symbol,
    baseAsset,
    price: payload.price,
    priceChangePercent: payload.priceChangePercent,
    priceChange: payload.priceChange,
    highPrice: payload.highPrice,
    lowPrice: payload.lowPrice,
    volume: payload.volume,
    quoteVolume: payload.quoteVolume,
    tickDirection,
    lastUpdated: payload.timestamp || Date.now(),
  };
}

// ─── Binance WebSocket Stream Manager (Universal Client) ──────────────

type DepthListener = (payload: LiveDepthStreamPayload) => void;
type TickerListener = (payload: LiveTickerStreamPayload) => void;
type TradeListener = (payload: LiveTradeTick) => void;
type StatusListener = (status: WebSocketConnectionState) => void;
type TelemetryListener = (telemetry: WebSocketTelemetry) => void;

export class BinanceWebSocketManager {
  private static instance: BinanceWebSocketManager | null = null;
  private ws: WebSocket | null = null;
  private connectionState: WebSocketConnectionState = 'DISCONNECTED';
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isExplicitlyClosed = false;

  private depthSubscribers = new Map<string, Set<DepthListener>>();
  private tickerSubscribers = new Map<string, Set<TickerListener>>();
  private tradeSubscribers = new Map<string, Set<TradeListener>>();
  private statusSubscribers = new Set<StatusListener>();
  private telemetrySubscribers = new Set<TelemetryListener>();

  // Telemetry metrics (Phase 36)
  private packetCount = 0;
  private connectedAt: number | null = null;
  private reconnectCount = 0;
  private lastPingTimestamp: number | null = null;
  private lastPongTimestamp: number | null = null;
  private lastLatencyMs = 45;
  private rollingPacketTimestamps: number[] = [];

  public static getInstance(): BinanceWebSocketManager {
    if (!BinanceWebSocketManager.instance) {
      BinanceWebSocketManager.instance = new BinanceWebSocketManager();
    }
    return BinanceWebSocketManager.instance;
  }

  public getConnectionState(): WebSocketConnectionState {
    return this.connectionState;
  }

  private setConnectionState(newState: WebSocketConnectionState): void {
    if (this.connectionState === newState) return;
    this.connectionState = newState;
    for (const listener of this.statusSubscribers) {
      try {
        listener(newState);
      } catch (err) {
        console.error('[BinanceWS] Error in status listener:', err);
      }
    }
  }

  public onStatusChange(callback: StatusListener): () => void {
    this.statusSubscribers.add(callback);
    callback(this.connectionState);
    return () => this.statusSubscribers.delete(callback);
  }

  /**
   * Subscribes to real-time order book depth (top 20 @ 100ms) for a symbol
   */
  public subscribeDepth(symbol: string, callback: DepthListener): () => void {
    const raw = toRawSymbol(symbol);
    if (!this.depthSubscribers.has(raw)) {
      this.depthSubscribers.set(raw, new Set());
    }
    this.depthSubscribers.get(raw)!.add(callback);
    this.ensureConnection();

    return () => {
      const set = this.depthSubscribers.get(raw);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.depthSubscribers.delete(raw);
        }
      }
      this.evaluateConnectionNeeds();
    };
  }

  /**
   * Subscribes to real-time ticker price and 24h stats for a symbol
   */
  public subscribeTicker(symbol: string, callback: TickerListener): () => void {
    const raw = toRawSymbol(symbol);
    if (!this.tickerSubscribers.has(raw)) {
      this.tickerSubscribers.set(raw, new Set());
    }
    this.tickerSubscribers.get(raw)!.add(callback);
    this.ensureConnection();

    return () => {
      const set = this.tickerSubscribers.get(raw);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.tickerSubscribers.delete(raw);
        }
      }
      this.evaluateConnectionNeeds();
    };
  }

  /**
   * Subscribes to real-time ticker streams for multiple symbols concurrently
   */
  public subscribeMultiTickers(
    symbols: string[],
    callback: TickerListener
  ): () => void {
    const unsubs = symbols.map((sym) => this.subscribeTicker(sym, callback));
    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }

  /**
   * Subscribes to real-time executed trades (@trade) for a symbol (Phase 34)
   */
  public subscribeTrades(symbol: string, callback: TradeListener): () => void {
    const raw = toRawSymbol(symbol);
    if (!this.tradeSubscribers.has(raw)) {
      this.tradeSubscribers.set(raw, new Set());
    }
    this.tradeSubscribers.get(raw)!.add(callback);
    this.ensureConnection();

    return () => {
      const set = this.tradeSubscribers.get(raw);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.tradeSubscribers.delete(raw);
        }
      }
      this.evaluateConnectionNeeds();
    };
  }

  /**
   * Computes the combined active streams array
   */
  public getActiveStreams(): string[] {
    const streams: string[] = [];
    for (const raw of this.depthSubscribers.keys()) {
      streams.push(toWebSocketStreamName(raw, 'depth'));
    }
    for (const raw of this.tickerSubscribers.keys()) {
      streams.push(toWebSocketStreamName(raw, 'ticker'));
    }
    for (const raw of this.tradeSubscribers.keys()) {
      streams.push(toWebSocketStreamName(raw, 'trade'));
    }
    return streams;
  }

  /**
   * Ensures WebSocket is connected when active subscribers exist
   */
  private ensureConnection(): void {
    if (typeof WebSocket === 'undefined') {
      return; // Not in environment with WebSocket support
    }

    const streams = this.getActiveStreams();
    if (streams.length === 0) return;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      // If already open, send SUBSCRIBE frame for any new streams
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendSubscriptionPayload('SUBSCRIBE', streams);
      }
      return;
    }

    this.connect();
  }

  private connect(): void {
    const streams = this.getActiveStreams();
    if (streams.length === 0) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isExplicitlyClosed = false;
    this.setConnectionState(this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');

    const url = `${BINANCE_WS_STREAM_URL}${streams.join('/')}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connectedAt = Date.now();
        this.reconnectAttempt = 0;
        this.setConnectionState('CONNECTED');
        this.startHeartbeat();
        this.broadcastTelemetry();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.warn('[BinanceWS] Socket error encountered:', error);
        this.setConnectionState('ERROR');
        this.broadcastTelemetry();
      };

      this.ws.onclose = () => {
        this.connectedAt = null;
        this.cleanupHeartbeat();
        if (!this.isExplicitlyClosed) {
          this.reconnectCount++;
          this.setConnectionState('DISCONNECTED');
          this.scheduleReconnect();
        }
        this.broadcastTelemetry();
      };
    } catch (err) {
      console.error('[BinanceWS] Failed to initialize WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: any): void {
    try {
      this.packetCount++;
      const now = Date.now();
      this.rollingPacketTimestamps.push(now);
      const cutoff = now - 5000;
      while (
        this.rollingPacketTimestamps.length > 0 &&
        this.rollingPacketTimestamps[0] < cutoff
      ) {
        this.rollingPacketTimestamps.shift();
      }

      const text = typeof data === 'string' ? data : data.toString();
      const json = JSON.parse(text);

      // Handle Ping ACK / Pong frame
      if (
        json.result === 'pong' ||
        (json.id && this.lastPingTimestamp && json.id === this.lastPingTimestamp)
      ) {
        this.lastPongTimestamp = now;
        if (this.lastPingTimestamp) {
          this.lastLatencyMs = Math.max(1, now - this.lastPingTimestamp);
        }
        this.broadcastTelemetry();
        return;
      }

      // Binance combined stream payload format: { stream: "solusdt@depth20@100ms", data: { ... } }
      const streamName = json.stream as string | undefined;
      const payload = json.data || json;

      // Extract server event timestamp latency indicator if present
      if (payload && (payload.E || payload.T)) {
        const eventTime = payload.E || payload.T;
        const diff = now - eventTime;
        if (diff >= 0 && diff < 5000) {
          this.lastLatencyMs = Math.round(this.lastLatencyMs * 0.75 + diff * 0.25);
        }
      }

      // If payload is an array of tickers (e.g. from !miniTicker@arr)
      if (Array.isArray(payload)) {
        for (const item of payload) {
          if (item && item.s) {
            const rawSym = item.s.toUpperCase();
            const listeners = this.tickerSubscribers.get(rawSym);
            if (listeners && listeners.size > 0) {
              const parsed = parseTickerPayload(item);
              for (const cb of listeners) {
                try {
                  cb(parsed);
                } catch (e) {
                  console.error('[BinanceWS] Error in ticker callback:', e);
                }
              }
            }
          }
        }
        return;
      }

      if (!streamName && !payload.s) return;

      if (streamName && streamName.includes('@depth')) {
        const rawSym = streamName.split('@')[0].toUpperCase();
        const parsed = parseDepthPayload(rawSym, payload);
        const listeners = this.depthSubscribers.get(rawSym);
        if (listeners) {
          for (const cb of listeners) {
            try {
              cb(parsed);
            } catch (e) {
              console.error('[BinanceWS] Error in depth callback:', e);
            }
          }
        }

        // Phase 35: Evaluate depth walls for institutional order flow alerts
        if (parsed.bidWalls && parsed.bidWalls.length > 0) {
          for (const wall of parsed.bidWalls) {
            const wallAlert = evaluateWallImbalance(parsed.symbol, wall, 'BID');
            if (wallAlert) dispatchOrderFlowAlert(wallAlert);
          }
        }
        if (parsed.askWalls && parsed.askWalls.length > 0) {
          for (const wall of parsed.askWalls) {
            const wallAlert = evaluateWallImbalance(parsed.symbol, wall, 'ASK');
            if (wallAlert) dispatchOrderFlowAlert(wallAlert);
          }
        }
      } else if (
        (streamName && streamName.includes('@ticker')) ||
        payload.e === '24hrTicker' ||
        payload.c !== undefined
      ) {
        const parsed = parseTickerPayload(payload);
        const rawSym = parsed.symbol.replace('/', '').toUpperCase();
        const listeners = this.tickerSubscribers.get(rawSym);
        if (listeners) {
          for (const cb of listeners) {
            try {
              cb(parsed);
            } catch (e) {
              console.error('[BinanceWS] Error in ticker callback:', e);
            }
          }
        }
      } else if (
        (streamName && streamName.includes('@trade')) ||
        payload.e === 'trade'
      ) {
        const rawSym = (streamName ? streamName.split('@')[0] : payload.s || '').toUpperCase();
        const parsed = parseTradePayload(payload, rawSym);
        const listeners = this.tradeSubscribers.get(rawSym);
        if (listeners) {
          for (const cb of listeners) {
            try {
              cb(parsed);
            } catch (e) {
              console.error('[BinanceWS] Error in trade callback:', e);
            }
          }
        }

        // Phase 35: Evaluate trade tick for institutional whale sweep alerts
        const sweepAlert = evaluateTradeImbalance(parsed);
        if (sweepAlert) {
          dispatchOrderFlowAlert(sweepAlert);
        }
      }
    } catch (err) {
      // Discard unparseable pong or ACK frames
    }
  }

  private sendSubscriptionPayload(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', params: string[]): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && params.length > 0) {
      const payload = JSON.stringify({
        method,
        params,
        id: Date.now(),
      });
      this.ws.send(payload);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isExplicitlyClosed) return;
    const delay = getReconnectDelay(this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.cleanupHeartbeat();
    // Ping every 15 seconds to measure RTT latency and keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTimestamp = Date.now();
        try {
          this.ws.send(JSON.stringify({ method: 'ping', id: this.lastPingTimestamp }));
        } catch {
          // Socket might have closed
        }
      }
    }, 15000);
  }

  private cleanupHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Retrieves instantaneous telemetry metrics (Phase 36)
   */
  public getTelemetry(): WebSocketTelemetry {
    const now = Date.now();
    const uptimeSeconds = this.connectedAt ? Math.floor((now - this.connectedAt) / 1000) : 0;
    const msgsPerSec =
      this.rollingPacketTimestamps.length > 0
        ? Number((this.rollingPacketTimestamps.length / 5).toFixed(1))
        : 0;

    return {
      connectionState: this.connectionState,
      latencyMs: this.lastLatencyMs,
      packetCount: this.packetCount,
      messagesPerSecond: msgsPerSec,
      connectedAt: this.connectedAt,
      uptimeSeconds,
      reconnectCount: this.reconnectCount,
      lastPingTimestamp: this.lastPingTimestamp,
      lastPongTimestamp: this.lastPongTimestamp,
      quality: classifyConnectionQuality(this.connectionState, this.lastLatencyMs),
      activeStreamCount: this.getActiveStreams().length,
    };
  }

  /**
   * Subscribes to real-time WebSocket telemetry updates
   */
  public onTelemetry(callback: TelemetryListener): () => void {
    this.telemetrySubscribers.add(callback);
    callback(this.getTelemetry());
    return () => this.telemetrySubscribers.delete(callback);
  }

  private broadcastTelemetry(): void {
    const current = this.getTelemetry();
    for (const cb of this.telemetrySubscribers) {
      try {
        cb(current);
      } catch (e) {
        console.error('[BinanceWS] Error in telemetry listener:', e);
      }
    }
  }

  /**
   * Forces an immediate connection refresh / reboot
   */
  public triggerReconnect(): void {
    this.disconnect();
    this.reconnectAttempt = 0;
    this.connect();
  }

  private evaluateConnectionNeeds(): void {
    const streams = this.getActiveStreams();
    if (streams.length === 0 && this.ws) {
      this.disconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.cleanupHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setConnectionState('DISCONNECTED');
  }
}

/** Convenience getter for the global Binance WebSocket client */
export function getBinanceWsManager(): BinanceWebSocketManager {
  return BinanceWebSocketManager.getInstance();
}

/** Singleton instance export */
export const binanceWs = BinanceWebSocketManager.getInstance();
