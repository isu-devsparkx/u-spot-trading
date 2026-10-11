// ─── Phase 45: Institutional Whale Iceberg Order Detector Unit Tests ─────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectIcebergOrders,
  classifyIcebergConfidence,
  calculateIcebergTrackerSummary,
  generateSyntheticIcebergScenario,
} from '../services/iceberg-detector.ts';
import type { LiveTradeTick, LiveDepthStreamPayload } from '../../types/index.ts';

describe('Institutional Whale Iceberg Order Detector (Phase 45)', () => {
  describe('1. Iceberg Order Detection & Reload Calculation', () => {
    it('detects a BID_ACCUMULATION iceberg when executed sell volume heavily exceeds visible bid depth', () => {
      const price = 68000;
      const visibleDepthUsdt = 15000; // $15,000 displayed on order book
      const tradesCount = 8;
      const chunkUsdt = 8000; // 8 * $8,000 = $64,000 executed (> 4.2x visible depth)

      const trades: LiveTradeTick[] = Array.from({ length: tradesCount }, (_, i) => ({
        id: 1000 + i,
        symbol: 'BTC/USDT',
        price,
        quantity: chunkUsdt / price,
        volumeUsdt: chunkUsdt,
        side: 'SELL', // Taker sell hitting the passive bid
        timestamp: 1700000000000 + i * 200,
        isBuyerMaker: true,
        sizeCategory: 'MEDIUM',
        isWhale: false,
      }));

      const depth: LiveDepthStreamPayload = {
        symbol: 'BTC/USDT',
        lastUpdateId: 500,
        bids: [[price, visibleDepthUsdt / price]],
        asks: [[price + 10, 1.0]],
        bestBid: price,
        bestAsk: price + 10,
        spread: 10,
        spreadPercent: 0.015,
        bidDepthUsdt: visibleDepthUsdt,
        askDepthUsdt: 68010,
        depthImbalance: 0.1,
        bidWalls: [],
        askWalls: [],
        timestamp: 1700000000000,
      };

      const detected = detectIcebergOrders('BTC/USDT', trades, depth, {
        minReloadMultiplier: 1.8,
        minExecutedVolumeUsdt: 20000,
        minFillsCount: 3,
      });

      assert.strictEqual(detected.length, 1);
      const ib = detected[0];
      assert.strictEqual(ib.symbol, 'BTC/USDT');
      assert.strictEqual(ib.price, price);
      assert.strictEqual(ib.side, 'BID_ACCUMULATION');
      assert.strictEqual(ib.executedVolumeUsdt, 64000);
      assert.strictEqual(ib.visibleVolumeUsdt, 15000);
      assert.strictEqual(ib.estimatedHiddenVolumeUsdt, 49000); // 64,000 - 15,000
      assert.strictEqual(ib.fillCount, 8);
      assert(ib.reloadMultiplier >= 4.0);
      assert.strictEqual(ib.confidence, 'HIGH');
    });

    it('detects an ASK_DISTRIBUTION iceberg when executed buy volume heavily exceeds visible ask depth', () => {
      const price = 68500;
      const visibleDepthUsdt = 20000;
      const tradesCount = 6;
      const chunkUsdt = 10000; // 6 * $10,000 = $60,000 executed (3.0x visible)

      const trades: LiveTradeTick[] = Array.from({ length: tradesCount }, (_, i) => ({
        id: 2000 + i,
        symbol: 'BTC/USDT',
        price,
        quantity: chunkUsdt / price,
        volumeUsdt: chunkUsdt,
        side: 'BUY', // Taker buy hitting the passive ask
        timestamp: 1700000000000 + i * 150,
        isBuyerMaker: false,
        sizeCategory: 'LARGE',
        isWhale: false,
      }));

      const depth: LiveDepthStreamPayload = {
        symbol: 'BTC/USDT',
        lastUpdateId: 501,
        bids: [[price - 10, 1.0]],
        asks: [[price, visibleDepthUsdt / price]],
        bestBid: price - 10,
        bestAsk: price,
        spread: 10,
        spreadPercent: 0.015,
        bidDepthUsdt: 68490,
        askDepthUsdt: visibleDepthUsdt,
        depthImbalance: -0.1,
        bidWalls: [],
        askWalls: [],
        timestamp: 1700000000000,
      };

      const detected = detectIcebergOrders('BTC/USDT', trades, depth);

      assert.strictEqual(detected.length, 1);
      const ib = detected[0];
      assert.strictEqual(ib.side, 'ASK_DISTRIBUTION');
      assert.strictEqual(ib.executedVolumeUsdt, 60000);
      assert.strictEqual(ib.visibleVolumeUsdt, 20000);
      assert.strictEqual(ib.estimatedHiddenVolumeUsdt, 40000);
      assert.strictEqual(ib.reloadMultiplier, 3.0);
    });

    it('does not flag normal retail trading where executed volume does not reload above threshold', () => {
      const price = 68000;
      const visibleDepthUsdt = 50000; // Large wall visible ($50k)
      // Only $12k executed across 2 small trades
      const trades: LiveTradeTick[] = [
        {
          id: 3001,
          symbol: 'BTC/USDT',
          price,
          quantity: 6000 / price,
          volumeUsdt: 6000,
          side: 'SELL',
          timestamp: 1700000000000,
          isBuyerMaker: true,
          sizeCategory: 'SMALL',
          isWhale: false,
        },
        {
          id: 3002,
          symbol: 'BTC/USDT',
          price,
          quantity: 6000 / price,
          volumeUsdt: 6000,
          side: 'SELL',
          timestamp: 1700000000100,
          isBuyerMaker: true,
          sizeCategory: 'SMALL',
          isWhale: false,
        },
      ];

      const depth: LiveDepthStreamPayload = {
        symbol: 'BTC/USDT',
        lastUpdateId: 502,
        bids: [[price, visibleDepthUsdt / price]],
        asks: [[price + 10, 1.0]],
        bestBid: price,
        bestAsk: price + 10,
        spread: 10,
        spreadPercent: 0.015,
        bidDepthUsdt: visibleDepthUsdt,
        askDepthUsdt: 68010,
        depthImbalance: 0.2,
        bidWalls: [],
        askWalls: [],
        timestamp: 1700000000000,
      };


      const detected = detectIcebergOrders('BTC/USDT', trades, depth);
      assert.strictEqual(detected.length, 0);
    });
  });

  describe('2. Confidence & Institutional Classification', () => {
    it('accurately grades confidence levels according to reload multiplier and fill count', () => {
      assert.strictEqual(classifyIcebergConfidence(3.5, 8), 'HIGH');
      assert.strictEqual(classifyIcebergConfidence(2.2, 5), 'MEDIUM');
      assert.strictEqual(classifyIcebergConfidence(1.8, 2), 'SUSPECTED');
    });
  });

  describe('3. Summary Telemetry & Flow Bias Aggregation', () => {
    it('aggregates total hidden volumes and detects STRONG_ACCUMULATION flow', () => {
      const mockIcebergs = [
        {
          id: 'ICE-B-1',
          symbol: 'BTC/USDT',
          price: 68000,
          side: 'BID_ACCUMULATION' as const,
          visibleVolumeUsdt: 10000,
          executedVolumeUsdt: 95000,
          estimatedHiddenVolumeUsdt: 85000,
          reloadMultiplier: 9.5,
          fillCount: 10,
          firstSeenTimestamp: 1700000000000,
          lastReloadTimestamp: 1700000005000,
          status: 'ACTIVE' as const,
          confidence: 'HIGH' as const,
          institutionalImpact: 'MAJOR_ACCUMULATION' as const,
        },
        {
          id: 'ICE-B-2',
          symbol: 'BTC/USDT',
          price: 67900,
          side: 'BID_ACCUMULATION' as const,
          visibleVolumeUsdt: 10000,
          executedVolumeUsdt: 40000,
          estimatedHiddenVolumeUsdt: 30000,
          reloadMultiplier: 4.0,
          fillCount: 5,
          firstSeenTimestamp: 1700000000000,
          lastReloadTimestamp: 1700000004000,
          status: 'ACTIVE' as const,
          confidence: 'MEDIUM' as const,
          institutionalImpact: 'MODERATE_ACCUMULATION' as const,
        },
        {
          id: 'ICE-A-1',
          symbol: 'BTC/USDT',
          price: 68400,
          side: 'ASK_DISTRIBUTION' as const,
          visibleVolumeUsdt: 10000,
          executedVolumeUsdt: 25000,
          estimatedHiddenVolumeUsdt: 15000,
          reloadMultiplier: 2.5,
          fillCount: 4,
          firstSeenTimestamp: 1700000000000,
          lastReloadTimestamp: 1700000003000,
          status: 'ACTIVE' as const,
          confidence: 'MEDIUM' as const,
          institutionalImpact: 'MODERATE_ACCUMULATION' as const,
        },
      ];

      const summary = calculateIcebergTrackerSummary('BTC/USDT', mockIcebergs, 120);

      assert.strictEqual(summary.symbol, 'BTC/USDT');
      assert.strictEqual(summary.activeIcebergsCount, 3);
      assert.strictEqual(summary.totalHiddenBidVolumeUsdt, 115000); // 85,000 + 30,000
      assert.strictEqual(summary.totalHiddenAskVolumeUsdt, 15000);
      assert.strictEqual(summary.netHiddenFlowDeltaUsdt, 100000); // 115,000 - 15,000
      assert.strictEqual(summary.dominantInstitutionalBias, 'STRONG_ACCUMULATION');
      assert.strictEqual(summary.analyzedTradesCount, 120);
    });

    it('detects DISTRIBUTION_CEILING when hidden ask volume dominates', () => {
      const mockIcebergs = [
        {
          id: 'ICE-A-1',
          symbol: 'ETH/USDT',
          price: 2650,
          side: 'ASK_DISTRIBUTION' as const,
          visibleVolumeUsdt: 20000,
          executedVolumeUsdt: 120000,
          estimatedHiddenVolumeUsdt: 100000,
          reloadMultiplier: 6.0,
          fillCount: 15,
          firstSeenTimestamp: 1700000000000,
          lastReloadTimestamp: 1700000005000,
          status: 'ACTIVE' as const,
          confidence: 'HIGH' as const,
          institutionalImpact: 'MAJOR_ACCUMULATION' as const,
        },
      ];

      const summary = calculateIcebergTrackerSummary('ETH/USDT', mockIcebergs, 80);
      assert.strictEqual(summary.totalHiddenAskVolumeUsdt, 100000);
      assert.strictEqual(summary.netHiddenFlowDeltaUsdt, -100000);
      assert.strictEqual(summary.dominantInstitutionalBias, 'DISTRIBUTION_CEILING');
    });
  });

  describe('4. Synthetic Iceberg Scenario Generator', () => {
    it('generates a realistic synthetic iceberg trade scenario that passes detection', () => {
      const { trades, depth } = generateSyntheticIcebergScenario(
        'BTC/USDT',
        'BID_ACCUMULATION',
        68200,
        20000,
        4.0
      );

      assert(trades.length >= 12);
      assert(depth.bids.length > 0);

      const detected = detectIcebergOrders('BTC/USDT', trades, depth);
      assert.strictEqual(detected.length, 1);
      assert.strictEqual(detected[0].price, 68200);
      assert.strictEqual(detected[0].side, 'BID_ACCUMULATION');
      assert(detected[0].estimatedHiddenVolumeUsdt > 40000);
      assert.strictEqual(detected[0].confidence, 'HIGH');
    });
  });
});
