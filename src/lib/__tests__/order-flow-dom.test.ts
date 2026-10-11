import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getRecommendedTickSizes,
  aggregateOrderBookLevels,
  buildDOMHeatmapSnapshot,
  computeLiquidityBands,
} from '../services/order-flow-dom.ts';
import type { LiveDepthStreamPayload, OrderBookEntry } from '../../types/index.ts';

describe('Phase 31: Real-Time Order Flow Heatmap & DOM (Depth of Market) Visualizer', () => {
  describe('Tick Size Recommendation Logic', () => {
    it('returns suitable tick size tiers based on asset price magnitude', () => {
      const btcSizes = getRecommendedTickSizes(65000);
      assert.deepStrictEqual(btcSizes, [0.1, 1, 5, 10, 50]);

      const ethSizes = getRecommendedTickSizes(3500);
      assert.deepStrictEqual(ethSizes, [0.05, 0.5, 1, 5]);

      const solSizes = getRecommendedTickSizes(150);
      assert.deepStrictEqual(solSizes, [0.01, 0.05, 0.1, 0.5]);

      const adaSizes = getRecommendedTickSizes(1.25);
      assert.deepStrictEqual(adaSizes, [0.005, 0.01, 0.05, 0.1]);

      const dogeSizes = getRecommendedTickSizes(0.12);
      assert.deepStrictEqual(dogeSizes, [0.0001, 0.0005, 0.001, 0.005]);
    });
  });

  describe('Order Book Level Tick Aggregation', () => {
    it('returns identical entries when tick size is 0 or negative', () => {
      const raw: OrderBookEntry[] = [
        [100.25, 2],
        [100.10, 3],
      ];
      assert.deepStrictEqual(aggregateOrderBookLevels(raw, 0, 'BID'), raw);
      assert.deepStrictEqual(aggregateOrderBookLevels(raw, -1, 'ASK'), raw);
    });

    it('aggregates bids by rounding down and combining quantities', () => {
      // With tickSize = 1.0:
      // 99.8 (qty 2) -> 99.0
      // 99.2 (qty 3) -> 99.0 (combined qty = 5)
      // 98.5 (qty 4) -> 98.0
      const bids: OrderBookEntry[] = [
        [99.8, 2],
        [99.2, 3],
        [98.5, 4],
      ];

      const binned = aggregateOrderBookLevels(bids, 1.0, 'BID');
      assert.strictEqual(binned.length, 2);
      assert.strictEqual(binned[0][0], 99.0);
      assert.strictEqual(binned[0][1], 5);
      assert.strictEqual(binned[1][0], 98.0);
      assert.strictEqual(binned[1][1], 4);
    });

    it('aggregates asks by rounding up and combining quantities', () => {
      // With tickSize = 1.0:
      // 100.2 (qty 2) -> 101.0
      // 100.8 (qty 5) -> 101.0 (combined qty = 7)
      // 101.5 (qty 3) -> 102.0
      const asks: OrderBookEntry[] = [
        [100.2, 2],
        [100.8, 5],
        [101.5, 3],
      ];

      const binned = aggregateOrderBookLevels(asks, 1.0, 'ASK');
      assert.strictEqual(binned.length, 2);
      assert.strictEqual(binned[0][0], 101.0);
      assert.strictEqual(binned[0][1], 7);
      assert.strictEqual(binned[1][0], 102.0);
      assert.strictEqual(binned[1][1], 3);
    });
  });

  describe('DOM Heatmap Snapshot Construction & Metrics', () => {
    const mockDepth: LiveDepthStreamPayload = {
      symbol: 'SOL/USDT',
      lastUpdateId: 987654321,
      bids: [
        [100.0, 10], // Vol = 1000
        [99.5, 20],  // Vol = 1990
        [99.0, 100], // Vol = 9900 (Wall!)
        [98.5, 10],  // Vol = 985
      ],
      asks: [
        [100.5, 10], // Vol = 1005
        [101.0, 15], // Vol = 1515
        [101.5, 20], // Vol = 2030
        [102.0, 10], // Vol = 1020
      ],
      bestBid: 100.0,
      bestAsk: 100.5,
      spread: 0.5,
      spreadPercent: 0.498,
      bidDepthUsdt: 13875,
      askDepthUsdt: 5570,
      depthImbalance: 0.427,
      bidWalls: [],
      askWalls: [],
      timestamp: 1700000000000,
    };

    it('constructs snapshot with exact mid-price, spread, and depth totals', () => {
      const snap = buildDOMHeatmapSnapshot(mockDepth, { maxLevels: 4 });
      assert.strictEqual(snap.symbol, 'SOL/USDT');
      assert.strictEqual(snap.bestBid, 100.0);
      assert.strictEqual(snap.bestAsk, 100.5);
      assert.strictEqual(snap.midPrice, 100.25);
      assert.strictEqual(snap.spread, 0.5);
      assert.strictEqual(snap.bidRows.length, 4);
      assert.strictEqual(snap.askRows.length, 4);
    });

    it('computes cumulative depth and identifies peak volume level for heat intensity', () => {
      const snap = buildDOMHeatmapSnapshot(mockDepth, { maxLevels: 4 });

      // Peak level is bid level at 99.0 with volume = 9900 USDT
      assert.strictEqual(snap.peakLevelVolumeUsdt, 9900);

      const wallBidRow = snap.bidRows.find((r) => r.price === 99.0);
      assert.ok(wallBidRow);
      assert.strictEqual(wallBidRow.heatIntensity, 1.0); // 9900 / 9900 = 1.0
      assert.strictEqual(wallBidRow.isWall, true);
      assert.ok(wallBidRow.wallMultiple && wallBidRow.wallMultiple >= 2.5);

      // Best bid is first bid row
      assert.strictEqual(snap.bidRows[0].isBestBid, true);
      assert.strictEqual(snap.bidRows[0].price, 100.0);
      assert.strictEqual(snap.bidRows[0].cumulativeVolumeUsdt, 1000);

      // Cumulative bid at lowest row is total bid volume
      const lastBid = snap.bidRows[snap.bidRows.length - 1];
      assert.strictEqual(lastBid.cumulativeVolumeUsdt, 13875);
      assert.strictEqual(lastBid.cumulativeDepthPercent, 100);
    });

    it('orders ask rows descending from highest price down to best ask', () => {
      const snap = buildDOMHeatmapSnapshot(mockDepth, { maxLevels: 4 });
      // askRows descending: [102.0, 101.5, 101.0, 100.5]
      assert.strictEqual(snap.askRows[0].price, 102.0);
      assert.strictEqual(snap.askRows[snap.askRows.length - 1].price, 100.5);
      assert.strictEqual(snap.askRows[snap.askRows.length - 1].isBestAsk, true);
    });
  });

  describe('Liquidity Band Distribution Analysis', () => {
    const mockDepth: LiveDepthStreamPayload = {
      symbol: 'ETH/USDT',
      lastUpdateId: 1000,
      bids: [
        [3000, 10], // Vol = 30,000 (0.08% away)
        [2980, 20], // Vol = 59,600 (0.75% away)
        [2950, 30], // Vol = 88,500 (1.75% away)
      ],
      asks: [
        [3005, 5],  // Vol = 15,025 (0.08% away)
        [3025, 10], // Vol = 30,250 (0.75% away)
        [3055, 15], // Vol = 45,825 (1.75% away)
      ],
      bestBid: 3000,
      bestAsk: 3005,
      spread: 5,
      spreadPercent: 0.166,
      bidDepthUsdt: 178100,
      askDepthUsdt: 91100,
      depthImbalance: 0.323,
      bidWalls: [],
      askWalls: [],
      timestamp: Date.now(),
    };

    it('computes buyer dominance percentage across standard percentage ranges', () => {
      const snap = buildDOMHeatmapSnapshot(mockDepth);
      const bands = computeLiquidityBands(snap, [0.5, 1.0, 2.0]);

      assert.strictEqual(bands.length, 3);
      // Band 0.5% only includes 3000 (30k) and 3005 (15k) -> 30k/(30k+15k) ~= 67%
      assert.strictEqual(bands[0].rangePercent, 0.5);
      assert.ok(bands[0].buyerDominancePercent > 60);

      // Band 2.0% includes all levels
      assert.strictEqual(bands[2].rangePercent, 2.0);
      assert.ok(bands[2].bidVolumeUsdt > bands[2].askVolumeUsdt);
      assert.ok(bands[2].buyerDominancePercent > 50);
    });
  });
});
