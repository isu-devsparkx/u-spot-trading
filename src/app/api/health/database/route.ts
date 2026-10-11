// ─── U-SPOT Database Health & Connectivity Diagnostic API ──────────────
// Phase 8 & Option 1: Live Database Verification
// Tests Supabase connectivity, table presence, and roundtrip latency

import { NextResponse } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/services/supabase';
import { getStorageStatus } from '@/lib/services/signal-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const configured = isSupabaseConfigured();
  const storageStatus = getStorageStatus();

  if (!configured) {
    return NextResponse.json({
      success: true,
      mode: 'local_memory',
      configured: false,
      message: 'Supabase credentials are not configured in .env.local. Operating in zero-config In-Memory fallback mode.',
      storageStatus,
      tables: {
        signals: 'in_memory',
        signal_events: 'in_memory',
        signal_evaluations: 'in_memory',
        market_snapshots: 'in_memory',
        strategy_versions: 'in_memory',
        strategy_parameters: 'in_memory',
      },
      latencyMs: Date.now() - startTime,
    });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json(
      {
        success: false,
        mode: 'error',
        configured: true,
        error: 'Failed to initialize Supabase client instance.',
      },
      { status: 500 }
    );
  }

  try {
    const tableChecks: Record<string, { ok: boolean; count?: number; error?: string }> = {};

    // 1. Check strategy_versions
    const { count: verCount, error: verErr } = await client
      .from('strategy_versions')
      .select('*', { count: 'exact', head: true });
    tableChecks.strategy_versions = verErr
      ? { ok: false, error: verErr.message }
      : { ok: true, count: verCount ?? 0 };

    // 2. Check signals
    const { count: sigCount, error: sigErr } = await client
      .from('signals')
      .select('*', { count: 'exact', head: true });
    tableChecks.signals = sigErr
      ? { ok: false, error: sigErr.message }
      : { ok: true, count: sigCount ?? 0 };

    // 3. Check signal_events
    const { count: evtCount, error: evtErr } = await client
      .from('signal_events')
      .select('*', { count: 'exact', head: true });
    tableChecks.signal_events = evtErr
      ? { ok: false, error: evtErr.message }
      : { ok: true, count: evtCount ?? 0 };

    // 4. Check signal_evaluations
    const { count: evalCount, error: evalErr } = await client
      .from('signal_evaluations')
      .select('*', { count: 'exact', head: true });
    tableChecks.signal_evaluations = evalErr
      ? { ok: false, error: evalErr.message }
      : { ok: true, count: evalCount ?? 0 };

    // 5. Check market_snapshots
    const { count: snapCount, error: snapErr } = await client
      .from('market_snapshots')
      .select('*', { count: 'exact', head: true });
    tableChecks.market_snapshots = snapErr
      ? { ok: false, error: snapErr.message }
      : { ok: true, count: snapCount ?? 0 };

    // 6. Check strategy_parameters
    const { count: paramCount, error: paramErr } = await client
      .from('strategy_parameters')
      .select('*', { count: 'exact', head: true });
    tableChecks.strategy_parameters = paramErr
      ? { ok: false, error: paramErr.message }
      : { ok: true, count: paramCount ?? 0 };

    const allOk = Object.values(tableChecks).every((t) => t.ok);
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: allOk,
      mode: 'supabase',
      configured: true,
      storageStatus,
      tables: tableChecks,
      allTablesReady: allOk,
      latencyMs,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        mode: 'supabase',
        configured: true,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
