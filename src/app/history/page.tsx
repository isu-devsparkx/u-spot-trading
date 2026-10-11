'use client';

// ─── U-SPOT Signal History Page — Phase 8 ───────────────────────────
// Spec Sections 16, 18, 25, 40: Signal history, persistence, filters

import { useState, useMemo, useEffect } from 'react';
import Header from '@/components/layout/Header';
import SignalHistoryTable from '@/components/history/SignalHistoryTable';
import PerformanceOverview from '@/components/dashboard/PerformanceOverview';
import { mockMarketRegime } from '@/lib/mock-data';
import { isEntryTriggered } from '@/lib/utils';
import type { SignalHistoryRecord, PerformanceStats } from '@/types';
import { History as HistoryIcon, Filter, TrendingUp, ChevronRight, Database, RefreshCw, Search, Info } from 'lucide-react';

// Filter definitions
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'BUY', label: 'BUY' },
  { key: 'SELL', label: 'SELL' },
  { key: 'TP', label: 'All TP' },
  { key: 'TP1', label: 'TP1' },
  { key: 'TP2', label: 'TP2' },
  { key: 'TP3', label: 'TP3' },
  { key: 'SL', label: 'SL Hit' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'A+', label: 'A+' },
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function matchesFilter(record: SignalHistoryRecord, filter: FilterKey): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'BUY':
      return record.direction === 'BUY';
    case 'SELL':
      return record.direction === 'SELL';
    case 'TP':
      return (
        record.finalResult !== null &&
        (record.finalResult.startsWith('TP') ||
          record.finalResult === 'FULL_TP' ||
          record.finalResult === 'PARTIAL_TP_THEN_SL')
      );
    case 'TP1':
      return (
        record.finalResult === 'TP1_ONLY' ||
        record.finalResult === 'PARTIAL_TP_THEN_SL' ||
        record.lifecycle === 'TP1_HIT'
      );
    case 'TP2':
      return (
        record.finalResult === 'TP2_REACHED' ||
        record.lifecycle === 'TP2_HIT'
      );
    case 'TP3':
      return (
        record.finalResult === 'TP3_REACHED' ||
        record.finalResult === 'FULL_TP' ||
        record.lifecycle === 'TP3_HIT'
      );
    case 'SL':
      return record.finalResult === 'SL';
    case 'EXPIRED':
      return record.finalResult === 'EXPIRED';
    case 'ACTIVE':
      return record.lifecycle === 'ACTIVE' || record.lifecycle === 'ENTRY_TRIGGERED';
    case 'A+':
      return record.confidence === 'A+';
    case 'A':
      return record.confidence === 'A';
    case 'B':
      return record.confidence === 'B';
  }
}

function computeSummary(records: SignalHistoryRecord[]) {
  const tp = records.filter(
    (r) =>
      r.finalResult?.startsWith('TP') || r.finalResult === 'FULL_TP' || r.finalResult === 'PARTIAL_TP_THEN_SL'
  ).length;
  const sl = records.filter((r) => r.finalResult === 'SL').length;
  const exp = records.filter((r) => r.finalResult === 'EXPIRED').length;
  const avg =
    records.filter((r) => r.realizedR !== null && r.realizedR !== 0).length > 0
      ? records
          .filter((r) => r.realizedR !== null && r.realizedR !== 0)
          .reduce((s, r) => s + (r.realizedR ?? 0), 0) /
        records.filter((r) => r.realizedR !== null && r.realizedR !== 0).length
      : null;
  return { tp, sl, exp, avg };
}

export default function HistoryPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRegime, setSelectedRegime] = useState<string>('ALL');
  const [records, setRecords] = useState<SignalHistoryRecord[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [storageSource, setStorageSource] = useState<'supabase' | 'local_memory'>('local_memory');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/signals/history?includeStats=true');
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setRecords(json.data.filter(isEntryTriggered));
        }
        if (json.globalStats) {
          setStats(json.globalStats);
        }
        if (json.dataSource) {
          setStorageSource(json.dataSource);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch live signal history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const reAuditAllSignals = async () => {
    setIsAuditing(true);
    setAuditMessage('Replaying Binance 15m candlesticks to re-audit all historical signals...');
    try {
      const res = await fetch('/api/signals/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RE_AUDIT_ALL' }),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setAuditMessage(
          `Re-audit complete: verified ${data.summary.totalAudited} signals (${data.summary.updatedCount} updated).`
        );
        await fetchHistory();
      } else {
        setAuditMessage('Re-audit complete.');
        await fetchHistory();
      }
    } catch (e) {
      console.error('Audit failed:', e);
      setAuditMessage('Failed to re-audit signals.');
    } finally {
      setIsAuditing(false);
      setTimeout(() => setAuditMessage(null), 6000);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      // 1. Result / Direction / Confidence filter
      if (!matchesFilter(r, activeFilter)) return false;

      // 2. Coin Symbol Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const sym = r.symbol.toUpperCase();
        if (!sym.includes(q)) return false;
      }

      // 3. Market Regime filter
      if (selectedRegime !== 'ALL') {
        if (r.marketRegime !== selectedRegime) return false;
      }

      return true;
    });
  }, [records, activeFilter, searchQuery, selectedRegime]);

  const summary = useMemo(() => computeSummary(filtered), [filtered]);

  return (
    <>
      <Header marketRegime={mockMarketRegime} />
      <div className="flex-1 p-4 sm:p-6 space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
              <span>Dashboard</span>
              <ChevronRight size={12} />
              <span className="text-slate-400">Signal History</span>
            </div>
            <div className="flex items-center gap-3 mb-1">
              <HistoryIcon size={20} className="text-cyan-400" />
              <h1 className="text-xl font-bold text-slate-200">Signal History & Persistence</h1>
            </div>
            <p className="text-sm text-slate-500">
              Only entry-triggered trades are recorded in history and counted in performance analytics. Pre-entry cancellations and unfilled expired setups are excluded.
              {' '}(Spec §16, §18, §28, §40)
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Storage source badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-3)] border border-[var(--glass-border)] text-xs">
              <Database size={13} className={storageSource === 'supabase' ? 'text-emerald-400' : 'text-amber-400'} />
              <span className="text-slate-400">Storage:</span>
              <span className={`font-medium ${storageSource === 'supabase' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {storageSource === 'supabase' ? 'Supabase Free Tier' : 'Local Store'}
              </span>
              <span className={`w-2 h-2 rounded-full ${storageSource === 'supabase' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            </div>

            {/* Re-Audit History Button */}
            <button
              onClick={reAuditAllSignals}
              disabled={isAuditing || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/50 text-xs text-cyan-300 font-medium transition-all cursor-pointer disabled:opacity-50"
              title="Replay Binance 15M candles for all signals to strictly re-audit TP and SL hits"
            >
              <RefreshCw size={13} className={isAuditing ? 'animate-spin text-cyan-400' : 'text-cyan-400'} />
              <span>{isAuditing ? 'Auditing History...' : 'Re-Audit All Signals'}</span>
            </button>

            <button
              onClick={fetchHistory}
              disabled={isLoading || isAuditing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-3)] hover:bg-[var(--surface-2)] border border-[var(--glass-border)] text-xs text-slate-300 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh history"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Audit Notification Banner */}
        {auditMessage && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-950/50 border border-cyan-800/60 text-xs text-cyan-300 animate-fade-in">
            <Info size={14} className="text-cyan-400 shrink-0" />
            <span>{auditMessage}</span>
          </div>
        )}

        {/* Summary Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-delay-1">
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Showing</p>
            {isLoading ? (
              <div className="h-8 w-12 bg-slate-700/40 rounded-lg animate-pulse mx-auto my-0.5" />
            ) : (
              <p className="text-2xl font-bold font-mono text-slate-200">{filtered.length}</p>
            )}
            <p className="text-[10px] text-slate-600">signals</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">TP Hit Count</p>
            {isLoading ? (
              <div className="h-8 w-12 bg-slate-700/40 rounded-lg animate-pulse mx-auto my-0.5" />
            ) : (
              <p className="text-2xl font-bold font-mono text-emerald-400">{summary.tp}</p>
            )}
            <p className="text-[10px] text-slate-600">hits</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SL Hit Count</p>
            {isLoading ? (
              <div className="h-8 w-12 bg-slate-700/40 rounded-lg animate-pulse mx-auto my-0.5" />
            ) : (
              <p className="text-2xl font-bold font-mono text-rose-400">{summary.sl}</p>
            )}
            <p className="text-[10px] text-slate-600">stopped</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg R</p>
            {isLoading ? (
              <div className="h-8 w-16 bg-slate-700/40 rounded-lg animate-pulse mx-auto my-0.5" />
            ) : (
              <p
                className={`text-2xl font-bold font-mono ${
                  summary.avg !== null
                    ? summary.avg >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                    : 'text-slate-500'
                }`}
              >
                {summary.avg !== null
                  ? `${summary.avg >= 0 ? '+' : ''}${summary.avg.toFixed(1)}R`
                  : '—'}
              </p>
            )}
            <p className="text-[10px] text-slate-600">multiple</p>
          </div>
        </div>

        {/* Filter & Search Bar (Spec §25) */}
        <div className="space-y-3 animate-fade-in-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter size={14} className="text-slate-500 mr-1" />
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  id={`filter-${f.key.toLowerCase()}`}
                  className={`
                    px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border
                    ${
                      activeFilter === f.key
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 glow-cyan'
                        : 'bg-[var(--surface-3)] text-slate-400 border-transparent hover:border-[var(--glass-border)] hover:text-slate-300'
                    }
                  `}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Coin Search & Regime Dropdown */}
            <div className="flex items-center gap-2">
              {/* Coin Search Input */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search coin (e.g. SOL)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 w-44 font-mono transition"
                />
              </div>

              {/* Market Regime Filter Dropdown */}
              <select
                value={selectedRegime}
                onChange={(e) => setSelectedRegime(e.target.value)}
                className="px-2.5 py-1 bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer font-mono"
              >
                <option value="ALL">All Regimes</option>
                <option value="BULL">BULL</option>
                <option value="BEAR">BEAR</option>
                <option value="RANGE">RANGE</option>
                <option value="HIGH_VOLATILITY">HIGH VOL</option>
                <option value="LOW_LIQUIDITY">LOW LIQ</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>
              Showing {filtered.length} of {records.length} signals
              {searchQuery && ` matching "${searchQuery}"`}
              {selectedRegime !== 'ALL' && ` in ${selectedRegime} regime`}
            </span>
            <span className="font-mono text-cyan-400/80">Click any row or &ldquo;Inspect&rdquo; for full audit trail</span>
          </div>
        </div>

        {/* History Table */}
        <div className="animate-fade-in-delay-3">
          <SignalHistoryTable records={filtered} isLoading={isLoading} />
        </div>

        {/* Performance Overview */}
        <div className="animate-fade-in-delay-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-200">Performance Analytics</h2>
          </div>
          <PerformanceOverview stats={stats} isLoading={isLoading} />
        </div>

        {/* Phase notice */}
        <div className="glass-card rounded-xl px-4 py-3 border-cyan-500/20 text-xs text-slate-400 animate-fade-in-delay-3 flex items-start gap-2.5">
          <Info size={15} className="text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-400">Audit Trail &amp; Candlestick Replay. </strong>
            Inspect every completed signal with interactive candlestick charts, planned levels (Entry, DCAs, SL, TPs), execution markers, MFE/MAE excursions, and structured post-trade evaluations.
          </div>
        </div>
      </div>
    </>
  );
}
