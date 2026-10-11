// ─── U-SPOT POST & GET /api/signals/[id]/evaluate ───────────────────────
// Spec Section 41: /api/signals/[id]/evaluate endpoint
// Evaluates or re-evaluates a signal's post-trade performance, MFE/MAE,
// realized R, fees/slippage, SL failure causality, and counterfactuals

import { NextRequest, NextResponse } from 'next/server';
import {
  getSignalById,
  getSignalEvents,
  getSignalEvaluation,
  saveSignal,
  saveSignalEvaluation,
  getStorageStatus,
} from '@/lib/services/signal-store';
import {
  evaluateSignalOutcome,
  EvaluationConfig,
  EvaluationContext,
} from '@/lib/services/evaluation-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/signals/[id]/evaluate
 * Returns the existing evaluation record for the signal
 */
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

    const evaluation = await getSignalEvaluation(id);

    if (!evaluation) {
      return NextResponse.json(
        { success: false, error: `No evaluation found for signal ID: ${id}` },
        { status: 404 }
      );
    }

    const storageStatus = getStorageStatus();

    return NextResponse.json({
      success: true,
      data: evaluation,
      dataSource: storageStatus.source,
    });
  } catch (err) {
    console.error('[/api/signals/[id]/evaluate] GET Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve signal evaluation',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signals/[id]/evaluate
 * Computes or re-computes the comprehensive post-trade evaluation
 */
export async function POST(
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

    const [signal, events] = await Promise.all([
      getSignalById(id),
      getSignalEvents(id),
    ]);

    if (!signal) {
      return NextResponse.json(
        { success: false, error: `Signal not found with ID: ${id}` },
        { status: 404 }
      );
    }

    // Parse optional body inputs
    let body: {
      config?: EvaluationConfig;
      context?: EvaluationContext;
    } = {};

    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const evaluationContext: EvaluationContext = {
      events: events || [],
      ...(body.context || {}),
    };

    const evaluation = evaluateSignalOutcome(
      signal,
      evaluationContext,
      body.config
    );

    // Save evaluation to store
    await saveSignalEvaluation(evaluation);

    // Update signal record with final evaluation fields
    signal.evaluationText = evaluation.evaluationText;
    signal.realizedR = evaluation.realizedR;
    signal.realizedReturn = evaluation.realizedReturnPercent;
    signal.mfe = evaluation.mfe;
    signal.mae = evaluation.mae;
    signal.fees = evaluation.feesUsdt;
    signal.slippage = evaluation.slippageUsdt;
    signal.finalResult = evaluation.finalResult;

    await saveSignal(signal);

    const storageStatus = getStorageStatus();

    return NextResponse.json({
      success: true,
      data: evaluation,
      dataSource: storageStatus.source,
      message: `Evaluation computed successfully for ${signal.symbol}`,
    });
  } catch (err) {
    console.error('[/api/signals/[id]/evaluate] POST Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to compute signal evaluation',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
