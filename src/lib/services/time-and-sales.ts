// ─── U-SPOT Time & Sales Service (Phase 34) ─────────────────────────
// Real-time trades processing, Cumulative Volume Delta (CVD), & Flow Stats
// Implements Binance spot @trade streaming parser and aggressive side classification

import type {
  LiveTradeTick,
  TradeFlowStats,
  TradeSizeCategory,
} from '../../types/index.ts';
import { toDisplaySymbol } from './binance-service.ts';

/** Raw Binance WebSocket trade payload (@trade stream) */
export interface RawWsTrade {
  e?: string; // Event type: "trade"
  E?: number; // Event time
  s?: string; // Symbol
  t?: number; // Trade ID
  p: string;  // Price
  q: string;  // Quantity
  b?: number; // Buyer order ID
  a?: number; // Seller order ID
  T?: number; // Trade time
  m: boolean; // Is the buyer the market maker? true = Maker Buy / Taker Sell, false = Taker Buy
  M?: boolean; // Ignore
}

/**
 * Classifies trade volume (in USDT) into size tiers:
 * - SMALL: < $1,000
 * - MEDIUM: $1,000 - $10,000
 * - LARGE: $10,000 - $50,000
 * - WHALE: >= $50,000
 */
export function classifyTradeSize(volumeUsdt: number): TradeSizeCategory {
  if (volumeUsdt >= 50000) return 'WHALE';
  if (volumeUsdt >= 10000) return 'LARGE';
  if (volumeUsdt >= 1000) return 'MEDIUM';
  return 'SMALL';
}

/**
 * Parses raw Binance trade payload into a normalized LiveTradeTick.
 * In Binance spot:
 * - m === false -> Buyer was the taker (aggressive buyer lifting the ask) -> 'BUY'
 * - m === true  -> Seller was the taker (aggressive seller hitting the bid) -> 'SELL'
 */
export function parseTradePayload(
  raw: RawWsTrade,
  fallbackSymbol = 'BTCUSDT'
): LiveTradeTick {
  const price = parseFloat(raw.p) || 0;
  const quantity = parseFloat(raw.q) || 0;
  const volumeUsdt = Number((price * quantity).toFixed(2));
  const isBuyerMaker = Boolean(raw.m);
  const side: 'BUY' | 'SELL' = isBuyerMaker ? 'SELL' : 'BUY';
  const sizeCategory = classifyTradeSize(volumeUsdt);
  const isWhale = volumeUsdt >= 10000; // Large & Whale orders flagged for whale filter

  const symbol = toDisplaySymbol(raw.s || fallbackSymbol);

  return {
    id: raw.t ?? Date.now(),
    symbol,
    price,
    quantity,
    volumeUsdt,
    side,
    isBuyerMaker,
    timestamp: raw.T || raw.E || Date.now(),
    sizeCategory,
    isWhale,
  };
}

/**
 * Computes aggregated flow statistics and Cumulative Volume Delta (CVD)
 * over a sliding window of recent live trades.
 */
export function computeTradeFlowStats(
  trades: LiveTradeTick[],
  symbol: string
): TradeFlowStats {
  if (!trades || trades.length === 0) {
    return {
      symbol: toDisplaySymbol(symbol),
      totalTrades: 0,
      buyCount: 0,
      sellCount: 0,
      buyVolumeUsdt: 0,
      sellVolumeUsdt: 0,
      totalVolumeUsdt: 0,
      netCvdUsdt: 0,
      takerBuyRatio: 0.5,
      largestTradeUsdt: 0,
      whaleTradeCount: 0,
      lastUpdated: Date.now(),
    };
  }

  let buyCount = 0;
  let sellCount = 0;
  let buyVolumeUsdt = 0;
  let sellVolumeUsdt = 0;
  let largestTradeUsdt = 0;
  let whaleTradeCount = 0;

  for (const trade of trades) {
    if (trade.side === 'BUY') {
      buyCount++;
      buyVolumeUsdt += trade.volumeUsdt;
    } else {
      sellCount++;
      sellVolumeUsdt += trade.volumeUsdt;
    }

    if (trade.volumeUsdt > largestTradeUsdt) {
      largestTradeUsdt = trade.volumeUsdt;
    }

    if (trade.isWhale) {
      whaleTradeCount++;
    }
  }

  buyVolumeUsdt = Number(buyVolumeUsdt.toFixed(2));
  sellVolumeUsdt = Number(sellVolumeUsdt.toFixed(2));
  const totalVolumeUsdt = Number((buyVolumeUsdt + sellVolumeUsdt).toFixed(2));
  const netCvdUsdt = Number((buyVolumeUsdt - sellVolumeUsdt).toFixed(2));
  const takerBuyRatio =
    totalVolumeUsdt > 0 ? Number((buyVolumeUsdt / totalVolumeUsdt).toFixed(4)) : 0.5;

  return {
    symbol: toDisplaySymbol(symbol),
    totalTrades: trades.length,
    buyCount,
    sellCount,
    buyVolumeUsdt,
    sellVolumeUsdt,
    totalVolumeUsdt,
    netCvdUsdt,
    takerBuyRatio,
    largestTradeUsdt: Number(largestTradeUsdt.toFixed(2)),
    whaleTradeCount,
    lastUpdated: Date.now(),
  };
}

/**
 * Generates synthetic realistic trade ticks for fallback, offline, or test states.
 */
export function generateSyntheticTrades(
  symbol: string,
  basePrice: number,
  count = 20
): LiveTradeTick[] {
  const displaySym = toDisplaySymbol(symbol);
  const trades: LiveTradeTick[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    // Price variance +/- 0.15%
    const priceDelta = (Math.random() - 0.49) * 0.003 * basePrice;
    const price = Number((basePrice + priceDelta).toFixed(2));

    // Variable quantity ranging from small retail to occasional whale
    const isWhaleChance = Math.random() < 0.15;
    const isLargeChance = Math.random() < 0.25;

    let volumeUsdt: number;
    if (isWhaleChance) {
      volumeUsdt = 50000 + Math.random() * 45000;
    } else if (isLargeChance) {
      volumeUsdt = 10000 + Math.random() * 25000;
    } else {
      volumeUsdt = 100 + Math.random() * 4000;
    }

    const quantity = Number((volumeUsdt / price).toFixed(4));
    volumeUsdt = Number((price * quantity).toFixed(2));

    const isBuyerMaker = Math.random() > 0.52; // slight buy bias
    const side: 'BUY' | 'SELL' = isBuyerMaker ? 'SELL' : 'BUY';
    const sizeCategory = classifyTradeSize(volumeUsdt);

    trades.push({
      id: now - (count - i) * 800 + i,
      symbol: displaySym,
      price,
      quantity,
      volumeUsdt,
      side,
      isBuyerMaker,
      timestamp: now - (count - i) * 800,
      sizeCategory,
      isWhale: volumeUsdt >= 10000,
    });
  }

  return trades;
}
