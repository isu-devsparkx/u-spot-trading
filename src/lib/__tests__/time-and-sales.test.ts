// ─── U-SPOT Time & Sales Unit Tests (Phase 34) ──────────────────────
// Test trade parsing, side classification, size tiers, CVD calculation, and stats aggregation

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyTradeSize,
  parseTradePayload,
  computeTradeFlowStats,
  generateSyntheticTrades,
  type RawWsTrade,
} from '../services/time-and-sales.ts';
import {
  toWebSocketStreamName,
  BinanceWebSocketManager,
} from '../services/binance-websocket.ts';
import type { LiveTradeTick } from '../../types/index.ts';

describe('Phase 34: Time & Sales Service', () => {
  describe('classifyTradeSize', () => {
    it('categorizes volumes below $1k as SMALL', () => {
      assert.equal(classifyTradeSize(0), 'SMALL');
      assert.equal(classifyTradeSize(250), 'SMALL');
      assert.equal(classifyTradeSize(999.99), 'SMALL');
    });

    it('categorizes volumes between $1k and $10k as MEDIUM', () => {
      assert.equal(classifyTradeSize(1000), 'MEDIUM');
      assert.equal(classifyTradeSize(5432.1), 'MEDIUM');
      assert.equal(classifyTradeSize(9999.99), 'MEDIUM');
    });

    it('categorizes volumes between $10k and $50k as LARGE', () => {
      assert.equal(classifyTradeSize(10000), 'LARGE');
      assert.equal(classifyTradeSize(25000), 'LARGE');
      assert.equal(classifyTradeSize(49999.99), 'LARGE');
    });

    it('categorizes volumes $50k and above as WHALE', () => {
      assert.equal(classifyTradeSize(50000), 'WHALE');
      assert.equal(classifyTradeSize(125000), 'WHALE');
      assert.equal(classifyTradeSize(1000000), 'WHALE');
    });
  });

  describe('parseTradePayload', () => {
    it('correctly maps m === false to aggressive Taker BUY', () => {
      const raw: RawWsTrade = {
        e: 'trade',
        E: 1700000001000,
        s: 'BTCUSDT',
        t: 1234567,
        p: '64500.50',
        q: '0.5000',
        T: 1700000001000,
        m: false, // Buyer is taker -> BUY
      };

      const parsed = parseTradePayload(raw);
      assert.equal(parsed.id, 1234567);
      assert.equal(parsed.symbol, 'BTC/USDT');
      assert.equal(parsed.price, 64500.5);
      assert.equal(parsed.quantity, 0.5);
      assert.equal(parsed.volumeUsdt, 32250.25);
      assert.equal(parsed.side, 'BUY');
      assert.equal(parsed.isBuyerMaker, false);
      assert.equal(parsed.sizeCategory, 'LARGE');
      assert.equal(parsed.isWhale, true); // >= 10k flagged for whale filter
    });

    it('correctly maps m === true to aggressive Taker SELL', () => {
      const raw: RawWsTrade = {
        e: 'trade',
        E: 1700000002000,
        s: 'SOLUSDT',
        t: 9876543,
        p: '150.00',
        q: '4.0000',
        T: 1700000002000,
        m: true, // Buyer is maker -> Seller was taker -> SELL
      };

      const parsed = parseTradePayload(raw);
      assert.equal(parsed.id, 9876543);
      assert.equal(parsed.symbol, 'SOL/USDT');
      assert.equal(parsed.price, 150);
      assert.equal(parsed.quantity, 4);
      assert.equal(parsed.volumeUsdt, 600);
      assert.equal(parsed.side, 'SELL');
      assert.equal(parsed.isBuyerMaker, true);
      assert.equal(parsed.sizeCategory, 'SMALL');
      assert.equal(parsed.isWhale, false);
    });

    it('handles WHALE size category for orders >= $50,000', () => {
      const raw: RawWsTrade = {
        p: '65000.00',
        q: '1.2000',
        m: false,
      };

      const parsed = parseTradePayload(raw, 'BTCUSDT');
      assert.equal(parsed.volumeUsdt, 78000);
      assert.equal(parsed.sizeCategory, 'WHALE');
      assert.equal(parsed.isWhale, true);
    });
  });

  describe('computeTradeFlowStats', () => {
    it('returns zeroed defaults for empty trade array', () => {
      const stats = computeTradeFlowStats([], 'ETH/USDT');
      assert.equal(stats.symbol, 'ETH/USDT');
      assert.equal(stats.totalTrades, 0);
      assert.equal(stats.buyCount, 0);
      assert.equal(stats.sellCount, 0);
      assert.equal(stats.buyVolumeUsdt, 0);
      assert.equal(stats.sellVolumeUsdt, 0);
      assert.equal(stats.netCvdUsdt, 0);
      assert.equal(stats.takerBuyRatio, 0.5);
      assert.equal(stats.whaleTradeCount, 0);
    });

    it('aggregates trades, computes CVD, taker ratio, and finds largest trade', () => {
      const sampleTrades: LiveTradeTick[] = [
        {
          id: 1,
          symbol: 'BTC/USDT',
          price: 60000,
          quantity: 1.0,
          volumeUsdt: 60000,
          side: 'BUY',
          isBuyerMaker: false,
          timestamp: 1000,
          sizeCategory: 'WHALE',
          isWhale: true,
        },
        {
          id: 2,
          symbol: 'BTC/USDT',
          price: 60000,
          quantity: 0.5,
          volumeUsdt: 30000,
          side: 'BUY',
          isBuyerMaker: false,
          timestamp: 1001,
          sizeCategory: 'LARGE',
          isWhale: true,
        },
        {
          id: 3,
          symbol: 'BTC/USDT',
          price: 60000,
          quantity: 0.25,
          volumeUsdt: 15000,
          side: 'SELL',
          isBuyerMaker: true,
          timestamp: 1002,
          sizeCategory: 'LARGE',
          isWhale: true,
        },
        {
          id: 4,
          symbol: 'BTC/USDT',
          price: 60000,
          quantity: 0.05,
          volumeUsdt: 3000,
          side: 'SELL',
          isBuyerMaker: true,
          timestamp: 1003,
          sizeCategory: 'MEDIUM',
          isWhale: false,
        },
      ];

      const stats = computeTradeFlowStats(sampleTrades, 'BTC/USDT');
      assert.equal(stats.totalTrades, 4);
      assert.equal(stats.buyCount, 2);
      assert.equal(stats.sellCount, 2);
      assert.equal(stats.buyVolumeUsdt, 90000); // 60k + 30k
      assert.equal(stats.sellVolumeUsdt, 18000); // 15k + 3k
      assert.equal(stats.totalVolumeUsdt, 108000);
      assert.equal(stats.netCvdUsdt, 72000); // 90k - 18k
      assert.equal(Number(stats.takerBuyRatio.toFixed(3)), 0.833); // 90k / 108k
      assert.equal(stats.largestTradeUsdt, 60000);
      assert.equal(stats.whaleTradeCount, 3);
    });
  });

  describe('generateSyntheticTrades', () => {
    it('generates the specified number of realistic ticks', () => {
      const generated = generateSyntheticTrades('SOL/USDT', 150, 15);
      assert.equal(generated.length, 15);
      for (const tick of generated) {
        assert.equal(tick.symbol, 'SOL/USDT');
        assert.ok(tick.price > 140 && tick.price < 160);
        assert.ok(tick.quantity > 0);
        assert.ok(tick.volumeUsdt > 0);
        assert.ok(['BUY', 'SELL'].includes(tick.side));
        assert.ok(['SMALL', 'MEDIUM', 'LARGE', 'WHALE'].includes(tick.sizeCategory));
      }
    });
  });

  describe('Binance WebSocket Stream Management for Trades', () => {
    it('formats stream name for trade stream correctly', () => {
      assert.equal(toWebSocketStreamName('BTC/USDT', 'trade'), 'btcusdt@trade');
      assert.equal(toWebSocketStreamName('SOL-USDT', 'trade'), 'solusdt@trade');
      assert.equal(toWebSocketStreamName('ethusdt', 'trade'), 'ethusdt@trade');
    });

    it('subscribes and tracks trade stream in manager', () => {
      const wsManager = BinanceWebSocketManager.getInstance();
      const unsub = wsManager.subscribeTrades('SOL/USDT', () => {});

      const activeStreams = wsManager.getActiveStreams();
      assert.ok(activeStreams.includes('solusdt@trade'));

      unsub();
      const activeAfterUnsub = wsManager.getActiveStreams();
      assert.ok(!activeAfterUnsub.includes('solusdt@trade'));
    });
  });
});
