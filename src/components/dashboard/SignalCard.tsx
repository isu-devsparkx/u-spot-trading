'use client';

// ─── U-SPOT Signal Card — Phase 7: Full Trade Plan UI ───────────────
// Spec Sections 15 (Lifecycle), 25 (Signal History UI), 26 (Signal Detail),
// 27 (Performance Dashboard), with entry/DCA/SL/TP/sizing/risk expansion

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  formatNumber,
  formatUsd,
  formatStatus,
  getStatusBadgeClass,
  getScoreColor,
  getRegimeBadgeClass,
} from '@/lib/utils';
import type { Signal } from '@/types';
import { useLiveTicker } from '@/hooks/useBinanceWebSocket';
import LiveOrderBookStream from '@/components/dashboard/LiveOrderBookStream';
import AdaptiveVolatilityCard from './AdaptiveVolatilityCard';
import {
  ArrowUpRight,
  Clock,
  Shield,
  Target,
  Wallet,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  BarChart2,
} from 'lucide-react';

interface SignalCardProps {
  signal: Signal;
  currentPrice?: number;
}

function PriceLevel({
  label,
  price,
  colorClass,
  subLabel,
  percentFromEntry,
  badge,
}: {
  label: string;
  price: number;
  colorClass: string;
  subLabel?: string;
  percentFromEntry?: number | null;
  badge?: React.ReactNode;
}) {
  const decimals = price < 0.01 ? 6 : price < 1 ? 4 : price < 10 ? 4 : price < 1000 ? 2 : 2;
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--glass-border)]/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${colorClass}`}>{label}</span>
        {badge}
        {subLabel && (
          <span className="text-[10px] text-slate-600">{subLabel}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {percentFromEntry !== null && percentFromEntry !== undefined && (
          <span
            className={`text-[10px] font-mono ${percentFromEntry >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}
          >
            {percentFromEntry >= 0 ? '+' : ''}{percentFromEntry.toFixed(2)}%
          </span>
        )}
        <span className={`font-mono font-bold text-sm ${colorClass}`}>
          ${formatNumber(price, decimals)}
        </span>
      </div>
    </div>
  );
}

export default function SignalCard({
  signal,
  currentPrice: propPrice,
}: SignalCardProps) {
  const { livePrice: wsPrice, isLiveWs, tickDirection } = useLiveTicker(signal.symbol, {
    initialPrice: propPrice ?? signal.preferredEntry,
    enabled: true,
  });

  const livePrice = wsPrice ?? propPrice ?? signal.preferredEntry;
  const [isExpanded, setIsExpanded] = useState(false);

  const entry = signal.preferredEntry;
  const priceDiff =
    livePrice > 0 && entry > 0
      ? ((livePrice - entry) / entry) * 100
      : null;

  const isInEntryZone =
    signal.entryZone &&
    livePrice >= signal.entryZone.low &&
    livePrice <= signal.entryZone.high;

  // Calculate TP gain percentages
  const tp1Pct = entry > 0 ? ((signal.tp1 - entry) / entry) * 100 : 0;
  const tp2Pct = entry > 0 ? ((signal.tp2 - entry) / entry) * 100 : 0;
  const tp3Pct = entry > 0 ? ((signal.tp3 - entry) / entry) * 100 : 0;
  const slPct = entry > 0 ? ((signal.stopLoss - entry) / entry) * 100 : 0;

  // Potential dollar profits based on initial allocation (30%/30%/40% splits)
  const tp1DollarGain = signal.initialAllocation * (tp1Pct / 100) * 0.3;
  const tp2DollarGain = signal.initialAllocation * (tp2Pct / 100) * 0.3;
  const tp3DollarGain = signal.initialAllocation * (tp3Pct / 100) * 0.4;

  // Score breakdown (if available)
  const breakdown = signal.tradeScoreBreakdown;

  const statusIcon = {
    BUY_NOW: <CheckCircle2 size={12} className="text-emerald-400" />,
    WAIT_FOR_CONFIRMATION: <Clock size={12} className="text-amber-400" />,
    WATCH: <Info size={12} className="text-sky-400" />,
    AVOID: <AlertTriangle size={12} className="text-red-400" />,
    NO_TRADE: <AlertTriangle size={12} className="text-slate-500" />,
    SELL_EXIT: <ArrowUpRight size={12} className="text-rose-400" />,
  }[signal.status] ?? null;

  return (
    <div
      className={`glass-card rounded-2xl transition-all duration-300 ${
        isExpanded
          ? 'glow-cyan ring-1 ring-cyan-500/20'
          : 'hover:glow-cyan'
      }`}
    >
      {/* ── Main Card Header ─────────────────────────────────── */}
      <div className="p-5">
        {/* Top Row: Symbol + Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`
                w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                ${
                  signal.direction === 'BUY'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-rose-500/15 text-rose-400'
                }
              `}
            >
              <ArrowUpRight
                size={18}
                className={signal.direction === 'SELL' ? 'rotate-90' : ''}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-base">
                  {signal.symbol.split('/')[0]}
                </span>
                <span className="text-xs text-slate-500">
                  /{signal.symbol.split('/')[1]}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                    signal.confidence === 'A+'
                      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                      : signal.confidence === 'A'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : signal.confidence === 'B'
                      ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                  }`}
                >
                  {signal.confidence}
                </span>
                {signal.isAiGenerated && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-purple-500/20 text-purple-300 border-purple-500/30 flex items-center gap-0.5">
                    <Zap size={10} className="text-purple-400" /> AI Gen
                  </span>
                )}
                {signal.aiAnalysis && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border flex items-center gap-0.5 ${
                      signal.aiAnalysis.verdict === 'APPROVED'
                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : signal.aiAnalysis.verdict === 'CAUTION'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    AI {signal.aiAnalysis.verdict}
                  </span>
                )}
                {signal.mtfAnalysis && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border flex items-center gap-1 ${
                      signal.mtfAnalysis.alignment === 'FULL_CONFLUENCE'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : signal.mtfAnalysis.alignment === 'PARTIAL_CONFLUENCE'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : signal.mtfAnalysis.alignment === 'COUNTER_TREND'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                        : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                    }`}
                    title={signal.mtfAnalysis.summary}
                  >
                    {signal.mtfAnalysis.alignment === 'FULL_CONFLUENCE'
                      ? '15M•1H•4H 🟢'
                      : signal.mtfAnalysis.alignment === 'PARTIAL_CONFLUENCE'
                      ? '15M•1H 🟢'
                      : signal.mtfAnalysis.alignment === 'COUNTER_TREND'
                      ? '1H DOWNTREND ⚠️'
                      : 'MTF NEUTRAL'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-mono">{signal.signalId}</p>
            </div>
          </div>

          <div className="text-right flex flex-col items-end gap-1">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${getStatusBadgeClass(signal.status)}`}
            >
              {statusIcon}
              {formatStatus(signal.status)}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Live:</span>
              <span
                className={`font-mono font-bold text-sm transition-colors duration-200 ${
                  tickDirection === 'UP'
                    ? 'text-emerald-400'
                    : tickDirection === 'DOWN'
                    ? 'text-rose-400'
                    : 'text-cyan-400'
                }`}
              >
                ${formatNumber(livePrice, livePrice < 0.01 ? 6 : livePrice < 10 ? 4 : 2)}
              </span>
              {isLiveWs && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live WebSocket Stream" />
              )}
            </div>
          </div>
        </div>

        {/* Score Row */}
        <div className="flex items-center gap-4 mb-3">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Trade Score</p>
            <p className={`text-lg font-bold font-mono ${getScoreColor(signal.tradeScore)}`}>
              {signal.tradeScore}
              <span className="text-xs text-slate-600 font-sans">/100</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Risk:Reward</p>
            <p className="text-lg font-bold font-mono text-emerald-400">
              {signal.riskReward.toFixed(1)}R
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Risk %</p>
            <p className="text-lg font-bold font-mono text-amber-400">
              {signal.riskPercent}%
            </p>
          </div>
          <div
            className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium border ${getRegimeBadgeClass(signal.marketRegime)}`}
          >
            {signal.marketRegime}
          </div>
        </div>

        {/* AI Audit Box */}
        {signal.aiAnalysis && (
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-purple-950/20 border border-purple-500/25 text-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-semibold text-purple-300 text-[11px]">
                <Zap size={12} className="text-purple-400" />
                AI Officer Audit ({signal.aiAnalysis.source === 'GEMINI' ? 'Gemini 2.5 Flash' : 'Quantitative Gatekeeper'})
              </div>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 px-1.5 py-0.2 rounded border border-purple-500/30">
                {signal.aiAnalysis.confidenceScore}% Confidence
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">{signal.aiAnalysis.aiRationale}</p>
            {signal.aiAnalysis.keyRisks && signal.aiAnalysis.keyRisks.length > 0 && (
              <div className="mt-1.5 text-[10px] text-amber-300/90 flex items-center gap-1">
                <AlertTriangle size={11} className="flex-shrink-0 text-amber-400" />
                <span>Risk: {signal.aiAnalysis.keyRisks[0]}</span>
              </div>
            )}
          </div>
        )}

        {/* Current Price vs Entry Zone Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--surface-2)]/70 border border-[var(--glass-border)] mb-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-slate-400 font-medium">Price:</span>
            <span className="font-mono font-bold text-slate-100">
              ${formatNumber(livePrice, livePrice < 0.01 ? 6 : livePrice < 10 ? 4 : 2)}
            </span>
          </div>
          <div className="font-mono text-[11px]">
            {isInEntryZone ? (
              <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                <Zap size={10} /> In Entry Zone
              </span>
            ) : priceDiff !== null ? (
              <span
                className={`font-medium ${
                  Math.abs(priceDiff) <= 1
                    ? 'text-cyan-400'
                    : priceDiff > 0
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {priceDiff >= 0 ? '+' : ''}
                {priceDiff.toFixed(2)}% vs entry
              </span>
            ) : null}
          </div>
        </div>

        {/* Quick Level Summary */}
        <div className="grid grid-cols-4 gap-2 text-center mb-3">
          {[
            { label: 'Entry', val: entry, cls: 'text-slate-200' },
            {
              label: signal.trailingStopPrice ? 'Trail SL 🛡️' : 'SL',
              val: signal.trailingStopPrice ?? signal.stopLoss,
              cls: signal.trailingStopPrice ? 'text-emerald-400 font-bold' : 'text-rose-400',
            },
            { label: 'TP1', val: signal.tp1, cls: 'text-emerald-400' },
            { label: 'TP3', val: signal.tp3, cls: 'text-emerald-300' },
          ].map(({ label, val, cls }) => (
            <div key={label} className="bg-[var(--surface-2)]/50 rounded-xl p-2 border border-[var(--glass-border)]/60">
              <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
              <p className={`text-xs font-mono font-bold ${cls}`}>
                ${formatNumber(val, val < 0.01 ? 6 : val < 10 ? 4 : 2)}
              </p>
            </div>
          ))}
        </div>

        {/* Position Summary */}
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)]/50 mb-3">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Wallet size={12} className="text-cyan-400" />
            <span>Entry Size:</span>
            <span className="font-mono font-bold text-slate-200">{formatUsd(signal.initialAllocation)}</span>
          </div>
          <div className="text-slate-400">
            Max Deployed: <span className="font-mono text-slate-200">{formatUsd(signal.maxDeployed)}</span>
          </div>
          <div className="text-slate-400">
            Max Loss: <span className="font-mono text-rose-400">{formatUsd(signal.maxLoss)}</span>
          </div>
        </div>

        {/* Actions: View Full Trade Plan Page + Quick Inline Toggle */}
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/history/${signal.signalId}`}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-cyan-300 transition-all shadow-sm group"
          >
            <BarChart2 size={13} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>View Full Trade Plan</span>
            <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
          <button
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? 'Hide inline summary' : 'Quick preview'}
            className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] border border-[var(--glass-border)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="text-[11px] text-slate-500">{isExpanded ? 'Less' : 'Preview'}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* ── Expanded Trade Plan ──────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-[var(--glass-border)] px-5 pb-5 space-y-4 animate-fade-in">

          {/* Full Price Level Ladder */}
          <div className="pt-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Target size={12} className="text-cyan-400" /> Complete Trade Ladder
            </h3>
            <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 border border-[var(--glass-border)]/60">
              <PriceLevel label="Entry Zone Low" price={signal.entryZone.low} colorClass="text-slate-300" />
              <PriceLevel label="Preferred Entry" price={entry} colorClass="text-cyan-400" badge={<span className="text-[10px] bg-cyan-500/15 text-cyan-400 px-1.5 rounded">TARGET</span>} />
              <PriceLevel label="Entry Zone High" price={signal.entryZone.high} colorClass="text-slate-300" />
              <PriceLevel label="DCA #1" price={signal.dca1} colorClass="text-amber-400" percentFromEntry={entry > 0 ? ((signal.dca1 - entry) / entry) * 100 : null} subLabel={`+${formatUsd(signal.dca1Allocation)}`} />
              <PriceLevel label="DCA #2" price={signal.dca2} colorClass="text-amber-400" percentFromEntry={entry > 0 ? ((signal.dca2 - entry) / entry) * 100 : null} subLabel={`+${formatUsd(signal.dca2Allocation)}`} />
              <PriceLevel label="Stop Loss" price={signal.stopLoss} colorClass="text-rose-400" percentFromEntry={slPct} badge={<Shield size={10} className="text-rose-400" />} />
              {signal.trailingStopPrice && (
                <PriceLevel
                  label="Dynamic Trailing Stop"
                  price={signal.trailingStopPrice}
                  colorClass="text-emerald-400 font-bold"
                  percentFromEntry={entry > 0 ? ((signal.trailingStopPrice - entry) / entry) * 100 : null}
                  badge={<span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-500/40">🛡️ PROTECTED PROFIT</span>}
                />
              )}
              <PriceLevel label="TP1 (30% close)" price={signal.tp1} colorClass="text-emerald-400" percentFromEntry={tp1Pct} subLabel={`~${formatUsd(tp1DollarGain)}`} />
              <PriceLevel label="TP2 (30% close)" price={signal.tp2} colorClass="text-emerald-300" percentFromEntry={tp2Pct} subLabel={`~${formatUsd(tp2DollarGain)}`} />
              <PriceLevel label="TP3 (40% runner)" price={signal.tp3} colorClass="text-emerald-200" percentFromEntry={tp3Pct} subLabel={`~${formatUsd(tp3DollarGain)}`} badge={<TrendingUp size={10} className="text-emerald-300" />} />
            </div>
          </div>

          {/* Position Sizing Breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Wallet size={12} className="text-cyan-400" /> Position Sizing (Spec §14)
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Entry', usdt: signal.initialAllocation, note: '~58%', cls: 'text-slate-200' },
                { label: 'DCA #1', usdt: signal.dca1Allocation, note: '~23%', cls: 'text-amber-400' },
                { label: 'DCA #2', usdt: signal.dca2Allocation, note: '~19%', cls: 'text-amber-400' },
              ].map((t) => (
                <div key={t.label} className="bg-[var(--surface-2)]/60 rounded-xl p-3 border border-[var(--glass-border)]/60 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">{t.label}</p>
                  <p className={`text-sm font-bold font-mono ${t.cls}`}>{formatUsd(t.usdt)}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{t.note}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              <div className="bg-[var(--surface-2)]/40 rounded-lg p-2 text-center">
                <p className="text-slate-500 text-[10px]">Max Deployed</p>
                <p className="font-mono text-slate-200 font-bold">{formatUsd(signal.maxDeployed)}</p>
              </div>
              <div className="bg-[var(--surface-2)]/40 rounded-lg p-2 text-center">
                <p className="text-slate-500 text-[10px]">Risk %</p>
                <p className="font-mono text-amber-400 font-bold">{signal.riskPercent}%</p>
              </div>
              <div className="bg-rose-500/5 rounded-lg p-2 text-center border border-rose-500/20">
                <p className="text-slate-500 text-[10px]">Max Loss</p>
                <p className="font-mono text-rose-400 font-bold">{formatUsd(signal.maxLoss)}</p>
              </div>
            </div>
          </div>

          {/* Trade Score Breakdown */}
          {breakdown && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BarChart2 size={12} className="text-cyan-400" /> Score Breakdown (Spec §10)
              </h3>
              <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 border border-[var(--glass-border)]/60 space-y-2">
                {[
                  { label: 'Trend', pts: breakdown.trend, max: 20 },
                  { label: 'Momentum', pts: breakdown.momentum, max: 15 },
                  { label: 'Volume', pts: breakdown.volume, max: 15 },
                  { label: 'Structure', pts: breakdown.structure, max: 20 },
                  { label: 'Liquidity', pts: breakdown.liquidity, max: 15 },
                  { label: 'Volatility', pts: breakdown.volatility, max: 10 },
                  { label: 'Regime', pts: breakdown.regime, max: 5 },
                ].map(({ label, pts, max }) => {
                  const pct = (pts / max) * 100;
                  const color =
                    pct >= 80
                      ? 'bg-emerald-400'
                      : pct >= 60
                      ? 'bg-amber-400'
                      : 'bg-orange-400';
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-20 shrink-0">{label}</span>
                      <div className="flex-1 score-bar h-1.5 rounded-full bg-[var(--surface-3)]">
                        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 w-14 text-right shrink-0">
                        {pts.toFixed(1)}/{max}
                      </span>
                    </div>
                  );
                })}
                <div className="pt-2 mt-1 border-t border-[var(--glass-border)]/50 flex justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">Total Score</span>
                  <span className={`text-sm font-bold font-mono ${getScoreColor(breakdown.total)}`}>
                    {breakdown.total}/100
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Setup Rationale */}
          {(signal.rationale || signal.confirmationCondition) && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Info size={12} className="text-cyan-400" /> Setup Rationale (Spec §11)
              </h3>
              <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 border border-[var(--glass-border)]/60 space-y-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Setup Type</p>
                  <p className="text-xs font-medium text-cyan-400">
                    {signal.setupType.replace(/_/g, ' ')}
                  </p>
                </div>
                {signal.rationale && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Rationale</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{signal.rationale}</p>
                  </div>
                )}
                {signal.confirmationCondition && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Confirmation Required</p>
                    <p className="text-xs text-amber-300/80 leading-relaxed">{signal.confirmationCondition}</p>
                  </div>
                )}
                {signal.taSummary && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">TA Summary</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{signal.taSummary}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Multi-Timeframe Confluence (Phase 25) */}
          {signal.mtfAnalysis && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={12} className="text-cyan-400" /> Multi-Timeframe Confluence (15M • 1H • 4H)
              </h3>
              <div className="bg-[var(--surface-2)]/40 rounded-xl p-3 border border-[var(--glass-border)]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Confluence Score</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    {signal.mtfAnalysis.confluenceScore}/100
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)]/40 text-center">
                    <span className="text-slate-500 block text-[10px]">15M Execution</span>
                    <span className={`font-bold ${signal.mtfAnalysis.tf15m.direction === 'BULLISH' ? 'text-emerald-400' : signal.mtfAnalysis.tf15m.direction === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {signal.mtfAnalysis.tf15m.direction}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)]/40 text-center">
                    <span className="text-slate-500 block text-[10px]">1H Intermediate</span>
                    <span className={`font-bold ${signal.mtfAnalysis.tf1h.direction === 'BULLISH' ? 'text-emerald-400' : signal.mtfAnalysis.tf1h.direction === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {signal.mtfAnalysis.tf1h.direction}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)]/40 text-center">
                    <span className="text-slate-500 block text-[10px]">4H Macro Trend</span>
                    <span className={`font-bold ${signal.mtfAnalysis.tf4h?.direction === 'BULLISH' ? 'text-emerald-400' : signal.mtfAnalysis.tf4h?.direction === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {signal.mtfAnalysis.tf4h?.direction ?? 'NEUTRAL'}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                  {signal.mtfAnalysis.summary}
                </p>
              </div>
            </div>
          )}

          {/* Auto-Adaptive Volatility ATR Sizing & Dynamic Target Scaling (Phase 42) */}
          <AdaptiveVolatilityCard
            symbol={signal.symbol}
            entryPrice={signal.preferredEntry}
            atr={signal.adaptivePlan?.atrValue || signal.preferredEntry * 0.02}
            structuralPivotLow={signal.stopLoss}
            overheadResistance={signal.tp1}
            compact={true}
          />

          {/* Live Order Book & Wall Scanner (Phase 29) */}
          <LiveOrderBookStream symbol={signal.symbol} maxLevels={5} />

          {/* Expiry / Lifecycle */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-[var(--glass-border)]/50">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-slate-600" />
              <span>Expires: <span className="text-slate-400">{new Date(signal.expiresAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Exchange: <span className="text-slate-400">{signal.exchange ?? 'Binance Spot'}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600">{signal.strategyVersion}</span>
            </div>
          </div>

          {/* Dedicated Chart & Inspection Page Link */}
          <Link
            href={`/history/${signal.signalId}`}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all shadow-md group mt-1"
          >
            <BarChart2 size={14} />
            <span>Open Dedicated Chart & Audit Trail Page</span>
            <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      )}
    </div>
  );
}
