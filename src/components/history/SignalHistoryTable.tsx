'use client';

// ─── U-SPOT Signal History Table — Phase 7 ──────────────────────────
// Spec Sections 16 (Signal History), 18 (Result Types), 22 (MFE/MAE),
// 23 (Time-to-Event), 25 (History UI)

import { useState, Fragment } from 'react';
import Link from 'next/link';
import type { SignalHistoryRecord, SignalResult } from '@/types';
import {
  formatNumber,
  formatUsd,
  formatDate,
  formatTime,
  getResultBadgeClass,
  getRegimeBadgeClass,
  getScoreColor,
} from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Target,
  Info,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface SignalHistoryTableProps {
  records: SignalHistoryRecord[];
  isLoading?: boolean;
}

function formatResult(result: SignalResult | null): string {
  if (!result) return '—';
  if (result === 'TP1_ONLY' || result === 'PARTIAL_TP_THEN_SL') {
    return 'TP1';
  }
  if (result === 'TP2_REACHED') {
    return 'TP2';
  }
  if (result === 'TP3_REACHED' || result === 'FULL_TP') {
    return 'TP3';
  }
  if (result === 'SL') {
    return 'SL HIT';
  }
  const map: Record<string, string> = {
    INVALIDATED_BEFORE_ENTRY: 'INV',
    EXPIRED: 'EXP',
    CANCELLED: 'CANCEL',
    INDETERMINATE: '?',
    MANUAL_EXIT: 'MANUAL',
  };
  return map[result] ?? result;
}

function ResultBadge({ result, lifecycle }: { result: SignalResult | null; lifecycle?: string }) {
  if (!result) {
    if (lifecycle === 'ACTIVE' || lifecycle === 'ENTRY_TRIGGERED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          ACTIVE
        </span>
      );
    }
    if (lifecycle === 'DCA1_TRIGGERED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          DCA 1
        </span>
      );
    }
    if (lifecycle === 'DCA2_TRIGGERED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          DCA 2
        </span>
      );
    }
    if (lifecycle === 'TP1_HIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          TP1
        </span>
      );
    }
    if (lifecycle === 'TP2_HIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          TP2
        </span>
      );
    }
    if (lifecycle === 'TP3_HIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          TP3
        </span>
      );
    }
    return <span className="text-slate-600 text-xs">—</span>;
  }
  const cls = getResultBadgeClass(result);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}
    >
      {formatResult(result)}
    </span>
  );
}

function RBadge({ r }: { r: number | null }) {
  if (r === null || r === undefined) return <span className="text-slate-600 text-xs">—</span>;
  const color = r >= 2 ? 'text-emerald-400' : r >= 0 ? 'text-amber-400' : 'text-rose-400';
  return (
    <span className={`font-mono font-bold text-xs ${color}`}>
      {r >= 0 ? '+' : ''}{r.toFixed(1)}R
    </span>
  );
}

function ExpandedRow({ record }: { record: SignalHistoryRecord }) {
  const p = record.preferredEntry;
  const pDecimals = p < 0.01 ? 6 : p < 1 ? 4 : p < 10 ? 4 : 2;

  return (
    <tr>
      <td colSpan={9} className="px-4 pb-4">
        <div className="bg-[var(--surface-2)]/50 rounded-xl border border-[var(--glass-border)] p-4 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Trade Levels */}
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Target size={11} className="text-cyan-400" /> Trade Levels
              </h4>
              <div className="space-y-1 text-xs">
                {[
                  { label: 'Entry', val: record.preferredEntry, cls: 'text-slate-300', actual: record.actualEntry },
                  { label: 'DCA #1', val: record.dca1, cls: 'text-amber-400', hit: record.dca1Hit },
                  { label: 'DCA #2', val: record.dca2, cls: 'text-amber-400', hit: record.dca2Hit },
                  { label: 'SL', val: record.stopLoss, cls: 'text-rose-400', hit: undefined },
                  { label: 'TP1', val: record.tp1, cls: 'text-emerald-400', hit: undefined },
                  { label: 'TP2', val: record.tp2, cls: 'text-emerald-300', hit: undefined },
                  { label: 'TP3', val: record.tp3, cls: 'text-emerald-200', hit: undefined },
                ].map(({ label, val, cls, actual, hit }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-500">{label}</span>
                    <div className="flex items-center gap-2">
                      {actual !== undefined && actual !== null && (
                        <span className="text-[10px] text-cyan-400/70 font-mono">
                          actual: ${formatNumber(actual, pDecimals)}
                        </span>
                      )}
                      {hit !== undefined && (
                        <span
                          className={`text-[10px] px-1 rounded ${
                            hit ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-600 bg-[var(--surface-3)]'
                          }`}
                        >
                          {hit ? 'HIT' : 'MISS'}
                        </span>
                      )}
                      <span className={`font-mono ${cls}`}>
                        ${formatNumber(val, pDecimals)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Excursions & Metrics */}
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={11} className="text-cyan-400" /> MFE / MAE (Spec §22)
              </h4>
              <div className="space-y-2">
                <div className="bg-emerald-500/5 rounded-lg p-2.5 border border-emerald-500/20">
                  <p className="text-[10px] text-slate-500 mb-1">Max Favorable Excursion</p>
                  {record.mfe !== null ? (
                    <p className="font-mono text-emerald-400 font-bold text-sm">+{record.mfe?.toFixed(2)}%</p>
                  ) : (
                    <p className="text-slate-600 text-xs">No entry triggered</p>
                  )}
                </div>
                <div className="bg-rose-500/5 rounded-lg p-2.5 border border-rose-500/20">
                  <p className="text-[10px] text-slate-500 mb-1">Max Adverse Excursion</p>
                  {record.mae !== null ? (
                    <p className="font-mono text-rose-400 font-bold text-sm">{record.mae?.toFixed(2)}%</p>
                  ) : (
                    <p className="text-slate-600 text-xs">No entry triggered</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[var(--surface-2)]/60 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">Fees</p>
                    <p className="font-mono text-slate-400 text-xs">
                      {record.fees !== null ? formatUsd(record.fees!) : '—'}
                    </p>
                  </div>
                  <div className="bg-[var(--surface-2)]/60 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">Slippage</p>
                    <p className="font-mono text-slate-400 text-xs">
                      {record.slippage !== null ? `${record.slippage?.toFixed(3)}%` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Evaluation */}
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Info size={11} className="text-cyan-400" /> Post-Trade Evaluation (Spec §19)
              </h4>
              {record.evaluationText ? (
                <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 border border-[var(--glass-border)] text-xs text-slate-300 leading-relaxed whitespace-pre-line font-mono max-h-60 overflow-y-auto">
                  {record.evaluationText}
                </div>
              ) : (
                <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 border border-[var(--glass-border)] text-xs text-slate-500 italic">
                  Evaluation pending signal completion or manual evaluation trigger.
                </div>
              )}
              {record.finalResult === 'SL' && (
                <div className="mt-2 flex items-center justify-between text-[10px] text-amber-400/90 bg-amber-500/10 rounded-lg px-2.5 py-1.5 border border-amber-500/20">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                    <span>SL Root Cause & Counterfactual Diagnostic (Spec §19-21)</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Audited</span>
                </div>
              )}
            </div>
          </div>

          {/* Position Sizing Row */}
          <div className="pt-2 border-t border-[var(--glass-border)]/50">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-slate-500">
              <span>
                Entry: <span className="font-mono text-slate-300">{formatUsd(record.initialAllocation)}</span>
              </span>
              <span>
                DCA #1: <span className="font-mono text-amber-400">{formatUsd(record.dca1Allocation)}</span>
              </span>
              <span>
                DCA #2: <span className="font-mono text-amber-400">{formatUsd(record.dca2Allocation)}</span>
              </span>
              <span>
                Max Deployed: <span className="font-mono text-slate-200">{formatUsd(record.maxDeployed)}</span>
              </span>
              <span>
                Risk: <span className="font-mono text-amber-400">{record.riskPercent}%</span>
              </span>
              <span>
                Max Loss: <span className="font-mono text-rose-400">{formatUsd(record.maxLoss)}</span>
              </span>
              <span>
                R:R: <span className="font-mono text-emerald-400">{record.riskReward.toFixed(1)}</span>
              </span>
              <span className="ml-auto">
                <span className="text-slate-600">Strategy: </span>
                <span className="text-slate-400">{record.strategyVersion}</span>
              </span>
            </div>
          </div>

          {/* Action Row: Link to Dedicated Signal Detail Page (Spec §26 & §45) */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--glass-border)]/50">
            <span className="text-[11px] text-slate-500 font-mono">
              Signal ID: <span className="text-slate-400">{record.signalId}</span>
            </span>
            <Link
              href={`/history/${record.signalId}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition group shadow-sm"
            >
              <span>Inspect Full Audit Trail & Candlestick Replay (Spec §26)</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function SignalHistoryTable({ records, isLoading = false }: SignalHistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl p-16 text-center animate-fade-in">
        <RefreshCw size={36} className="text-cyan-400 animate-spin mx-auto mb-4" />
        <p className="text-base font-semibold text-slate-200">
          Loading Signal History...
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Querying entry-triggered trades from database.
        </p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center animate-fade-in">
        <Clock size={36} className="text-slate-600 mx-auto mb-4" />
        <p className="text-sm text-slate-300 font-medium">No entry-triggered signals found</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Only signals where market price reached entry are recorded in history and counted in performance analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left py-3 px-4">Time</th>
              <th className="text-left py-3 px-4">Coin</th>
              <th className="text-left py-3 px-4">Dir</th>
              <th className="text-right py-3 px-4">Score</th>
              <th className="text-right py-3 px-4">Entry</th>
              <th className="text-center py-3 px-4">Result</th>
              <th className="text-right py-3 px-4">R</th>
              <th className="text-center py-3 px-4">MFE / MAE</th>
              <th className="text-center py-3 px-4 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => {
              const isOpen = expandedId === record.signalId;
              const p = record.preferredEntry;
              const pDecimals = p < 0.01 ? 6 : p < 1 ? 4 : p < 10 ? 4 : 2;

              return (
                <Fragment key={`${record.signalId}-${idx}`}>
                  <tr
                    onClick={() => setExpandedId(isOpen ? null : record.signalId)}
                    className={`border-b border-[var(--glass-border)]/50 cursor-pointer transition-colors ${
                      isOpen
                        ? 'bg-cyan-500/5'
                        : 'hover:bg-[var(--surface-2)]/50'
                    }`}
                  >
                    {/* Time */}
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      <div>{formatDate(record.createdAt)}</div>
                      <div className="text-slate-600">{formatTime(record.createdAt)}</div>
                    </td>

                    {/* Coin */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-200 text-xs">
                        {record.symbol.split('/')[0]}
                      </div>
                      <div
                        className={`text-[10px] px-1.5 py-0 rounded font-medium mt-0.5 inline-block border ${getRegimeBadgeClass(record.marketRegime)}`}
                      >
                        {record.marketRegime}
                      </div>
                    </td>

                    {/* Direction */}
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          record.direction === 'BUY'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {record.direction}
                      </span>
                    </td>

                    {/* Score */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span
                          className={`font-mono font-bold text-xs ${getScoreColor(record.tradeScore)}`}
                        >
                          {record.tradeScore}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            record.confidence === 'A+'
                              ? 'text-yellow-400'
                              : record.confidence === 'A'
                              ? 'text-emerald-400'
                              : 'text-sky-400'
                          }`}
                        >
                          {record.confidence}
                        </span>
                      </div>
                    </td>

                    {/* Entry */}
                    <td className="py-3 px-4 text-right">
                      <div className="font-mono text-xs text-slate-300">
                        ${formatNumber(record.preferredEntry, pDecimals)}
                      </div>
                      {record.actualEntry !== null && (
                        <div className="font-mono text-[10px] text-cyan-400/70">
                          actual: ${formatNumber(record.actualEntry!, pDecimals)}
                        </div>
                      )}
                    </td>

                    {/* Result */}
                    <td className="py-3 px-4 text-center">
                      <ResultBadge result={record.finalResult} lifecycle={record.lifecycle} />
                    </td>

                    {/* R Multiple */}
                    <td className="py-3 px-4 text-right">
                      <RBadge r={record.realizedR} />
                    </td>

                    {/* MFE / MAE */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        {record.mfe !== null ? (
                          <span className="text-[10px] font-mono text-emerald-400">
                            <TrendingUp size={9} className="inline mr-0.5" />
                            +{record.mfe?.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                        {record.mae !== null ? (
                          <span className="text-[10px] font-mono text-rose-400">
                            <TrendingDown size={9} className="inline mr-0.5" />
                            {record.mae?.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </div>
                    </td>

                    {/* Expand */}
                    <td className="py-3 px-4 text-center">
                      {isOpen ? (
                        <ChevronUp size={14} className="text-cyan-400 mx-auto" />
                      ) : (
                        <ChevronDown size={14} className="text-slate-500 mx-auto" />
                      )}
                    </td>
                  </tr>

                  {isOpen && <ExpandedRow key={`${record.signalId}-detail`} record={record} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
