// ─── U-SPOT Backtesting API — Phase 13 ──────────────────────────────
// Spec Section 30: Historical Simulation & Backtesting API
// Spec Section 32: Fees & Slippage Accounting
// Spec Section 33: Strictly No Look-Ahead Bias

import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/services/binance-service';
import { generateSyntheticOHLCV } from '@/lib/services/signal-engine';
import { runBacktest, DEFAULT_BACKTEST_CONFIG } from '@/lib/services/backtest-service';
import type { BacktestConfig, OHLCV, Timeframe } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbol: string = body.symbol || 'SOL/USDT';
    const timeframe: Timeframe = body.timeframe || '15m';
    const barsCount: number = Math.min(Math.max(body.barsCount || 200, 50), 1000);
    const initialWalletBalance: number = body.initialWalletBalance || 300;

    const config: Partial<BacktestConfig> = {
      symbol,
      timeframe,
      barsCount,
      initialWalletBalance,
      makerFeeRate: body.makerFeeRate ?? DEFAULT_BACKTEST_CONFIG.makerFeeRate,
      takerFeeRate: body.takerFeeRate ?? DEFAULT_BACKTEST_CONFIG.takerFeeRate,
      slippageRate: body.slippageRate ?? DEFAULT_BACKTEST_CONFIG.slippageRate,
      spreadRate: body.spreadRate ?? DEFAULT_BACKTEST_CONFIG.spreadRate,
      dcaEnabled: body.dcaEnabled ?? DEFAULT_BACKTEST_CONFIG.dcaEnabled,
      breakevenTrigger: body.breakevenTrigger ?? DEFAULT_BACKTEST_CONFIG.breakevenTrigger,
      mtfEnabled: body.mtfEnabled ?? DEFAULT_BACKTEST_CONFIG.mtfEnabled,
      weights: body.weights,
      strategyVersion: body.strategyVersion || 'v1.0.0',
    };

    let candles: OHLCV[] = [];
    let dataSource = 'binance_live';

    // 1. Fetch real historical candles from Binance
    try {
      candles = await fetchKlines(symbol, timeframe, barsCount);
    } catch (err) {
      console.warn(`[/api/backtest] Binance fetch failed for ${symbol}, falling back to synthetic historical series:`, err);
    }

    // 2. Guaranteed zero-downtime fallback to realistic synthetic candles if offline
    if (!candles || candles.length < 50) {
      dataSource = 'synthetic_historical';
      const basePrice = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3500 : 150;
      candles = generateSyntheticOHLCV(basePrice, 5, barsCount);
    }

    // 3. Execute historical simulation with zero lookahead bias
    const result = runBacktest(candles, config);

    return NextResponse.json({
      success: true,
      result,
      dataSource,
      candlesSampled: candles.length,
    });
  } catch (err) {
    console.error('[/api/backtest] Error running backtest:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run historical backtest',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    defaultConfig: DEFAULT_BACKTEST_CONFIG,
    supportedSymbols: ['SOL/USDT', 'BTC/USDT', 'ETH/USDT', 'DOGE/USDT', 'XRP/USDT', 'BNB/USDT', 'AVAX/USDT'],
    supportedTimeframes: ['5m', '15m', '1h', '4h', '1d'],
    presets: {
      CONSERVATIVE: {
        name: 'Conservative Spot',
        description: 'Emphasis on trend confirmation and capital preservation with strict breakeven ratcheting',
        riskPercent: 0.5,
        dcaEnabled: true,
        breakevenTrigger: true,
      },
      AGGRESSIVE: {
        name: 'Momentum Breakout',
        description: 'Higher volume surge weighting, wider runner targets, and accelerated entry triggers',
        riskPercent: 1.0,
        dcaEnabled: true,
        breakevenTrigger: false,
      },
      RANGE_SCALPER: {
        name: 'Range Bounce',
        description: 'Designed for chop/range markets with tight TP1/TP2 scaling',
        riskPercent: 0.75,
        dcaEnabled: true,
        breakevenTrigger: true,
      },
    },
  });
}
