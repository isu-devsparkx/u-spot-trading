'use client';

// ─── U-SPOT Walk-Forward Workbench Component — Phase 14 ───────────────
// In-Sample training, Out-of-Sample testing, Rolling Window breakdown, WFE gauge

import { useState } from 'react';
import EquityCurveChart from '@/components/backtest/EquityCurveChart';
import {
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Layers,
  BarChart2,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import type { WalkForwardResult, Timeframe, RobustnessGrade } from '@/types';

interface WalkForwardWorkbenchProps {
  symbol: string;
  timeframe: Timeframe;
  barsCount: number;
}

export default function WalkForwardWorkbench({
  symbol,
  timeframe,
  barsCount,
}: WalkForwardWorkbenchProps) {
  const [windowCount, setWindowCount] = useState(3);
  const [trainRatio, setTrainRatio] = useState(0.70);
  const [mtfOptimization, setMtfOptimization] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WalkForwardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/walk-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          totalBars: barsCount,
          windowCount,
          trainRatio,
          initialBalance: 300,
          mtfOptimization,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to complete walk-forward validation');
      }
      setResult(data.result);
    } catch (err: any) {
      console.error('Walk-Forward error:', err);
      setError(err.message || 'Validation request failed');
    } finally {
      setLoading(false);
    }
  };

  const getGradeBadge = (grade: RobustnessGrade) => {
    switch (grade) {
      case 'HIGHLY_ROBUST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck size={14} />
            HIGHLY ROBUST (Deployable)
          </span>
        );
      case 'ROBUST':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <ShieldCheck size={14} />
            ROBUST (Acceptable Edge)
          </span>
        );
      case 'FRAGILE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle size={14} />
            FRAGILE (Parameter Decay)
          </span>
        );
      case 'OVERFIT':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <ShieldAlert size={14} />
            OVERFIT (Curve-Fitted)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration & Trigger */}
      <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Rolling Windows
            </label>
            <select
              value={windowCount}
              onChange={(e) => setWindowCount(Number(e.target.value))}
              className="bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-3 py-1.5 text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value={2}>2 Windows</option>
              <option value={3}>3 Windows (Recommended)</option>
              <option value={4}>4 Windows</option>
              <option value={5}>5 Windows</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Train / Test Split
            </label>
            <select
              value={trainRatio}
              onChange={(e) => setTrainRatio(Number(e.target.value))}
              className="bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-3 py-1.5 text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value={0.60}>60% IS / 40% OOS</option>
              <option value={0.70}>70% IS / 30% OOS (Standard)</option>
              <option value={0.75}>75% IS / 25% OOS</option>
              <option value={0.80}>80% IS / 20% OOS</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              MTF Grid Search
            </label>
            <button
              type="button"
              onClick={() => setMtfOptimization(!mtfOptimization)}
              className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer text-center ${
                mtfOptimization
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                  : 'bg-slate-800/40 text-slate-500 border-slate-700/50'
              }`}
            >
              {mtfOptimization ? '6 MTF Candidates' : '4 Standard Candidates'}
            </button>
          </div>

          <div className="hidden sm:block border-l border-slate-800 pl-4 space-y-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
              Active Parameters
            </span>
            <span className="text-slate-300 font-medium font-mono">
              {symbol} • {timeframe} • {barsCount} bars
            </span>
          </div>
        </div>

        <button
          onClick={runValidation}
          disabled={loading}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs shrink-0"
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Simulating Windows...</span>
            </>
          ) : (
            <>
              <Play size={14} className="fill-current" />
              <span>Run Walk-Forward Validation</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="glass-card rounded-xl p-4 border border-rose-500/30 bg-rose-500/5 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert size={16} className="shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Results View */}
      {result ? (
        <div className="space-y-6">
          {/* Robustness Scorecard Banner */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] bg-gradient-to-br from-slate-900/80 via-slate-950/90 to-cyan-950/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-100">
                    Walk-Forward Robustness Scorecard
                  </h2>
                  {getGradeBadge(result.robustnessGrade)}
                </div>
                <p className="text-xs text-slate-400 max-w-2xl">
                  Walk-Forward Efficiency (WFE) compares Out-of-Sample performance to In-Sample optimization.
                  A high WFE (&gt;50%) confirms genuine algorithmic edge rather than historical overfitting.
                </p>
              </div>

              {/* Main Gauge */}
              <div className="bg-[var(--surface-2)]/80 border border-[var(--glass-border)] px-6 py-3.5 rounded-2xl text-center shrink-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Overall Efficiency (WFE)
                </span>
                <span
                  className={`text-3xl font-black font-mono tracking-tight ${
                    result.overallWFE >= 50
                      ? 'text-emerald-400'
                      : result.overallWFE >= 25
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {result.overallWFE}%
                </span>
              </div>
            </div>

            {/* In-Sample vs Out-of-Sample Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                  Avg Return (IS ➔ OOS)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold font-mono text-slate-400">
                    {result.avgInSampleReturn}%
                  </span>
                  <span className="text-xs text-slate-600">➔</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      result.avgOutOfSampleReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {result.avgOutOfSampleReturn}%
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                  Win Rate (IS ➔ OOS)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold font-mono text-slate-400">
                    {result.avgInSampleWinRate}%
                  </span>
                  <span className="text-xs text-slate-600">➔</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      result.avgOutOfSampleWinRate >= 50 ? 'text-emerald-400' : 'text-slate-200'
                    }`}
                  >
                    {result.avgOutOfSampleWinRate}%
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                  Profit Factor (IS ➔ OOS)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold font-mono text-slate-400">
                    {result.avgInSampleProfitFactor}
                  </span>
                  <span className="text-xs text-slate-600">➔</span>
                  <span
                    className={`text-base font-bold font-mono ${
                      result.avgOutOfSampleProfitFactor >= 1.2 ? 'text-emerald-400' : 'text-slate-200'
                    }`}
                  >
                    {result.avgOutOfSampleProfitFactor}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                  Net OOS Profit
                </span>
                <span
                  className={`text-base font-bold font-mono block ${
                    result.outOfSampleTotalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {result.outOfSampleTotalPnl >= 0 ? '+' : ''}
                  {result.outOfSampleTotalPnl} USDT
                </span>
              </div>
            </div>
          </div>

          {/* Combined Out-of-Sample Equity Curve */}
          <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">
                  Continuous Out-Of-Sample Equity Curve
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {result.combinedOutOfSampleCurve.length} Excursion Points
              </span>
            </div>

            <EquityCurveChart
              equityCurve={result.combinedOutOfSampleCurve}
              initialBalance={result.config.initialBalance}
            />
          </div>

          {/* MTF Confluence Out-of-Sample Alpha Card (Phase 28) */}
          {result.mtfAlphaMetric && (
            <div className="glass-card rounded-2xl p-5 border border-indigo-500/30 bg-gradient-to-r from-indigo-950/30 via-slate-950 to-slate-900/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-indigo-200">
                        Higher-Timeframe Confluence Out-of-Sample Alpha
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {result.mtfAlphaMetric.isMtfSuperior ? 'MTF Alpha Positive' : 'Baseline Comparable'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {result.mtfAlphaMetric.summary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
                  <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 block">WFE Delta</span>
                    <span className={`font-bold ${result.mtfAlphaMetric.wfeDelta >= 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {result.mtfAlphaMetric.wfeDelta >= 0 ? '+' : ''}{result.mtfAlphaMetric.wfeDelta}%
                    </span>
                  </div>
                  <div className="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Saved DD</span>
                    <span className="text-emerald-400 font-bold">
                      +${result.mtfAlphaMetric.counterTrendDrawdownSavedUsdt}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rolling Window Details Breakdown */}
          <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">
                  Rolling Window Performance Breakdown
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                {result.windows.length} Sequential Partitions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Window</th>
                    <th className="py-2.5 px-3">Selected Candidate</th>
                    <th className="py-2.5 px-3">In-Sample Return</th>
                    <th className="py-2.5 px-3">Out-Of-Sample Return</th>
                    <th className="py-2.5 px-3">WFE %</th>
                    <th className="py-2.5 px-3">OOS Trades</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {result.windows.map((w) => (
                    <tr key={w.windowIndex} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-300">
                        Window #{w.windowIndex}
                        <span className="block text-[10px] text-slate-500 font-sans">
                          {w.trainRange.barsCount} IS / {w.testRange.barsCount} OOS
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-cyan-300">
                            {w.selectedCandidate.name}
                          </span>
                          {w.selectedCandidate.mtf?.enabled ? (
                            <span className="text-[10px] font-mono font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                              15M•1H•4H 🛡️
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-800/40 border border-slate-700/40 px-1.5 py-0.5 rounded">
                              Single TF
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={
                            w.inSampleResult.totalReturnPercent >= 0
                              ? 'text-emerald-400 font-semibold'
                              : 'text-rose-400 font-semibold'
                          }
                        >
                          {w.inSampleResult.totalReturnPercent >= 0 ? '+' : ''}
                          {w.inSampleResult.totalReturnPercent}%
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={
                            w.outOfSampleResult.totalReturnPercent >= 0
                              ? 'text-emerald-400 font-semibold'
                              : 'text-rose-400 font-semibold'
                          }
                        >
                          {w.outOfSampleResult.totalReturnPercent >= 0 ? '+' : ''}
                          {w.outOfSampleResult.totalReturnPercent}%
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-bold ${
                            w.windowEfficiency >= 50
                              ? 'text-emerald-400'
                              : w.windowEfficiency >= 25
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {w.windowEfficiency}%
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-300">
                        {w.outOfSampleResult.trades.length} trades
                        <span className="block text-[10px] text-slate-500 font-mono">
                          WR: {w.outOfSampleResult.stats.winRate}%
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans">
                        {w.isRobust ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 size={13} />
                            Robust
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                            <XCircle size={13} />
                            Degraded
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actionable Strategy Recommendations */}
          <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-200">
                Diagnostic Observations & Recommendations
              </h3>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              {result.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 border border-[var(--glass-border)] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
            <Layers size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-200">
            Ready for Walk-Forward Stress Testing
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click <strong>Run Walk-Forward Validation</strong> to partition {barsCount} historical bars into {windowCount} rolling in-sample training and out-of-sample testing windows.
          </p>
        </div>
      )}
    </div>
  );
}
