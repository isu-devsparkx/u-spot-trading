'use client';

// ─── U-SPOT AI Strategy Factor Optimizer Workbench — Phase 40 ─────────────
// Interactive Workbench: Objective selection, before-vs-after factor weight comparison,
// simulation delta scorecard, AI synthesis insights, and one-click application to active strategy.

import { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  Sliders,
  CheckCircle2,
  TrendingUp,
  Target,
  ShieldCheck,
  Zap,
  Info,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Award,
  Layers,
  ChevronRight,
  Check,
} from 'lucide-react';
import type {
  OptimizationObjective,
  SignalWeights,
  AiStrategyOptimizationReport,
} from '@/types';
import { DEFAULT_SIGNAL_WEIGHTS } from '@/lib/services/signal-engine';

interface AiStrategyOptimizerWorkbenchProps {
  currentWeights: SignalWeights;
  onApplyWeights: (weights: SignalWeights) => void;
  onRunBacktestWithWeights?: (weights: SignalWeights) => void;
}

const OBJECTIVES: { id: OptimizationObjective; label: string; desc: string; icon: any }[] = [
  {
    id: 'MAX_EXPECTANCY',
    label: 'Max Expectancy',
    desc: 'Maximizes mathematical edge E(R) per trade',
    icon: Target,
  },
  {
    id: 'MAX_PROFIT_FACTOR',
    label: 'Max Profit Factor',
    desc: 'Maximizes gross profit to gross loss ratio',
    icon: TrendingUp,
  },
  {
    id: 'MAX_WIN_RATE',
    label: 'Max Win Rate',
    desc: 'Maximizes target hits and minimizes stop-outs',
    icon: Award,
  },
  {
    id: 'MIN_DRAWDOWN',
    label: 'Min Drawdown',
    desc: 'Capital preservation & volatility defense',
    icon: ShieldCheck,
  },
  {
    id: 'BALANCED_ALPHA',
    label: 'Balanced Alpha',
    desc: 'Multi-factor equilibrium across all modules',
    icon: Brain,
  },
];

const FACTOR_LABELS: Record<keyof SignalWeights, { label: string; color: string }> = {
  trend: { label: 'Trend (EMA)', color: 'from-emerald-500 to-teal-400' },
  momentum: { label: 'Momentum (RSI/MACD)', color: 'from-cyan-500 to-blue-400' },
  volume: { label: 'Volume (OBV/Surge)', color: 'from-blue-500 to-indigo-400' },
  structure: { label: 'Structure (BOS/Pivots)', color: 'from-purple-500 to-pink-400' },
  liquidity: { label: 'Liquidity (Order Book)', color: 'from-amber-500 to-orange-400' },
  volatility: { label: 'Volatility (ATR)', color: 'from-rose-500 to-red-400' },
  regime: { label: 'Market Regime', color: 'from-emerald-400 to-cyan-400' },
};

export default function AiStrategyOptimizerWorkbench({
  currentWeights,
  onApplyWeights,
  onRunBacktestWithWeights,
}: AiStrategyOptimizerWorkbenchProps) {
  const [objective, setObjective] = useState<OptimizationObjective>('MAX_EXPECTANCY');
  const [report, setReport] = useState<AiStrategyOptimizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const runOptimization = async (selectedObjective = objective) => {
    try {
      setLoading(true);
      setError(null);
      setApplied(false);

      const res = await fetch('/api/strategy/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: selectedObjective,
          originalWeights: currentWeights,
        }),
      });

      const json = await res.json();
      if (json.success && json.report) {
        setReport(json.report);
      } else {
        throw new Error(json.error || 'Failed to run factor optimization');
      }
    } catch (err) {
      console.error('Error running AI optimization:', err);
      setError(err instanceof Error ? err.message : 'Unknown optimization error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runOptimization(objective);
  }, [objective]);

  const handleApply = () => {
    if (!report) return;
    onApplyWeights(report.optimizedWeights);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  const handleRunBacktest = () => {
    if (!report || !onRunBacktestWithWeights) return;
    onRunBacktestWithWeights(report.optimizedWeights);
  };

  const weightsSum = report
    ? Object.values(report.optimizedWeights).reduce((a, b) => a + b, 0)
    : 100;

  return (
    <div className="space-y-6">
      {/* ─── Hero Header & Objective Selection ─── */}
      <div className="glass-card rounded-2xl p-6 border border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 via-[var(--surface-1)] to-[var(--surface-1)] relative overflow-hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Brain size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  AI Strategy Synthesis & Factor Weight Optimizer
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                  <Sparkles size={10} /> Phase 40 Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluates historical signal factor correlations and derives the mathematical optimal weight vector.
              </p>
            </div>
          </div>

          <button
            onClick={() => runOptimization(objective)}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Synthesizing...' : 'Re-Optimize Weights'}
          </button>
        </div>

        {/* Objective Chips */}
        <div className="pt-2 border-t border-[var(--glass-border)]">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-2">
            Select Optimization Target Objective:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {OBJECTIVES.map((obj) => {
              const Icon = obj.icon;
              const isSelected = objective === obj.id;
              return (
                <button
                  key={obj.id}
                  onClick={() => setObjective(obj.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/40'
                      : 'bg-[var(--surface-2)]/60 border-[var(--glass-border)] hover:bg-[var(--surface-2)] text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={16} className={isSelected ? 'text-cyan-400' : 'text-slate-500'} />
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                  </div>
                  <div className="mt-2">
                    <span
                      className={`text-xs font-bold block ${
                        isSelected ? 'text-cyan-300' : 'text-slate-200'
                      }`}
                    >
                      {obj.label}
                    </span>
                    <span className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{obj.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle size={15} className="text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Simulation Delta Scorecard ─── */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)] bg-[var(--surface-1)]">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Expectancy Delta
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-emerald-400">
                +{report.simulation.expectancyDelta}R
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ({report.simulation.baselineExpectancy}R → {report.simulation.optimizedExpectancy}R)
              </span>
            </div>
            <span className="text-[10px] text-emerald-400/80 block mt-1">
              Mathematical edge expansion per trade
            </span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)] bg-[var(--surface-1)]">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Win Rate Delta
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-emerald-400">
                +{report.simulation.winRateDelta}%
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ({report.simulation.baselineWinRate}% → {report.simulation.optimizedWinRate}%)
              </span>
            </div>
            <span className="text-[10px] text-emerald-400/80 block mt-1">
              Estimated target hit accuracy increase
            </span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)] bg-[var(--surface-1)]">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Profit Factor Delta
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-cyan-400">
                +{report.simulation.profitFactorDelta}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ({report.simulation.baselineProfitFactor} → {report.simulation.optimizedProfitFactor})
              </span>
            </div>
            <span className="text-[10px] text-cyan-400/80 block mt-1">
              Gross profit to loss ratio improvement
            </span>
          </div>

          <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)] bg-[var(--surface-1)]">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              Net Alpha Projection
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-emerald-400">
                +${Math.round(report.simulation.netPnlDelta)}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                (+${Math.round(report.simulation.optimizedNetPnlUsdt)})
              </span>
            </div>
            <span className="text-[10px] text-emerald-400/80 block mt-1">
              Simulated net USDT portfolio expansion
            </span>
          </div>
        </div>
      )}

      {/* ─── Factor Weights Comparison Grid (Before vs After) ─── */}
      {report && (
        <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sliders size={16} className="text-cyan-400" />
                7-Factor Weight Redistribution Vector
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparison between your current strategy weights and the AI optimized vector (Floor: 5%, Ceiling: 45%).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                Sum: <strong className="text-slate-200">{weightsSum}%</strong>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 size={10} /> Valid 100%
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {report.adjustments.map((adj) => {
              const meta = FACTOR_LABELS[adj.factor];
              const isPositive = adj.delta > 0;
              const isZero = adj.delta === 0;

              return (
                <div
                  key={adj.factor}
                  className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2 hover:bg-[var(--surface-2)] transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{meta.label}</span>
                      <span className="text-[10px] text-slate-500">
                        (Win Avg: {adj.winAvgScore} vs Loss Avg: {adj.lossAvgScore})
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 font-mono text-[11px]">
                        Current: <strong>{adj.originalWeight}%</strong>
                      </span>
                      <ArrowRight size={12} className="text-slate-600" />
                      <span className="text-cyan-300 font-mono font-bold text-[11px]">
                        Optimized: <strong>{adj.optimizedWeight}%</strong>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          isPositive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isZero
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {adj.delta}%
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar Comparison */}
                  <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden flex">
                    <div
                      className={`h-full bg-gradient-to-r ${meta.color} transition-all duration-500`}
                      style={{ width: `${adj.optimizedWeight}%` }}
                    />
                  </div>

                  <p className="text-[10px] text-slate-400">{adj.rationale}</p>
                </div>
              );
            })}
          </div>

          {/* Action Toolbar */}
          <div className="pt-4 border-t border-[var(--glass-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Info size={14} className="text-cyan-400" />
              <span>Applying will update active strategy weights in the Strategy Lab session.</span>
            </div>

            <div className="flex items-center gap-2">
              {onRunBacktestWithWeights && (
                <button
                  onClick={handleRunBacktest}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                >
                  Simulate in Backtester
                </button>
              )}

              <button
                onClick={handleApply}
                disabled={applied}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  applied
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                }`}
              >
                {applied ? (
                  <>
                    <Check size={14} /> Applied Successfully!
                  </>
                ) : (
                  <>
                    <Zap size={14} /> Apply to Active Strategy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── AI Synthesis Insights Commentary Card ─── */}
      {report && (
        <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Brain size={16} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100">AI Quantitative Synthesis Insights</h4>
              <span className="text-[10px] text-slate-500 font-mono">
                Engine: {report.model} • Sample size: {report.sampleTradesCount} closed setups
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--surface-2)]/80 border border-[var(--glass-border)] text-xs text-slate-300 leading-relaxed">
            {report.aiSynthesis.summary}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Key Strengths */}
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] space-y-2">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Optimization Strengths
              </span>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                {report.aiSynthesis.keyStrengths.map((str, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-emerald-400">•</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Regime-Specific Guidance */}
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] space-y-2">
              <span className="text-[10px] uppercase font-bold text-cyan-400 block flex items-center gap-1.5">
                <Target size={12} /> Regime Tactical Execution
              </span>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                {report.aiSynthesis.regimeSpecificAdvice.map((adv, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-cyan-400">•</span>
                    <span>{adv}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommended Setup Bias */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--glass-border)]">
            <span className="text-[10px] uppercase font-semibold text-slate-400">
              Recommended Setup Biases:
            </span>
            {report.aiSynthesis.recommendedSetupBias.map((setup) => (
              <span
                key={setup}
                className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
              >
                {setup.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
