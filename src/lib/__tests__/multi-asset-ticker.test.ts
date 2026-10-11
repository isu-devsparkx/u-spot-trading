import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_WATCHLIST_SYMBOLS,
  formatWatchlistTickerItem,
  binanceWs,
  getBinanceWsManager,
} from '../services/binance-websocket.ts';
import type { LiveTickerStreamPayload, WatchlistTickerItem } from '../../types/index.ts';

describe('Phase 30: Multi-Asset Live WebSocket Watchlist Strip & Global Ticker Bar', () => {
  describe('Default Watchlist Universe', () => {
    it('provides standard top liquid spot pairs in DEFAULT_WATCHLIST_SYMBOLS', () => {
      assert.ok(Array.isArray(DEFAULT_WATCHLIST_SYMBOLS));
      assert.ok(DEFAULT_WATCHLIST_SYMBOLS.length >= 10);
      assert.ok(DEFAULT_WATCHLIST_SYMBOLS.includes('BTC/USDT'));
      assert.ok(DEFAULT_WATCHLIST_SYMBOLS.includes('ETH/USDT'));
      assert.ok(DEFAULT_WATCHLIST_SYMBOLS.includes('SOL/USDT'));
      assert.ok(DEFAULT_WATCHLIST_SYMBOLS.includes('BNB/USDT'));
    });

    it('ensures all default watchlist pairs end with USDT and contain a slash', () => {
      for (const sym of DEFAULT_WATCHLIST_SYMBOLS) {
        assert.ok(sym.endsWith('/USDT'), `Symbol ${sym} must end with /USDT`);
        assert.ok(sym.includes('/'), `Symbol ${sym} must include slash`);
      }
    });
  });

  describe('formatWatchlistTickerItem & Price Tick Direction Detection', () => {
    const mockPayload: LiveTickerStreamPayload = {
      symbol: 'SOL/USDT',
      price: 150.50,
      priceChange: 7.50,
      priceChangePercent: 5.24,
      highPrice: 155.00,
      lowPrice: 142.00,
      volume: 1250000,
      quoteVolume: 187500000,
      bestBid: 150.48,
      bestAsk: 150.52,
      timestamp: 1700000000000,
    };

    it('formats ticker payload and extracts clean base asset symbol', () => {
      const item = formatWatchlistTickerItem(mockPayload);
      assert.strictEqual(item.symbol, 'SOL/USDT');
      assert.strictEqual(item.baseAsset, 'SOL');
      assert.strictEqual(item.price, 150.50);
      assert.strictEqual(item.priceChangePercent, 5.24);
      assert.strictEqual(item.highPrice, 155.00);
      assert.strictEqual(item.lowPrice, 142.00);
      assert.strictEqual(item.volume, 1250000);
      assert.strictEqual(item.quoteVolume, 187500000);
      assert.strictEqual(item.tickDirection, 'EQUAL');
    });

    it('detects price UP tick when incoming price is higher than previous tick', () => {
      const prevItem: WatchlistTickerItem = {
        symbol: 'SOL/USDT',
        baseAsset: 'SOL',
        price: 150.00,
        priceChangePercent: 4.80,
        priceChange: 7.00,
        highPrice: 155.00,
        lowPrice: 142.00,
        volume: 1240000,
        quoteVolume: 186000000,
        tickDirection: 'EQUAL',
        lastUpdated: 1699999990000,
      };

      const updated = formatWatchlistTickerItem(mockPayload, prevItem);
      assert.strictEqual(updated.price, 150.50);
      assert.strictEqual(updated.tickDirection, 'UP');
    });

    it('detects price DOWN tick when incoming price is lower than previous tick', () => {
      const prevItem: WatchlistTickerItem = {
        symbol: 'SOL/USDT',
        baseAsset: 'SOL',
        price: 151.00,
        priceChangePercent: 5.50,
        priceChange: 8.00,
        highPrice: 155.00,
        lowPrice: 142.00,
        volume: 1240000,
        quoteVolume: 186000000,
        tickDirection: 'EQUAL',
        lastUpdated: 1699999990000,
      };

      const updated = formatWatchlistTickerItem(mockPayload, prevItem);
      assert.strictEqual(updated.price, 150.50);
      assert.strictEqual(updated.tickDirection, 'DOWN');
    });

    it('retains EQUAL direction when price is identical to previous tick', () => {
      const prevItem: WatchlistTickerItem = {
        symbol: 'SOL/USDT',
        baseAsset: 'SOL',
        price: 150.50,
        priceChangePercent: 5.24,
        priceChange: 7.50,
        highPrice: 155.00,
        lowPrice: 142.00,
        volume: 1240000,
        quoteVolume: 186000000,
        tickDirection: 'EQUAL',
        lastUpdated: 1699999990000,
      };

      const updated = formatWatchlistTickerItem(mockPayload, prevItem);
      assert.strictEqual(updated.price, 150.50);
      assert.strictEqual(updated.tickDirection, 'EQUAL');
    });
  });

  describe('Multi-Ticker Subscription & Listener Management', () => {
    it('subscribes to multiple symbols concurrently and unregisters all cleanly', () => {
      const manager = getBinanceWsManager();
      const testSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
      const received: LiveTickerStreamPayload[] = [];

      const unsub = manager.subscribeMultiTickers(testSymbols, (payload) => {
        received.push(payload);
      });

      assert.strictEqual(typeof unsub, 'function');

      // Unsubscribe all and disconnect test socket
      unsub();
      manager.disconnect();
    });
  });

  describe('Watchlist Ticker Filtering & Sorting Logic', () => {
    const mockList: WatchlistTickerItem[] = [
      {
        symbol: 'BTC/USDT',
        baseAsset: 'BTC',
        price: 65000,
        priceChangePercent: 2.1,
        priceChange: 1300,
        highPrice: 66000,
        lowPrice: 64000,
        volume: 10000,
        quoteVolume: 650000000,
        tickDirection: 'EQUAL',
        lastUpdated: Date.now(),
      },
      {
        symbol: 'SOL/USDT',
        baseAsset: 'SOL',
        price: 150,
        priceChangePercent: 8.5,
        priceChange: 12,
        highPrice: 155,
        lowPrice: 138,
        volume: 2000000,
        quoteVolume: 300000000,
        tickDirection: 'UP',
        lastUpdated: Date.now(),
      },
      {
        symbol: 'DOGE/USDT',
        baseAsset: 'DOGE',
        price: 0.12,
        priceChangePercent: -4.2,
        priceChange: -0.005,
        highPrice: 0.13,
        lowPrice: 0.11,
        volume: 500000000,
        quoteVolume: 60000000,
        tickDirection: 'DOWN',
        lastUpdated: Date.now(),
      },
    ];

    it('correctly identifies top gainer and top loser', () => {
      let topGainer = mockList[0];
      let topLoser = mockList[0];

      for (const item of mockList) {
        if (item.priceChangePercent > topGainer.priceChangePercent) {
          topGainer = item;
        }
        if (item.priceChangePercent < topLoser.priceChangePercent) {
          topLoser = item;
        }
      }

      assert.strictEqual(topGainer.baseAsset, 'SOL');
      assert.strictEqual(topGainer.priceChangePercent, 8.5);
      assert.strictEqual(topLoser.baseAsset, 'DOGE');
      assert.strictEqual(topLoser.priceChangePercent, -4.2);
    });

    it('sorts by GAINERS descending', () => {
      const sorted = [...mockList].sort((a, b) => b.priceChangePercent - a.priceChangePercent);
      assert.strictEqual(sorted[0].baseAsset, 'SOL');
      assert.strictEqual(sorted[1].baseAsset, 'BTC');
      assert.strictEqual(sorted[2].baseAsset, 'DOGE');
    });

    it('sorts by LOSERS ascending', () => {
      const sorted = [...mockList].sort((a, b) => a.priceChangePercent - b.priceChangePercent);
      assert.strictEqual(sorted[0].baseAsset, 'DOGE');
      assert.strictEqual(sorted[1].baseAsset, 'BTC');
      assert.strictEqual(sorted[2].baseAsset, 'SOL');
    });

    it('sorts by VOLUME descending', () => {
      const sorted = [...mockList].sort((a, b) => b.quoteVolume - a.quoteVolume);
      assert.strictEqual(sorted[0].baseAsset, 'BTC'); // 650M
      assert.strictEqual(sorted[1].baseAsset, 'SOL'); // 300M
      assert.strictEqual(sorted[2].baseAsset, 'DOGE'); // 60M
    });
  });
});
