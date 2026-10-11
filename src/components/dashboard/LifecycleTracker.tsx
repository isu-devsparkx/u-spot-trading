'use client';

// ─── U-SPOT Signal Lifecycle Tracker Component ────────────────────────
// Phase 9: Signal Lifecycle Tracking
// Spec Sections: 15, 17, 18
// Visual progress stepper, distance to targets/invalidation, and manual sweep trigger

import { useState, useEffect } from 'react';
import type { SignalHistoryRecord, LifecycleEvaluationSummary } from '@/types';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

interface LifecycleTrackerProps {
  onSweepCompleted?: (summary: LifecycleEvaluationSummary) => void;
}

export default function LifecycleTracker({ onSweepCompleted }: LifecycleTrackerProps) {
  const [activeSignals, setActiveSignals] = useState<SignalHistoryRecord[]>([]);
  const [pendingSignals, setPendingSignals] = useState<SignalHistoryRecord[]>([]);
  const [isSweeping, setIsSweeping] = useState(false);
  const [lastSweepTime, setLastSweepTime] = useState<string | null>(null);
  const [recentTransitions, setRecentTransitions] = useState<string[]>([]);

  const fetchActiveLifecycles = async () => {
    try {
      const res = await fetch('/api/signals/lifecycle');
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setActiveSignals(json.data.activeSignals || []);
          setPendingSignals(json.data.pendingSignals || []);
        }
      }
    } catch (err) {
      console.warn('Failed to load active lifecycles:', err);
    }
  };

  useEffect(() => {
    fetchActiveLifecycles();
    // Poll every 30 seconds
    const interval = setInterval(fetchActiveLifecycles, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSweepNow = async () => {
    setIsSweeping(true);
    try {
      const res = await fetch('/api/signals/lifecycle', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.summary) {
          setLastSweepTime(new Date().toLocaleTimeString());
          if (json.summary.transitions?.length > 0) {
            setRecentTransitions(
              json.summary.transitions.map((t: { message: string }) => t.message)
            );
          }
          onSweepCompleted?.(json.summary);
          await fetchActiveLifecycles();
        }
      }
    } catch (err) {
      console.warn('Manual lifecycle sweep failed:', err);
    } finally {
      setIsSweeping(false);
    }
  };

  const allTracked = [...activeSignals, ...pendingSignals].slice(0, 4);

  return (
    <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Autonomous Signal Lifecycle Tracker
            </h3>
            <p className="text-xs text-slate-500">
              Monitoring spot entries, DCA pullbacks, TP scale-outs, and stop losses
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastSweepTime && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Clock size={12} />
              Last swept: {lastSweepTime}
            </span>
          )}
          <button
            onClick={handleSweepNow}
            disabled={isSweeping}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={isSweeping ? 'animate-spin' : ''} />
            <span>{isSweeping ? 'Sweeping...' : 'Check Lifecycles Now'}</span>
          </button>
        </div>
      </div>

      {/* Recent Transition Alerts */}
      {recentTransitions.length > 0 && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <CheckCircle2 size={13} />
            <span>Recent Lifecycle Transitions</span>
          </div>
          {recentTransitions.slice(0, 2).map((msg, i) => (
            <p key={i} className="text-xs text-emerald-200/80">
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Tracked Active Signals List */}
      {allTracked.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          No signals currently awaiting entry or actively trading. Generate new signals to begin tracking.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {allTracked.map((signal, idx) => {
            const isFilled = signal.actualEntry !== null && signal.actualEntry !== undefined;
            const currentEntry = signal.actualEntry || signal.preferredEntry;
            const dca1Done = Boolean(signal.dca1Hit);
            const tp1Done =
              signal.finalResult === 'TP1_ONLY' ||
              signal.finalResult === 'TP2_REACHED' ||
              signal.finalResult === 'FULL_TP';

            return (
              <div
                key={`${signal.signalId}-${idx}`}
                className="p-3.5 rounded-xl bg-[var(--surface-3)] border border-[var(--glass-border)] space-y-3"
              >
                {/* Title & Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-slate-200">
                      {signal.symbol}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                        signal.confidence === 'A+'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      }`}
                    >
                      {signal.confidence}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {signal.trailingStopPrice && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        🛡️ Trail: ${signal.trailingStopPrice.toFixed(4)}
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        signal.lifecycle === 'ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse'
                          : signal.lifecycle.includes('TRIGGERED')
                          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {signal.lifecycle}
                    </span>
                  </div>
                </div>

                {/* Stepper Progress */}
                <div className="flex items-center justify-between text-[11px] px-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isFilled
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      ✓
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">Entry</span>
                  </div>

                  <div className={`h-0.5 flex-1 mx-1 ${isFilled ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />

                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        dca1Done
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      1
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">DCA</span>
                  </div>

                  <div className={`h-0.5 flex-1 mx-1 ${tp1Done ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />

                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        tp1Done
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      TP1
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">30%</span>
                  </div>

                  <div className="h-0.5 flex-1 mx-1 bg-slate-800" />

                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700">
                      TP3
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">Full</span>
                  </div>
                </div>

                {/* Level Distances */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">ENTRY</span>
                    <span className="text-slate-300 font-semibold">${currentEntry.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">TP1 (+30%)</span>
                    <span className="text-emerald-400 font-semibold">${signal.tp1.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">
                      {signal.trailingStopPrice ? 'TRAILING STOP 🛡️' : 'STOP LOSS'}
                    </span>
                    <span
                      className={`font-semibold ${
                        signal.trailingStopPrice ? 'text-emerald-400 font-bold' : 'text-rose-400'
                      }`}
                    >
                      ${(signal.trailingStopPrice ?? signal.stopLoss).toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
