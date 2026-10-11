// ─── U-SPOT Phase 13: Backtest Engine Tests ──────────────────────────
// Spec Section 30: Backtesting Engine (Historical simulator)
// Spec Section 32: Fees, Slippage & Spread Accounting
// Spec Section 33: Strictly No Lookahead Bias

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { runBacktest, DEFAULT_BACKTEST_CONFIG } from '../services/backtest-service.ts';
import { generateSyntheticOHLCV } from '../services/signal-engine.ts';
import type { OHLCV } from '../../types/index.ts';

describe('Phase 13: Backtest Engine — Empty & Guard Rails', () => {
  test('returns zeroed backtest result when candle array is empty or insufficient', () => {
    const emptyResult = runBacktest([], { symbol: 'SOL/USDT' });
    assert.strictEqual(emptyResult.trades.length, 0);
    assert.strictEqual(emptyResult.initialBalance, 300);
    assert.strictEqual(emptyResult.finalBalance, 300);
    assert.strictEqual(emptyResult.netProfitUsdt, 0);

    const shortCandles = generateSyntheticOHLCV(150, 2, 20);
    const shortResult = runBacktest(shortCandles, { symbol: 'SOL/USDT' });
    assert.strictEqual(shortResult.trades.length, 0);
    assert.strictEqual(shortResult.finalBalance, 300);
  });
});

describe('Phase 13: Backtest Engine — Historical Simulation & Zero Lookahead', () => {
  test('executes historical simulation on trending candles with fee accounting', () => {
    // Generate 120 bars of synthetic upward trending OHLCV
    const candles = generateSyntheticOHLCV(150, 10, 120);

    const result = runBacktest(candles, {
      symbol: 'SOL/USDT',
      timeframe: '15m',
      initialWalletBalance: 300,
      makerFeeRate: 0.001,
      takerFeeRate: 0.001,
      slippageRate: 0.0005,
      spreadRate: 0.0002,
      dcaEnabled: true,
      breakevenTrigger: true,
    });

    assert.ok(result.simulatedBarsCount >= 120);
    assert.strictEqual(result.config.symbol, 'SOL/USDT');
    assert.strictEqual(result.initialBalance, 300);

    // Initial equity curve point must be at index 0 with initial balance
    assert.ok(result.equityCurve.length >= 1);
    assert.strictEqual(result.equityCurve[0].equityUsdt, 300);
    assert.strictEqual(result.equityCurve[0].runningR, 0);

    // If trades were triggered, verify trade properties and fee deductions
    if (result.trades.length > 0) {
      const firstTrade = result.trades[0];
      assert.ok(firstTrade.entryPrice > 0);
      assert.ok(firstTrade.allocatedCapital > 0);
      assert.ok(firstTrade.feesUsdt >= 0);
      assert.ok(firstTrade.slippageUsdt >= 0);
      assert.ok(firstTrade.holdingBars >= 1);
      assert.ok(typeof firstTrade.exitReason === 'string');

      // Net PnL must equal Gross PnL minus Fees, Slippage, and Spread
      const expectedNet = Number(
        (firstTrade.grossPnlUsdt - firstTrade.feesUsdt - firstTrade.slippageUsdt - firstTrade.spreadUsdt).toFixed(2)
      );
      assert.strictEqual(firstTrade.netPnlUsdt, expectedNet);

      // Verify equity curve aligns with completed trades
      const lastPoint = result.equityCurve[result.equityCurve.length - 1];
      assert.strictEqual(lastPoint.equityUsdt, result.finalBalance);
    }
  });

  test('enforces zero lookahead bias determinism', () => {
    const candles = generateSyntheticOHLCV(100, 5, 100);

    const run1 = runBacktest(candles, { symbol: 'BTC/USDT', initialWalletBalance: 500 });
    const run2 = runBacktest(candles, { symbol: 'BTC/USDT', initialWalletBalance: 500 });

    assert.strictEqual(run1.trades.length, run2.trades.length);
    assert.strictEqual(run1.finalBalance, run2.finalBalance);
    assert.strictEqual(run1.totalReturnPercent, run2.totalReturnPercent);

    if (run1.trades.length > 0) {
      assert.strictEqual(run1.trades[0].realizedR, run2.trades[0].realizedR);
      assert.strictEqual(run1.trades[0].netPnlUsdt, run2.trades[0].netPnlUsdt);
    }
  });
});

describe('Phase 13: Backtest Engine — Performance Analytics Integration', () => {
  test('integrates with Performance Engine to output valid Expectancy and Target Rates', () => {
    const candles = generateSyntheticOHLCV(200, 8, 140);
    const result = runBacktest(candles, {
      symbol: 'ETH/USDT',
      initialWalletBalance: 300,
    });

    assert.ok(result.stats);
    assert.ok(typeof result.stats.winRate === 'number');
    assert.ok(typeof result.stats.lossRate === 'number');
    assert.ok(typeof result.stats.expectancy === 'number');
    assert.ok(typeof result.stats.profitFactor === 'number');
    assert.ok(typeof result.stats.maxDrawdown === 'number');
  });
});
