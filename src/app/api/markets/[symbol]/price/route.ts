// ─── GET /api/markets/[symbol]/price ────────────────────────────────
// Phase 3: Real-time ticker and price for a single coin

import { NextResponse } from 'next/server';
import { fetchTicker24h } from '@/lib/services/binance-service';

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    const ticker = await fetchTicker24h(symbol);

    return NextResponse.json({
      success: true,
      ticker,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error fetching ticker:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch ticker price',
        status: 'DATA_UNAVAILABLE',
      },
      { status: 500 }
    );
  }
}
