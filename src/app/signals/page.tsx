'use client';

// ─── U-SPOT Signals Page ────────────────────────────────────────────
// Phase 6: Live Signal Engine Active
// Spec Section 9 (Signal Engine), 10 (Trade Score), 11 (Entry), 14 (Position Sizing)

import { useState } from 'react';
import Header from '@/components/layout/Header';
import SignalCard from '@/components/dashboard/SignalCard';
import { useSignals } from '@/hooks/useSignals';
import { useWallet } from '@/context/WalletContext';
import { formatUsd } from '@/lib/utils';
import type { SignalStatus, ConfidenceGrade } from '@/types';
import DivergenceMatrixWidget from '@/components/dashboard/DivergenceMatrixWidget';
import {
  Radar,
  Activity,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Layers,
} from 'lucide-react';

export default function SignalsPage() {
  const { walletBalance } = useWallet();
  const [activeTab, setActiveTab] = useState<'SIGNALS' | 'DIVERGENCE_MATRIX'>('SIGNALS');
  const {
    signals,
    summary,
    marketRegime,
    statusFilter,
    setStatusFilter,
    gradeFilter,
    setGradeFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    isRefreshing,
    refresh,
    lastUpdated,
  } = useSignals(30000); // Auto-refresh every 30s

  const statusTabs: Array<{ id: SignalStatus | 'ALL'; label: string; count?: number }> = [
    { id: 'ALL', label: 'All Signals', count: summary?.totalEvaluated ?? signals.length },
    { id: 'BUY_NOW', label: 'Buy Now', count: summary?.buyNowCount },
    { id: 'WAIT_FOR_CONFIRMATION', label: 'Confirmation Pending', count: summary?.waitForConfirmationCount },
    { id: 'WATCH', label: 'Watchlist', count: summary?.watchCount },
  ];

  const gradeTabs: Array<{ id: ConfidenceGrade | 'ALL'; label: string }> = [
    { id: 'ALL', label: 'All Grades' },
    { id: 'A+', label: 'A+ (≥85)' },
    { id: 'A', label: 'A (75-84)' },
    { id: 'B', label: 'B (60-74)' },
  ];

  return (
    <>
      <Header
        marketRegime={marketRegime as any}
        onScanNow={refresh}
        isScanning={isRefreshing}
      />

      <div className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                <Radar size={20} className="text-cyan-400" />
              </div>
              <h1 className="text-xl font-bold text-slate-100">
                Signal Engine
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Live Engine Active
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Multi-factor trade scoring, automated setup detection, structure-based stop loss, and exact wallet sizing.
            </p>
          </div>

          {/* Quick wallet context & refresh */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-slate-500">Wallet Sizing Basis</p>
              <p className="text-sm font-bold text-slate-200 font-mono">
                {formatUsd(walletBalance)} USDT
              </p>
            </div>
            <button
              onClick={() => refresh()}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-2)] text-slate-300 hover:text-white hover:border-cyan-500/40 border border-[var(--glass-border)] transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={isRefreshing ? 'animate-spin text-cyan-400' : ''}
              />
              <span>{isRefreshing ? 'Evaluating...' : 'Refresh Signals'}</span>
            </button>
          </div>
        </div>

        {/* View Mode Switcher (Signals Feed vs Multi-TF Divergence Matrix) */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] w-fit">
          <button
            onClick={() => setActiveTab('SIGNALS')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'SIGNALS'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radar size={14} />
            <span>Active Signals ({signals.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('DIVERGENCE_MATRIX')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'DIVERGENCE_MATRIX'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers size={14} />
            <span>Multi-TF Divergence Matrix</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300 font-mono">
              NEW
            </span>
          </button>
        </div>

        {activeTab === 'DIVERGENCE_MATRIX' ? (
          <div className="animate-fade-in">
            <DivergenceMatrixWidget />
          </div>
        ) : (
          <>

        {/* Engine Metrics Ribbon */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-delay-1">
            <div className="glass-card rounded-xl p-3.5 border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-1">
                <CheckCircle2 size={14} />
                <span>Buy Now Setups</span>
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {summary.buyNowCount}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Inside entry zone with confirmed bias
              </p>
            </div>

            <div className="glass-card rounded-xl p-3.5 border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
                <Clock size={14} />
                <span>Pending Confirmation</span>
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {summary.waitForConfirmationCount}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Awaiting retest or candle close
              </p>
            </div>

            <div className="glass-card rounded-xl p-3.5 border-cyan-500/20">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1">
                <Sparkles size={14} />
                <span>Average Trade Score</span>
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {summary.averageTradeScore}
                <span className="text-xs text-slate-500 font-sans font-normal"> / 100</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Top Grade: <strong className="text-cyan-400">{summary.topGrade}</strong>
              </p>
            </div>

            <div className="glass-card rounded-xl p-3.5 border-purple-500/20">
              <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold mb-1">
                <Eye size={14} />
                <span>Watchlist Only</span>
              </div>
              <p className="text-2xl font-bold text-slate-100 font-mono">
                {summary.watchCount}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Score 55-69 developing setups
              </p>
            </div>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="glass-card rounded-2xl p-4 space-y-3 animate-fade-in-delay-2">
          {/* Status Tabs & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {statusTabs.map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`
                      px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5
                      ${isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[var(--surface-2)] border border-transparent'
                      }
                    `}
                  >
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive
                            ? 'bg-cyan-500/30 text-cyan-200'
                            : 'bg-[var(--surface-3)] text-slate-400'
                          }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search coin (e.g. SOL, ETH)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Grade Selector */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--glass-border)] text-xs text-slate-400">
            <span className="flex items-center gap-1 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
              <ShieldCheck size={12} className="text-cyan-400" />
              Confidence Grade:
            </span>
            <div className="flex items-center gap-1">
              {gradeTabs.map((g) => {
                const isActive = gradeFilter === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGradeFilter(g.id)}
                    className={`
                      px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer
                      ${isActive
                        ? 'bg-slate-200 text-slate-900 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[var(--surface-2)]'
                      }
                    `}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Signals List / Grid */}
        {isLoading && signals.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center animate-fade-in">
            <RefreshCw size={36} className="text-cyan-400 animate-spin mx-auto mb-4" />
            <p className="text-base font-semibold text-slate-200">
              Evaluating Market Signals...
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Scanning candidate coins, running 6 TA modules, and computing trade scores.
            </p>
          </div>
        ) : signals.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center animate-fade-in">
            <AlertTriangle size={36} className="text-amber-400 mx-auto mb-4" />
            <p className="text-base font-semibold text-slate-200">
              No matching signals found
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Per Spec Section 0 & 9: &quot;Never force a trade when no valid setup exists.&quot;
              Adjust your filters or wait for higher probability structures.
            </p>
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setGradeFilter('ALL');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-delay-3">
            {signals.map((signal, idx) => (
              <SignalCard
                key={`${signal.signalId}-${idx}`}
                signal={signal}
                currentPrice={signal.preferredEntry}
              />
            ))}
          </div>
        )}
        </>
        )}

        {/* Informational Guidance Footer */}
        <div className="glass-card rounded-2xl p-5 border-cyan-500/10 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-slate-400">Spec Section 9 & 10 Protocol:</span>{' '}
            Trade Score weights: Trend (20), Momentum (15), Volume (15), Structure (20), Liquidity (15), Volatility (10), Market Regime (5).
          </div>
          {lastUpdated && (
            <div className="font-mono text-[11px] text-slate-600 shrink-0">
              Updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
