import { NextRequest, NextResponse } from 'next/server';
import {
  processActiveSignalsLifecycle,
  evaluateSignalLifecycleStep,
} from '@/lib/services/lifecycle-service';
import { getSignals, getSignalById } from '@/lib/services/signal-store';
import { requireWorkerOrAdmin } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const triggerCheck = searchParams.get('check') === 'true';

    // State-changing sweep execution requires Worker or Admin authorization
    if (triggerCheck) {
      const auth = requireWorkerOrAdmin(request);
      if (!auth.isAuthorized) {
        return auth.errorResponse || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }

      const summary = await processActiveSignalsLifecycle();
      return NextResponse.json({
        success: true,
        action: 'SWEEP_COMPLETED',
        summary,
      });
    }

    // Return current active signals overview (safe read-only inspection)
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
    // Phase A Authorization: Sweeping trade lifecycles requires Worker token or Administrator session
    const auth = requireWorkerOrAdmin(request);
    if (!auth.isAuthorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { signalId, tick, mockPrices } = body;

    // In production, strictly ignore client-supplied mockPrices to prevent artificial lifecycle manipulation
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'test';
    const safeMockPrices = isTestEnv ? mockPrices : undefined;

    // Single signal step mode (only permitted in test environment or for administrator simulation)
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

    // Batch evaluation across all pending/active signals using live Binance spot prices
    const summary = await processActiveSignalsLifecycle(safeMockPrices);

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
