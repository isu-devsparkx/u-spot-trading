// ─── Phase 41: Order Flow Heatmap 2.0 Service Unit Tests ───────────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createHeatmapSlice,
  appendHeatmapSlice,
  getHeatmapColor,
  calculateDepthDeltaStats,
  generateSyntheticHeatmapHistory,
  DEFAULT_HEATMAP_CONFIG,
} from '../services/order-flow-heatmap.ts';
import type { LiveDepthStreamPayload } from '../../types/index.ts';

describe('OrderFlowHeatmapService (Phase 41)', () => {
  const mockDepth: LiveDepthStreamPayload = {
    symbol: 'BTC/USDT',
    lastUpdateId: 10001,
    timestamp: 1700000000000,
    bids: [
      [68000, 1.5],
      [67950, 3.0],
      [67900, 10.0], // Big wall: 679000 USDT
    ],
    asks: [
      [68050, 1.2],
      [68100, 2.5],
      [68150, 4.0],
    ],
    bestBid: 68000,
    bestAsk: 68050,
    spread: 50,
    spreadPercent: 0.0735,
    bidDepthUsdt: 984500,
    askDepthUsdt: 524450,
    depthImbalance: 0.304,
    bidWalls: [
      {
        price: 67900,
        volumeUsdt: 679000,
        multipleOfAverage: 3.2,
        distancePercent: 0.147,
        percentFromPrice: 0.15,
      },
    ],
    askWalls: [],
  };

  it('correctly creates a heatmap slice with mid price and buckets', () => {
    const slice = createHeatmapSlice(mockDepth, 15000);

    assert.strictEqual(slice.midPrice, 68025);
    assert.strictEqual(slice.spreadUsdt, 50);
    assert.strictEqual(slice.buckets.length, 6);
    assert.ok(slice.totalBidLiquidityUsdt > 0);
    assert.ok(slice.totalAskLiquidityUsdt > 0);
    assert.strictEqual(
      slice.depthDeltaUsdt,
      Math.round((slice.totalBidLiquidityUsdt - slice.totalAskLiquidityUsdt) * 100) / 100
    );
    assert.strictEqual(
      slice.cumulativeDeltaUsdt,
      Math.round((15000 + slice.depthDeltaUsdt) * 100) / 100
    );
  });

  it('identifies institutional liquidity walls in buckets', () => {
    const slice = createHeatmapSlice(mockDepth);
    const wallBucket = slice.buckets.find((b) => b.price === 67900);

    assert.ok(wallBucket);
    assert.strictEqual(wallBucket?.isWall, true);
    assert.ok(slice.whaleWallsCount >= 1);
  });

  it('maps colors accurately across themes and sides', () => {
    // CYAN_EMERALD theme
    const bidCyan = getHeatmapColor(0.8, 'BID', 'CYAN_EMERALD', false, 1.0);
    assert.ok(bidCyan.includes('rgba(16,'));

    const askCyan = getHeatmapColor(0.8, 'ASK', 'CYAN_EMERALD', false, 1.0);
    assert.ok(askCyan.includes('235'));

    // NEON_FIRE theme
    const bidNeon = getHeatmapColor(0.9, 'BID', 'NEON_FIRE', false, 1.0);
    assert.ok(bidNeon.includes('22'));

    const askNeon = getHeatmapColor(0.9, 'ASK', 'NEON_FIRE', false, 1.0);
    assert.ok(askNeon.includes('rgba(244,'));

    // CLASSIC_DEPTH theme
    const bidClassic = getHeatmapColor(0.5, 'BID', 'CLASSIC_DEPTH', false, 1.0);
    assert.ok(bidClassic.includes('rgba(34, 197, 94'));

    const askClassic = getHeatmapColor(0.5, 'ASK', 'CLASSIC_DEPTH', false, 1.0);
    assert.ok(askClassic.includes('rgba(239, 68, 68'));

    // Wall highlight overrides
    const wallColor = getHeatmapColor(0.5, 'BID', 'CYAN_EMERALD', true, 1.0);
    assert.strictEqual(wallColor, 'rgba(52, 211, 153, 0.95)');
  });

  it('manages rolling buffer capacity and preserves max slices limit', () => {
    const slice1 = createHeatmapSlice(mockDepth, 0);
    const slice2 = createHeatmapSlice(mockDepth, 100);
    const slice3 = createHeatmapSlice(mockDepth, 200);

    let buffer = [slice1, slice2];
    buffer = appendHeatmapSlice(buffer, slice3, 2);

    assert.strictEqual(buffer.length, 2);
    assert.strictEqual(buffer[0], slice2);
    assert.strictEqual(buffer[1], slice3);
  });

  it('computes depth delta summary statistics and dominance', () => {
    const s1 = createHeatmapSlice(mockDepth, 0);
    const s2 = createHeatmapSlice(
      {
        ...mockDepth,
        timestamp: 1700000001000,
      },
      s1.cumulativeDeltaUsdt
    );

    const stats = calculateDepthDeltaStats([s1, s2]);

    assert.strictEqual(stats.currentDepthDeltaUsdt, s2.depthDeltaUsdt);
    assert.strictEqual(stats.cumulativeDeltaUsdt, s2.cumulativeDeltaUsdt);
    assert.ok(stats.bidDominancePct > 50);
    assert.strictEqual(stats.deltaTrend, 'BUY_PRESSURE');
    assert.ok(stats.totalWhaleWalls >= 2);
  });

  it('handles empty slices in calculateDepthDeltaStats gracefully', () => {
    const stats = calculateDepthDeltaStats([]);
    assert.strictEqual(stats.currentDepthDeltaUsdt, 0);
    assert.strictEqual(stats.bidDominancePct, 50);
    assert.strictEqual(stats.deltaTrend, 'BALANCED');
  });

  it('generates synthetic historical depth slices for immediate visualization', () => {
    const count = 15;
    const history = generateSyntheticHeatmapHistory(mockDepth, count, 1000);

    assert.strictEqual(history.length, count);
    assert.ok(history[0].timestamp < history[count - 1].timestamp);
    assert.ok(history[count - 1].buckets.length > 0);
  });

  it('provides comprehensive default heatmap configuration', () => {
    assert.strictEqual(DEFAULT_HEATMAP_CONFIG.resolution, '1m');
    assert.strictEqual(DEFAULT_HEATMAP_CONFIG.theme, 'CYAN_EMERALD');
    assert.strictEqual(DEFAULT_HEATMAP_CONFIG.showDeltaBars, true);
    assert.strictEqual(DEFAULT_HEATMAP_CONFIG.showWallOverlays, true);
    assert.strictEqual(DEFAULT_HEATMAP_CONFIG.paused, false);
  });
});
