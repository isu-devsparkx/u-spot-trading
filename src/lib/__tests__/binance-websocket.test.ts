import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  toWebSocketStreamName,
  detectOrderBookWalls,
  parseDepthPayload,
  parseTickerPayload,
  getReconnectDelay,
  binanceWs,
  getBinanceWsManager,
} from '../services/binance-websocket.ts';
import type { OrderBookEntry } from '../../types/index.ts';

describe('Phase 29: Live Binance WebSocket Order Book Depth & Ticker Stream', () => {
  describe('Stream & Symbol Formatting', () => {
    it('formats depth stream names with 20 levels and 100ms update frequency', () => {
      assert.strictEqual(
        toWebSocketStreamName('BTC/USDT', 'depth'),
        'btcusdt@depth20@100ms'
      );
      assert.strictEqual(
        toWebSocketStreamName('SOL/USDT', 'depth'),
        'solusdt@depth20@100ms'
      );
      assert.strictEqual(
        toWebSocketStreamName('ETH-USDT', 'depth'),
        'ethusdt@depth20@100ms'
      );
    });

    it('formats ticker stream names correctly', () => {
      assert.strictEqual(
        toWebSocketStreamName('ETH/USDT', 'ticker'),
        'ethusdt@ticker'
      );
      assert.strictEqual(
        toWebSocketStreamName('BNB/USDT', 'ticker'),
        'bnbusdt@ticker'
      );
    });
  });

  describe('Institutional Order Book Wall Detection', () => {
    it('returns empty array when entries list is empty or midPrice <= 0', () => {
      const wallsEmpty = detectOrderBookWalls([], 'BID', 100);
      assert.deepStrictEqual(wallsEmpty, []);

      const wallsZeroMid = detectOrderBookWalls([[100, 50]], 'BID', 0);
      assert.deepStrictEqual(wallsZeroMid, []);
    });

    it('returns empty array when liquidity is uniformly distributed (no wall >= 2.5x avg)', () => {
      // 10 levels with identical 10.0 volume each
      const bids: OrderBookEntry[] = Array.from({ length: 10 }, (_, i) => [100 - i, 10.0]);
      const walls = detectOrderBookWalls(bids, 'BID', 100);
      assert.strictEqual(walls.length, 0);
    });

    it('detects institutional bid wall exceeding 2.5x the average level volume', () => {
      // 9 bids of 10.0 volume, 1 giant bid of 100.0 volume at $95 (avg ~ 19.0, 100 >= 2.5 * 19 = 47.5)
      const bids: OrderBookEntry[] = [
        [100, 10.0],
        [99, 10.0],
        [98, 10.0],
        [97, 10.0],
        [96, 10.0],
        [95, 100.0], // 100 volume wall
        [94, 10.0],
        [93, 10.0],
        [92, 10.0],
        [91, 10.0],
      ];

      const walls = detectOrderBookWalls(bids, 'BID', 100);
      assert.strictEqual(walls.length, 1);
      const bidWall = walls[0]!;
      assert.strictEqual(bidWall.type, 'BID');
      assert.strictEqual(bidWall.price, 95);
      assert.strictEqual(bidWall.quantity, 100.0);
      assert.ok((bidWall.multipleOfAverage ?? 0) >= 2.5);
      assert.strictEqual(bidWall.distancePercent, 5.0); // (100 - 95)/100 = 5%
    });

    it('detects institutional ask wall on the sell side', () => {
      const asks: OrderBookEntry[] = [
        [101, 10.0],
        [102, 10.0],
        [103, 150.0], // Giant resistance wall
        [104, 10.0],
        [105, 10.0],
      ];

      const walls = detectOrderBookWalls(asks, 'ASK', 100);
      assert.strictEqual(walls.length, 1);
      const askWall = walls[0]!;
      assert.strictEqual(askWall.type, 'ASK');
      assert.strictEqual(askWall.price, 103);
      assert.strictEqual(askWall.quantity, 150.0);
      assert.ok((askWall.multipleOfAverage ?? 0) >= 2.5);
      assert.strictEqual(askWall.distancePercent, 3.0); // (103 - 100)/100 = 3%
    });
  });

  describe('Order Book Depth Payload Parsing & Metrics', () => {
    it('parses raw string tuple bids/asks into numeric structures and computes spread & imbalance', () => {
      const rawPayload = {
        lastUpdateId: 12345678,
        bids: [
          ['100.50', '2.5'] as [string, string],
          ['100.00', '5.0'] as [string, string],
        ],
        asks: [
          ['100.75', '3.0'] as [string, string],
          ['101.00', '1.0'] as [string, string],
        ],
      };

      const parsed = parseDepthPayload('SOL/USDT', rawPayload);
      assert.strictEqual(parsed.symbol, 'SOL/USDT');
      assert.strictEqual(parsed.bids.length, 2);
      assert.strictEqual(parsed.asks.length, 2);

      // Best bid = 100.50, best ask = 100.75 -> spread = 0.25
      assert.strictEqual(parsed.bids[0][0], 100.5);
      assert.strictEqual(parsed.bids[0][1], 2.5);
      assert.strictEqual(parsed.asks[0][0], 100.75);
      assert.strictEqual(parsed.asks[0][1], 3.0);

      assert.strictEqual(parsed.spread, 0.25);
      // spreadPercent = (0.25 / 100.75) * 100 ~= 0.248%
      assert.ok(parsed.spreadPercent > 0.24 && parsed.spreadPercent < 0.26);

      // bidDepthUsdt = 100.5*2.5 + 100.0*5.0 = 251.25 + 500 = 751.25 -> 751
      // askDepthUsdt = 100.75*3.0 + 101.0*1.0 = 302.25 + 101 = 403.25 -> 403
      // depthImbalance = (751.25 - 403.25) / (751.25 + 403.25) > 0 (bid heavy)
      assert.ok(parsed.depthImbalance > 0.25 && parsed.depthImbalance < 0.35);
    });

    it('handles empty bids or asks gracefully without crashing', () => {
      const emptyPayload = {
        lastUpdateId: 0,
        bids: [],
        asks: [],
      };

      const parsed = parseDepthPayload('BTC/USDT', emptyPayload);
      assert.strictEqual(parsed.spread, 0);
      assert.strictEqual(parsed.spreadPercent, 0);
      assert.strictEqual(parsed.depthImbalance, 0);
      assert.strictEqual(parsed.bidWalls.length, 0);
      assert.strictEqual(parsed.askWalls.length, 0);
    });
  });

  describe('Ticker Stream Payload Parsing', () => {
    it('parses raw Binance ticker websocket event format', () => {
      const rawTicker = {
        e: '24hrTicker',
        E: 1700000000000,
        s: 'BTCUSDT',
        p: '1234.50',
        P: '1.92',
        c: '65432.10',
        h: '66000.00',
        l: '64000.00',
        v: '12345.678',
        q: '800000000.00',
        b: '65430.00',
        a: '65432.10',
      };

      const parsed = parseTickerPayload(rawTicker);
      assert.strictEqual(parsed.symbol, 'BTC/USDT');
      assert.strictEqual(parsed.price, 65432.1);
      assert.strictEqual(parsed.priceChange, 1234.5);
      assert.strictEqual(parsed.priceChangePercent, 1.92);
      assert.strictEqual(parsed.highPrice, 66000);
      assert.strictEqual(parsed.lowPrice, 64000);
      assert.strictEqual(parsed.volume, 12345.678);
      assert.strictEqual(parsed.quoteVolume, 800000000);
      assert.strictEqual(parsed.bestBid, 65430);
      assert.strictEqual(parsed.bestAsk, 65432.1);
    });
  });

  describe('Reconnection & Resiliency Logic', () => {
    it('computes exponential backoff bounded within reasonable limits', () => {
      const delay0 = getReconnectDelay(0);
      const delay1 = getReconnectDelay(1);
      const delay2 = getReconnectDelay(2);
      const delay10 = getReconnectDelay(10);

      assert.ok(delay0 >= 1000 && delay0 <= 1500, `delay0: ${delay0}`);
      assert.ok(delay1 >= 2000 && delay2 >= 2000, `delay1: ${delay1}`);
      assert.ok(delay10 <= 17000, `delay10: ${delay10}`);
    });

    it('exports singleton binanceWs instance with active subscriber APIs', () => {
      assert.ok(binanceWs);
      assert.strictEqual(binanceWs, getBinanceWsManager());
      assert.strictEqual(typeof binanceWs.subscribeDepth, 'function');
      assert.strictEqual(typeof binanceWs.subscribeTicker, 'function');
      assert.strictEqual(typeof binanceWs.getConnectionState, 'function');
    });
  });
});
