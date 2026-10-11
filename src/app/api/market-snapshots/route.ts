// ─── U-SPOT Market Snapshots API ──────────────────────────────────────
// Spec Section 40 & 41: /api/market-snapshots
// Returns recent market snapshots saved during signal generation

import { NextRequest, NextResponse } from 'next/server';
import {
  getLatestMarketSnapshots,
  saveMarketSnapshot,
  getStorageStatus,
} from '@/lib/services/signal-store';
import type { MarketSnapshot } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '50')));

    const snapshots = await getLatestMarketSnapshots(limit);
    const status = getStorageStatus();

    return NextResponse.json({
      success: true,
      count: snapshots.length,
      data: snapshots,
      storageStatus: status,
    });
  } catch (err) {
    console.error('[/api/market-snapshots] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve market snapshots',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MarketSnapshot;

    if (!body.symbol || body.price === undefined) {
      return NextResponse.json(
        { success: false, error: 'Symbol and price are required' },
        { status: 400 }
      );
    }

    const res = await saveMarketSnapshot({
      timestamp: body.timestamp || new Date().toISOString(),
      symbol: body.symbol,
      price: body.price,
      volume24h: body.volume24h ?? 0,
      liquidity: body.liquidity ?? 0,
      spread: body.spread ?? 0,
      marketRegime: body.marketRegime ?? 'NEUTRAL',
      indicators: body.indicators ?? {},
    });

    return NextResponse.json({
      success: res.success,
      source: res.source,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save market snapshot',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
