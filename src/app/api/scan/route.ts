// ─── GET & POST /api/scan ───────────────────────────────────────────
// Phase 4: Dynamic Top 20 Market Scanner & Evaluation Engine
// Spec Section 5 (Top-20 Scanner), Section 6 (Market Regime Engine), Section 41

import { NextResponse } from 'next/server';
import { getMarketUniverse } from '@/lib/services/market-universe';
import { fetchAllTickers24h } from '@/lib/services/binance-service';
import {
  scanMarketUniverse,
  DEFAULT_SCANNER_WEIGHTS,
  SCANNER_PRESETS,
} from '@/lib/services/scanner-service';
import type {
  ScannerFilters,
  ScannerWeights,
  MarketRegime,
  ScannerPresetName,
} from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Preset selection
    const rawPreset = searchParams.get('preset')?.toUpperCase() || '';
    const presetParam = (rawPreset in SCANNER_PRESETS
      ? rawPreset
      : undefined) as ScannerPresetName | undefined;

    let initialWeights: ScannerWeights = DEFAULT_SCANNER_WEIGHTS;
    if (presetParam && SCANNER_PRESETS[presetParam]) {
      initialWeights = SCANNER_PRESETS[presetParam].weights;
    }

    // Filter parameters
    const regimeParam = searchParams.get('regime')?.toUpperCase() as ('ALL' | MarketRegime) | undefined;
    const minVolume = searchParams.get('minVolume') ? Number(searchParams.get('minVolume')) : undefined;
    const maxSpread = searchParams.get('maxSpread') ? Number(searchParams.get('maxSpread')) : undefined;
    const minLiquidity = searchParams.get('minLiquidity') ? Number(searchParams.get('minLiquidity')) : undefined;
    const search = searchParams.get('search') || undefined;
    const limit = searchParams.get('limit') ? Math.min(100, Math.max(1, Number(searchParams.get('limit')))) : 20;

    const filters: ScannerFilters = {
      minVolumeUsdt: minVolume,
      maxSpreadPercent: maxSpread,
      minLiquidityScore: minLiquidity,
      regimeFilter: regimeParam,
      searchQuery: search,
      limit,
    };

    // Retrieve active pairs and tickers
    const [universe, tickers] = await Promise.all([
      getMarketUniverse(forceRefresh),
      fetchAllTickers24h(),
    ]);

    const scanResult = scanMarketUniverse(universe.pairs, tickers, {
      weights: initialWeights,
      filters,
    });

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      activePreset: presetParam || 'BALANCED',
      regimeAnalysis: scanResult.regimeAnalysis,
      appliedWeights: scanResult.appliedWeights,
      activeFilters: scanResult.activeFilters,
      totalTracked: universe.pairs.length,
      allScoredCount: scanResult.allScoredCount,
      returnedCount: scanResult.candidates.length,
      candidates: scanResult.candidates,
      presets: Object.values(SCANNER_PRESETS),
    });
  } catch (error) {
    console.error('Error in GET /api/scan:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scanner evaluation failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { weights, filters, refresh = false } = body;

    const [universe, tickers] = await Promise.all([
      getMarketUniverse(Boolean(refresh)),
      fetchAllTickers24h(),
    ]);

    const scanResult = scanMarketUniverse(universe.pairs, tickers, {
      weights,
      filters,
    });

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      regimeAnalysis: scanResult.regimeAnalysis,
      appliedWeights: scanResult.appliedWeights,
      activeFilters: scanResult.activeFilters,
      totalTracked: universe.pairs.length,
      allScoredCount: scanResult.allScoredCount,
      returnedCount: scanResult.candidates.length,
      candidates: scanResult.candidates,
    });
  } catch (error) {
    console.error('Error in POST /api/scan:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Custom scanner evaluation failed',
      },
      { status: 500 }
    );
  }
}
