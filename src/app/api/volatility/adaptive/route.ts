// ─── GET/POST /api/volatility/adaptive (Phase 42) ────────────────────
// Auto-Adaptive Volatility ATR Sizing & Dynamic Target Scaling API

import { NextResponse } from 'next/server';
import { fetchKlines, fetchOrderBook } from '@/lib/services/binance-service';
import { runTechnicalAnalysis } from '@/lib/ta';
import {
  generateAdaptiveVolatilityReport,
  computeAdaptiveTargetPlan,
} from '@/lib/services/adaptive-volatility';
import type { Timeframe } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol = searchParams.get('symbol') || 'BTCUSDT';
    const cleanSymbol = rawSymbol.replace('/', '').toUpperCase();
    const slashSymbol = cleanSymbol.endsWith('USDT')
      ? `${cleanSymbol.slice(0, -4)}/USDT`
      : cleanSymbol;

    const timeframe = (searchParams.get('timeframe') || '15m') as Timeframe;

    // Fetch live market data to compute real ATR
    const [klines, orderBook] = await Promise.all([
      fetchKlines(slashSymbol, timeframe, 60).catch(() => []),
      fetchOrderBook(slashSymbol, 20).catch(() => null),
    ]);

    let entryPrice = 100;
    let atr = 2.5;
    let structuralPivotLow: number | undefined;
    let overheadResistance: number | undefined;

    if (klines && klines.length > 0) {
      entryPrice = klines[klines.length - 1].close;
      const ta = runTechnicalAnalysis(slashSymbol, klines, timeframe, orderBook);
      atr = ta.volatility.atr || entryPrice * 0.02;
      structuralPivotLow = ta.structure.nearestSupport ?? undefined;
      overheadResistance = ta.structure.nearestResistance ?? undefined;
    }

    const report = generateAdaptiveVolatilityReport(
      slashSymbol,
      entryPrice,
      atr,
      structuralPivotLow,
      overheadResistance
    );

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate adaptive volatility report',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      symbol = 'BTC/USDT',
      entryPrice = 100,
      atr = 2.0,
      structuralPivotLow,
      overheadResistance,
      forcedRegime,
    } = body;

    const plan = computeAdaptiveTargetPlan({
      symbol,
      entryPrice: Number(entryPrice),
      atr: Number(atr),
      structuralPivotLow: structuralPivotLow ? Number(structuralPivotLow) : undefined,
      overheadResistance: overheadResistance ? Number(overheadResistance) : undefined,
      forcedRegime,
    });

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request payload',
      },
      { status: 400 }
    );
  }
}
