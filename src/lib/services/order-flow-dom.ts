// ─── U-SPOT Real-Time Order Flow & DOM Heatmap Service (Phase 31) ─────
// Computes Depth of Market (DOM) ladders, cumulative volume profiling,
// heatmap intensity color scaling, and liquidity distribution metrics.

import type {
  LiveDepthStreamPayload,
  OrderBookEntry,
  OrderBookWall,
  DOMRow,
  DOMHeatmapSnapshot,
} from '../../types/index.ts';
import { detectOrderBookWalls } from './binance-websocket.ts';

/**
 * Returns sensible tick aggregation sizes based on asset price magnitude
 */
export function getRecommendedTickSizes(midPrice: number): number[] {
  if (midPrice >= 10000) {
    return [0.1, 1, 5, 10, 50];
  }
  if (midPrice >= 1000) {
    return [0.05, 0.5, 1, 5];
  }
  if (midPrice >= 10) {
    return [0.01, 0.05, 0.1, 0.5];
  }
  if (midPrice >= 1) {
    return [0.005, 0.01, 0.05, 0.1];
  }
  return [0.0001, 0.0005, 0.001, 0.005];
}

/**
 * Aggregates order book entries into custom tick size bins.
 * Bids round DOWN to conservative execution price.
 * Asks round UP to conservative execution price.
 */
export function aggregateOrderBookLevels(
  entries: OrderBookEntry[],
  tickSize: number,
  side: 'BID' | 'ASK'
): OrderBookEntry[] {
  if (!tickSize || tickSize <= 0 || entries.length === 0) {
    return [...entries];
  }

  const binMap = new Map<number, number>();

  for (const [price, qty] of entries) {
    if (price <= 0 || qty <= 0) continue;

    let binnedPrice: number;
    if (side === 'BID') {
      binnedPrice = Math.floor(price / tickSize + 1e-9) * tickSize;
    } else {
      binnedPrice = Math.ceil(price / tickSize - 1e-9) * tickSize;
    }

    // Fix floating point precision artifacts
    binnedPrice = Number(binnedPrice.toFixed(6));
    const currentQty = binMap.get(binnedPrice) || 0;
    binMap.set(binnedPrice, currentQty + qty);
  }

  const binned: OrderBookEntry[] = Array.from(binMap.entries()).map(([p, q]) => [
    p,
    Number(q.toFixed(6)),
  ]);

  if (side === 'BID') {
    return binned.sort((a, b) => b[0] - a[0]); // Descending (highest bid first)
  }
  return binned.sort((a, b) => a[0] - b[0]); // Ascending (lowest ask first)
}

/**
 * Builds a complete DOM Heatmap Snapshot from a live depth payload
 */
export function buildDOMHeatmapSnapshot(
  depth: LiveDepthStreamPayload,
  options: { maxLevels?: number; tickSize?: number } = {}
): DOMHeatmapSnapshot {
  const { maxLevels = 15, tickSize } = options;

  let rawBids = depth.bids || [];
  let rawAsks = depth.asks || [];

  if (tickSize && tickSize > 0) {
    rawBids = aggregateOrderBookLevels(rawBids, tickSize, 'BID');
    rawAsks = aggregateOrderBookLevels(rawAsks, tickSize, 'ASK');
  }

  const bids = rawBids.slice(0, maxLevels);
  const asks = rawAsks.slice(0, maxLevels);

  const bestBid = bids[0]?.[0] || depth.bestBid || 0;
  const bestAsk = asks[0]?.[0] || depth.bestAsk || 0;
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : depth.spread || 0;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  // 1. Calculate individual level volume in USDT
  const bidVols = bids.map(([p, q]) => p * q);
  const askVols = asks.map(([p, q]) => p * q);

  const totalBidDepthUsdt = bidVols.reduce((acc, v) => acc + v, 0);
  const totalAskDepthUsdt = askVols.reduce((acc, v) => acc + v, 0);
  const totalDepth = totalBidDepthUsdt + totalAskDepthUsdt;

  const bidAskRatio =
    totalAskDepthUsdt > 0 ? Number((totalBidDepthUsdt / totalAskDepthUsdt).toFixed(2)) : 1.0;
  const depthImbalance =
    totalDepth > 0 ? Number(((totalBidDepthUsdt - totalAskDepthUsdt) / totalDepth).toFixed(3)) : 0;

  // 2. Identify peak level volume for heatmap intensity normalization
  const peakLevelVolumeUsdt = Math.max(1, ...bidVols, ...askVols);
  const avgLevelVol = totalDepth > 0 ? totalDepth / Math.max(1, bids.length + asks.length) : 1;

  // 3. Detect walls on active levels
  const detectedWalls = [
    ...detectOrderBookWalls(bids, 'BID', midPrice),
    ...detectOrderBookWalls(asks, 'ASK', midPrice),
  ];

  // 4. Construct Bid Rows (best bid downwards)
  let runningBidCum = 0;
  const bidRows: DOMRow[] = bids.map(([price, qty], i) => {
    const volUsdt = bidVols[i];
    runningBidCum += volUsdt;
    const isWall = volUsdt >= avgLevelVol * 2.5;
    const distancePercent = midPrice > 0 ? ((midPrice - price) / midPrice) * 100 : 0;

    return {
      price,
      side: 'BID',
      quantity: qty,
      volumeUsdt: Math.round(volUsdt),
      cumulativeVolumeUsdt: Math.round(runningBidCum),
      cumulativeDepthPercent:
        totalBidDepthUsdt > 0 ? Math.min(100, Math.round((runningBidCum / totalBidDepthUsdt) * 100)) : 0,
      heatIntensity: Number(Math.min(1.0, volUsdt / peakLevelVolumeUsdt).toFixed(3)),
      isWall,
      wallMultiple: avgLevelVol > 0 ? Number((volUsdt / avgLevelVol).toFixed(1)) : undefined,
      isBestBid: i === 0,
      isBestAsk: false,
      distancePercentFromMid: Number(Math.max(0, distancePercent).toFixed(2)),
    };
  });

  // 5. Construct Ask Rows (best ask upwards)
  let runningAskCum = 0;
  const rawAskRows: DOMRow[] = asks.map(([price, qty], i) => {
    const volUsdt = askVols[i];
    runningAskCum += volUsdt;
    const isWall = volUsdt >= avgLevelVol * 2.5;
    const distancePercent = midPrice > 0 ? ((price - midPrice) / midPrice) * 100 : 0;

    return {
      price,
      side: 'ASK',
      quantity: qty,
      volumeUsdt: Math.round(volUsdt),
      cumulativeVolumeUsdt: Math.round(runningAskCum),
      cumulativeDepthPercent:
        totalAskDepthUsdt > 0 ? Math.min(100, Math.round((runningAskCum / totalAskDepthUsdt) * 100)) : 0,
      heatIntensity: Number(Math.min(1.0, volUsdt / peakLevelVolumeUsdt).toFixed(3)),
      isWall,
      wallMultiple: avgLevelVol > 0 ? Number((volUsdt / avgLevelVol).toFixed(1)) : undefined,
      isBestBid: false,
      isBestAsk: i === 0,
      distancePercentFromMid: Number(Math.max(0, distancePercent).toFixed(2)),
    };
  });

  // For visual DOM display: Asks are rendered top-to-bottom descending to meet the spread
  // Highest ask on top, best ask directly above mid-price
  const askRows = [...rawAskRows].reverse();

  return {
    symbol: depth.symbol,
    midPrice: Number(midPrice.toFixed(4)),
    spread: Number(spread.toFixed(4)),
    spreadPercent: Number(spreadPercent.toFixed(3)),
    bestBid,
    bestAsk,
    totalBidDepthUsdt: Math.round(totalBidDepthUsdt),
    totalAskDepthUsdt: Math.round(totalAskDepthUsdt),
    bidAskRatio,
    depthImbalance,
    peakLevelVolumeUsdt: Math.round(peakLevelVolumeUsdt),
    askRows,
    bidRows,
    detectedWalls,
    timestamp: depth.timestamp || Date.now(),
  };
}

/**
 * Calculates liquidity distribution metrics across price bands (+/- 0.5%, 1%, 2%)
 */
export interface LiquidityBandDistribution {
  rangePercent: number; // e.g. 0.5, 1.0, 2.0
  bidVolumeUsdt: number;
  askVolumeUsdt: number;
  buyerDominancePercent: number;
}

export function computeLiquidityBands(
  snapshot: DOMHeatmapSnapshot,
  ranges = [0.5, 1.0, 2.0]
): LiquidityBandDistribution[] {
  const { midPrice, bidRows, askRows } = snapshot;
  if (midPrice <= 0) return [];

  return ranges.map((pct) => {
    let bidVol = 0;
    for (const r of bidRows) {
      if (r.distancePercentFromMid <= pct) {
        bidVol += r.volumeUsdt;
      }
    }

    let askVol = 0;
    for (const r of askRows) {
      if (r.distancePercentFromMid <= pct) {
        askVol += r.volumeUsdt;
      }
    }

    const total = bidVol + askVol;
    const buyerDominance = total > 0 ? Math.round((bidVol / total) * 100) : 50;

    return {
      rangePercent: pct,
      bidVolumeUsdt: bidVol,
      askVolumeUsdt: askVol,
      buyerDominancePercent: buyerDominance,
    };
  });
}
