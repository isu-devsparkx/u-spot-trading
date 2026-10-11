'use client';

// ─── U-SPOT Adaptive Volatility ATR Sizing Card (Phase 42) ───────────
// Visualizes auto-adaptive volatility-adjusted DCA tranches, structural SL buffers,
// and TP target expansions across LOW, NORMAL, HIGH, and EXTREME volatility regimes.

import React, { useState, useEffect, useMemo } from 'react';
import {
  computeAdaptiveTargetPlan,
  classifyVolatilityRegime,
  getAdaptiveMultipliers,
} from '@/lib/services/adaptive-volatility';
import type {
  AdaptiveVolatilityRegime,
  AdaptiveTargetPlan,
} from '@/types';
import {
  Activity,
  Sliders,
  Shield,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Info,
  Maximize2,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface AdaptiveVolatilityCardProps {
  symbol?: string;
  entryPrice?: number;
  atr?: number;
  structuralPivotLow?: number;
  overheadResistance?: number;
  compact?: boolean;
}

export default function AdaptiveVolatilityCard({
  symbol = 'BTC/USDT',
  entryPrice = 68000,
  atr = 1250,
  structuralPivotLow,
  overheadResistance,
  compact = false,
}: AdaptiveVolatilityCardProps) {
  // Allow user to simulate regimes manually or keep Auto
  const [selectedRegime, setSelectedRegime] = useState<AdaptiveVolatilityRegime | 'AUTO'>('AUTO');

  const computedAtrPercent = entryPrice > 0 ? (atr / entryPrice) * 100 : 2.0;
  const naturalRegime = useMemo(() => classifyVolatilityRegime(computedAtrPercent), [computedAtrPercent]);

  const activeRegime: AdaptiveVolatilityRegime =
    selectedRegime === 'AUTO' ? naturalRegime : selectedRegime;

  const plan: AdaptiveTargetPlan = useMemo(() => {
    return computeAdaptiveTargetPlan({
      symbol,
      entryPrice,
      atr,
      structuralPivotLow,
      overheadResistance,
      forcedRegime: activeRegime,
    });
  }, [symbol, entryPrice, atr, structuralPivotLow, overheadResistance, activeRegime]);

  // Baseline standard normal plan for comparison
  const baselinePlan = useMemo(() => {
    return computeAdaptiveTargetPlan({
      symbol,
      entryPrice,
      atr,
      structuralPivotLow,
      overheadResistance,
      forcedRegime: 'NORMAL',
    });
  }, [symbol, entryPrice, atr, structuralPivotLow, overheadResistance]);

  const getRegimeColor = (reg: AdaptiveVolatilityRegime) => {
    switch (reg) {
      case 'LOW':
        return 'bg-sky-500/15 border-sky-500/30 text-sky-400';
      case 'NORMAL':
        return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
      case 'HIGH':
        return 'bg-amber-500/15 border-amber-500/30 text-amber-400';
      case 'EXTREME':
        return 'bg-rose-500/15 border-rose-500/30 text-rose-400 animate-pulse';
    }
  };

  return (
    <div className="rounded-xl bg-[var(--surface-2)]/95 border border-[var(--glass-border)] p-4 space-y-3.5">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Activity size={13} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-slate-100">
                Auto-Adaptive Volatility ATR Sizing
              </h4>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20">
                Phase 42
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
              <span>{symbol}</span>
              <span>•</span>
              <span>ATR: {formatNumber(atr)} ({computedAtrPercent.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* Regime Simulation Filter Chips */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono">
          <button
            onClick={() => setSelectedRegime('AUTO')}
            className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
              selectedRegime === 'AUTO'
                ? 'bg-amber-500/20 text-amber-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto ({naturalRegime})
          </button>
          {(['LOW', 'NORMAL', 'HIGH', 'EXTREME'] as AdaptiveVolatilityRegime[]).map((reg) => (
            <button
              key={reg}
              onClick={() => setSelectedRegime(reg)}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                selectedRegime === reg
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Regime Telemetry Multiplier Badges ─── */}
      <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono bg-slate-950/60 p-2.5 rounded-lg border border-[var(--glass-border)]">
        <div>
          <span className="text-slate-500 block text-[9px]">Active Regime</span>
          <span className={`inline-block px-1.5 py-0.5 mt-0.5 rounded border font-bold ${getRegimeColor(activeRegime)}`}>
            {activeRegime} VOLATILITY
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px]">DCA Step Multiplier</span>
          <span className="text-cyan-400 font-bold text-xs mt-0.5 block">
            {plan.multipliers.dcaStepMultiplier}x ATR
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px]">SL Buffer Multiplier</span>
          <span className="text-amber-400 font-bold text-xs mt-0.5 block">
            {plan.multipliers.slBufferMultiplier}x ATR
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px]">TP Expansion Factor</span>
          <span className="text-emerald-400 font-bold text-xs mt-0.5 block">
            {plan.multipliers.tpExpansionMultiplier}x R
          </span>
        </div>
      </div>

      {/* ─── Dynamic Adaptive Target Ladder ─── */}
      <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-[10px] font-mono">
        {/* TP3 */}
        <div className="flex items-center justify-between py-0.5 px-2 rounded bg-emerald-500/10 border border-emerald-500/20">
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <TrendingUp size={11} /> TP3 Runner (+{plan.tp3DistancePercent}%)
          </span>
          <span className="text-emerald-300 font-bold">${formatNumber(plan.adaptiveTp3Price)}</span>
        </div>

        {/* TP2 */}
        <div className="flex items-center justify-between py-0.5 px-2 rounded bg-emerald-500/5">
          <span className="text-emerald-400">TP2 Extension (+{plan.tp2DistancePercent}%)</span>
          <span className="text-slate-200">${formatNumber(plan.adaptiveTp2Price)}</span>
        </div>

        {/* TP1 */}
        <div className="flex items-center justify-between py-0.5 px-2 rounded bg-emerald-500/5">
          <span className="text-emerald-400">TP1 Front-Run (+{plan.tp1DistancePercent}%)</span>
          <span className="text-slate-200">${formatNumber(plan.adaptiveTp1Price)}</span>
        </div>

        {/* ENTRY */}
        <div className="flex items-center justify-between py-1 px-2 rounded bg-cyan-500/15 border border-cyan-500/30 my-1">
          <span className="text-cyan-300 font-bold flex items-center gap-1">
            <Zap size={11} /> Planned Entry
          </span>
          <span className="text-cyan-200 font-bold">${formatNumber(plan.entryPrice)}</span>
        </div>

        {/* DCA1 */}
        <div className="flex items-center justify-between py-0.5 px-2 rounded bg-slate-800/40">
          <span className="text-slate-400">DCA 1 Safety Pullback (-{plan.dca1DistancePercent}%)</span>
          <span className="text-slate-300">${formatNumber(plan.adaptiveDca1Price)}</span>
        </div>

        {/* DCA2 */}
        <div className="flex items-center justify-between py-0.5 px-2 rounded bg-slate-800/40">
          <span className="text-slate-400">DCA 2 Extreme Dip (-{plan.dca2DistancePercent}%)</span>
          <span className="text-slate-300">${formatNumber(plan.adaptiveDca2Price)}</span>
        </div>

        {/* STOP LOSS */}
        <div className="flex items-center justify-between py-0.5 px-2 rounded bg-rose-500/10 border border-rose-500/20">
          <span className="text-rose-400 font-bold flex items-center gap-1">
            <Shield size={11} /> Adaptive Stop Loss (-{plan.slDistancePercent}%)
          </span>
          <span className="text-rose-300 font-bold">${formatNumber(plan.adaptiveSlPrice)}</span>
        </div>
      </div>

      {/* ─── Comparison with Baseline Fixed Plan ─── */}
      <div className="flex items-center justify-between text-[10px] font-mono px-1">
        <div className="text-slate-400">
          Blended Risk / Reward:{' '}
          <span className="text-emerald-400 font-bold">1:{plan.riskRewardRatio}</span>
          <span className="text-slate-500 text-[9px] ml-1">
            (Baseline: 1:{baselinePlan.riskRewardRatio})
          </span>
        </div>
        <div className="text-slate-400">
          SL Distance:{' '}
          <span className="text-rose-400 font-bold">{plan.slDistancePercent}%</span>
        </div>
      </div>

      {/* Warnings & Rationale */}
      {plan.warnings.length > 0 && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-300 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <div>{plan.warnings.join(' ')}</div>
        </div>
      )}
    </div>
  );
}
