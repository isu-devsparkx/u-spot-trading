// ─── U-SPOT Institutional Whale Iceberg Order Detector API Route (Phase 45) ───
// Detects real-time hidden institutional reload orders, absorption walls, and flow delta.

import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveIcebergsFromBinance } from '@/lib/services/iceberg-detector';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSymbol = searchParams.get('symbol') || 'BTC/USDT';
    const symbol = rawSymbol.includes('/') ? rawSymbol : `${rawSymbol}/USDT`;

    const summary = await fetchLiveIcebergsFromBinance(symbol);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to detect institutional icebergs' },
      { status: 500 }
    );
  }
}
