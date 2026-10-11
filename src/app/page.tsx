'use client';

// ─── U-SPOT Dashboard ───────────────────────────────────────────────
// Phase 3: Connected to live Binance market data & CoinGecko discovery

import Header from '@/components/layout/Header';
import StatCard from '@/components/ui/StatCard';
import CandidateTable from '@/components/dashboard/CandidateTable';
import SignalCard from '@/components/dashboard/SignalCard';
import PerformanceOverview from '@/components/dashboard/PerformanceOverview';
import RecentSignals from '@/components/dashboard/RecentSignals';
import LifecycleTracker from '@/components/dashboard/LifecycleTracker';
import CrossExchangeArbitrageCard from '@/components/dashboard/CrossExchangeArbitrageCard';
import IcebergDetectorCard from '@/components/dashboard/IcebergDetectorCard';
import SmartOrderExecutionWorkbench from '@/components/dashboard/SmartOrderExecutionWorkbench';
import { useMarketData } from '@/hooks/useMarketData';
import { useSignals } from '@/hooks/useSignals';
import { useMemo, useState, useEffect } from 'react';
import type { PerformanceStats, SignalHistoryRecord, Signal } from '@/types';
import {
  Activity,
  TrendingUp,
  Target,
  ShieldAlert,
  Zap,
  BarChart3,
  Globe2,
  Radar,
  RefreshCw,
} from 'lucide-react';

const toPct = (val: number | undefined | null) => {
  if (val == null) return 0;
  return val <= 1 && val > 0 ? val * 100 : Math.min(100, Math.max(0, val));
};

export default function DashboardPage() {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [recentRecords, setRecentRecords] = useState<SignalHistoryRecord[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState<boolean>(true);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiGeneratedSignal, setAiGeneratedSignal] = useState<Signal | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const handleAiGenerate = async () => {
    setIsGeneratingAi(true);
    setAiNotice(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GENERATE' }),
      });
      const data = await res.json();
      if (data.success && data.signal) {
        setAiGeneratedSignal(data.signal);
        setAiNotice(`Autonomous AI synthesized setup for ${data.signal.symbol} with ${data.signal.riskReward}R target.`);
        refreshSignals();
      } else {
        setAiNotice(data.message || data.error || 'AI scanned market: No high-probability setup met strict 2.0R criteria.');
      }
    } catch (err) {
      setAiNotice(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const {
    candidates,
    pairs,
    summary,
    regimeAnalysis,
    appliedWeights,
    activePreset,
    isRefreshing,
    isScanning,
    refresh,
    runCustomScan,
    applyPreset,
    lastUpdated,
  } = useMarketData(30000); // Poll every 30s

  const {
    signals: liveSignals,
    isLoading: isLoadingSignals,
    refresh: refreshSignals,
  } = useSignals(30000);

  const currentRegime = regimeAnalysis?.regime ?? candidates[0]?.marketRegime ?? 'NEUTRAL';

  // Fetch real performance statistics and real recent trades
  useEffect(() => {
    let mounted = true;
    setIsLoadingStats(true);
    fetch('/api/performance')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.success && data.stats) {
          setStats(data.stats);
        }
      })
      .catch((err) => console.warn('Failed to fetch performance:', err))
      .finally(() => {
        if (mounted) setIsLoadingStats(false);
      });

    setIsLoadingRecent(true);
    fetch('/api/signals/history?limit=5&onlyEntryTriggered=true')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.success && Array.isArray(data.data)) {
          setRecentRecords(data.data);
        }
      })
      .catch((err) => console.warn('Failed to fetch recent signals:', err))
      .finally(() => {
        if (mounted) setIsLoadingRecent(false);
      });

    return () => {
      mounted = false;
    };
  }, [liveSignals]);

  const priceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pairs) {
      map[p.symbol] = p.price;
    }
    for (const c of candidates) {
      if (!map[c.symbol]) map[c.symbol] = c.price;
    }
    return map;
  }, [pairs, candidates]);

  // Display actionable signals first, prepending any on-demand AI generated signal
  const displaySignals = useMemo(() => {
    let list: Signal[] = [];
    if (liveSignals && liveSignals.length > 0) {
      const actionable = liveSignals.filter(
        (s) => s.status === 'BUY_NOW' || s.status === 'WAIT_FOR_CONFIRMATION'
      );
      list = actionable.length > 0 ? actionable.slice(0, 4) : liveSignals.slice(0, 4);
    }
    if (aiGeneratedSignal && !list.some((s) => s.signalId === aiGeneratedSignal.signalId)) {
      list = [aiGeneratedSignal, ...list];
    }
    return list;
  }, [liveSignals, aiGeneratedSignal]);

  return (
    <>
      <Header
        marketRegime={currentRegime}
        onScanNow={refresh}
        isScanning={isRefreshing || isScanning}
      />

      <div className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Phase 9 Banner */}
        <div className="glass-card rounded-2xl p-4 border-cyan-500/20 glow-cyan animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <Radar size={16} className="text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Real-Time Signal Lifecycle Tracking Active
                </p>
                <p className="text-xs text-slate-400">
                  Autonomous price monitoring, entry confirmation, safety DCA triggers, multi-stage TP scaling, and strict stop loss execution.
                </p>
              </div>
            </div>

            {summary && (
              <div className="flex items-center gap-3 text-xs font-mono text-slate-400 bg-[var(--surface-2)]/60 px-3 py-1.5 rounded-xl border border-[var(--glass-border)] self-start sm:self-auto">
                <span>Universe: <strong className="text-slate-200">{summary.totalTracked}</strong></span>
                <span>•</span>
                <span>Regime: <strong className="text-emerald-400">{currentRegime}</strong></span>
                <span>•</span>
                <span>Active Signals: <strong className="text-cyan-400">{displaySignals.length}</strong></span>
              </div>
            )}
          </div>
        </div>

        {/* Phase 9: Real-time Lifecycle Tracker Stepper */}
        <LifecycleTracker onSweepCompleted={() => refreshSignals()} />

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Signals"
            value={stats?.totalSignals ?? 0}
            subtitle={`${stats?.activeSignals ?? 0} active`}
            icon={<Activity size={16} />}
            trend="neutral"
            isLoading={isLoadingStats}
          />
          <StatCard
            title="Win Rate (TP1+)"
            value={`${toPct(stats?.tp1Rate ?? stats?.winRate).toFixed(0)}%`}
            subtitle={`${stats?.completedSignals ?? 0} completed`}
            icon={<Target size={16} />}
            trend="up"
            delay={1}
            isLoading={isLoadingStats}
          />
          <StatCard
            title="Avg R Multiple"
            value={`${(stats?.avgR ?? 0) > 0 ? '+' : ''}${(stats?.avgR ?? 0).toFixed(1)}R`}
            subtitle={`PF: ${(stats?.profitFactor ?? 0).toFixed(1)}`}
            icon={<TrendingUp size={16} />}
            trend="up"
            delay={2}
            isLoading={isLoadingStats}
          />
          <StatCard
            title="Max Drawdown"
            value={`${Math.min(100, Math.abs(stats?.maxDrawdown ?? 0)).toFixed(1)}%`}
            subtitle={`SL rate: ${toPct(stats?.slRate).toFixed(0)}%`}
            icon={<ShieldAlert size={16} />}
            trend="down"
            delay={3}
            isLoading={isLoadingStats}
          />
        </div>

        {/* Active Signals */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Active Signals
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                ({displaySignals.length})
              </span>
            </div>
            <button
              onClick={handleAiGenerate}
              disabled={isGeneratingAi}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/35 text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {isGeneratingAi ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-purple-400" />
                  <span>AI Scanning Market...</span>
                </>
              ) : (
                <>
                  <Zap size={13} className="text-purple-400" />
                  <span>AI Generate Signal</span>
                </>
              )}
            </button>
          </div>

          {aiNotice && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-purple-400 flex-shrink-0" />
                <span>{aiNotice}</span>
              </div>
              <button
                onClick={() => setAiNotice(null)}
                className="text-purple-400 hover:text-purple-200 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
          {isLoadingSignals && displaySignals.length === 0 ? (
            <div className="glass-card rounded-2xl p-10 text-center animate-fade-in">
              <RefreshCw size={28} className="text-cyan-400 animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-200">Evaluating Market Signals...</p>
              <p className="text-xs text-slate-500 mt-1">Scanning candidate pairs, analyzing multi-factor technicals, and computing trade scores.</p>
            </div>
          ) : displaySignals.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center animate-fade-in border border-slate-800">
              <Radar size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-medium">No active signals found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No high-probability setups currently meet the minimum score threshold (≥75). The autonomous scanner continuously monitors the market.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-delay-1">
              {displaySignals.map((signal, idx) => (
                <SignalCard
                  key={`${signal.signalId}-${idx}`}
                  signal={signal}
                  currentPrice={priceMap[signal.symbol] || signal.preferredEntry}
                />
              ))}
            </div>
          )}
        </div>

        {/* Multi-Exchange Spread Arbitrage & Liquidity Monitor (Phase 43) */}
        <CrossExchangeArbitrageCard />

        {/* Institutional Whale Iceberg Order Detector & Hidden Liquidity (Phase 45) */}
        <IcebergDetectorCard />

        {/* Algorithmic TWAP/VWAP Smart Order Execution Splitter (Phase 46) */}
        <SmartOrderExecutionWorkbench />

        {/* Live Candidate Table with Phase 4 Multi-Factor Scanner Controls */}
        <CandidateTable
          candidates={candidates}
          isRefreshing={isRefreshing}
          isScanning={isScanning}
          onRefresh={refresh}
          lastUpdated={lastUpdated}
          regimeAnalysis={regimeAnalysis}
          appliedWeights={appliedWeights}
          activePreset={activePreset}
          onApplyWeights={runCustomScan}
          onApplyPreset={applyPreset}
        />

        {/* Bottom Row: Performance + Recent Signals */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1">
            <PerformanceOverview stats={stats} isLoading={isLoadingStats} />
          </div>
          <div className="xl:col-span-2">
            <RecentSignals records={recentRecords} isLoading={isLoadingRecent} />
          </div>
        </div>
      </div>
    </>
  );
}
