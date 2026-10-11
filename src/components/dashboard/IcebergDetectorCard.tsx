'use client';

// ─── U-SPOT Institutional Whale Iceberg Order Detector Card (Phase 45) ──────
// Visualizes hidden institutional liquidity reloads, absorption floors/ceilings,
// and net hidden order flow delta synchronized with trade tape execution.

import React, { useState, useEffect } from 'react';
import type { IcebergTrackerSummary, DetectedIcebergOrder } from '@/types';
import {
  Anchor,
  Shield,
  Layers,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Info,
  Clock,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface IcebergDetectorCardProps {
  initialSymbol?: string;
}

const POPULAR_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];

export default function IcebergDetectorCard({
  initialSymbol = 'BTC/USDT',
}: IcebergDetectorCardProps) {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [summary, setSummary] = useState<IcebergTrackerSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchIcebergs = async (sym: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analysis/icebergs?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSummary(json.data);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.warn('Failed to load iceberg detection summary:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIcebergs(symbol);
    const interval = setInterval(() => {
      fetchIcebergs(symbol);
    }, 20000); // 20s auto-refresh
    return () => clearInterval(interval);
  }, [symbol]);

  const activeIcebergs = summary?.recentIcebergs || [];

  return (
    <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
      {/* ─── Header: Title, Asset Tabs, Refresh ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
            <Anchor size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                Whale Iceberg Order Detector
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono font-bold">
                Phase 45
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Stealth institutional reload liquidity & absorption floors
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Asset Pills */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            {POPULAR_SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-2 py-1 rounded transition cursor-pointer font-bold ${
                  symbol === s
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.split('/')[0]}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchIcebergs(symbol)}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 cursor-pointer transition"
            title="Refresh Iceberg Detection"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-cyan-400' : ''} />
          </button>
        </div>
      </div>

      {/* ─── Telemetry Bar: Net Delta, Hidden Bid/Ask, Flow Bias ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs font-mono">
        {/* Dominant Bias */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block">Institutional Flow Bias</span>
          <div className="flex items-center gap-1.5">
            {summary?.dominantInstitutionalBias === 'STRONG_ACCUMULATION' ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                <TrendingUp size={12} /> Whale Accumulation
              </span>
            ) : summary?.dominantInstitutionalBias === 'DISTRIBUTION_CEILING' ? (
              <span className="text-rose-400 font-bold flex items-center gap-1 text-[11px]">
                <TrendingDown size={12} /> Distribution Ceiling
              </span>
            ) : (
              <span className="text-slate-300 font-bold text-[11px]">Balanced Absorption</span>
            )}
          </div>
        </div>

        {/* Net Hidden Delta */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block">Net Hidden Flow Delta</span>
          <div
            className={`font-bold text-[11px] ${
              (summary?.netHiddenFlowDeltaUsdt || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {(summary?.netHiddenFlowDeltaUsdt || 0) >= 0 ? '+' : ''}
            {formatNumber(summary?.netHiddenFlowDeltaUsdt || 0)} USDT
          </div>
        </div>

        {/* Hidden Bid Volume */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block flex items-center gap-1">
            <ArrowUpCircle size={10} className="text-emerald-400" /> Hidden Bids (Floors)
          </span>
          <div className="text-emerald-400 font-bold text-[11px]">
            ${formatNumber(summary?.totalHiddenBidVolumeUsdt || 0)}
          </div>
        </div>

        {/* Hidden Ask Volume */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block flex items-center gap-1">
            <ArrowDownCircle size={10} className="text-rose-400" /> Hidden Asks (Ceilings)
          </span>
          <div className="text-rose-400 font-bold text-[11px]">
            ${formatNumber(summary?.totalHiddenAskVolumeUsdt || 0)}
          </div>
        </div>
      </div>

      {/* ─── Active Iceberg Orders Feed Table ─── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
          <span className="flex items-center gap-1.5 font-bold text-slate-300">
            <Shield size={12} className="text-cyan-400" />
            Detected Iceberg Orders ({activeIcebergs.length})
          </span>
          <span className="text-[10px] text-slate-500">
            Analyzed {summary?.analyzedTradesCount || 0} discrete trades
          </span>
        </div>

        {activeIcebergs.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center font-mono text-xs text-slate-500 space-y-1">
            <p>No active iceberg reload orders currently exceeding $25k at {symbol}.</p>
            <p className="text-[10px] text-slate-600">
              The engine continuously scans trade tape fills against displayed L2 depth.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/60">
            {activeIcebergs.map((ib) => {
              const isBid = ib.side === 'BID_ACCUMULATION';
              return (
                <div
                  key={ib.id}
                  className="p-2.5 bg-slate-950/50 hover:bg-slate-900/50 transition flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
                >
                  {/* Left: Side Badge & Price */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                        isBid
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {isBid ? <ArrowUpCircle size={10} /> : <ArrowDownCircle size={10} />}
                      {isBid ? 'BID RELOAD' : 'ASK RELOAD'}
                    </span>
                    <span className="font-bold text-slate-200 text-[13px]">
                      ${ib.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                        ib.confidence === 'HIGH'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {ib.confidence}
                    </span>
                  </div>

                  {/* Center: Reload Factor & Executed vs Visible */}
                  <div className="flex items-center gap-4 text-[11px]">
                    <div>
                      <span className="text-slate-500 text-[9px] block">Reload Factor</span>
                      <span className="font-bold text-amber-300">{ib.reloadMultiplier}x</span>
                      <span className="text-slate-500 text-[9px] ml-1">({ib.fillCount} fills)</span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[9px] block">Executed vs Visible</span>
                      <span className="text-slate-300">
                        ${formatNumber(ib.executedVolumeUsdt)} /{' '}
                        <span className="text-slate-500">${formatNumber(ib.visibleVolumeUsdt)}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[9px] block">Estimated Hidden</span>
                      <span
                        className={`font-bold ${isBid ? 'text-emerald-400' : 'text-rose-400'}`}
                      >
                        +${formatNumber(ib.estimatedHiddenVolumeUsdt)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Timestamp */}
                  <div className="text-right text-[10px] text-slate-500">
                    <div>{new Date(ib.lastReloadTimestamp).toLocaleTimeString()}</div>
                    <span className="text-[9px] text-slate-600 uppercase">
                      {ib.institutionalImpact.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Bottom Footer ─── */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">
        <span className="flex items-center gap-1" suppressHydrationWarning>
          <Clock size={10} /> Auto-refreshed: {isMounted ? lastRefreshed.toLocaleTimeString() : '--:--:--'}
        </span>
        <span>Passive L2 Depth vs Trade Tape Ticks • Sub-Second Analysis</span>
      </div>
    </div>
  );
}
