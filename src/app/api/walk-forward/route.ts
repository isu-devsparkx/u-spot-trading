// ─── U-SPOT Walk-Forward Validation API — Phase 14 ─────────────────────
// Spec Ref: Phase 14 Walk-Forward Testing, Out-of-Sample Evaluation & WFE

import { NextRequest, NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/services/binance-service';
import { generateSyntheticOHLCV } from '@/lib/services/signal-engine';
import {
  runWalkForwardValidation,
  DEFAULT_WALK_FORWARD_CONFIG,
  DEFAULT_WALK_FORWARD_CANDIDATES,
  DEFAULT_MTF_GRID_CANDIDATES,
} from '@/lib/services/walk-forward-service';
import type { OHLCV, Timeframe, WalkForwardConfig } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbol: string = body.symbol || 'SOL/USDT';
    const timeframe: Timeframe = body.timeframe || '15m';
    const totalBars: number = Math.min(Math.max(body.totalBars || 300, 100), 1000);
    const windowCount: number = Math.min(Math.max(body.windowCount || 3, 2), 6);
    const trainRatio: number = Math.min(Math.max(body.trainRatio || 0.70, 0.50), 0.85);
    const initialBalance: number = body.initialBalance || 300;
    const mtfOptimization: boolean = Boolean(body.mtfOptimization);
    const candidates = body.candidates || (mtfOptimization ? DEFAULT_MTF_GRID_CANDIDATES : DEFAULT_WALK_FORWARD_CANDIDATES);

    const config: Partial<WalkForwardConfig> = {
      symbol,
      timeframe,
      totalBars,
      windowCount,
      trainRatio,
      initialBalance,
      candidates,
      includeFees: body.includeFees ?? true,
      slippagePercent: body.slippagePercent ?? 0.05,
      mtfOptimization,
    };

    let candles: OHLCV[] = [];
    let dataSource = 'binance_live';

    // 1. Fetch real historical candles from Binance Spot
    try {
      candles = await fetchKlines(symbol, timeframe, totalBars);
    } catch (err) {
      console.warn(`[/api/walk-forward] Binance fetch failed for ${symbol}, using synthetic series:`, err);
    }

    // 2. Guaranteed fallback if offline or rate limited
    if (!candles || candles.length < 80) {
      dataSource = 'synthetic_historical';
      const basePrice = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3500 : 150;
      candles = generateSyntheticOHLCV(basePrice, 5, totalBars);
    }

    // 3. Execute multi-window walk-forward validation
    const result = runWalkForwardValidation(candles, config);

    return NextResponse.json({
      success: true,
      result,
      dataSource,
      totalCandlesAnalyzed: candles.length,
    });
  } catch (error: any) {
    console.error('[/api/walk-forward] Error executing walk-forward validation:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to execute walk-forward validation',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    defaultConfig: DEFAULT_WALK_FORWARD_CONFIG,
    candidates: DEFAULT_WALK_FORWARD_CANDIDATES,
    metricsExplained: {
      wfe: 'Walk-Forward Efficiency: (Out-of-Sample Return / In-Sample Return) * 100. Target >= 50-60%.',
      inSample: 'Historical training partition used to select optimal strategy parameters.',
      outOfSample: 'Unseen subsequent forward data partition used to stress-test selected parameters.',
      robustnessGrades: {
        HIGHLY_ROBUST: 'WFE >= 65%, >=75% profitable windows, zero parameter collapse.',
        ROBUST: 'WFE >= 50%, >=50% profitable windows.',
        FRAGILE: 'WFE 25-50%, high variance across market cycles.',
        OVERFIT: 'WFE < 25%, edge failed out-of-sample (curve-fitted).',
      },
    },
    supportedSymbols: ['SOL/USDT', 'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'AVAX/USDT'],
    supportedTimeframes: ['5m', '15m', '1h', '4h', '1d'],
  });
}
