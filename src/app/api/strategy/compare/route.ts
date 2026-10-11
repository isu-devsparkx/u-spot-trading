// ─── U-SPOT Strategy Comparison API ──────────────────────────────────
// Phase 16: Strategy Research Lab (Spec Sections 29, 36)
// Side-by-side strategy backtest comparison on identical market data

import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/services/binance-service';
import { generateSyntheticOHLCV } from '@/lib/services/signal-engine';
import {
  compareStrategies,
  DEFAULT_STRATEGY_PARAMS,
  PRESET_TREND_FOLLOWER,
} from '@/lib/services/strategy-service';
import type { StrategyResearchParameters, OHLCV, Timeframe } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const versionA: StrategyResearchParameters = body.versionA || DEFAULT_STRATEGY_PARAMS;
    const versionB: StrategyResearchParameters = body.versionB || PRESET_TREND_FOLLOWER;
    const symbol: string = body.symbol || 'SOL/USDT';
    const timeframe: Timeframe = body.timeframe || '15m';
    const barsCount: number = Math.min(Math.max(body.barsCount || 200, 60), 1000);
    const initialWalletBalance: number = body.initialWalletBalance || 300;

    let candles: OHLCV[] = [];
    let dataSource = 'binance_live';

    // 1. Fetch real historical candles from Binance spot API
    try {
      candles = await fetchKlines(symbol, timeframe, barsCount);
    } catch (err) {
      console.warn(
        `[/api/strategy/compare] Binance fetch failed for ${symbol}, using synthetic fallback:`,
        err
      );
    }

    // 2. Guaranteed fallback to realistic synthetic candles if offline
    if (!candles || candles.length < 50) {
      dataSource = 'synthetic_historical';
      const basePrice = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3500 : 150;
      candles = generateSyntheticOHLCV(basePrice, 5, barsCount);
    }

    // 3. Execute side-by-side comparison on identical candles
    const comparison = compareStrategies(candles, versionA, versionB, {
      symbol,
      timeframe,
      initialBalance: initialWalletBalance,
    });

    return NextResponse.json({
      success: true,
      comparison,
      dataSource,
      symbol,
      timeframe,
      barsCount: candles.length,
    });
  } catch (err) {
    console.error('[/api/strategy/compare] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute strategy comparison',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
