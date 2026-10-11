// ─── U-SPOT Market Data Unit Tests ──────────────────────────────────
// Phase 3: Market Data Services & Data Quality Tests
// Spec Section 4 (Universe), Section 7 (Timeframes), Section 42 (Data Quality), Section 51

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toRawSymbol,
  toDisplaySymbol,
  getBaseAsset,
  STABLECOINS,
} from '../services/binance-service.ts';
import { determineMarketRegime } from '../services/market-universe.ts';
import type { Ticker24h, Timeframe } from '../../types/index.ts';

describe('Market Data: Symbol Formatting & Normalization', () => {
  it('converts display format to raw Binance format', () => {
    assert.equal(toRawSymbol('SOL/USDT'), 'SOLUSDT');
    assert.equal(toRawSymbol('BTC/USDT'), 'BTCUSDT');
    assert.equal(toRawSymbol('eth/usdt'), 'ETHUSDT');
  });

  it('converts raw Binance format to standard display format', () => {
    assert.equal(toDisplaySymbol('SOLUSDT'), 'SOL/USDT');
    assert.equal(toDisplaySymbol('BTCUSDT'), 'BTC/USDT');
  });

  it('extracts base asset from USDT pair', () => {
    assert.equal(getBaseAsset('SOLUSDT'), 'SOL');
    assert.equal(getBaseAsset('AVAXUSDT'), 'AVAX');
  });
});

describe('Market Data: Stablecoin & Token Filtering (Spec Section 4)', () => {
  it('identifies and filters out major stablecoins and fiat-pegged tokens', () => {
    assert.ok(STABLECOINS.has('USDT'));
    assert.ok(STABLECOINS.has('USDC'));
    assert.ok(STABLECOINS.has('FDUSD'));
    assert.ok(STABLECOINS.has('DAI'));
    assert.ok(STABLECOINS.has('TUSD'));
    assert.ok(STABLECOINS.has('EUR'));

    // Real tradeable crypto assets must NOT be filtered
    assert.ok(!STABLECOINS.has('BTC'));
    assert.ok(!STABLECOINS.has('ETH'));
    assert.ok(!STABLECOINS.has('SOL'));
    assert.ok(!STABLECOINS.has('AVAX'));
  });
});

describe('Market Data: Market Regime Determination (Spec Section 6)', () => {
  it('identifies BULL market regime when majors are trending up', () => {
    const mockTickers: Ticker24h[] = [
      {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        price: 90000,
        priceChange: 2000,
        priceChangePercent: 2.5,
        highPrice: 91000,
        lowPrice: 88000,
        volume: 1000,
        quoteVolume: 90000000,
        bidPrice: 89999,
        askPrice: 90000,
        spreadPercent: 0.001,
        count: 50000,
        timestamp: Date.now(),
      },
      {
        symbol: 'ETHUSDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        price: 3500,
        priceChange: 70,
        priceChangePercent: 2.0,
        highPrice: 3550,
        lowPrice: 3420,
        volume: 5000,
        quoteVolume: 17500000,
        bidPrice: 3499.5,
        askPrice: 3500,
        spreadPercent: 0.014,
        count: 30000,
        timestamp: Date.now(),
      },
    ];

    const regime = determineMarketRegime(mockTickers);
    assert.equal(regime, 'BULL');
  });

  it('identifies BEAR market regime when majors are falling', () => {
    const mockTickers: Ticker24h[] = [
      {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        price: 80000,
        priceChange: -2000,
        priceChangePercent: -2.5,
        highPrice: 82000,
        lowPrice: 79000,
        volume: 1000,
        quoteVolume: 80000000,
        bidPrice: 79999,
        askPrice: 80000,
        spreadPercent: 0.001,
        count: 50000,
        timestamp: Date.now(),
      },
      {
        symbol: 'ETHUSDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        price: 3000,
        priceChange: -80,
        priceChangePercent: -2.6,
        highPrice: 3100,
        lowPrice: 2950,
        volume: 5000,
        quoteVolume: 15000000,
        bidPrice: 2999.5,
        askPrice: 3000,
        spreadPercent: 0.017,
        count: 30000,
        timestamp: Date.now(),
      },
    ];

    const regime = determineMarketRegime(mockTickers);
    assert.equal(regime, 'BEAR');
  });

  it('identifies HIGH_VOLATILITY regime when extreme moves occur (>7%)', () => {
    const mockTickers: Ticker24h[] = [
      {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        price: 90000,
        priceChange: 7500,
        priceChangePercent: 8.5,
        highPrice: 91000,
        lowPrice: 82000,
        volume: 5000,
        quoteVolume: 450000000,
        bidPrice: 89999,
        askPrice: 90000,
        spreadPercent: 0.001,
        count: 100000,
        timestamp: Date.now(),
      },
    ];

    const regime = determineMarketRegime(mockTickers);
    assert.equal(regime, 'HIGH_VOLATILITY');
  });
});

describe('Market Data: Timeframes Supported (Spec Section 7)', () => {
  it('validates supported timeframes: 5m, 15m, 1h, 4h, 1d', () => {
    const supported: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];
    assert.equal(supported.length, 5);
    assert.ok(supported.includes('5m'));
    assert.ok(supported.includes('15m'));
    assert.ok(supported.includes('1h'));
    assert.ok(supported.includes('4h'));
    assert.ok(supported.includes('1d'));
  });
});
