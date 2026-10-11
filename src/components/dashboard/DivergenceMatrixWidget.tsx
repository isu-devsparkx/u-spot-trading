'use client';

// ─── U-SPOT Multi-Timeframe Divergence Matrix Widget — Phase 37 ──────
// Interactive multi-timeframe divergence scanner grid, confluence visualizer,
// and detail drawer for spot trading accumulation & profit-taking zones.

import React, { useState } from 'react';
import { useDivergenceMatrix, DivergenceFilterMode } from '@/hooks/useDivergenceMatrix';
import type { DivergenceType, DivergenceResult, DivergenceTimeframe } from '@/types';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Layers,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';

interface DivergenceMatrixWidgetProps {
  compact?: boolean;
}

export default function DivergenceMatrixWidget({ compact = false }: DivergenceMatrixWidgetProps) {
  const {
    report,
    matrix,
    confluences,
    summary,
    isLoading,
    isRefreshing,
    error,
    filterMode,
    setFilterMode,
    searchQuery,
    setSearchQuery,
    expandedSymbol,
    toggleExpand,
    refresh,
  } = useDivergenceMatrix(30000);

  const [broadcastingSymbol, setBroadcastingSymbol] = useState<string | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);

  const handleBroadcast = async (divergence: DivergenceResult) => {
    try {
      setBroadcastingSymbol(divergence.symbol);
      setBroadcastMessage(null);
      const res = await fetch('/api/divergence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'BROADCAST',
          alertPayload: {
            symbol: divergence.symbol,
            price: divergence.currentPrice,
            divergenceType: divergence.type,
            divergenceIndicator: divergence.indicator,
            divergenceTimeframe: divergence.timeframe,
            divergenceStrength: divergence.strength,
            divergenceStrengthScore: divergence.strengthScore,
            details: `${divergence.indicator} (${divergence.timeframe}): P1 $${divergence.pricePivots[0].price.toFixed(2)} ➔ P2 $${divergence.pricePivots[1].price.toFixed(2)} | I1 ${divergence.pricePivots[0].indicatorValue.toFixed(1)} ➔ I2 ${divergence.pricePivots[1].indicatorValue.toFixed(1)}`,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBroadcastMessage(`Dispatched Telegram alert for ${divergence.symbol}!`);
      } else {
        setBroadcastMessage(data.error || 'Failed to dispatch Telegram alert');
      }
    } catch (err: any) {
      setBroadcastMessage(err.message || 'Error broadcasting alert');
    } finally {
      setBroadcastingSymbol(null);
      setTimeout(() => setBroadcastMessage(null), 4000);
    }
  };

  const getDivergenceBadge = (type?: DivergenceType, score?: number) => {
    if (!type || type === 'NONE') {
      return <span className="text-slate-600 font-mono text-xs">—</span>;
    }

    switch (type) {
      case 'REGULAR_BULLISH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Bullish Rev
            {score && <span className="text-[9px] text-emerald-300 font-mono opacity-80">{score}</span>}
          </span>
        );
      case 'HIDDEN_BULLISH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Hidden Bull
            {score && <span className="text-[9px] text-cyan-300 font-mono opacity-80">{score}</span>}
          </span>
        );
      case 'REGULAR_BEARISH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            Bearish Exh
            {score && <span className="text-[9px] text-rose-300 font-mono opacity-80">{score}</span>}
          </span>
        );
      case 'HIDDEN_BEARISH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Hidden Bear
            {score && <span className="text-[9px] text-amber-300 font-mono opacity-80">{score}</span>}
          </span>
        );
      default:
        return <span className="text-slate-600 font-mono text-xs">—</span>;
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-[var(--glass-border)] p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">
              Multi-Timeframe Divergence Matrix
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
              15m • 1h • 4h
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-timeframe RSI, MACD, and OBV regular reversal & hidden continuation radar.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {broadcastMessage && (
            <span className="text-xs text-emerald-400 animate-pulse font-medium mr-2">
              {broadcastMessage}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-2)]/80 hover:bg-[var(--surface-2)] border border-[var(--glass-border)] text-xs text-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-cyan-400' : ''} />
            <span>{isRefreshing ? 'Scanning...' : 'Scan Matrix'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Regular Bullish</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">
              {summary.totalBullishRegular}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Regular Bearish</span>
            <span className="text-xs font-semibold text-rose-400 font-mono">
              {summary.totalBearishRegular}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Hidden Divergences</span>
            <span className="text-xs font-semibold text-cyan-400 font-mono">
              {summary.totalBullishHidden + summary.totalBearishHidden}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-between">
            <span className="text-[11px] text-cyan-300 font-medium">Multi-TF Confluences</span>
            <span className="text-xs font-bold text-cyan-400 font-mono">
              {summary.totalConfluences}
            </span>
          </div>
        </div>
      )}

      {/* Filter Chips & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'ALL', label: 'All Pairs' },
              { id: 'BULLISH', label: 'Bullish Divergences' },
              { id: 'BEARISH', label: 'Bearish Divergences' },
              { id: 'CONFLUENCE', label: 'Confluences Only' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id as DivergenceFilterMode)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterMode === tab.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-[var(--surface-2)]/40 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search coin (e.g. BTC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 rounded-lg bg-[var(--surface-2)]/60 border border-[var(--glass-border)] text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Matrix Table */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
          <RefreshCw size={18} className="animate-spin text-cyan-400" />
          <span>Scanning multi-timeframe candles & calculating pivots...</span>
        </div>
      ) : matrix.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs border border-[var(--glass-border)] rounded-xl">
          No divergence records match active filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)] bg-[var(--surface-2)]/20">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-[var(--surface-2)]/50 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3">Price</th>
                <th className="py-2.5 px-3">15m TF</th>
                <th className="py-2.5 px-3">1h TF</th>
                <th className="py-2.5 px-3">4h TF</th>
                <th className="py-2.5 px-3">Multi-TF Confluence</th>
                <th className="py-2.5 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--glass-border)] font-normal text-slate-300">
              {matrix.map((row) => {
                const isExpanded = expandedSymbol === row.symbol;
                const allDivergences: DivergenceResult[] = Object.values(row.timeframes).flatMap(
                  (tf) => tf?.divergences || []
                );

                return (
                  <React.Fragment key={row.symbol}>
                    <tr
                      onClick={() => toggleExpand(row.symbol)}
                      className={`hover:bg-[var(--surface-2)]/40 transition-colors cursor-pointer ${
                        isExpanded ? 'bg-[var(--surface-2)]/60' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        <span className="text-cyan-400">{row.symbol}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">
                        ${row.currentPrice > 0 ? row.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {getDivergenceBadge(row.timeframes['15m']?.dominantType, row.timeframes['15m']?.maxStrengthScore)}
                      </td>
                      <td className="py-2.5 px-3">
                        {getDivergenceBadge(row.timeframes['1h']?.dominantType, row.timeframes['1h']?.maxStrengthScore)}
                      </td>
                      <td className="py-2.5 px-3">
                        {getDivergenceBadge(row.timeframes['4h']?.dominantType, row.timeframes['4h']?.maxStrengthScore)}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.confluence ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              row.confluence.divergenceType === 'BULLISH'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            <Zap size={10} className="fill-current" />
                            {row.confluence.divergenceType} ({row.confluence.confluenceScore}%)
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button className="text-slate-400 hover:text-slate-200">
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Pivot Breakdown Drawer */}
                    {isExpanded && (
                      <tr className="bg-[var(--surface-1)]/80">
                        <td colSpan={7} className="p-4 border-b border-[var(--glass-border)]">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-[var(--glass-border)]">
                              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                                <Activity size={14} className="text-cyan-400" />
                                Active Divergence Pivots & Confluence Breakdown for {row.symbol}
                              </span>
                              {row.confluence && (
                                <span className="text-[11px] text-slate-400">
                                  {row.confluence.description}
                                </span>
                              )}
                            </div>

                            {allDivergences.length === 0 ? (
                              <p className="text-xs text-slate-500 italic">
                                No active divergence detected across visible lookback window.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {allDivergences.map((div, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        {getDivergenceBadge(div.type, div.strengthScore)}
                                        <span className="text-xs font-semibold text-slate-200">
                                          {div.indicator} • {div.timeframe}
                                        </span>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleBroadcast(div);
                                        }}
                                        disabled={broadcastingSymbol === div.symbol}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-[10px] font-semibold transition-colors disabled:opacity-50"
                                      >
                                        <Send size={10} />
                                        <span>Alert</span>
                                      </button>
                                    </div>

                                    {/* Pivot Values */}
                                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/40 p-2 rounded-lg border border-slate-800">
                                      <div>
                                        <span className="text-slate-500 block text-[9px] uppercase font-sans">Price Pivot</span>
                                        <span className="text-slate-300">
                                          ${div.pricePivots[0].price.toFixed(2)} ➔ ${div.pricePivots[1].price.toFixed(2)}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-500 block text-[9px] uppercase font-sans">{div.indicator} Pivot</span>
                                        <span className="text-slate-300">
                                          {div.pricePivots[0].indicatorValue.toFixed(1)} ➔ {div.pricePivots[1].indicatorValue.toFixed(1)}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-slate-400">
                                        Separation: <span className="text-slate-200 font-mono">{div.barDistance} bars</span>
                                      </span>
                                      <span
                                        className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                                          div.spotAction === 'BUY_ACCUMULATE'
                                            ? 'text-emerald-400 bg-emerald-500/10'
                                            : div.spotAction === 'CAUTION_TRIM'
                                            ? 'text-rose-400 bg-rose-500/10'
                                            : 'text-slate-400 bg-slate-800'
                                        }`}
                                      >
                                        {div.spotAction.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
