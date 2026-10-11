// ─── U-SPOT Multi-Timeframe Divergence API Route — Phase 37 ────────
// Endpoint for real-time cross-timeframe divergence matrix scans,
// multi-timeframe confluence detection, and Telegram alert broadcasting.

import { NextRequest, NextResponse } from 'next/server';
import {
  scanUniverseDivergenceMatrix,
  scanSymbolTimeframeDivergences,
  evaluateMultiTimeframeConfluence,
} from '@/lib/services/divergence-scanner';
import { broadcastDivergenceAlert } from '@/lib/services/telegram-service';
import { DEFAULT_WATCHLIST_SYMBOLS } from '@/lib/services/binance-websocket';
import { fetchKlines } from '@/lib/services/binance-service';
import type { DivergenceTimeframe, DivergenceResult } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbolsParam = searchParams.get('symbols') || searchParams.get('symbol');
    const timeframesParam = searchParams.get('timeframes');

    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
      : DEFAULT_WATCHLIST_SYMBOLS;

    const validTimeframes: DivergenceTimeframe[] = ['15m', '1h', '4h', '1d'];
    const timeframes: DivergenceTimeframe[] = timeframesParam
      ? (timeframesParam
          .split(',')
          .map((t) => t.trim())
          .filter((t) => validTimeframes.includes(t as DivergenceTimeframe)) as DivergenceTimeframe[])
      : ['15m', '1h', '4h'];

    if (timeframes.length === 0) {
      timeframes.push('15m', '1h', '4h');
    }

    const report = await scanUniverseDivergenceMatrix(symbols, timeframes);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to scan multi-timeframe divergence matrix',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, symbol, timeframe, alertPayload } = body;

    if (action === 'BROADCAST' && alertPayload) {
      const result = await broadcastDivergenceAlert(alertPayload);
      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    if (action === 'SCAN_SYMBOL' && symbol) {
      const tf: DivergenceTimeframe = (timeframe as DivergenceTimeframe) || '15m';
      const klines = await fetchKlines(symbol, tf, 60);
      const divergences = scanSymbolTimeframeDivergences(symbol, tf, klines);
      const confluence = evaluateMultiTimeframeConfluence(symbol, divergences);

      return NextResponse.json({
        success: true,
        symbol,
        timeframe: tf,
        divergences,
        confluence,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action or missing parameters' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error processing divergence request',
      },
      { status: 500 }
    );
  }
}
