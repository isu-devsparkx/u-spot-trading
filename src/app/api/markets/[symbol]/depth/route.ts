// ─── GET /api/markets/[symbol]/depth ────────────────────────────────
// Phase 3: Order book depth, bid-ask spread, and liquidity metrics

import { NextResponse } from 'next/server';
import { fetchOrderBook } from '@/lib/services/binance-service';

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const { searchParams } = new URL(request.url);

    const limitParam = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Math.min(100, Math.max(5, isNaN(limitParam) ? 20 : limitParam));

    const orderBook = await fetchOrderBook(symbol, limit);

    return NextResponse.json({
      success: true,
      orderBook,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error fetching order book:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch order book',
        status: 'DATA_UNAVAILABLE',
      },
      { status: 500 }
    );
  }
}
