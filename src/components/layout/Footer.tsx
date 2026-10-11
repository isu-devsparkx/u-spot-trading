'use client';

// ─── U-SPOT Financial Terminal Global Footer Component (Phase 36) ─────
// Displays system architecture, real-time WebSocket telemetry, and operational vitals

import React from 'react';
import Link from 'next/link';
import WebSocketTelemetryWidget from '@/components/dashboard/WebSocketTelemetryWidget';
import { ShieldCheck, Cpu, Terminal } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--glass-border)] bg-[var(--surface-0)]/90 backdrop-blur-xl px-4 sm:px-6 py-2.5 text-xs text-slate-500 font-sans">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Left: Platform Architecture Specs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Terminal size={13} className="text-cyan-400" />
            <span className="font-semibold text-slate-300">U-SPOT</span>
            <span className="text-[10px] font-mono text-cyan-400/90 bg-cyan-500/10 px-1.5 py-0.2 rounded border border-cyan-500/20">
              v0.1.0
            </span>
          </div>

          <span className="text-slate-800 hidden md:inline">|</span>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>Spot Only (1x) · Capital Preservation · Free-First Feeds</span>
          </div>
        </div>

        {/* Right: Live WebSocket Telemetry Vitals Widget */}
        <div className="flex items-center gap-3 shrink-0">
          <WebSocketTelemetryWidget compact={false} />
        </div>
      </div>
    </footer>
  );
}
