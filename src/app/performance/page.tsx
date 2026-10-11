'use client';

// ─── U-SPOT Strategy Performance Dashboard — Phase 12 ────────────────────
// Spec Section 27: Performance Dashboard
// Spec Section 28: Mathematical Expectancy, R-Multiples, Target Hit Rates
// Spec Section 19: Stop Loss Failure Causality Breakdown
// Spec Section 21: Stop Tightness & Counterfactual Breakdown

import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/layout/Header';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  BarChart3,
  Target,
  Zap,
  Activity,
  Award,
  Layers,
  RefreshCw,
  Info,
  Sliders,
  DollarSign,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Compass,
} from 'lucide-react';
import type { PerformanceStats, MarketRegime } from '@/types';
import { mockMarketRegime } from '@/lib/mock-data';
import PerformanceAttributionMatrix from '@/components/dashboard/PerformanceAttributionMatrix';

export default function PerformancePage() {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regimeFilter, setRegimeFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'attribution' | 'regime' | 'setup' | 'confidence' | 'coin' | 'sl-causes'>('attribution');

  const fetchPerformance = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = new URL('/api/performance', window.location.origin);
      if (regimeFilter !== 'ALL') {
        url.searchParams.set('regime', regimeFilter);
      }
      const res = await fetch(url.toString());
      const json = await res.json();
      if (json.success && json.stats) {
        setStats(json.stats);
      } else {
        throw new Error(json.error || 'Failed to fetch performance stats');
      }
    } catch (err) {
      console.error('Error fetching performance:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
  }, [regimeFilter]);

  const toPct = (rate: number | undefined | null) => {
    if (rate == null) return 0;
    return rate <= 1 && rate > 0 ? rate * 100 : rate;
  };

  const expectancy = stats?.expectancy ?? 0;
  const isPositiveEdge = expectancy > 0;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-slate-100 pb-16">
      <Header marketRegime={mockMarketRegime} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Page Title & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <BarChart3 size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
                Strategy Performance & Statistical Edge
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span>Statistical Edge</span>
              <span>•</span>
              <span>Mathematical Expectancy E(R), Multi-Factor Breakdowns & Failure Attribution</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Market Regime Filter */}
            <div className="flex items-center gap-1.5 bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-xl px-3 py-1.5 text-xs text-slate-300">
              <Compass size={13} className="text-cyan-400" />
              <span className="text-[11px] text-slate-500">Regime:</span>
              <select
                value={regimeFilter}
                onChange={(e) => setRegimeFilter(e.target.value)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900">All Regimes</option>
                <option value="BULL" className="bg-slate-900">BULL</option>
                <option value="BEAR" className="bg-slate-900">BEAR</option>
                <option value="RANGE" className="bg-slate-900">RANGE</option>
                <option value="NEUTRAL" className="bg-slate-900">NEUTRAL</option>
                <option value="BREAKOUT" className="bg-slate-900">BREAKOUT</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchPerformance}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--surface-2)] text-slate-300 hover:text-white border border-[var(--glass-border)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-cyan-400' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Expectancy Core Banner (Spec Section 28) */}
        {loading && !stats ? (
          <div className="glass-card rounded-2xl p-16 text-center animate-fade-in">
            <RefreshCw size={36} className="text-cyan-400 animate-spin mx-auto mb-4" />
            <p className="text-base font-semibold text-slate-200">
              Loading Strategy Performance Analytics...
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Querying trade history, computing mathematical expectancy, and analyzing R-multiples.
            </p>
          </div>
        ) : !stats || stats.totalSignals === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center animate-fade-in border border-slate-800">
            <Clock size={36} className="text-slate-600 mx-auto mb-4" />
            <p className="text-base font-semibold text-slate-200">No closed trades recorded yet</p>
            <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
              Per Spec §27 & §28: Strategy performance, win rates, target hit rates, and mathematical expectancy will calculate live as confirmed trades execute and close.
            </p>
          </div>
        ) : (
          <>
            <div className="glass-card rounded-2xl p-5 border border-cyan-500/20 bg-gradient-to-r from-cyan-950/20 via-slate-900/40 to-slate-900/60">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        isPositiveEdge
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isPositiveEdge ? 'Positive Mathematical Edge' : 'Negative Edge Warning'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">Spec Section 28</span>
                  </div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Expectancy E(R):</span>
                <span
                  className={`font-mono text-2xl ${
                    expectancy > 0.5
                      ? 'text-emerald-400'
                      : expectancy > 0
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {expectancy > 0 ? '+' : ''}{expectancy.toFixed(2)}R
                </span>
                <span className="text-xs font-normal text-slate-400">per trade</span>
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-200">Do Not Rely On Win Rate Alone:</strong> A system with 40% win rate can be highly profitable if average win is +3.0R and average loss is -1.0R (Expectancy = +0.60R). Conversely, 80% win rate with large tail losses produces negative expectancy.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="bg-[var(--surface-2)]/60 rounded-xl p-3 border border-[var(--glass-border)] text-center min-w-[110px]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Win Rate</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                  {stats ? `${toPct(stats.winRate).toFixed(1)}%` : '—'}
                </p>
                <p className="text-[10px] text-slate-500">{stats?.winCount ?? 0} wins</p>
              </div>

              <div className="bg-[var(--surface-2)]/60 rounded-xl p-3 border border-[var(--glass-border)] text-center min-w-[110px]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Loss Rate</p>
                <p className="text-lg font-mono font-bold text-rose-400 mt-0.5">
                  {stats ? `${toPct(stats.lossRate).toFixed(1)}%` : '—'}
                </p>
                <p className="text-[10px] text-slate-500">{stats?.lossCount ?? 0} losses</p>
              </div>

              <div className="bg-[var(--surface-2)]/60 rounded-xl p-3 border border-[var(--glass-border)] text-center min-w-[110px]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Profit Factor</p>
                <p
                  className={`text-lg font-mono font-bold mt-0.5 ${
                    (stats?.profitFactor ?? 0) >= 2.0
                      ? 'text-emerald-400'
                      : (stats?.profitFactor ?? 0) >= 1.2
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {stats?.profitFactor?.toFixed(2) ?? '—'}
                </p>
                <p className="text-[10px] text-slate-500">Gross W / Gross L</p>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Avg Win R</span>
            <span className="text-lg font-mono font-bold text-emerald-400 block mt-1">
              +{stats?.avgWin ? stats.avgWin.toFixed(2) : '0.00'}R
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Average winner multiple</span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Avg Loss R</span>
            <span className="text-lg font-mono font-bold text-rose-400 block mt-1">
              {stats?.avgLoss ? stats.avgLoss.toFixed(2) : '-1.00'}R
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Controlled SL boundary</span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Median R</span>
            <span className="text-lg font-mono font-bold text-slate-200 block mt-1">
              {stats?.medianR ? `${stats.medianR > 0 ? '+' : ''}${stats.medianR.toFixed(2)}R` : '—'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Outlier-resistant center</span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Max Drawdown</span>
            <span className="text-lg font-mono font-bold text-rose-400 block mt-1">
              {stats?.maxDrawdown != null ? `${Math.min(100, Math.abs(stats.maxDrawdown)).toFixed(1)}%` : '0.0%'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Peak-to-trough drop</span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Net Realized P&L</span>
            <span
              className={`text-lg font-mono font-bold block mt-1 ${
                (stats?.totalNetPnlUsdt ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats?.totalNetPnlUsdt != null
                ? `${stats.totalNetPnlUsdt >= 0 ? '+' : ''}$${stats.totalNetPnlUsdt.toFixed(2)}`
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">After fees & slippage</span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Frictions (Fees)</span>
            <span className="text-lg font-mono font-bold text-amber-400 block mt-1">
              ${stats?.totalFeesUsdt != null ? stats.totalFeesUsdt.toFixed(2) : '0.00'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">0.1% maker/taker + slip</span>
          </div>
        </div>

        {/* Target Hit Rates & Conversion Funnel (Spec Section 27) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Target Ladder Progress */}
          <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={15} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-200">
                  Target Hit Rate Ladder (Spec §27)
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                Sample: {stats?.completedSignals ?? 0} Completed Signals
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {[
                {
                  label: 'TP1 Hit Rate (30% tranche)',
                  rate: toPct(stats?.tp1Rate),
                  sub: 'Initial target & breakeven ratchet trigger',
                  color: 'bg-emerald-400',
                  textColor: 'text-emerald-400',
                },
                {
                  label: 'TP2 Hit Rate (30% tranche)',
                  rate: toPct(stats?.tp2Rate),
                  sub: 'Intermediate structure liquidity target',
                  color: 'bg-emerald-500',
                  textColor: 'text-emerald-400',
                },
                {
                  label: 'TP3 Hit Rate (40% runner)',
                  rate: toPct(stats?.tp3Rate),
                  sub: 'Full expansion runner target reached',
                  color: 'bg-teal-400',
                  textColor: 'text-teal-400',
                },
                {
                  label: 'Stop Loss Hit Rate',
                  rate: toPct(stats?.slRate),
                  sub: 'Closed at original or trailed stop loss',
                  color: 'bg-rose-500',
                  textColor: 'text-rose-400',
                },
                {
                  label: 'Signal Expiry Rate',
                  rate: toPct(stats?.expiryRate),
                  sub: 'Price never entered planned zone before expiry',
                  color: 'bg-slate-500',
                  textColor: 'text-slate-400',
                },
              ].map((target) => (
                <div key={target.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{target.label}</span>
                    <span className={`font-mono font-bold ${target.textColor}`}>
                      {target.rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${target.color} transition-all duration-500`}
                      style={{ width: `${Math.min(100, Math.max(0, target.rate))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">{target.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* MFE & MAE Excursions (Spec Section 22) */}
          <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                MFE / MAE Stress Gauges (Spec §22)
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Evaluates whether trades were stressed before reaching targets or if profit was left on the table.
            </p>

            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Average MFE</span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    +{stats?.avgMfe ? stats.avgMfe.toFixed(2) : '0.00'}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Maximum Favorable Excursion above entry before trade closed.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Average MAE</span>
                  <span className="text-base font-bold font-mono text-rose-400">
                    {stats?.avgMae ? stats.avgMae.toFixed(2) : '-0.00'}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Maximum Adverse Excursion against entry before recovery or stop out.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock size={12} className="text-slate-500" /> Avg Hold Time:
                </span>
                <span className="font-mono font-medium text-slate-200">
                  {stats?.avgHoldingTime || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Dimensional Breakdowns (Spec Sections 27 & 28) */}
        <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--glass-border)] pb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Layers size={15} className="text-cyan-400" />
                Multi-Dimensional Strategy Performance Matrices
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Isolate which regimes, setups, and confidence tiers generate positive expectancy
              </p>
            </div>

            {/* Segment Tabs */}
            <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--glass-border)]">
              {(
                [
                  { id: 'attribution', label: 'Setup × Regime Matrix 2D' },
                  { id: 'regime', label: 'Market Regime' },
                  { id: 'setup', label: 'Setup Type' },
                  { id: 'confidence', label: 'Confidence' },
                  { id: 'coin', label: 'Asset / Coin' },
                  { id: 'sl-causes', label: 'SL Root Causes' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab 0: 2D Setup × Regime Attribution Matrix */}
          {activeTab === 'attribution' && (
            <PerformanceAttributionMatrix
              report={stats?.attributionReport ?? null}
              loading={loading}
            />
          )}

          {/* Tab 1: By Market Regime */}
          {activeTab === 'regime' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Market Regime</th>
                    <th className="py-2.5 px-3 text-right">Signals</th>
                    <th className="py-2.5 px-3 text-right">Win Rate</th>
                    <th className="py-2.5 px-3 text-right">Average R</th>
                    <th className="py-2.5 px-3 text-right">Profit Factor</th>
                    <th className="py-2.5 px-3">Edge Assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)]/50">
                  {stats?.byMarketRegime && Object.keys(stats.byMarketRegime).length > 0 ? (
                    Object.entries(stats.byMarketRegime).map(([reg, item]) => {
                      const isPositive = item.avgR > 0;
                      return (
                        <tr key={reg} className="hover:bg-slate-800/20 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-200 flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                reg === 'BULL'
                                  ? 'bg-emerald-400'
                                  : reg === 'BEAR'
                                  ? 'bg-rose-400'
                                  : 'bg-amber-400'
                              }`}
                            />
                            {reg}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">{item.count}</td>
                          <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">
                            {toPct(item.winRate).toFixed(1)}%
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-bold ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.avgR > 0 ? '+' : ''}{item.avgR.toFixed(2)}R
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-200">
                            {item.profitFactor?.toFixed(2) ?? '—'}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                item.avgR >= 1.0
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : item.avgR > 0
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {item.avgR >= 1.0
                                ? 'Strong Alpha'
                                : item.avgR > 0
                                ? 'Viable Edge'
                                : 'Underperforming'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No regime data available for the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: By Setup Type */}
          {activeTab === 'setup' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Setup Pattern</th>
                    <th className="py-2.5 px-3 text-right">Signals</th>
                    <th className="py-2.5 px-3 text-right">Win Rate</th>
                    <th className="py-2.5 px-3 text-right">Average R</th>
                    <th className="py-2.5 px-3 text-right">Expectancy E(R)</th>
                    <th className="py-2.5 px-3">Pattern Viability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)]/50">
                  {stats?.bySetupType && Object.keys(stats.bySetupType).length > 0 ? (
                    Object.entries(stats.bySetupType).map(([setup, item]) => {
                      const exp = item.expectancy ?? 0;
                      return (
                        <tr key={setup} className="hover:bg-slate-800/20 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-200">
                            {setup.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">{item.count}</td>
                          <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">
                            {toPct(item.winRate).toFixed(1)}%
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-bold ${
                              item.avgR > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.avgR > 0 ? '+' : ''}{item.avgR.toFixed(2)}R
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-bold ${
                              exp > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {exp > 0 ? '+' : ''}{exp.toFixed(2)}R
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                exp > 0.5
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : exp > 0
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {exp > 0.5 ? 'Core Winner' : exp > 0 ? 'Profitable' : 'Avoid / Optimize'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No setup pattern data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: By Confidence Grade */}
          {activeTab === 'confidence' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats?.byConfidence &&
                Object.entries(stats.byConfidence).map(([grade, d]) => (
                  <div
                    key={grade}
                    className="glass-card rounded-xl p-4 border border-[var(--glass-border)] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-lg font-bold px-2 py-0.5 rounded ${
                          grade === 'A+'
                            ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                            : grade === 'A'
                            ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
                            : 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20'
                        }`}
                      >
                        {grade} Tier
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{d.count} signals</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Win Rate</span>
                        <span className="font-mono font-bold text-slate-200">
                          {toPct(d.winRate).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Avg Realized R</span>
                        <span
                          className={`font-mono font-bold ${
                            d.avgR > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {d.avgR > 0 ? '+' : ''}{d.avgR.toFixed(2)}R
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Tab 4: By Coin / Asset */}
          {activeTab === 'coin' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-slate-500 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Asset</th>
                    <th className="py-2.5 px-3 text-right">Signals</th>
                    <th className="py-2.5 px-3 text-right">Win Rate</th>
                    <th className="py-2.5 px-3 text-right">Avg R</th>
                    <th className="py-2.5 px-3 text-right">Net P&L (USDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)]/50">
                  {stats?.byCoin && Object.keys(stats.byCoin).length > 0 ? (
                    Object.entries(stats.byCoin).map(([coin, item]) => (
                      <tr key={coin} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-200">{coin}/USDT</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">{item.count}</td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">
                          {toPct(item.winRate).toFixed(1)}%
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono font-bold ${
                            item.avgR > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.avgR > 0 ? '+' : ''}{item.avgR.toFixed(2)}R
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-mono font-bold ${
                            item.netPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.netPnlUsdt >= 0 ? '+' : ''}${item.netPnlUsdt.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No asset breakdown data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 5: Stop Loss Failure Root Causes (Spec Section 19) */}
          {activeTab === 'sl-causes' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={15} className="text-rose-400" />
                <h4 className="text-xs font-semibold text-slate-300">
                  9-Factor Stop Loss Failure Attribution Classifier (Spec §19)
                </h4>
              </div>

              {stats?.bySlReason && Object.keys(stats.bySlReason).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.bySlReason).map(([reason, data]) => (
                    <div
                      key={reason}
                      className="p-3 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] space-y-1.5"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-200">
                          {reason.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 font-mono">{data.count} hits</span>
                          <span className="font-mono font-bold text-rose-400">{data.percentage}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, data.percentage))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No stop losses recorded in this sample.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Stop Tightness & Counterfactual Analysis (Spec Section 21) */}
        <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Counterfactual Stop Tightness Diagnostics (Spec §21)
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Differentiates between valid stops where the trade thesis was genuinely invalidated versus stops set too tight that were prematurely tagged before reaching target.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-xl bg-[var(--surface-2)]/50 border border-[var(--glass-border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" /> Appropriate Stops
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {stats?.byStopTightness?.['APPROPRIATE_STOP']?.percentage ?? 100}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Adverse price action extended beyond 1.5% past stop loss level. Stopping out protected against severe downstream drawdown.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--surface-2)]/50 border border-[var(--glass-border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <XCircle size={14} className="text-amber-400" /> Potentially Tight Stops
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {stats?.byStopTightness?.['POTENTIALLY_TIGHT']?.percentage ?? 0}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Price pierced stop loss by less than 1.5% and subsequently rallied toward targets. Consider adjusting ATR multiplier on this setup.
              </p>
            </div>
          </div>
        </div>
      </>
    )}
    </main>
  </div>
);
}
