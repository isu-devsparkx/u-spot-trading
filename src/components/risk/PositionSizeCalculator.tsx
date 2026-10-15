'use client';

// ─── U-SPOT Position Size Calculator Component ──────────────────────
// Phase 2: Interactive risk & position sizing tool
// Spec Sections: 1, 3, 14, 51

import { useState, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { calculatePositionSize, getDefaultRiskForGrade } from '@/lib/risk-engine';
import { formatNumber, formatUsd } from '@/lib/utils';
import { useSignals } from '@/hooks/useSignals';
import type { ConfidenceGrade } from '@/types';
import {
  Calculator,
  Shield,
  Target,
  AlertTriangle,
  Info,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Sliders,
  Layers,
} from 'lucide-react';

interface PositionSizeCalculatorProps {
  initialSymbol?: string;
  compact?: boolean;
}

export default function PositionSizeCalculator({
  initialSymbol,
  compact = false,
}: PositionSizeCalculatorProps) {
  const {
    walletBalance,
    setWalletBalance,
    riskConfigs,
    maxPositionPercent,
    costs,
  } = useWallet();

  const { signals: activeSignals } = useSignals(60000);

  // Selected preset signal or custom
  const [selectedPreset, setSelectedPreset] = useState<string>(
    initialSymbol ?? 'CUSTOM'
  );

  // Form State
  const [grade, setGrade] = useState<ConfidenceGrade>('A');
  const [useCustomRisk, setUseCustomRisk] = useState<boolean>(false);
  const [customRiskPercent, setCustomRiskPercent] = useState<number>(0.75);

  const [entryPrice, setEntryPrice] = useState<number>(214);
  const [stopLossPrice, setStopLossPrice] = useState<number>(198);

  const [enableDca, setEnableDca] = useState<boolean>(true);
  const [dca1Price, setDca1Price] = useState<number>(209);
  const [dca2Price, setDca2Price] = useState<number>(203);

  const [enableTp, setEnableTp] = useState<boolean>(true);
  const [tp1Price, setTp1Price] = useState<number>(220);
  const [tp2Price, setTp2Price] = useState<number>(227);
  const [tp3Price, setTp3Price] = useState<number>(236);

  // Active risk percent based on grade or custom
  const activeRiskPercent = useMemo(() => {
    if (useCustomRisk) return customRiskPercent;
    const configured = riskConfigs.find((rc) => rc.grade === grade);
    return configured ? configured.maxRiskPercent : getDefaultRiskForGrade(grade);
  }, [useCustomRisk, customRiskPercent, riskConfigs, grade]);

  // Handle Preset Selection
  const handleSelectPreset = (symbol: string) => {
    setSelectedPreset(symbol);
    if (symbol === 'CUSTOM') return;

    const signal = activeSignals.find((s) => s.symbol === symbol);
    if (signal) {
      setGrade(signal.confidence);
      setUseCustomRisk(false);
      setEntryPrice(signal.preferredEntry);
      setStopLossPrice(signal.stopLoss);
      setDca1Price(signal.dca1);
      setDca2Price(signal.dca2);
      setEnableDca(true);
      setTp1Price(signal.tp1);
      setTp2Price(signal.tp2);
      setTp3Price(signal.tp3);
      setEnableTp(true);
    }
  };

  // Run calculation
  const calcResult = useMemo(() => {
    return calculatePositionSize({
      walletBalance,
      riskPercent: activeRiskPercent,
      entryPrice,
      stopLossPrice,
      dca1Price: enableDca ? dca1Price : undefined,
      dca2Price: enableDca ? dca2Price : undefined,
      maxPositionPercent,
      costs: {
        makerFeePercent: costs.makerFeePercent,
        takerFeePercent: costs.takerFeePercent,
        slippagePercent: costs.slippagePercent,
      },
      takeProfits: enableTp
        ? {
            tp1: tp1Price,
            tp2: tp2Price,
            tp3: tp3Price,
          }
        : undefined,
    });
  }, [
    walletBalance,
    activeRiskPercent,
    entryPrice,
    stopLossPrice,
    enableDca,
    dca1Price,
    dca2Price,
    maxPositionPercent,
    costs,
    enableTp,
    tp1Price,
    tp2Price,
    tp3Price,
  ]);

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Title & Preset Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400">
            <Calculator size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              Position Sizing Calculator
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30">
                Risk Engine
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Derives exact USDT deployment from wallet risk and invalidation distance.
            </p>
          </div>
        </div>

        {/* Quick Signal Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1 font-medium">Load:</span>
          {activeSignals.map((sig) => (
            <button
              key={sig.symbol}
              onClick={() => handleSelectPreset(sig.symbol)}
              className={`
                px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer
                ${
                  selectedPreset === sig.symbol
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 border border-transparent'
                }
              `}
            >
              {sig.symbol.split('/')[0]}
            </button>
          ))}
          <button
            onClick={() => handleSelectPreset('CUSTOM')}
            className={`
              px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer
              ${
                selectedPreset === 'CUSTOM'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 border border-transparent'
              }
            `}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Inputs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Wallet Balance Input */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Wallet Balance (USDT)
          </label>
          <div className="relative">
            <input
              type="number"
              value={walletBalance}
              onChange={(e) => setWalletBalance(parseFloat(e.target.value) || 0)}
              className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
              min={0}
              step={10}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
              USDT
            </span>
          </div>
        </div>

        {/* Setup Grade / Risk % */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-400">
              Setup Grade & Risk
            </label>
            <button
              onClick={() => setUseCustomRisk(!useCustomRisk)}
              className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
            >
              {useCustomRisk ? 'Use Grade' : 'Custom %'}
            </button>
          </div>

          {useCustomRisk ? (
            <div className="relative">
              <input
                type="number"
                value={customRiskPercent}
                onChange={(e) =>
                  setCustomRiskPercent(Math.max(0.1, parseFloat(e.target.value) || 0.1))
                }
                className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
                min={0.1}
                max={10}
                step={0.1}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                %
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {(['A+', 'A', 'B'] as ConfidenceGrade[]).map((g) => {
                const cfg = riskConfigs.find((rc) => rc.grade === g);
                const pct = cfg ? cfg.maxRiskPercent : getDefaultRiskForGrade(g);
                return (
                  <button
                    key={g}
                    onClick={() => setGrade(g)}
                    className={`
                      py-2 px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer border
                      ${
                        grade === g
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                          : 'bg-[var(--surface-3)] text-slate-400 border-transparent hover:border-[var(--glass-border)]'
                      }
                    `}
                  >
                    <span>{g}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Entry Price */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Entry Price ($)
          </label>
          <div className="relative">
            <input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
              step={entryPrice < 10 ? 0.001 : 0.5}
            />
          </div>
        </div>

        {/* Stop Loss Price */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Stop Loss Price ($)
          </label>
          <div className="relative">
            <input
              type="number"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-[var(--surface-3)] border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-sm font-mono text-rose-300 focus:outline-none focus:border-rose-500/60"
              step={stopLossPrice < 10 ? 0.001 : 0.5}
            />
          </div>
        </div>
      </div>

      {/* DCA & TP Expanders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DCA Configuration */}
        <div className="p-4 rounded-xl bg-[var(--surface-2)]/70 border border-[var(--glass-border)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-200">
                DCA Orders (Spec Section 3)
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
              <input
                type="checkbox"
                checked={enableDca}
                onChange={(e) => setEnableDca(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              Enable DCAs
            </label>
          </div>

          {enableDca ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  DCA #1 Price ($)
                </label>
                <input
                  type="number"
                  value={dca1Price}
                  onChange={(e) => setDca1Price(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500/50"
                  step={dca1Price < 10 ? 0.001 : 0.5}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  DCA #2 Price ($)
                </label>
                <input
                  type="number"
                  value={dca2Price}
                  onChange={(e) => setDca2Price(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500/50"
                  step={dca2Price < 10 ? 0.001 : 0.5}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              DCA disabled — 100% position allocated on initial entry.
            </p>
          )}
        </div>

        {/* Take Profit Configuration */}
        <div className="p-4 rounded-xl bg-[var(--surface-2)]/70 border border-[var(--glass-border)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">
                Take Profit Targets
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
              <input
                type="checkbox"
                checked={enableTp}
                onChange={(e) => setEnableTp(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              Calculate TP Profits
            </label>
          </div>

          {enableTp ? (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  TP1 (30%)
                </label>
                <input
                  type="number"
                  value={tp1Price}
                  onChange={(e) => setTp1Price(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--surface-3)] border border-emerald-500/30 rounded-lg px-2.5 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
                  step={tp1Price < 10 ? 0.001 : 0.5}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  TP2 (30%)
                </label>
                <input
                  type="number"
                  value={tp2Price}
                  onChange={(e) => setTp2Price(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--surface-3)] border border-emerald-500/30 rounded-lg px-2.5 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
                  step={tp2Price < 10 ? 0.001 : 0.5}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  TP3 (40%)
                </label>
                <input
                  type="number"
                  value={tp3Price}
                  onChange={(e) => setTp3Price(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[var(--surface-3)] border border-emerald-500/30 rounded-lg px-2.5 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
                  step={tp3Price < 10 ? 0.001 : 0.5}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Take profits disabled — showing position sizing only.
            </p>
          )}
        </div>
      </div>

      {/* Validation Errors */}
      {!calcResult.isValid && calcResult.errors.length > 0 && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={14} className="text-rose-400" />
            Invalid Trade Parameters
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
            {calcResult.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings & Info */}
      {calcResult.isValid && calcResult.warnings.length > 0 && (
        <div className="space-y-1.5">
          {calcResult.warnings.map((w, i) => (
            <div
              key={i}
              className={`
                p-2.5 rounded-xl text-xs flex items-center gap-2
                ${
                  w.severity === 'warning'
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                    : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                }
              `}
            >
              {w.severity === 'warning' ? (
                <AlertTriangle size={13} className="shrink-0" />
              ) : (
                <Info size={13} className="shrink-0" />
              )}
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results Card */}
      {calcResult.isValid && (
        <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--glass-border)] space-y-5">
          {/* Top Key Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">
                Max Risk Budget
              </span>
              <span className="text-lg font-bold font-mono text-slate-200">
                {formatUsd(calcResult.maxRiskUsdt)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {calcResult.riskPercent.toFixed(2)}% of wallet
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">
                Initial Entry Size
              </span>
              <span className="text-lg font-bold font-mono text-cyan-400">
                {formatUsd(calcResult.initialAllocation)}
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">
                {formatNumber(calcResult.initialQuantity, 4)} coins
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">
                Max Deployed
              </span>
              <span className="text-lg font-bold font-mono text-slate-100">
                {formatUsd(calcResult.maxDeployed)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {calcResult.percentOfWallet.toFixed(1)}% of wallet
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">
                Planned Loss at SL
              </span>
              <span className="text-lg font-bold font-mono text-rose-400">
                {formatUsd(calcResult.plannedLossAtSlUsdt)}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Planned max risk
              </span>
            </div>
          </div>

          {/* Tranche Allocation Table */}
          {calcResult.tranches.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sliders size={12} className="text-cyan-400" />
                  Tranche Capital Deployment
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Avg Entry: ${formatNumber(calcResult.averageEntryPrice, 2)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase tracking-wider bg-[var(--surface-2)]/60 border-b border-[var(--glass-border)]">
                      <th className="text-left px-3 py-2">Order</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">USDT Size</th>
                      <th className="text-right px-3 py-2">Quantity</th>
                      <th className="text-right px-3 py-2">% Capital</th>
                      <th className="text-right px-3 py-2">Dist to SL</th>
                      <th className="text-right px-3 py-2">Loss at SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcResult.tranches.map((t) => (
                      <tr
                        key={t.orderName}
                        className="border-b border-[var(--glass-border)]/50 hover:bg-[var(--surface-2)]/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-200">
                          {t.orderName}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                          ${formatNumber(t.price, t.price < 10 ? 4 : 2)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-cyan-400">
                          {formatUsd(t.allocationUsdt)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                          {formatNumber(t.quantityCoins, 4)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                          {t.percentOfTotal}%
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                          {t.distanceToSlPercent}%
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-400">
                          {formatUsd(t.plannedLossUsdt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Take Profit Breakdown */}
          {enableTp && calcResult.takeProfits.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-emerald-400" />
                  Take Profit Targets & R:R Projections
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Total Profit: +{formatUsd(calcResult.totalPotentialNetProfitUsdt)} (R:R {calcResult.riskRewardRatio}R)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {calcResult.takeProfits.map((tp) => (
                  <div
                    key={tp.target}
                    className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-emerald-400">
                        {tp.target}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {tp.portionPercent}% exit
                      </span>
                    </div>
                    <div className="text-sm font-bold font-mono text-slate-200">
                      ${formatNumber(tp.price, tp.price < 10 ? 4 : 2)}
                      <span className="text-[10px] text-emerald-400 font-normal ml-1.5">
                        +{tp.gainPercent}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-emerald-500/15">
                      <span>Net Profit:</span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        +{formatUsd(tp.netProfitUsdt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                      <span>R Multiple:</span>
                      <span className="font-mono text-cyan-400">
                        +{tp.rMultiple.toFixed(1)}R
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Cost Footnote */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-[var(--glass-border)] gap-2">
            <span>
              Calculated with structural price movement & volatility-adjusted risk sizing.
            </span>
            <span className="text-cyan-400 font-medium">
              Section 14 & 51 compliant
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
