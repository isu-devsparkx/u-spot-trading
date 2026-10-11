// ─── U-SPOT Signal Lifecycle Tracking API ────────────────────────────
// Phase 9: Signal Lifecycle Tracking
// Spec Sections: 15, 17, 18, 41 (/api/signals/lifecycle)
// Checks active signals against live market prices and updates lifecycle state

import { NextRequest, NextResponse } from 'next/server';
import {
  processActiveSignalsLifecycle,
  evaluateSignalLifecycleStep,
} from '@/lib/services/lifecycle-service';
import { getSignals, getSignalById } from '@/lib/services/signal-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const triggerCheck = searchParams.get('check') === 'true';

    if (triggerCheck) {
      const summary = await processActiveSignalsLifecycle();
      return NextResponse.json({
        success: true,
        action: 'SWEEP_COMPLETED',
        summary,
      });
    }

    // Return current active signals overview
    const { records: allSignals } = await getSignals({ limit: 100 });

    const activeSignals = allSignals.filter(
      (s) =>
        s.lifecycle === 'ACTIVE' ||
        s.lifecycle === 'ENTRY_TRIGGERED' ||
        s.lifecycle === 'DCA1_TRIGGERED' ||
        s.lifecycle === 'DCA2_TRIGGERED' ||
        s.lifecycle === 'TP1_HIT' ||
        s.lifecycle === 'TP2_HIT'
    );

    const pendingSignals = allSignals.filter((s) => s.lifecycle === 'CREATED');
    const recentlyClosed = allSignals
      .filter((s) => s.lifecycle === 'CLOSED')
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      counts: {
        active: activeSignals.length,
        pending: pendingSignals.length,
        recentlyClosed: recentlyClosed.length,
        total: allSignals.length,
      },
      data: {
        activeSignals,
        pendingSignals,
        recentlyClosed,
      },
    });
  } catch (err) {
    console.error('[/api/signals/lifecycle] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to inspect signal lifecycles',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { signalId, tick, mockPrices } = body;

    // Single signal evaluation mode (for testing / manual price injection)
    if (signalId && tick && typeof tick.price === 'number') {
      const signal = await getSignalById(signalId);
      if (!signal) {
        return NextResponse.json(
          { success: false, error: `Signal ${signalId} not found` },
          { status: 404 }
        );
      }

      const result = evaluateSignalLifecycleStep(signal, tick);
      return NextResponse.json({
        success: true,
        mode: 'SINGLE_SIGNAL_STEP',
        signalId,
        updatedLifecycle: result.updatedSignal.lifecycle,
        finalResult: result.updatedSignal.finalResult,
        events: result.events,
        transitions: result.transitions,
      });
    }

    // Batch evaluation across all pending/active signals
    const summary = await processActiveSignalsLifecycle(mockPrices);

    return NextResponse.json({
      success: true,
      mode: 'BATCH_SWEEP',
      summary,
    });
  } catch (err) {
    console.error('[/api/signals/lifecycle] Sweep Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute lifecycle tracking sweep',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
