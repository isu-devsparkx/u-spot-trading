// ─── GET /api/analysis/[symbol] ──────────────────────────────────────
// Phase 5: Technical Analysis API — Trend, Momentum, Volume, Volatility, Structure & Liquidity
// Spec Section 8 (Strategy Modules)

import { NextResponse } from 'next/server';
import { fetchKlines, fetchOrderBook } from '@/lib/services/binance-service';
import { runTechnicalAnalysis } from '@/lib/ta';
import type { Timeframe } from '@/types';

const VALID_TIMEFRAMES = new Set<Timeframe>(['5m', '15m', '1h', '4h', '1d']);

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const { searchParams } = new URL(request.url);

    const tfParam = (searchParams.get('timeframe') ?? '15m') as Timeframe;
    const timeframe: Timeframe = VALID_TIMEFRAMES.has(tfParam) ? tfParam : '15m';

    const limitParam = parseInt(searchParams.get('limit') ?? '100', 10);
    const limit = Math.min(300, Math.max(20, isNaN(limitParam) ? 100 : limitParam));

    // Fetch klines and order book in parallel
    const [klines, orderBook] = await Promise.all([
      fetchKlines(symbol, timeframe, limit).catch(() => []),
      fetchOrderBook(symbol, 20).catch(() => null),
    ]);

    if (!klines || klines.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No candle data available for ${symbol}`,
        },
        { status: 404 }
      );
    }

    const analysis = runTechnicalAnalysis(symbol, klines, timeframe, orderBook);

    return NextResponse.json({
      success: true,
      symbol,
      timeframe,
      timestamp: Date.now(),
      analysis,
    });
  } catch (error) {
    console.error('Error in /api/analysis/[symbol]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Technical analysis execution failed',
      },
      { status: 500 }
    );
  }
}
