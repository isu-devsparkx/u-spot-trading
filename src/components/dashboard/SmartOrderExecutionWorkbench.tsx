'use client';

// ─── U-SPOT Algorithmic TWAP/VWAP Smart Order Execution Workbench (Phase 46) ─
// Interactive execution splitter breaking institutional spot entries into randomized
// micro-tranches with slippage ceiling guards and arrival benchmark comparison.

import React, { useState, useEffect } from 'react';
import type {
  SmartOrderPlan,
  SmartExecutionAlgorithm,
  ChildOrderTranche,
} from '@/types';
import {
  Split,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Layers,
  Sparkles,
  Clock,
  ArrowRight,
  Sliders,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface SmartOrderExecutionWorkbenchProps {
  initialSymbol?: string;
  initialBenchmarkPrice?: number;
}

const POPULAR_SYMBOLS = [
  { symbol: 'BTC/USDT', benchmark: 67850 },
  { symbol: 'ETH/USDT', benchmark: 2640 },
  { symbol: 'SOL/USDT', benchmark: 154 },
  { symbol: 'BNB/USDT', benchmark: 592 },
];

export default function SmartOrderExecutionWorkbench({
  initialSymbol = 'BTC/USDT',
  initialBenchmarkPrice = 67850,
}: SmartOrderExecutionWorkbenchProps) {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [benchmarkPrice, setBenchmarkPrice] = useState<number>(initialBenchmarkPrice);
  const [totalSizeUsdt, setTotalSizeUsdt] = useState<number>(10000);
  const [algorithm, setAlgorithm] = useState<SmartExecutionAlgorithm>('TWAP');
  const [durationMinutes, setDurationMinutes] = useState<number>(5);
  const [tranchesCount, setTranchesCount] = useState<number>(8);
  const [maxSlippageBps, setMaxSlippageBps] = useState<number>(20); // 0.20%

  const [activePlan, setActivePlan] = useState<SmartOrderPlan | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeTrancheStep, setActiveTrancheStep] = useState<number>(0);

  // Sync benchmark price when changing symbol
  const handleSelectSymbol = (s: string) => {
    setSymbol(s);
    const found = POPULAR_SYMBOLS.find((x) => x.symbol === s);
    if (found) {
      setBenchmarkPrice(found.benchmark);
    }
  };

  // Create plan
  const handleCreatePlan = async () => {
    try {
      const res = await fetch('/api/execution/smart-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE',
          symbol,
          totalSizeUsdt,
          durationMinutes,
          tranchesCount,
          algorithm,
          arrivalBenchmarkPrice: benchmarkPrice,
          maxSlippageBps,
        }),
      });
      const data = await res.json();
      if (data.success && data.plan) {
        setActivePlan(data.plan);
        setActiveTrancheStep(0);
      }
    } catch (err) {
      console.warn('Failed to create execution plan:', err);
    }
  };

  // Execute full automated simulation
  const handleRunFullSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/execution/smart-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SIMULATE',
          symbol,
          totalSizeUsdt,
          durationMinutes,
          tranchesCount,
          algorithm,
          arrivalBenchmarkPrice: benchmarkPrice,
          maxSlippageBps,
        }),
      });
      const data = await res.json();
      if (data.success && data.plan) {
        setActivePlan(data.plan);
        setActiveTrancheStep(data.plan.tranchesCount);
      }
    } catch (err) {
      console.warn('Failed to simulate full execution:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Step single tranche
  const handleStepNextTranche = async () => {
    if (!activePlan) return;
    const nextIdx = activePlan.tranches.findIndex((t) => t.status === 'PENDING');
    if (nextIdx === -1) return;

    const trancheNum = activePlan.tranches[nextIdx].trancheIndex;
    // Micro-jitter market price within +/- 0.05%
    const drift = 1 + (Math.sin(trancheNum * 0.9) * 0.0004);
    const currentPrice = Math.round(benchmarkPrice * drift * 100) / 100;

    try {
      const res = await fetch('/api/execution/smart-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'STEP',
          planId: activePlan.planId,
          trancheIndex: trancheNum,
          currentMarketPrice: currentPrice,
        }),
      });
      const data = await res.json();
      if (data.success && data.plan) {
        setActivePlan(data.plan);
        setActiveTrancheStep(trancheNum);
      }
    } catch (err) {
      console.warn('Failed to step tranche:', err);
    }
  };

  // Reset plan
  const handleReset = () => {
    setActivePlan(null);
    setActiveTrancheStep(0);
  };

  // Auto-initialize plan on mount
  useEffect(() => {
    handleCreatePlan();
  }, [symbol, totalSizeUsdt, algorithm, durationMinutes, tranchesCount, maxSlippageBps, benchmarkPrice]);

  const filledCount = activePlan?.tranches.filter((t) => t.status === 'FILLED').length || 0;
  const progressPct = activePlan ? Math.round((filledCount / activePlan.tranchesCount) * 100) : 0;

  return (
    <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
      {/* ─── Top Header: Title, Badge, Mode ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400">
            <Split size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                Algorithmic TWAP/VWAP Spot Execution Splitter
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono font-bold">
                Phase 46
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Micro-sliced spot entries with slippage ceiling guards & arrival benchmark tracking
            </p>
          </div>
        </div>

        {/* Quick Symbol Switcher */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
          {POPULAR_SYMBOLS.map((item) => (
            <button
              key={item.symbol}
              onClick={() => handleSelectSymbol(item.symbol)}
              className={`px-2 py-1 rounded transition cursor-pointer font-bold ${
                symbol === item.symbol
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.symbol.split('/')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Configuration Form Controls ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono">
        {/* Total Size */}
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Total Size (USDT)</label>
          <input
            type="number"
            min={500}
            step={500}
            value={totalSizeUsdt}
            onChange={(e) => setTotalSizeUsdt(Math.max(100, Number(e.target.value)))}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Algorithm */}
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Algorithm Model</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as SmartExecutionAlgorithm)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 outline-none focus:border-purple-500/50 cursor-pointer"
          >
            <option value="TWAP">TWAP (Time-Weighted)</option>
            <option value="VWAP">VWAP (Volume-Curve)</option>
            <option value="ADAPTIVE_LIQUIDITY">Adaptive Liquidity</option>
          </select>
        </div>

        {/* Window Duration */}
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">Execution Window</label>
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 outline-none focus:border-purple-500/50 cursor-pointer"
          >
            <option value={2}>2 Minutes (Rapid)</option>
            <option value={5}>5 Minutes (Balanced)</option>
            <option value={15}>15 Minutes (Stealth)</option>
            <option value={30}>30 Minutes (Whale)</option>
          </select>
        </div>

        {/* Tranches Count */}
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">
            Tranches: <span className="text-purple-300 font-bold">{tranchesCount} slices</span>
          </label>
          <input
            type="range"
            min={4}
            max={16}
            value={tranchesCount}
            onChange={(e) => setTranchesCount(Number(e.target.value))}
            className="w-full accent-purple-400 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none mt-2"
          />
        </div>

        {/* Slippage Guard Ceiling */}
        <div>
          <label className="text-[10px] text-slate-400 block mb-1">
            Slippage Ceiling: <span className="text-purple-300 font-bold">{maxSlippageBps} bps</span>
          </label>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={maxSlippageBps}
            onChange={(e) => setMaxSlippageBps(Number(e.target.value))}
            className="w-full accent-purple-400 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none mt-2"
          />
        </div>
      </div>

      {/* ─── Execution Progress & Status Telemetry Strip ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs font-mono">
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block">Execution Status</span>
          <div className="flex items-center gap-1.5 font-bold">
            {activePlan?.status === 'COMPLETED' ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} /> Completed
              </span>
            ) : activePlan?.status === 'PAUSED_SLIPPAGE' ? (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle size={12} /> Paused (Slippage)
              </span>
            ) : activePlan?.status === 'EXECUTING' ? (
              <span className="text-purple-400 flex items-center gap-1 animate-pulse">
                <Zap size={12} /> Executing ({progressPct}%)
              </span>
            ) : (
              <span className="text-slate-400">Ready to Split</span>
            )}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block">Arrival Benchmark Price</span>
          <div className="text-slate-200 font-bold">
            ${benchmarkPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block">Average Realized Fill</span>
          <div
            className={`font-bold ${
              (activePlan?.averageExecutedPrice || 0) > 0 ? 'text-purple-300' : 'text-slate-500'
            }`}
          >
            {(activePlan?.averageExecutedPrice || 0) > 0
              ? `$${activePlan?.averageExecutedPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}`
              : '—'}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-500 block">Estimated Slippage Alpha</span>
          <div className="text-emerald-400 font-bold flex items-center gap-1">
            <Sparkles size={11} />
            +${(activePlan?.estimatedFeeSavingsUsdt || 0).toFixed(2)} Saved
          </div>
        </div>
      </div>

      {/* ─── Visual Progress Bar & Action Buttons ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
          <span>
            Progress: {filledCount} / {activePlan?.tranchesCount || tranchesCount} Tranches Filled ($
            {formatNumber(activePlan?.executedTotalUsdt || 0)} / ${formatNumber(totalSizeUsdt)})
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStepNextTranche}
              disabled={isSimulating || activePlan?.status === 'COMPLETED'}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold disabled:opacity-40 cursor-pointer transition flex items-center gap-1"
            >
              <ArrowRight size={10} /> Step 1 Slice
            </button>

            <button
              onClick={handleRunFullSimulation}
              disabled={isSimulating}
              className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold disabled:opacity-50 cursor-pointer transition flex items-center gap-1.5 shadow-sm"
            >
              <Play size={10} className="fill-white" />
              {isSimulating ? 'Simulating...' : 'Simulate Full Split'}
            </button>

            <button
              onClick={handleReset}
              className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Reset Plan"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        {/* Multi-Segment Tranche Progress Bar */}
        <div className="h-2 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex">
          {activePlan?.tranches.map((t) => (
            <div
              key={t.trancheIndex}
              style={{ width: `${100 / activePlan.tranchesCount}%` }}
              className={`h-full border-r border-slate-950/40 transition-all duration-300 ${
                t.status === 'FILLED'
                  ? 'bg-purple-500'
                  : t.status === 'SKIPPED_SLIPPAGE'
                  ? 'bg-rose-500'
                  : 'bg-slate-800/60'
              }`}
              title={`Tranche #${t.trancheIndex}: ${t.status} ($${t.allocatedUsdt})`}
            />
          ))}
        </div>
      </div>

      {/* ─── Tranche Slices Visual Grid ─── */}
      <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/60">
        <div className="grid grid-cols-6 p-2 bg-slate-900/80 text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
          <span>Tranche</span>
          <span>Target Time</span>
          <span>Allocated</span>
          <span>Fill Price</span>
          <span>Slippage</span>
          <span className="text-right">Status</span>
        </div>

        <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/40">
          {activePlan?.tranches.map((tranche) => (
            <div
              key={tranche.trancheIndex}
              className="grid grid-cols-6 p-2 text-xs font-mono items-center hover:bg-slate-900/40 transition"
            >
              <span className="font-bold text-slate-300">Slice #{tranche.trancheIndex}</span>
              <span className="text-slate-400 text-[11px]">
                {new Date(tranche.targetReleaseTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className="text-slate-200 font-bold">${formatNumber(tranche.allocatedUsdt)}</span>
              <span className="text-slate-300">
                {tranche.executedPrice > 0
                  ? `$${tranche.executedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : '—'}
              </span>
              <span
                className={
                  tranche.slippageBps <= 0
                    ? 'text-emerald-400'
                    : tranche.slippageBps > maxSlippageBps
                    ? 'text-rose-400 font-bold'
                    : 'text-amber-300'
                }
              >
                {tranche.executedPrice > 0
                  ? `${tranche.slippageBps >= 0 ? '+' : ''}${tranche.slippageBps} bps`
                  : '—'}
              </span>
              <span className="text-right">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    tranche.status === 'FILLED'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : tranche.status === 'SKIPPED_SLIPPAGE'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tranche.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
