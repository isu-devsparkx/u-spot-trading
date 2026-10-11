'use client';

// ─── U-SPOT Technical Analysis Suite Component ───────────────────────
// Phase 5: Technical Analysis — Modules 8.1 to 8.6 Structured Results
// Spec Section 8 (Trend, Momentum, Volume, Volatility, Structure, Liquidity)

import React from 'react';
import type { TechnicalAnalysisResult, Timeframe } from '@/types';
import {
  TrendingUp,
  Activity,
  BarChart3,
  Flame,
  GitBranch,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Zap,
  Target,
  AlertTriangle,
  RefreshCw,
  Compass,
} from 'lucide-react';
import { formatNumber, getScoreColor } from '@/lib/utils';

interface TechnicalAnalysisCardProps {
  symbol: string;
  timeframe: Timeframe;
  analysis: TechnicalAnalysisResult | null;
  isLoading: boolean;
  onTimeframeChange: (tf: Timeframe) => void;
}

export default function TechnicalAnalysisCard({
  symbol,
  timeframe,
  analysis,
  isLoading,
  onTimeframeChange,
}: TechnicalAnalysisCardProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl bg-[var(--surface-2)] border border-[var(--glass-border)] text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw size={14} className="animate-spin text-cyan-400" />
        Running quantitative multi-module technical analysis on {symbol} ({timeframe})...
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const { trend, momentum, volume, volatility, structure, liquidity } = analysis;

  const getBiasBadge = (bias: string) => {
    switch (bias) {
      case 'BULLISH':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'BEARISH':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      default:
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface-2)] border border-cyan-500/30 space-y-4 animate-fade-in">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Compass size={15} className="text-cyan-400" />
              Technical Analysis Engine (Spec Section 8)
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getBiasBadge(
                analysis.overallBias
              )}`}
            >
              {analysis.overallBias} BIAS
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30">
              TA Score: {analysis.compositeTechnicalScore}/100
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{analysis.summary}</p>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 self-start sm:self-auto">
          <span className="text-[10px] text-slate-500 font-semibold mr-1">Timeframe:</span>
          {(['5m', '15m', '1h', '4h'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer ${
                timeframe === tf
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 border border-[var(--glass-border)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Grid of 6 Independent Strategy Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Module 8.1: Trend */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-cyan-400" />
              Trend Module (8.1)
            </span>
            <span className={`text-[10px] font-mono font-bold ${getScoreColor(trend.score)}`}>
              {trend.score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Alignment:</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  trend.alignment === 'BULLISH'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : trend.alignment === 'BEARISH'
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                {trend.alignment}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">EMA 20:</span>
              <span>
                ${formatNumber(trend.ema20, trend.ema20 < 1 ? 4 : 2)}{' '}
                <span
                  className={
                    trend.distanceEma20Percent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  ({trend.distanceEma20Percent > 0 ? '+' : ''}
                  {trend.distanceEma20Percent}%)
                </span>
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">EMA 50:</span>
              <span>
                ${formatNumber(trend.ema50, trend.ema50 < 1 ? 4 : 2)}{' '}
                <span
                  className={
                    trend.distanceEma50Percent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  ({trend.distanceEma50Percent > 0 ? '+' : ''}
                  {trend.distanceEma50Percent}%)
                </span>
              </span>
            </div>
            {trend.ema200 && (
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-500">EMA 200:</span>
                <span>${formatNumber(trend.ema200, trend.ema200 < 1 ? 4 : 2)}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 border-t border-[var(--glass-border)] pt-1.5">
            {trend.description}
          </p>
        </div>

        {/* Module 8.2: Momentum */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Activity size={13} className="text-cyan-400" />
              Momentum Module (8.2)
            </span>
            <span className={`text-[10px] font-mono font-bold ${getScoreColor(momentum.score)}`}>
              {momentum.score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">RSI (14):</span>
              <span
                className={`font-bold ${
                  momentum.rsi >= 70
                    ? 'text-amber-400'
                    : momentum.rsi >= 50
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {momentum.rsi} ({momentum.rsiState})
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">MACD Hist:</span>
              <span
                className={`font-bold ${
                  momentum.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {momentum.macd.histogram > 0 ? '+' : ''}
                {momentum.macd.histogram}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">ROC (10):</span>
              <span className={momentum.roc >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {momentum.roc > 0 ? '+' : ''}
                {momentum.roc}%
              </span>
            </div>

            {momentum.divergence !== 'NONE' && (
              <div className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30 text-center">
                {momentum.divergence}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 border-t border-[var(--glass-border)] pt-1.5">
            {momentum.description}
          </p>
        </div>

        {/* Module 8.3: Volume */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <BarChart3 size={13} className="text-cyan-400" />
              Volume Module (8.3)
            </span>
            <span className={`text-[10px] font-mono font-bold ${getScoreColor(volume.score)}`}>
              {volume.score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Vol Ratio:</span>
              <span
                className={`font-bold ${
                  volume.volumeRatio >= 2.0
                    ? 'text-emerald-400'
                    : volume.volumeRatio >= 1.2
                    ? 'text-cyan-400'
                    : 'text-slate-400'
                }`}
              >
                {volume.volumeRatio.toFixed(2)}x avg
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Volume Spike:</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  volume.isVolumeSpike
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {volume.isVolumeSpike ? 'YES (Spike)' : 'NORMAL'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Volume Trend:</span>
              <span className="text-slate-300">{volume.volumeTrend}</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 border-t border-[var(--glass-border)] pt-1.5">
            {volume.description}
          </p>
        </div>

        {/* Module 8.4: Volatility */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Flame size={13} className="text-cyan-400" />
              Volatility Module (8.4)
            </span>
            <span className={`text-[10px] font-mono font-bold ${getScoreColor(volatility.score)}`}>
              {volatility.score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">ATR (14):</span>
              <span className="font-bold text-slate-200">
                ${formatNumber(volatility.atr, volatility.atr < 1 ? 4 : 2)} ({volatility.atrPercent}%)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Dynamic SL:</span>
              <span className="text-rose-400 font-bold">
                -{volatility.recommendedSlDistancePercent}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Dynamic DCAs:</span>
              <span className="text-cyan-300 text-[11px]">
                DCA1 -{volatility.recommendedDca1DistancePercent}% • DCA2 -{volatility.recommendedDca2DistancePercent}%
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 border-t border-[var(--glass-border)] pt-1.5">
            {volatility.description}
          </p>
        </div>

        {/* Module 8.5: Structure */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <GitBranch size={13} className="text-cyan-400" />
              Structure Module (8.5)
            </span>
            <span className={`text-[10px] font-mono font-bold ${getScoreColor(structure.score)}`}>
              {structure.score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Pivots:</span>
              <span className="text-slate-300 font-bold">
                {structure.latestHighType ?? 'N/A'} High / {structure.latestLowType ?? 'N/A'} Low
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Structure Trend:</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  structure.structureTrend === 'UPTREND'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : structure.structureTrend === 'DOWNTREND'
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {structure.structureTrend}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Nearest S / R:</span>
              <span className="text-[11px]">
                S: ${structure.nearestSupport ?? 'N/A'} • R: ${structure.nearestResistance ?? 'N/A'}
              </span>
            </div>
            {structure.breakOfStructure.detected && (
              <div className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 text-center">
                {structure.breakOfStructure.type} at ${structure.breakOfStructure.level}
              </div>
            )}
            {structure.changeOfCharacter.detected && (
              <div className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-center">
                {structure.changeOfCharacter.type} at ${structure.changeOfCharacter.level}
              </div>
            )}
            {structure.liquiditySweep.detected && (
              <div className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-bold border border-purple-500/30 text-center">
                {structure.liquiditySweep.type} Sweep at ${structure.liquiditySweep.level}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 border-t border-[var(--glass-border)] pt-1.5">
            {structure.description}
          </p>
        </div>

        {/* Module 8.6: Liquidity / Order Flow */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Layers size={13} className="text-cyan-400" />
              Liquidity & Flow (8.6)
            </span>
            <span className={`text-[10px] font-mono font-bold ${getScoreColor(liquidity.score)}`}>
              {liquidity.score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Book Imbalance:</span>
              <span
                className={`font-bold ${
                  liquidity.orderBookImbalance > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {liquidity.orderBookImbalance > 0 ? '+' : ''}
                {Math.round(liquidity.orderBookImbalance * 100)}% Bids
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Spread:</span>
              <span className="text-slate-300">{liquidity.spreadPercent}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Volume Delta:</span>
              <span
                className={`font-bold ${
                  liquidity.volumeDeltaProxy > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {liquidity.volumeDeltaProxy > 0 ? '+' : ''}
                {liquidity.volumeDeltaProxy}% Buyer Dom
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 border-t border-[var(--glass-border)] pt-1.5">
            {liquidity.description}
          </p>
        </div>
      </div>
    </div>
  );
}
