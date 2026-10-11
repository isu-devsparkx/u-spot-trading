'use client';

// ─── U-SPOT PnL Performance Attribution Matrix Component — Phase 39 ─────────
// Quant 2D Setup Type × Macro Market Regime Attribution Heatmap & Edge Matrix
// Features: Metric toggle (E(R), Win Rate, Net PnL, Profit Factor), Cell Inspector,
// Top Alpha Generator banner, Strategy Drag Warning, and Marginal Rollups.

import { useState, useMemo } from 'react';
import {
  Layers,
  Award,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
  ShieldAlert,
  Sliders,
  DollarSign,
  Percent,
  Compass,
  Zap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  X,
  Target,
} from 'lucide-react';
import type {
  PerformanceAttributionReport,
  AttributionCell,
  SetupType,
  MarketRegime,
  AttributionEdgeStatus,
  TacticalRecommendation,
} from '@/types';

type DisplayMetric = 'EXPECTANCY' | 'WIN_RATE' | 'NET_PNL' | 'PROFIT_FACTOR' | 'SAMPLE_SIZE';

interface PerformanceAttributionMatrixProps {
  report: PerformanceAttributionReport | null;
  loading?: boolean;
}

const SETUP_LABELS: Record<SetupType, string> = {
  BREAKOUT_RETEST: 'Breakout Retest',
  PULLBACK_CONTINUATION: 'Pullback Cont.',
  LIQUIDITY_SWEEP: 'Liquidity Sweep',
  TREND_CONTINUATION: 'Trend Cont.',
  SUPPORT_REACTION: 'Support Reaction',
};

const REGIME_LABELS: Record<MarketRegime, { label: string; color: string }> = {
  BULL: { label: 'BULL', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  NEUTRAL: { label: 'NEUTRAL', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  BEAR: { label: 'BEAR', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  HIGH_VOLATILITY: { label: 'HIGH VOLATILITY', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  LOW_LIQUIDITY: { label: 'LOW LIQUIDITY', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
};

export default function PerformanceAttributionMatrix({
  report,
  loading = false,
}: PerformanceAttributionMatrixProps) {
  const [metric, setMetric] = useState<DisplayMetric>('EXPECTANCY');
  const [selectedCell, setSelectedCell] = useState<AttributionCell | null>(null);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 border border-[var(--glass-border)] flex flex-col items-center justify-center space-y-3 min-h-[350px]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Computing 2D strategy performance attribution...</p>
      </div>
    );
  }

  if (!report || report.cells.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 border border-[var(--glass-border)] text-center space-y-2">
        <Info size={24} className="text-slate-500 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-300">No Attribution Data Available</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Performance attribution requires entry-triggered historical trades to evaluate the
          cross-tabulation of setup types against macro regimes.
        </p>
      </div>
    );
  }

  const {
    matrix,
    setups,
    regimes,
    topAlphaGenerator,
    topRiskDrag,
    setupMarginals,
    regimeMarginals,
    totalNetPnlUsdt,
    overallExpectancy,
    overallWinRate,
    completedTradesAnalyzed,
  } = report;

  // Visual background tint helper for heatmap cells
  const getCellVisuals = (cell: AttributionCell) => {
    if (cell.completedSignals < 2) {
      return {
        bg: 'bg-slate-900/40 hover:bg-slate-800/60 border-slate-800/80',
        text: 'text-slate-500',
        badge: 'bg-slate-800/60 text-slate-400 border-slate-700/50',
      };
    }
    switch (cell.edgeStatus) {
      case 'STRONG_EDGE':
        return {
          bg: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.12)]',
          text: 'text-emerald-300 font-bold',
          badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
        };
      case 'MODERATE_EDGE':
        return {
          bg: 'bg-cyan-950/30 hover:bg-cyan-900/40 border-cyan-500/30',
          text: 'text-cyan-300 font-semibold',
          badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        };
      case 'NEUTRAL_EDGE':
        return {
          bg: 'bg-slate-800/40 hover:bg-slate-800/70 border-slate-700/50',
          text: 'text-slate-300',
          badge: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
        };
      case 'NEGATIVE_EDGE':
        return {
          bg: 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.12)]',
          text: 'text-rose-400 font-bold',
          badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
        };
      default:
        return {
          bg: 'bg-slate-900/40 hover:bg-slate-800/50 border-slate-800',
          text: 'text-slate-400',
          badge: 'bg-slate-800 text-slate-400 border-slate-700',
        };
    }
  };

  // Formatted metric value for cell
  const formatCellMetric = (cell: AttributionCell) => {
    if (cell.completedSignals === 0) return '—';
    switch (metric) {
      case 'EXPECTANCY':
        return `${cell.expectancy > 0 ? '+' : ''}${cell.expectancy.toFixed(2)}R`;
      case 'WIN_RATE':
        return `${cell.winRate.toFixed(1)}%`;
      case 'NET_PNL':
        return `${cell.netPnlUsdt >= 0 ? '+' : ''}$${Math.round(cell.netPnlUsdt).toLocaleString()}`;
      case 'PROFIT_FACTOR':
        return cell.profitFactor >= 99 ? 'MAX' : cell.profitFactor.toFixed(2);
      case 'SAMPLE_SIZE':
        return `${cell.completedSignals} trds`;
      default:
        return `${cell.expectancy.toFixed(2)}R`;
    }
  };

  // Tactical badge styling
  const getRecommendationBadge = (rec: TacticalRecommendation) => {
    switch (rec) {
      case 'AGGRESSIVE_SCALE':
        return {
          text: 'Scale Risk to 1.0%',
          cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        };
      case 'STANDARD_ALLOCATION':
        return {
          text: 'Standard Risk (0.75%)',
          cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        };
      case 'REDUCE_SIZE_50':
        return {
          text: 'Reduce Size by 50%',
          cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        };
      case 'AVOID_REGIME':
        return {
          text: 'Blacklist / Avoid Setup',
          cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        };
      case 'COLLECT_MORE_DATA':
      default:
        return {
          text: 'Collect More Data',
          cls: 'bg-slate-800 text-slate-400 border-slate-700',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Alpha & Risk Drag Hero Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Alpha Generator */}
        <div className="glass-card rounded-2xl p-5 border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-[var(--surface-1)] to-[var(--surface-1)] relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Award size={18} />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 block">
                  Top Alpha Generator (Core Edge)
                </span>
                <h4 className="text-sm font-bold text-slate-100">
                  {topAlphaGenerator
                    ? `${SETUP_LABELS[topAlphaGenerator.setupType]} × ${topAlphaGenerator.marketRegime}`
                    : 'Awaiting Trade Samples'}
                </h4>
              </div>
            </div>
            {topAlphaGenerator && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {topAlphaGenerator.expectancy > 0 ? '+' : ''}
                {topAlphaGenerator.expectancy.toFixed(2)}R
              </span>
            )}
          </div>

          {topAlphaGenerator ? (
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-emerald-500/20 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Win Rate</span>
                <span className="font-mono font-bold text-slate-200">
                  {topAlphaGenerator.winRate.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-500 block">({topAlphaGenerator.completedSignals} trades)</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Net P&L</span>
                <span className="font-mono font-bold text-emerald-400">
                  +${Math.round(topAlphaGenerator.netPnlUsdt).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {topAlphaGenerator.pnlAttributionPct.toFixed(1)}% share
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Tactical Rule</span>
                <span className="text-[10px] font-medium text-emerald-300 block">
                  {getRecommendationBadge(topAlphaGenerator.tacticalRecommendation).text}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-3">
              Requires at least 2 closed signals to confirm statistical alpha.
            </p>
          )}
        </div>

        {/* Primary Strategy Drag */}
        <div className="glass-card rounded-2xl p-5 border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-[var(--surface-1)] to-[var(--surface-1)] relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <ShieldAlert size={18} />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-400 block">
                  Primary Strategy Risk Drag
                </span>
                <h4 className="text-sm font-bold text-slate-100">
                  {topRiskDrag
                    ? `${SETUP_LABELS[topRiskDrag.setupType]} × ${topRiskDrag.marketRegime}`
                    : 'Zero Risk Drags'}
                </h4>
              </div>
            </div>
            {topRiskDrag && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                {topRiskDrag.expectancy.toFixed(2)}R
              </span>
            )}
          </div>

          {topRiskDrag ? (
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-rose-500/20 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Win Rate</span>
                <span className="font-mono font-bold text-rose-300">
                  {topRiskDrag.winRate.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-500 block">({topRiskDrag.completedSignals} trades)</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Net P&L</span>
                <span className="font-mono font-bold text-rose-400">
                  {topRiskDrag.netPnlUsdt >= 0 ? '+' : ''}${Math.round(topRiskDrag.netPnlUsdt).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Drawdown factor
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Tactical Rule</span>
                <span className="text-[10px] font-medium text-rose-300 block">
                  {getRecommendationBadge(topRiskDrag.tacticalRecommendation).text}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-3">
              No losing patterns identified in the active dataset.
            </p>
          )}
        </div>
      </div>

      {/* ─── 2D Attribution Heatmap Matrix ─── */}
      <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
        {/* Heatmap Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--glass-border)] pb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers size={16} className="text-cyan-400" />
              Setup Pattern × Macro Regime Edge Matrix (25 Combinations)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a metric to project across the 2D cross-tabulation. Click any cell to view deep audit.
            </p>
          </div>

          {/* Metric Selector Buttons */}
          <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--glass-border)] overflow-x-auto">
            {(
              [
                { id: 'EXPECTANCY', label: 'Expectancy E(R)' },
                { id: 'WIN_RATE', label: 'Win Rate %' },
                { id: 'NET_PNL', label: 'Net P&L ($)' },
                { id: 'PROFIT_FACTOR', label: 'Profit Factor' },
                { id: 'SAMPLE_SIZE', label: 'Trades' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  metric === m.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2D Heatmap Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-slate-400">
                <th className="py-2.5 px-3 font-semibold text-slate-300 min-w-[150px]">
                  Setup Pattern
                </th>
                {regimes.map((reg) => (
                  <th key={reg} className="py-2.5 px-3 text-center min-w-[130px]">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${REGIME_LABELS[reg].color}`}
                    >
                      {REGIME_LABELS[reg].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--glass-border)]/40">
              {setups.map((setup) => (
                <tr key={setup} className="hover:bg-slate-800/10 transition-colors">
                  {/* Setup Type Row Header */}
                  <td className="py-3 px-3 font-semibold text-slate-200 border-r border-[var(--glass-border)]/30">
                    <div>
                      <span className="font-bold text-slate-100">{SETUP_LABELS[setup]}</span>
                      <span className="block text-[10px] text-slate-500">
                        {setupMarginals.find((s) => s.setupType === setup)?.completedSignals ?? 0} total closed
                      </span>
                    </div>
                  </td>

                  {/* 5 Regime Cells */}
                  {regimes.map((regime) => {
                    const cell = matrix[setup][regime];
                    const visuals = getCellVisuals(cell);
                    const isSelected =
                      selectedCell?.setupType === setup && selectedCell?.marketRegime === regime;

                    return (
                      <td key={regime} className="p-1.5 text-center">
                        <button
                          onClick={() => setSelectedCell(cell)}
                          className={`w-full py-2.5 px-2 rounded-xl border transition-all text-left flex flex-col items-center justify-center cursor-pointer group ${
                            visuals.bg
                          } ${
                            isSelected ? 'ring-2 ring-cyan-400 border-cyan-400' : ''
                          }`}
                        >
                          <span className={`text-xs font-mono ${visuals.text}`}>
                            {formatCellMetric(cell)}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-500 font-mono">
                              {cell.completedSignals} trd{cell.completedSignals === 1 ? '' : 's'}
                            </span>
                            {cell.completedSignals >= 2 && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  cell.edgeStatus === 'STRONG_EDGE'
                                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                                    : cell.edgeStatus === 'NEGATIVE_EDGE'
                                    ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
                                    : 'bg-cyan-400'
                                }`}
                              />
                            )}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--glass-border)] text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="text-slate-500 text-[10px] uppercase font-semibold">Edge Tier:</span>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Strong Edge (E(R) ≥ 0.5)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Moderate Edge</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span>Neutral / Data Needed</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>Negative Drag (Avoid)</span>
            </div>
          </div>
          <span className="text-[10px] text-slate-500">
            Total Entry-Triggered Trades Analyzed: {completedTradesAnalyzed}
          </span>
        </div>
      </div>

      {/* ─── Cell Inspector Drawer / Modal ─── */}
      {selectedCell && (
        <div className="glass-card rounded-2xl p-5 border border-cyan-500/40 bg-[var(--surface-1)] shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between border-b border-[var(--glass-border)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Target size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>{SETUP_LABELS[selectedCell.setupType]}</span>
                  <span className="text-slate-500">•</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      REGIME_LABELS[selectedCell.marketRegime].color
                    }`}
                  >
                    {REGIME_LABELS[selectedCell.marketRegime].label}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Granular Setup-Regime Diagnostic Breakdown & Tactical Sizing
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCell(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-[var(--glass-border)] text-xs">
            <div>
              <span className="text-slate-500 block text-[10px]">Expectancy E(R)</span>
              <span
                className={`text-base font-mono font-bold ${
                  selectedCell.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {selectedCell.expectancy > 0 ? '+' : ''}
                {selectedCell.expectancy.toFixed(2)}R
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Win Rate / Sample</span>
              <span className="text-base font-mono font-bold text-slate-200">
                {selectedCell.winRate.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500 block">
                {selectedCell.winCount}W / {selectedCell.lossCount}L ({selectedCell.completedSignals} closed)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Net P&L (USDT)</span>
              <span
                className={`text-base font-mono font-bold ${
                  selectedCell.netPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {selectedCell.netPnlUsdt >= 0 ? '+' : ''}$
                {selectedCell.netPnlUsdt.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {selectedCell.pnlAttributionPct.toFixed(1)}% portfolio share
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Profit Factor</span>
              <span className="text-base font-mono font-bold text-slate-200">
                {selectedCell.profitFactor >= 99 ? 'MAX' : selectedCell.profitFactor.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                ${Math.round(selectedCell.grossProfitsUsdt)} / ${Math.round(selectedCell.grossLossesUsdt)}
              </span>
            </div>
          </div>

          {/* Tactical Sizing Recommendation Banner */}
          <div className="mt-4 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-cyan-400" />
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                  Execution Sizing Rule
                </span>
                <span className="text-xs text-slate-200 font-medium">
                  {selectedCell.edgeStatus === 'STRONG_EDGE'
                    ? 'Positive alpha verified. Standard or aggressive allocation permitted.'
                    : selectedCell.edgeStatus === 'NEGATIVE_EDGE'
                    ? 'Negative expectancy under this regime. Blacklist or pause new signals.'
                    : selectedCell.edgeStatus === 'MODERATE_EDGE'
                    ? 'Mild positive edge. Trade with standard risk and strict DCA discipline.'
                    : 'Insufficient completed trades to establish statistical edge.'}
                </span>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                getRecommendationBadge(selectedCell.tacticalRecommendation).cls
              }`}
            >
              {getRecommendationBadge(selectedCell.tacticalRecommendation).text}
            </span>
          </div>
        </div>
      )}

      {/* ─── Marginal Rollup Summaries ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Setup Marginal Summary */}
        <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={13} className="text-cyan-400" />
            Marginal Attribution by Setup Pattern
          </h4>
          <div className="space-y-2">
            {setupMarginals.map((s) => (
              <div
                key={s.setupType}
                className="p-2.5 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-200 block">
                    {SETUP_LABELS[s.setupType]}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {s.completedSignals} trades • {s.winRate.toFixed(0)}% win
                    {s.bestRegime && ` • Best: ${s.bestRegime}`}
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono font-bold block ${
                      s.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {s.expectancy > 0 ? '+' : ''}{s.expectancy.toFixed(2)}R
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {s.pnlSharePct.toFixed(1)}% P&L share
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regime Marginal Summary */}
        <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Compass size={13} className="text-cyan-400" />
            Marginal Attribution by Macro Market Regime
          </h4>
          <div className="space-y-2">
            {regimeMarginals.map((r) => (
              <div
                key={r.marketRegime}
                className="p-2.5 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-200 block">
                    {REGIME_LABELS[r.marketRegime].label}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {r.completedSignals} trades • {r.winRate.toFixed(0)}% win
                    {r.bestSetup && ` • Best: ${SETUP_LABELS[r.bestSetup]}`}
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono font-bold block ${
                      r.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {r.expectancy > 0 ? '+' : ''}{r.expectancy.toFixed(2)}R
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {r.pnlSharePct.toFixed(1)}% P&L share
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
