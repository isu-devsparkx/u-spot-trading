// ─── U-SPOT GET /api/signals/[id] ─────────────────────────────────────
// Spec Section 41: /api/signals/[id] endpoint
// Returns a single signal with its lifecycle events and post-trade evaluation

import { NextRequest, NextResponse } from 'next/server';
import {
  getSignalById,
  getSignalEvents,
  getSignalEvaluation,
  getStorageStatus,
} from '@/lib/services/signal-store';
import { auditSignalWithKlines } from '@/lib/services/lifecycle-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Signal ID parameter is required' },
        { status: 400 }
      );
    }

    const reAudit = request.nextUrl.searchParams.get('reAudit') === 'true';
    if (reAudit) {
      const existing = await getSignalById(id);
      if (existing) {
        await auditSignalWithKlines(existing);
      }
    }

    const [signal, events, evaluation] = await Promise.all([
      getSignalById(id),
      getSignalEvents(id),
      getSignalEvaluation(id),
    ]);

    if (!signal) {
      return NextResponse.json(
        { success: false, error: `Signal not found with ID: ${id}` },
        { status: 404 }
      );
    }

    const status = getStorageStatus();

    return NextResponse.json({
      success: true,
      data: {
        signal,
        events,
        evaluation,
      },
      dataSource: status.source,
      storageStatus: status,
    });
  } catch (err) {
    console.error('[/api/signals/[id]] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve signal',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
