// ─── U-SPOT Liquidity Heatmap Snapshot Recording & Replay API Route — Phase 44 ───
// Provides endpoints for listing, creating, retrieving, and importing recorded heatmap sessions.

import { NextRequest, NextResponse } from 'next/server';
import {
  getStoredRecordingSessions,
  getRecordingSessionById,
  createRecordingSession,
  recordSlice,
  finalizeRecordingSession,
  parseSessionFromJSON,
} from '@/lib/services/heatmap-recorder';
import type { HeatmapRecordingSession, HeatmapRecordingTag } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const session = getRecordingSessionById(id);
      if (!session) {
        return NextResponse.json(
          { success: false, error: `Recording session ${id} not found` },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, session });
    }

    const sessions = getStoredRecordingSessions();
    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch recording sessions' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Case 1: Importing raw JSON session string or object
    if (body.action === 'IMPORT') {
      const jsonContent = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
      const session = parseSessionFromJSON(jsonContent);
      return NextResponse.json({ success: true, session, message: 'Session imported successfully' });
    }

    // Case 2: Create a new recording session
    if (body.action === 'CREATE') {
      const symbol = body.symbol || 'BTC/USDT';
      const tag: HeatmapRecordingTag = body.tag || 'MANUAL';
      const associatedSignalId = body.associatedSignalId;
      const note = body.note;
      const session = createRecordingSession(symbol, tag, associatedSignalId, note);
      return NextResponse.json({ success: true, session });
    }

    // Case 3: Finalize a recording session
    if (body.action === 'FINALIZE') {
      const sessionId = body.id;
      const existing = getRecordingSessionById(sessionId);
      if (!existing) {
        return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
      }
      const finalized = finalizeRecordingSession(existing);
      return NextResponse.json({ success: true, session: finalized });
    }

    // Case 4: Record a slice to existing session
    if (body.action === 'RECORD_SLICE') {
      const sessionId = body.id;
      const slice = body.slice;
      const existing = getRecordingSessionById(sessionId);
      if (!existing || !slice) {
        return NextResponse.json({ success: false, error: 'Session or slice payload missing' }, { status: 400 });
      }
      const updated = recordSlice(existing, slice);
      return NextResponse.json({ success: true, session: updated });
    }

    return NextResponse.json({ success: false, error: 'Unknown action specified' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process recording operation' },
      { status: 500 }
    );
  }
}
