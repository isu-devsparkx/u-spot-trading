// ─── U-SPOT AI Strategy Factor Optimizer API — Phase 40 ──────────────────
// Evaluates historical signal factor correlations and produces optimized weight vectors
// with projected expectancy delta and AI synthesis commentary.

import { NextRequest, NextResponse } from 'next/server';
import { optimizeFactorWeights } from '@/lib/services/ai-strategy-optimizer';
import type { OptimizationObjective, SignalWeights } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const objective = (body.objective as OptimizationObjective) || 'MAX_EXPECTANCY';
    const originalWeights = body.originalWeights as SignalWeights | undefined;

    const report = await optimizeFactorWeights({
      objective,
      originalWeights,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[/api/strategy/optimize] Error during factor optimization:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to run AI strategy factor optimization',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const objective = (params.get('objective') as OptimizationObjective) || 'MAX_EXPECTANCY';

    const report = await optimizeFactorWeights({
      objective,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('[/api/strategy/optimize] Error during factor optimization GET:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve AI strategy factor optimization report',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
