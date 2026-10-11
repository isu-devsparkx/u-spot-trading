import type { OrderBook, OHLCV, LiquidityFlowAnalysis, OrderBookWall } from '../../types/index.ts';

/**
 * Calculates volume delta proxy from candle price action:
 * When price closes near high, majority of volume is attributed to aggressive market buys.
 * Delta Proxy = Volume * (2 * (Close - Low) / (High - Low) - 1)
 */
export function calculateVolumeDeltaProxy(klines: OHLCV[]): number {
  if (klines.length === 0) return 0;

  let totalDelta = 0;
  let totalVolume = 0;

  // Look at last 5 candles
  const lookback = Math.min(5, klines.length);
  const recent = klines.slice(klines.length - lookback);

  for (const bar of recent) {
    const range = bar.high - bar.low;
    if (range > 0) {
      const buyerFraction = (bar.close - bar.low) / range; // 0 to 1
      const barDelta = bar.volume * (buyerFraction * 2 - 1); // -vol to +vol
      totalDelta += barDelta;
      totalVolume += bar.volume;
    }
  }

  if (totalVolume === 0) return 0;
  // Normalize to -100 to +100
  return Math.round((totalDelta / totalVolume) * 100);
}

/**
 * Identifies high-concentration liquidity clusters (Bid Walls & Ask Walls)
 * from order book depth.
 */
export function findOrderBookWalls(
  orderBook: OrderBook,
  referencePrice: number
): {
  nearestBidWall: OrderBookWall | null;
  nearestAskWall: OrderBookWall | null;
  bidAskRatio: number;
} {
  const currentPrice =
    referencePrice > 0
      ? referencePrice
      : (orderBook.bids[0]?.[0] || orderBook.asks[0]?.[0] || 1);

  const { bids, asks, bidDepthUsdt, askDepthUsdt } = orderBook;
  const bidAskRatio =
    askDepthUsdt > 0
      ? Math.round((bidDepthUsdt / askDepthUsdt) * 100) / 100
      : 1.0;

  let nearestBidWall: OrderBookWall | null = null;
  if (bids.length > 0 && bidDepthUsdt > 0) {
    const avgBidLevelUsdt = bidDepthUsdt / bids.length;
    // Threshold: at least 2.0x average level or 12% of total bid depth (min $5k)
    const thresholdUsdt = Math.max(avgBidLevelUsdt * 2.0, bidDepthUsdt * 0.12, 5000);

    for (const [p, q] of bids) {
      if (p < currentPrice) {
        const distPercent = ((currentPrice - p) / currentPrice) * 100;
        // Only inspect walls within 4.0% of price
        if (distPercent <= 4.0) {
          const levelVolUsdt = p * q;
          if (levelVolUsdt >= thresholdUsdt) {
            nearestBidWall = {
              price: p,
              volumeUsdt: Math.round(levelVolUsdt),
              percentFromPrice: Math.round(distPercent * 100) / 100,
            };
            break; // Stop at closest bid wall beneath current price
          }
        }
      }
    }
  }

  let nearestAskWall: OrderBookWall | null = null;
  if (asks.length > 0 && askDepthUsdt > 0) {
    const avgAskLevelUsdt = askDepthUsdt / asks.length;
    // Threshold: at least 2.0x average level or 12% of total ask depth (min $5k)
    const thresholdUsdt = Math.max(avgAskLevelUsdt * 2.0, askDepthUsdt * 0.12, 5000);

    for (const [p, q] of asks) {
      if (p > currentPrice) {
        const distPercent = ((p - currentPrice) / currentPrice) * 100;
        // Only inspect walls within 4.5% of price
        if (distPercent <= 4.5) {
          const levelVolUsdt = p * q;
          if (levelVolUsdt >= thresholdUsdt) {
            nearestAskWall = {
              price: p,
              volumeUsdt: Math.round(levelVolUsdt),
              percentFromPrice: Math.round(distPercent * 100) / 100,
            };
            break; // Stop at closest ask wall above current price
          }
        }
      }
    }
  }

  return {
    nearestBidWall,
    nearestAskWall,
    bidAskRatio,
  };
}

/**
 * Main Liquidity & Order Flow Evaluator
 * Spec Section 8.6 with Phase 23 Order Book Wall Cluster detection
 */
export function analyzeLiquidityFlow(
  orderBook: OrderBook | null,
  klines: OHLCV[]
): LiquidityFlowAnalysis {
  const volumeDeltaProxy = calculateVolumeDeltaProxy(klines);
  const currentPrice = klines.length > 0 ? klines[klines.length - 1].close : 0;

  if (!orderBook) {
    // Fallback when order book is unavailable (e.g. historical backtesting)
    let fallbackScore = 50 + volumeDeltaProxy * 0.25;
    fallbackScore = Math.max(15, Math.min(85, Math.round(fallbackScore)));

    return {
      orderBookImbalance: 0,
      spreadPercent: 0.05,
      bidDepthUsdt: 0,
      askDepthUsdt: 0,
      volumeDeltaProxy,
      isLiquid: true,
      score: fallbackScore,
      description: `Volume delta proxy indicates ${volumeDeltaProxy > 0 ? 'net buying' : 'net selling'} pressure (${volumeDeltaProxy > 0 ? '+' : ''}${volumeDeltaProxy}%)`,
      nearestBidWall: null,
      nearestAskWall: null,
      bidAskRatio: 1.0,
    };
  }

  const { spreadPercent, bidDepthUsdt, askDepthUsdt } = orderBook;
  const totalDepth = bidDepthUsdt + askDepthUsdt;

  // Order book imbalance: -1.0 (100% asks) to +1.0 (100% bids)
  const orderBookImbalance =
    totalDepth > 0
      ? Math.round(((bidDepthUsdt - askDepthUsdt) / totalDepth) * 100) / 100
      : 0;

  // Is liquid check: spread <= 0.2% and depth >= $50k
  const isLiquid = spreadPercent <= 0.2 && totalDepth >= 50_000;

  // Wall analysis
  const { nearestBidWall, nearestAskWall, bidAskRatio } = findOrderBookWalls(
    orderBook,
    currentPrice
  );

  // Liquidity score (0-100)
  let score = 50;
  let description = '';

  // Order book imbalance contribution
  if (orderBookImbalance >= 0.25) {
    score += 25; // Significant bid wall / buyer absorption
  } else if (orderBookImbalance >= 0.1) {
    score += 12;
  } else if (orderBookImbalance <= -0.25) {
    score -= 25; // Heavy ask pressure / supply overhead
  } else if (orderBookImbalance <= -0.1) {
    score -= 12;
  }

  // Wall presence contribution
  if (nearestBidWall && (!nearestAskWall || nearestBidWall.volumeUsdt > nearestAskWall.volumeUsdt)) {
    score += 6;
  } else if (nearestAskWall && nearestAskWall.percentFromPrice < 1.2 && orderBookImbalance < 0) {
    score -= 8;
  }

  // Spread contribution
  if (spreadPercent <= 0.02) score += 15;
  else if (spreadPercent <= 0.05) score += 8;
  else if (spreadPercent > 0.15) score -= 15;

  // Volume delta proxy contribution
  if (volumeDeltaProxy >= 25) score += 10;
  else if (volumeDeltaProxy <= -25) score -= 10;

  score = Math.max(10, Math.min(99, Math.round(score)));

  // Synthesize rich descriptive summary
  if (orderBookImbalance >= 0.2 && spreadPercent <= 0.03) {
    description = `Strong buy-side depth imbalance (+${Math.round(orderBookImbalance * 100)}% bids) with tight ${spreadPercent}% spread`;
  } else if (orderBookImbalance <= -0.2) {
    description = `Sell-side order book pressure (-${Math.round(Math.abs(orderBookImbalance) * 100)}% asks)`;
  } else if (isLiquid) {
    description = `Balanced order book with solid spot liquidity ($${Math.round(totalDepth).toLocaleString()} depth, ${spreadPercent}% spread)`;
  } else {
    description = `Wide spread (${spreadPercent}%) or thin order book depth — caution on execution slippage`;
  }

  if (nearestBidWall) {
    description += ` | Bid wall: $${nearestBidWall.price} ($${Math.round(nearestBidWall.volumeUsdt / 1000)}k)`;
  }
  if (nearestAskWall) {
    description += ` | Ask wall: $${nearestAskWall.price} ($${Math.round(nearestAskWall.volumeUsdt / 1000)}k)`;
  }

  return {
    orderBookImbalance,
    spreadPercent,
    bidDepthUsdt: Math.round(bidDepthUsdt),
    askDepthUsdt: Math.round(askDepthUsdt),
    volumeDeltaProxy,
    isLiquid,
    score,
    description,
    nearestBidWall,
    nearestAskWall,
    bidAskRatio,
  };
}
