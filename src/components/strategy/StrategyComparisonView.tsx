'use client';

// ─── U-SPOT Strategy Comparison View Component ─────────────────────────
// Phase 16: Strategy Research Lab (Spec Sections 29, 36)
// Side-by-side strategy backtest comparison with dual equity curve overlay

import { useState } from 'react';
import {
  Trophy,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Scale,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Target,
  Shield,
  Layers,
  HelpCircle,
} from 'lucide-react';
import type {
  StrategyResearchParameters,
  StrategyComparisonResult,
  StrategyComparisonMetricDelta,
  Timeframe,
} from '@/types';
import {
  DEFAULT_STRATEGY_PARAMS,
  PRESET_TREND_FOLLOWER,
  PRESET_MOMENTUM_SCALPER,
  PRESET_CONSERVATIVE,
  PRESET_BREAKOUT_HUNTER,
  STRATEGY_PRESETS,
} from '@/lib/services/strategy-service';

interface StrategyComparisonViewProps {
  currentCustomParams: StrategyResearchParameters;
  symbol: string;
  timeframe: Timeframe;
  barsCount: number;
}

export default function StrategyComparisonView({
  currentCustomParams,
  symbol,
  timeframe,
  barsCount,
}: StrategyComparisonViewProps) {
  const [versionA, setVersionA] = useState<StrategyResearchParameters>(DEFAULT_STRATEGY_PARAMS);
  const [versionB, setVersionB] = useState<StrategyResearchParameters>(PRESET_TREND_FOLLOWER);
  const [comparison, setComparison] = useState<StrategyComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runComparison = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/strategy/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionA,
          versionB,
          symbol,
          timeframe,
          barsCount,
        }),
      });

      const json = await res.json();
      if (json.success && json.comparison) {
        setComparison(json.comparison);
      } else {
        throw new Error(json.error || 'Failed to compare strategies');
      }
    } catch (err) {
      console.error('Failed to run comparison:', err);
      setError(err instanceof Error ? err.message : 'Unknown comparison error');
    } finally {
      setLoading(false);
    }
  };

  const getPresetList = () => [
    { label: 'Current Editor Parameters', params: currentCustomParams },
    ...STRATEGY_PRESETS.map((p) => ({ label: `${p.name} (${p.version})`, params: p })),
  ];

  return (
    <div className="space-y-6">
      {/* ─── Control Bar: Strategy Selectors & Trigger ─── */}
      <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Scale size={16} className="text-cyan-400" />
              Side-by-Side Strategy Comparison Workbench (Spec Section 29)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate two strategy configurations over identical market data to isolate statistical edge
            </p>
          </div>

          <button
            onClick={runComparison}
            disabled={loading}
            className="btn-primary px-5 py-2 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10 whitespace-nowrap"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Evaluating Simulations...' : 'Run Comparative Evaluation'}
          </button>
        </div>

        {/* Strategy Version Pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[var(--glass-border)]">
          {/* Strategy A */}
          <div className="p-3.5 rounded-xl bg-[var(--surface-2)]/50 border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Strategy A (Baseline)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{versionA.version}</span>
            </div>
            <select
              value={versionA.name}
              onChange={(e) => {
                const selected = getPresetList().find((p) => p.params.name === e.target.value);
                if (selected) setVersionA(selected.params);
              }}
              className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
            >
              {getPresetList().map((p) => (
                <option key={p.label} value={p.params.name} className="bg-slate-900">
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 line-clamp-1">{versionA.description}</p>
          </div>

          {/* Strategy B */}
          <div className="p-3.5 rounded-xl bg-[var(--surface-2)]/50 border border-violet-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400" /> Strategy B (Candidate)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{versionB.version}</span>
            </div>
            <select
              value={versionB.name}
              onChange={(e) => {
                const selected = getPresetList().find((p) => p.params.name === e.target.value);
                if (selected) setVersionB(selected.params);
              }}
              className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
            >
              {getPresetList().map((p) => (
                <option key={p.label} value={p.params.name} className="bg-slate-900">
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 line-clamp-1">{versionB.description}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ─── Comparison Results View ─── */}
      {comparison && (
        <div className="space-y-6">
          {/* Winner Hero Banner */}
          <div
            className={`glass-card rounded-2xl p-5 border relative overflow-hidden ${
              comparison.winner === 'B'
                ? 'border-violet-500/40 bg-gradient-to-r from-violet-950/20 via-[var(--surface-1)] to-transparent'
                : comparison.winner === 'A'
                ? 'border-cyan-500/40 bg-gradient-to-r from-cyan-950/20 via-[var(--surface-1)] to-transparent'
                : 'border-[var(--glass-border)]'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      comparison.winner === 'B'
                        ? 'bg-violet-500/20 text-violet-400'
                        : comparison.winner === 'A'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-slate-500/20 text-slate-400'
                    }`}
                  >
                    <Trophy size={16} />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Comparative Edge Verdict
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      comparison.winner === 'B'
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        : comparison.winner === 'A'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-slate-500/20 text-slate-300'
                    }`}
                  >
                    {comparison.winner === 'B'
                      ? 'Strategy B Wins'
                      : comparison.winner === 'A'
                      ? 'Strategy A Wins'
                      : 'Statistical Tie'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-200">{comparison.summary}</p>
              </div>

              {/* Edge Score Badge */}
              <div className="flex items-center gap-3 bg-[var(--surface-2)]/60 px-4 py-2.5 rounded-xl border border-[var(--glass-border)] self-start md:self-auto">
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase block">Score A</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">{comparison.scoreA}</span>
                </div>
                <span className="text-xs text-slate-600 font-bold">vs</span>
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 uppercase block">Score B</span>
                  <span className="text-xs font-mono font-bold text-violet-400">{comparison.scoreB}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Dual Equity Curve Comparison (SVG Overlay) */}
          <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <TrendingUp size={14} className="text-cyan-400" />
                  Dual Equity Curve Overlay (Historical Progression)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Portfolio balance evolution starting at $300 USDT over identical bars
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-cyan-400 rounded-full" />
                  <span className="text-cyan-300">{comparison.versionA.config.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-violet-400 rounded-full" />
                  <span className="text-violet-300">{comparison.versionB.config.name}</span>
                </div>
              </div>
            </div>

            {/* Overlaid SVG Equity Curves */}
            <div className="h-48 w-full bg-[var(--surface-0)] rounded-xl border border-[var(--glass-border)] p-2 relative flex items-center justify-center">
              {renderDualEquityChart(comparison)}
            </div>
          </div>

          {/* Side-by-Side Comparison Scorecard Table */}
          <div className="glass-card rounded-2xl border border-[var(--glass-border)] overflow-hidden">
            <div className="p-4 bg-[var(--surface-1)] border-b border-[var(--glass-border)]">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <BarChart3 size={14} className="text-cyan-400" />
                Performance Comparison Matrix (Statistical Edge Breakdown)
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] bg-[var(--surface-2)]/40 text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-semibold">Evaluation Metric</th>
                    <th className="py-2.5 px-4 font-semibold text-right text-cyan-400">
                      Strategy A ({comparison.versionA.config.version})
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-right text-violet-400">
                      Strategy B ({comparison.versionB.config.version})
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-right">Delta (B vs A)</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Advantage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)] font-mono">
                  {comparison.metrics.map((m) => (
                    <tr key={m.metric} className="hover:bg-[var(--surface-2)]/30 transition-colors">
                      <td className="py-3 px-4 font-sans font-medium text-slate-200">
                        {m.label}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300 font-bold">
                        {formatValue(m.versionAValue, m.format)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300 font-bold">
                        {formatValue(m.versionBValue, m.format)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          m.delta > 0
                            ? 'text-emerald-400'
                            : m.delta < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {m.delta > 0 ? '+' : ''}
                        {formatValue(m.delta, m.format)}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        {m.better === 'B' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                            Strategy B
                          </span>
                        ) : m.better === 'A' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            Strategy A
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-bold">Equal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actionable Recommendations Card */}
          {comparison.recommendations.length > 0 && (
            <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                Key Strategic Takeaways & Deployment Recommendations
              </h4>
              <ul className="space-y-2 text-xs text-slate-300">
                {comparison.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Format Metric Helper ─────────────────────────────────────────────

function formatValue(
  val: number,
  format: 'currency' | 'percent' | 'number' | 'ratio'
): string {
  switch (format) {
    case 'currency':
      return `$${val.toFixed(2)}`;
    case 'percent':
      return `${val.toFixed(1)}%`;
    case 'ratio':
      return val.toFixed(2);
    default:
      return String(val);
  }
}

// ─── Dual Equity Chart SVG Renderer ───────────────────────────────────

function renderDualEquityChart(comparison: StrategyComparisonResult) {
  const curveA = comparison.versionA.result.equityCurve;
  const curveB = comparison.versionB.result.equityCurve;

  const pointsCount = Math.max(curveA.length, curveB.length);
  if (pointsCount < 2) {
    return (
      <div className="text-xs text-slate-500">
        Insufficient simulated equity data points for visual plotting.
      </div>
    );
  }

  const allEquities = [
    ...curveA.map((p) => p.equityUsdt),
    ...curveB.map((p) => p.equityUsdt),
    300,
  ];
  const minEquity = Math.min(...allEquities) * 0.98;
  const maxEquity = Math.max(...allEquities) * 1.02;
  const range = maxEquity - minEquity || 1;

  const width = 800;
  const height = 180;
  const padding = 20;

  const getPointsString = (curve: typeof curveA) => {
    if (curve.length === 0) return '';
    return curve
      .map((p, idx) => {
        const x = padding + (idx / Math.max(curve.length - 1, 1)) * (width - 2 * padding);
        const y = height - padding - ((p.equityUsdt - minEquity) / range) * (height - 2 * padding);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const polylineA = getPointsString(curveA);
  const polylineB = getPointsString(curveB);

  // Baseline $300 Y
  const baselineY =
    height - padding - ((300 - minEquity) / range) * (height - 2 * padding);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {/* Baseline $300 */}
      <line
        x1={padding}
        y1={baselineY}
        x2={width - padding}
        y2={baselineY}
        stroke="rgba(148, 163, 184, 0.2)"
        strokeDasharray="4 4"
      />
      <text
        x={width - padding}
        y={baselineY - 4}
        textAnchor="end"
        fill="#94a3b8"
        fontSize="9"
        fontFamily="monospace"
      >
        $300 Initial
      </text>

      {/* Curve A (Cyan) */}
      {polylineA && (
        <polyline
          fill="none"
          stroke="#06b6d4"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylineA}
        />
      )}

      {/* Curve B (Violet) */}
      {polylineB && (
        <polyline
          fill="none"
          stroke="#a855f7"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={polylineA === polylineB ? '4 4' : 'none'}
          points={polylineB}
        />
      )}
    </svg>
  );
}
