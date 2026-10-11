// ─── U-SPOT Performance Attribution API — Phase 39 ──────────────────────────
// Spec Section 27, 28: 2D Setup Type × Macro Regime PnL Attribution Report
// Returns granular expectancy, alpha generation edge, and regime drag diagnostics

import { NextRequest, NextResponse } from 'next/server';
import {
  getSignals,
  getAllSignalEvaluations,
  getStorageStatus,
} from '@/lib/services/signal-store';
import { computePerformanceAttribution } from '@/lib/services/performance-attribution';
import { isEntryTriggered } from '@/lib/utils';
import type { SignalQueryFilters } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const regime = params.get('regime');
    const symbol = params.get('symbol');
    const setupType = params.get('setupType');
    const since = params.get('since');
    const until = params.get('until');

    const filters: SignalQueryFilters = {
      limit: 1000,
      onlyEntryTriggered: true,
      regime: regime && regime !== 'ALL' ? (regime as any) : undefined,
      symbol: symbol ?? undefined,
      since: since ?? undefined,
      until: until ?? undefined,
    };

    const [{ records: rawRecords, source }, evaluations] = await Promise.all([
      getSignals(filters),
      getAllSignalEvaluations(),
    ]);

    const records = rawRecords.filter(isEntryTriggered);

    // Optional setupType filter
    const filteredRecords =
      setupType && setupType !== 'ALL'
        ? records.filter((r) => r.setupType === setupType)
        : records;

    const report = computePerformanceAttribution(filteredRecords, evaluations);
    const storage = getStorageStatus();

    return NextResponse.json({
      success: true,
      report,
      sampleSize: filteredRecords.length,
      evaluatedCount: evaluations.length,
      dataSource: source,
      storageStatus: storage,
    });
  } catch (err) {
    console.error('[/api/performance/attribution] Error computing attribution:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to compute strategy performance attribution report',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
