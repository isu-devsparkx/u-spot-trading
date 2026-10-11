// ─── GET /api/markets/[symbol]/klines ───────────────────────────────
// Phase 3: OHLCV candlestick data across supported timeframes

import { NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/services/binance-service';
import type { Timeframe } from '@/types';

const VALID_INTERVALS = new Set<Timeframe>(['5m', '15m', '1h', '4h', '1d']);

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const { searchParams } = new URL(request.url);

    const intervalParam = (searchParams.get('interval') ?? '15m') as Timeframe;
    const interval: Timeframe = VALID_INTERVALS.has(intervalParam)
      ? intervalParam
      : '15m';

    const limitParam = parseInt(searchParams.get('limit') ?? '100', 10);
    const limit = Math.min(500, Math.max(10, isNaN(limitParam) ? 100 : limitParam));

    const startTimeParam = searchParams.get('startTime');
    const startTime = startTimeParam ? parseInt(startTimeParam, 10) : undefined;

    const endTimeParam = searchParams.get('endTime');
    const endTime = endTimeParam ? parseInt(endTimeParam, 10) : undefined;

    const klines = await fetchKlines(symbol, interval, limit, startTime, endTime);

    return NextResponse.json({
      success: true,
      symbol,
      interval,
      count: klines.length,
      klines,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error fetching klines:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch klines',
        status: 'DATA_UNAVAILABLE',
      },
      { status: 500 }
    );
  }
}
