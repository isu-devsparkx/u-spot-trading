// ─── U-SPOT Real-Time Order Flow Heatmap Service (Phase 41) ──────────
// Depth slice construction, intensity color-mapping, rolling buffer management,
// institutional wall highlights, and depth volume delta aggregations.

import type {
  LiveDepthStreamPayload,
  OrderBookEntry,
  OrderFlowHeatmapSlice,
  HeatmapPriceBucket,
  HeatmapColorTheme,
  HeatmapRenderConfig,
  HeatmapResolution,
} from '@/types';

export const DEFAULT_HEATMAP_CONFIG: HeatmapRenderConfig = {
  resolution: '1m',
  theme: 'CYAN_EMERALD',
  contrastMultiplier: 1.2,
  maxHistorySlices: 60,
  showDeltaBars: true,
  showWallOverlays: true,
  showMidPriceLine: true,
  paused: false,
};

export interface DepthDeltaSummary {
  currentDepthDeltaUsdt: number;
  cumulativeDeltaUsdt: number;
  bidDominancePct: number;
  askDominancePct: number;
  maxDeltaUsdt: number;
  minDeltaUsdt: number;
  deltaTrend: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED';
  totalWhaleWalls: number;
}

/**
 * Maps volume intensity (0.0 to 1.0) to an RGBA color based on the selected theme.
 */
export function getHeatmapColor(
  intensity: number,
  side: 'BID' | 'ASK',
  theme: HeatmapColorTheme,
  isWall: boolean = false,
  contrastMultiplier: number = 1.0
): string {
  // Apply contrast boost clamped to [0.05, 1.0]
  const clampedIntensity = Math.min(1.0, Math.max(0.05, intensity * contrastMultiplier));

  if (isWall) {
    if (theme === 'CYAN_EMERALD') {
      return side === 'BID' ? 'rgba(52, 211, 153, 0.95)' : 'rgba(34, 211, 238, 0.95)';
    } else if (theme === 'NEON_FIRE') {
      return side === 'BID' ? 'rgba(250, 204, 21, 0.95)' : 'rgba(244, 63, 94, 0.95)';
    } else {
      return side === 'BID' ? 'rgba(74, 222, 128, 0.95)' : 'rgba(248, 113, 113, 0.95)';
    }
  }

  // Alpha mapped exponentially for smooth liquidity heat dissipation
  const alpha = Math.min(0.9, Math.max(0.12, Math.pow(clampedIntensity, 0.85)));

  switch (theme) {
    case 'CYAN_EMERALD':
      if (side === 'BID') {
        // Emerald gradient: deeper green for low heat, bright mint for high heat
        const g = Math.round(140 + clampedIntensity * 100);
        return `rgba(16, ${g}, 129, ${alpha.toFixed(2)})`;
      } else {
        // Cyan gradient: deeper blue for low heat, electric cyan for high heat
        const r = Math.round(6 + clampedIntensity * 40);
        const g = Math.round(140 + clampedIntensity * 90);
        return `rgba(${r}, ${g}, 235, ${alpha.toFixed(2)})`;
      }

    case 'NEON_FIRE':
      if (side === 'BID') {
        // Neon yellow-green lime
        const r = Math.round(110 + clampedIntensity * 80);
        const g = Math.round(190 + clampedIntensity * 55);
        return `rgba(${r}, ${g}, 22, ${alpha.toFixed(2)})`;
      } else {
        // Fiery magenta / neon orange-red
        const g = Math.round(30 + (1 - clampedIntensity) * 40);
        return `rgba(244, ${g}, 94, ${alpha.toFixed(2)})`;
      }

    case 'CLASSIC_DEPTH':
    default:
      if (side === 'BID') {
        // Classic deep emerald green
        return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
      } else {
        // Classic crimson rose
        return `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
      }
  }
}

/**
 * Constructs an individual time slice from live order book depth.
 */
export function createHeatmapSlice(
  depth: LiveDepthStreamPayload,
  previousCumulativeDelta: number = 0,
  config: Partial<HeatmapRenderConfig> = {}
): OrderFlowHeatmapSlice {
  const contrast = config.contrastMultiplier ?? 1.2;
  const bids = depth.bids || [];
  const asks = depth.asks || [];

  const bestBid = depth.bestBid || (bids[0] ? bids[0][0] : 0);
  const bestAsk = depth.bestAsk || (asks[0] ? asks[0][0] : 0);
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
  const spreadUsdt = Math.max(0, bestAsk - bestBid);

  // Extract raw levels
  const rawBuckets: { price: number; volumeUsdt: number; side: 'BID' | 'ASK' }[] = [];

  let totalBidLiquidityUsdt = 0;
  for (const [p, q] of bids) {
    const vol = p * q;
    totalBidLiquidityUsdt += vol;
    rawBuckets.push({ price: p, volumeUsdt: vol, side: 'BID' });
  }

  let totalAskLiquidityUsdt = 0;
  for (const [p, q] of asks) {
    const vol = p * q;
    totalAskLiquidityUsdt += vol;
    rawBuckets.push({ price: p, volumeUsdt: vol, side: 'ASK' });
  }

  const allVols = rawBuckets.map((b) => b.volumeUsdt);
  const maxVol = allVols.length > 0 ? Math.max(...allVols, 1) : 1;
  const avgVol = allVols.length > 0 ? allVols.reduce((a, b) => a + b, 0) / allVols.length : 1;
  const wallThreshold = avgVol * 2.5;

  let whaleWallsCount = 0;

  // Known walls from depth payload
  const knownWallPrices = new Set<number>([
    ...(depth.bidWalls || []).map((w) => w.price),
    ...(depth.askWalls || []).map((w) => w.price),
  ]);

  const buckets: HeatmapPriceBucket[] = rawBuckets.map((b) => {
    const isWall = b.volumeUsdt >= wallThreshold || knownWallPrices.has(b.price);
    if (isWall) whaleWallsCount++;
    const intensity = Math.min(1.0, (b.volumeUsdt / maxVol) * contrast);

    return {
      price: b.price,
      volumeUsdt: Math.round(b.volumeUsdt * 100) / 100,
      side: b.side,
      intensity: Math.round(intensity * 1000) / 1000,
      isWall,
    };
  });

  const depthDeltaUsdt = Math.round((totalBidLiquidityUsdt - totalAskLiquidityUsdt) * 100) / 100;
  const cumulativeDeltaUsdt = Math.round((previousCumulativeDelta + depthDeltaUsdt) * 100) / 100;

  return {
    timestamp: depth.timestamp || Date.now(),
    midPrice: Math.round(midPrice * 10000) / 10000,
    bestBid,
    bestAsk,
    spreadUsdt: Math.round(spreadUsdt * 10000) / 10000,
    buckets,
    totalBidLiquidityUsdt: Math.round(totalBidLiquidityUsdt * 100) / 100,
    totalAskLiquidityUsdt: Math.round(totalAskLiquidityUsdt * 100) / 100,
    depthDeltaUsdt,
    cumulativeDeltaUsdt,
    whaleWallsCount,
  };
}

/**
 * Appends a new slice to the rolling buffer, maintaining max history slice constraint.
 */
export function appendHeatmapSlice(
  buffer: OrderFlowHeatmapSlice[],
  newSlice: OrderFlowHeatmapSlice,
  maxSlices: number = 60
): OrderFlowHeatmapSlice[] {
  const updated = [...buffer, newSlice];
  if (updated.length > maxSlices) {
    return updated.slice(updated.length - maxSlices);
  }
  return updated;
}

/**
 * Calculates depth delta metrics and buy/sell dominance across visible slices.
 */
export function calculateDepthDeltaStats(slices: OrderFlowHeatmapSlice[]): DepthDeltaSummary {
  if (slices.length === 0) {
    return {
      currentDepthDeltaUsdt: 0,
      cumulativeDeltaUsdt: 0,
      bidDominancePct: 50,
      askDominancePct: 50,
      maxDeltaUsdt: 0,
      minDeltaUsdt: 0,
      deltaTrend: 'BALANCED',
      totalWhaleWalls: 0,
    };
  }

  const latest = slices[slices.length - 1];
  const deltas = slices.map((s) => s.depthDeltaUsdt);
  const maxDeltaUsdt = Math.max(...deltas);
  const minDeltaUsdt = Math.min(...deltas);

  const totalBids = slices.reduce((acc, s) => acc + s.totalBidLiquidityUsdt, 0);
  const totalAsks = slices.reduce((acc, s) => acc + s.totalAskLiquidityUsdt, 0);
  const sumLiquidity = totalBids + totalAsks;

  const bidDominancePct = sumLiquidity > 0 ? Math.round((totalBids / sumLiquidity) * 100) : 50;
  const askDominancePct = 100 - bidDominancePct;

  let deltaTrend: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED' = 'BALANCED';
  if (bidDominancePct >= 55) {
    deltaTrend = 'BUY_PRESSURE';
  } else if (askDominancePct >= 55) {
    deltaTrend = 'SELL_PRESSURE';
  }

  const totalWhaleWalls = slices.reduce((acc, s) => acc + s.whaleWallsCount, 0);

  return {
    currentDepthDeltaUsdt: latest.depthDeltaUsdt,
    cumulativeDeltaUsdt: latest.cumulativeDeltaUsdt,
    bidDominancePct,
    askDominancePct,
    maxDeltaUsdt,
    minDeltaUsdt,
    deltaTrend,
    totalWhaleWalls,
  };
}

/**
 * Pre-populates synthetic historical depth slices leading up to the current depth.
 * Ensures the heatmap renders a rich historical visualization immediately without waiting minutes.
 */
export function generateSyntheticHeatmapHistory(
  currentDepth: LiveDepthStreamPayload,
  count: number = 30,
  resolutionMs: number = 2000
): OrderFlowHeatmapSlice[] {
  const slices: OrderFlowHeatmapSlice[] = [];
  const now = currentDepth.timestamp || Date.now();
  let runningCumDelta = 0;

  const baseBids = currentDepth.bids || [];
  const baseAsks = currentDepth.asks || [];
  const basePrice = currentDepth.bestBid || (baseBids[0] ? baseBids[0][0] : 100);

  for (let i = count - 1; i >= 0; i--) {
    const sliceTime = now - i * resolutionMs;
    // Micro-jitter price & volumes for realistic order flow movement
    const jitterFactor = 1 + (Math.sin(i * 0.4) * 0.0008) + ((i % 3 === 0 ? 1 : -1) * 0.0003);
    const volumeMultiplier = 0.8 + Math.abs(Math.sin(i * 0.5)) * 0.5;

    const jitteredBids: OrderBookEntry[] = baseBids.map(([p, q]) => [
      Math.round(p * jitterFactor * 100) / 100,
      Math.round(q * volumeMultiplier * 1000) / 1000,
    ]);

    const jitteredAsks: OrderBookEntry[] = baseAsks.map(([p, q]) => [
      Math.round(p * jitterFactor * 100) / 100,
      Math.round(q * (2 - volumeMultiplier) * 1000) / 1000,
    ]);

    const synthDepth: LiveDepthStreamPayload = {
      ...currentDepth,
      timestamp: sliceTime,
      bids: jitteredBids,
      asks: jitteredAsks,
      bestBid: jitteredBids[0] ? jitteredBids[0][0] : basePrice * 0.999,
      bestAsk: jitteredAsks[0] ? jitteredAsks[0][0] : basePrice * 1.001,
    };

    const slice = createHeatmapSlice(synthDepth, runningCumDelta);
    runningCumDelta = slice.cumulativeDeltaUsdt;
    slices.push(slice);
  }

  return slices;
}
