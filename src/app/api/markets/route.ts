// ─── GET /api/markets ───────────────────────────────────────────────
// Phase 3: Active spot market universe, 24h tickers, and Top 20 Candidates

import { NextResponse } from 'next/server';
import { getMarketUniverse } from '@/lib/services/market-universe';
import { checkBinanceHealth } from '@/lib/services/binance-service';
import { checkCoinGeckoHealth } from '@/lib/services/coingecko-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const [universe, binanceHealth, coingeckoHealth] = await Promise.all([
      getMarketUniverse(forceRefresh),
      checkBinanceHealth(),
      checkCoinGeckoHealth(),
    ]);

    return NextResponse.json({
      success: true,
      summary: universe.summary,
      totalPairs: universe.pairs.length,
      pairs: universe.pairs,
      candidates: universe.candidates,
      health: {
        binance: binanceHealth,
        coingecko: coingeckoHealth,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error in /api/markets:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch market data',
        status: 'DATA_UNAVAILABLE',
      },
      { status: 500 }
    );
  }
}
