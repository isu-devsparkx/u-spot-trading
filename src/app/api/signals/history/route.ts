// ─── U-SPOT Signal History API — Phase 8 ────────────────────────────
// Spec Section 16 & Section 40: Signal History & Persistence endpoint
// Queries persisted signals from Supabase (or fallback local store) with full post-trade analysis

import { NextRequest, NextResponse } from 'next/server';
import {
  getSignals,
  getAllSignalEvaluations,
  saveSignalEvaluation,
  saveSignalEvent,
  getStorageStatus,
} from '@/lib/services/signal-store';
import { computePerformanceStats } from '@/lib/services/performance-service';
import { auditAllSignalsHistory } from '@/lib/services/lifecycle-service';
import { isEntryTriggered } from '@/lib/utils';
import type { SignalHistoryRecord, SignalResult, SignalEvaluation } from '@/types';

export const dynamic = 'force-dynamic';

function computeStats(records: SignalHistoryRecord[]) {
  const completed = records.filter((r) => r.finalResult !== null);
  const withR = completed.filter((r) => r.realizedR !== null && r.realizedR !== 0);

  const tp1 = completed.filter(
    (r) =>
      r.finalResult === 'TP1_ONLY' ||
      r.finalResult === 'TP2_REACHED' ||
      r.finalResult === 'TP3_REACHED' ||
      r.finalResult === 'FULL_TP' ||
      r.finalResult === 'PARTIAL_TP_THEN_SL'
  ).length;

  const tp2 = completed.filter(
    (r) =>
      r.finalResult === 'TP2_REACHED' ||
      r.finalResult === 'TP3_REACHED' ||
      r.finalResult === 'FULL_TP'
  ).length;

  const tp3 = completed.filter(
    (r) => r.finalResult === 'TP3_REACHED' || r.finalResult === 'FULL_TP'
  ).length;

  const sl = completed.filter((r) => r.finalResult === 'SL').length;

  const expired = completed.filter((r) => r.finalResult === 'EXPIRED').length;

  const avgR =
    withR.length > 0
      ? withR.reduce((s, r) => s + (r.realizedR ?? 0), 0) / withR.length
      : null;

  const winners = withR.filter((r) => (r.realizedR ?? 0) > 0);
  const losers = withR.filter((r) => (r.realizedR ?? 0) < 0);

  const profitFactor =
    losers.length > 0
      ? Math.abs(winners.reduce((s, r) => s + (r.realizedR ?? 0), 0)) /
        Math.abs(losers.reduce((s, r) => s + (r.realizedR ?? 0), 0))
      : null;

  return {
    total: records.length,
    completed: completed.length,
    tp1Rate: completed.length > 0 ? tp1 / completed.length : 0,
    tp2Rate: completed.length > 0 ? tp2 / completed.length : 0,
    tp3Rate: completed.length > 0 ? tp3 / completed.length : 0,
    slRate: completed.length > 0 ? sl / completed.length : 0,
    expiryRate: completed.length > 0 ? expired / completed.length : 0,
    avgR,
    profitFactor,
    winCount: winners.length,
    lossCount: losers.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const includeStats = params.get('includeStats') === 'true';
    const direction = params.get('direction');
    const resultFilter = params.get('result');
    const confidence = params.get('confidence');
    const symbol = params.get('symbol');
    const regime = params.get('regime');
    const since = params.get('since');
    const until = params.get('until');
    const minScore = params.get('minScore');
    const page = parseInt(params.get('page') ?? '1', 10);
    const limit = Math.min(parseInt(params.get('limit') ?? '50', 10), 200);
    const onlyEntryTriggered = params.get('onlyEntryTriggered') !== 'false';

    const reAudit = params.get('reAudit') === 'true';
    if (reAudit) {
      await auditAllSignalsHistory();
    }

    const { records: rawRecords, total: rawTotal, source } = await getSignals({
      direction: direction && direction !== 'ALL' ? (direction as any) : undefined,
      result: resultFilter && resultFilter !== 'ALL' ? resultFilter : undefined,
      confidence: confidence && confidence !== 'ALL' ? (confidence as any) : undefined,
      symbol: symbol ?? undefined,
      regime: regime && regime !== 'ALL' ? (regime as any) : undefined,
      since: since ?? undefined,
      until: until ?? undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
      onlyEntryTriggered,
      page,
      limit,
    });

    const records = onlyEntryTriggered ? rawRecords.filter(isEntryTriggered) : rawRecords;
    const total = onlyEntryTriggered && rawRecords.length !== records.length ? records.length : rawTotal;

    const status = getStorageStatus();

    const response: Record<string, unknown> = {
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
      dataSource: source,
      storageStatus: status,
    };

    if (includeStats) {
      response.stats = computeStats(records);
      const evals = await getAllSignalEvaluations();
      response.globalStats = computePerformanceStats(records, evals);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('[/api/signals/history] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve signal history',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ── POST: Mark a signal as evaluated or save lifecycle event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'RE_AUDIT_ALL') {
      const summary = await auditAllSignalsHistory();
      return NextResponse.json({
        success: true,
        action: 'RE_AUDIT_ALL',
        summary,
      });
    }

    const { signalId, evaluation, event } = body;

    if (!signalId || typeof signalId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'signalId is required' },
        { status: 400 }
      );
    }

    let evalSaved = false;
    let eventSaved = false;

    // Persist post-trade evaluation if provided
    if (evaluation) {
      const evalRecord: SignalEvaluation = {
        signalId,
        evaluatedAt: evaluation.evaluatedAt || new Date().toISOString(),
        finalResult: evaluation.finalResult as SignalResult,
        mfe: evaluation.mfe ?? null,
        mae: evaluation.mae ?? null,
        realizedReturnPercent: evaluation.realizedReturnPercent ?? null,
        realizedR: evaluation.realizedR ?? null,
        grossPnlUsdt: evaluation.grossPnlUsdt ?? null,
        netPnlUsdt: evaluation.netPnlUsdt ?? null,
        feesUsdt: evaluation.feesUsdt ?? null,
        slippageUsdt: evaluation.slippageUsdt ?? null,
        timeToEvent: evaluation.timeToEvent ?? {
          timeToEntryMs: null,
          timeToDca1Ms: null,
          timeToDca2Ms: null,
          timeToTp1Ms: null,
          timeToTp2Ms: null,
          timeToTp3Ms: null,
          timeToSlMs: null,
          timeToExpiryMs: null,
        },
        slFailurePrimaryCause: evaluation.slFailurePrimaryCause ?? null,
        slFailureSecondaryCauses: evaluation.slFailureSecondaryCauses ?? [],
        stopTightnessLabel: evaluation.stopTightnessLabel ?? null,
        counterfactualNote: evaluation.counterfactualNote ?? null,
        evaluationText: evaluation.evaluationText ?? '',
      };
      const res = await saveSignalEvaluation(evalRecord);
      evalSaved = res.success;
    }

    // Persist lifecycle event if provided
    if (event) {
      const eventRecord = {
        eventId: event.eventId || `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        signalId,
        eventType: event.eventType,
        timestamp: event.timestamp || new Date().toISOString(),
        price: event.price ?? null,
        metadata: event.metadata ?? {},
      };
      const res = await saveSignalEvent(eventRecord);
      eventSaved = res.success;
    }

    const status = getStorageStatus();

    return NextResponse.json({
      success: true,
      signalId,
      evaluationSaved: evalSaved,
      eventSaved: eventSaved,
      dataSource: status.source,
      note: 'Signal evaluation / event persisted successfully.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body or persistence failure',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
}
