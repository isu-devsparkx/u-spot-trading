// ─── Phase 43: Multi-Exchange Spread Arbitrage & Cross-Pair Liquidity Monitor Unit Tests ───

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateSpreadMetrics,
  classifyMacroInstitutionalSentiment,
  generateSyntheticCrossExchangeQuotes,
  scanCrossExchangeUniverse,
  MAJOR_ARBITRAGE_SYMBOLS,
} from '../services/cross-exchange-arbitrage.ts';
import type { ExchangeTickerQuote, CrossExchangeSpreadSnapshot } from '../../types/index.ts';

describe('Multi-Exchange Spread Arbitrage Service (Phase 43)', () => {
  const binanceQuote: ExchangeTickerQuote = {
    venue: 'BINANCE',
    symbol: 'BTC/USDT',
    price: 68000.0,
    bidPrice: 67990.0,
    askPrice: 68010.0,
    spreadPercent: 0.03,
    timestamp: 1700000000000,
  };

  describe('1. Spread & Premium Calculations', () => {
    it('calculates positive Coinbase Premium and flags institutional buy flow', () => {
      const coinbaseQuote: ExchangeTickerQuote = {
        venue: 'COINBASE',
        symbol: 'BTC/USDT',
        price: 68102.0, // +0.15% premium
        bidPrice: 68095.0,
        askPrice: 68105.0,
        spreadPercent: 0.02,
        timestamp: 1700000000000,
      };

      const krakenQuote: ExchangeTickerQuote = {
        venue: 'KRAKEN',
        symbol: 'BTC/USDT',
        price: 68040.0, // +0.06% premium
        bidPrice: 68030.0,
        askPrice: 68050.0,
        spreadPercent: 0.03,
        timestamp: 1700000000000,
      };

      const snapshot = calculateSpreadMetrics(binanceQuote, coinbaseQuote, krakenQuote);

      assert.strictEqual(snapshot.symbol, 'BTC/USDT');
      assert.strictEqual(snapshot.coinbasePremiumPercent, 0.15);
      assert.strictEqual(snapshot.krakenPremiumPercent, 0.06);
      assert.strictEqual(snapshot.highestVenue, 'COINBASE');
      assert.strictEqual(snapshot.lowestVenue, 'BINANCE');
      assert.strictEqual(snapshot.flowBias, 'STRONG_INSTITUTIONAL_BUY');
    });

    it('identifies discount and institutional sell pressure', () => {
      const coinbaseDiscount: ExchangeTickerQuote = {
        venue: 'COINBASE',
        symbol: 'BTC/USDT',
        price: 67932.0, // -0.10% discount
        bidPrice: 67925.0,
        askPrice: 67935.0,
        spreadPercent: 0.02,
        timestamp: 1700000000000,
      };

      const snapshot = calculateSpreadMetrics(binanceQuote, coinbaseDiscount, null);

      assert.strictEqual(snapshot.coinbasePremiumPercent, -0.10);
      assert.strictEqual(snapshot.flowBias, 'INSTITUTIONAL_SELL_PRESSURE');
      assert.strictEqual(snapshot.lowestVenue, 'COINBASE');
    });

    it('detects viable arbitrage opportunity when spread exceeds friction threshold', () => {
      const wideCoinbase: ExchangeTickerQuote = {
        venue: 'COINBASE',
        symbol: 'BTC/USDT',
        price: 68340.0, // +0.50% spread
        bidPrice: 68330.0,
        askPrice: 68350.0,
        spreadPercent: 0.03,
        timestamp: 1700000000000,
      };

      const snapshot = calculateSpreadMetrics(binanceQuote, wideCoinbase, null);

      assert.strictEqual(snapshot.maxSpreadPercent, 0.50);
      assert.strictEqual(snapshot.isArbitrageViable, true);
      assert.strictEqual(snapshot.estimatedNetProfitPercent, 0.25); // 0.50 - 0.25 friction
    });
  });

  describe('2. Macro Institutional Sentiment Classification', () => {
    it('classifies ACCUMULATION when majority of pairs show positive premium', () => {
      const mockSnapshots: CrossExchangeSpreadSnapshot[] = [
        { coinbasePremiumPercent: 0.12 } as CrossExchangeSpreadSnapshot,
        { coinbasePremiumPercent: 0.08 } as CrossExchangeSpreadSnapshot,
        { coinbasePremiumPercent: -0.01 } as CrossExchangeSpreadSnapshot,
      ];

      const sentiment = classifyMacroInstitutionalSentiment(mockSnapshots);
      assert.strictEqual(sentiment, 'ACCUMULATION');
    });

    it('classifies DISTRIBUTION when majority of pairs trade at discount', () => {
      const mockSnapshots: CrossExchangeSpreadSnapshot[] = [
        { coinbasePremiumPercent: -0.10 } as CrossExchangeSpreadSnapshot,
        { coinbasePremiumPercent: -0.07 } as CrossExchangeSpreadSnapshot,
        { coinbasePremiumPercent: 0.02 } as CrossExchangeSpreadSnapshot,
      ];

      const sentiment = classifyMacroInstitutionalSentiment(mockSnapshots);
      assert.strictEqual(sentiment, 'DISTRIBUTION');
    });
  });

  describe('3. Synthetic Fallback & Universe Scanning', () => {
    it('generates consistent synthetic quotes for testing', () => {
      const synth = generateSyntheticCrossExchangeQuotes('SOL/USDT', 150.0, 0.10, 0.04);

      assert.strictEqual(synth.binance.symbol, 'SOL/USDT');
      assert.strictEqual(synth.binance.price, 150.0);
      assert.ok(synth.coinbase.price > 150.0);
      assert.ok(synth.kraken.price > 150.0);
    });

    it('scans multi-exchange universe cleanly and outputs scan report', async () => {
      const report = await scanCrossExchangeUniverse(['BTC/USDT', 'ETH/USDT']);

      assert.strictEqual(report.pairsCount, 2);
      assert.ok(report.pairs.length === 2);
      assert.ok(report.highestPremiumPair !== null);
      assert.ok(report.highestSpreadPair !== null);
      assert.ok(['ACCUMULATION', 'DISTRIBUTION', 'NEUTRAL'].includes(report.macroInstitutionalSentiment));
    });
  });
});
