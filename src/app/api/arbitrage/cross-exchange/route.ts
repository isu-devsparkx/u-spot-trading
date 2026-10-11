// ─── GET /api/arbitrage/cross-exchange (Phase 43) ─────────────────────
// Multi-Exchange Spread Arbitrage & Cross-Pair Liquidity Monitor API

import { NextResponse } from 'next/server';
import {
  fetchCrossExchangeSnapshot,
  scanCrossExchangeUniverse,
  MAJOR_ARBITRAGE_SYMBOLS,
} from '@/lib/services/cross-exchange-arbitrage';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isScan = searchParams.get('scan') === 'true';
    const symbolParam = searchParams.get('symbol');

    if (isScan) {
      const scanReport = await scanCrossExchangeUniverse();
      return NextResponse.json({
        success: true,
        scanReport,
      });
    }

    const symbol = symbolParam || 'BTC/USDT';
    const cleanSymbol = symbol.includes('/') ? symbol : `${symbol}/USDT`;

    const snapshot = await fetchCrossExchangeSnapshot(cleanSymbol);

    return NextResponse.json({
      success: true,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch cross-exchange spread',
      },
      { status: 500 }
    );
  }
}
