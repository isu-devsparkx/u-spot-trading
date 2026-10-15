// ─── U-SPOT Performance Overview — Phase 7 ──────────────────────────
// Spec Section 27: Complete performance dashboard
// Includes TP rates, R metrics, MFE/MAE, expectancy, breakdowns by confidence/regime

import type { PerformanceStats } from '@/types';
import { TrendingUp, TrendingDown, BarChart2, Target, Zap, RefreshCw, Clock } from 'lucide-react';

interface PerformanceOverviewProps {
  stats?: PerformanceStats | null;
  isLoading?: boolean;
}

function StatBox({
  label,
  value,
  sub,
  color = 'text-slate-200',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PerformanceOverview({ stats, isLoading = false }: PerformanceOverviewProps) {
  if (isLoading || !stats) {
    return (
      <div className="glass-card rounded-2xl p-5 space-y-6 animate-fade-in-delay-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">Performance Overview</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Live strategy performance engine & statistical expectancy
          </p>
        </div>
        <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
          <span className="text-xs font-medium">Loading live performance metrics...</span>
        </div>
      </div>
    );
  }

  const expectancyColor =
    (stats.expectancy ?? 0) > 0.5
      ? 'text-emerald-400'
      : (stats.expectancy ?? 0) > 0
      ? 'text-amber-400'
      : 'text-rose-400';

  const toPct = (val: number | undefined | null) => {
    if (val == null) return 0;
    return val <= 1 && val > 0 ? val * 100 : val;
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-6 animate-fade-in-delay-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-200">Performance Overview</h2>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Live strategy performance engine & statistical expectancy
        </p>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        <StatBox
          label="TP1 Rate"
          value={`${toPct(stats.tp1Rate).toFixed(0)}%`}
          sub="Signals reaching TP1"
          color="text-emerald-400"
        />
        <StatBox
          label="Avg R"
          value={`${stats.avgR > 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
          sub={`Median ${stats.medianR.toFixed(1)}R`}
          color={stats.avgR > 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
        <StatBox
          label="Profit Factor"
          value={stats.profitFactor.toFixed(2)}
          sub="Gross wins / Gross losses"
          color={
            stats.profitFactor > 2
              ? 'text-emerald-400'
              : stats.profitFactor > 1.5
              ? 'text-amber-400'
              : 'text-rose-400'
          }
        />
        <StatBox
          label="Expectancy"
          value={`${(stats.expectancy ?? 0) > 0 ? '+' : ''}${(stats.expectancy ?? 0).toFixed(2)}R`}
          sub="Edge per trade"
          color={expectancyColor}
        />
        <StatBox
          label="Max Drawdown"
          value={`${Math.min(100, Math.abs(stats.maxDrawdown)).toFixed(1)}%`}
          sub="Worst equity dip"
          color="text-rose-400"
        />
        <StatBox
          label="SL Rate"
          value={`${toPct(stats.slRate).toFixed(0)}%`}
          sub="Signals stopped out"
          color={toPct(stats.slRate) < 30 ? 'text-amber-400' : 'text-rose-400'}
        />
        <StatBox
          label="Avg Hold"
          value={stats.avgHoldingTime}
          sub="Entry → close"
          color="text-slate-300"
        />
        <StatBox
          label="Net P&L"
          value={stats.totalNetPnlUsdt != null ? `$${stats.totalNetPnlUsdt.toFixed(1)}` : '—'}
          sub="Realized P&L"
          color={(stats.totalNetPnlUsdt ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
      </div>

      {/* TP Rate Bars */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Target size={11} className="text-cyan-400" /> TP Ladder Rates
        </p>
        <div className="space-y-2">
          {[
            { label: 'TP1', rate: toPct(stats.tp1Rate), color: 'bg-emerald-400/80' },
            { label: 'TP2', rate: toPct(stats.tp2Rate), color: 'bg-emerald-400/60' },
            { label: 'TP3', rate: toPct(stats.tp3Rate), color: 'bg-emerald-400/40' },
            { label: 'SL', rate: toPct(stats.slRate), color: 'bg-rose-400/70' },
            { label: 'EXP', rate: toPct(stats.expiryRate), color: 'bg-slate-500/50' },
          ].map((tp) => (
            <div key={tp.label} className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 w-8 shrink-0">{tp.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${tp.color} transition-all`}
                  style={{ width: `${Math.min(100, Math.max(0, tp.rate))}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400 w-9 text-right shrink-0">
                {tp.rate.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* MFE / MAE (Spec §22) */}
      {(stats.avgMfe != null || stats.avgMae != null) && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp size={11} className="text-cyan-400" /> MFE / MAE Averages (Spec §22)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/20">
              <p className="text-[10px] text-slate-500 mb-1">Avg Max Favorable Excursion</p>
              <p className="font-mono text-emerald-400 font-bold text-lg">
                +{(stats.avgMfe ?? 0).toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">Best price seen after entry</p>
            </div>
            <div className="bg-rose-500/5 rounded-xl p-3 border border-rose-500/20">
              <p className="text-[10px] text-slate-500 mb-1">Avg Max Adverse Excursion</p>
              <p className="font-mono text-rose-400 font-bold text-lg">
                {(stats.avgMae ?? 0).toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">Worst drawdown seen in trade</p>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown by Confidence */}
      {stats.byConfidence && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap size={11} className="text-cyan-400" /> By Grade (Spec §25)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(stats.byConfidence).map(([grade, d]) => (
              <div
                key={grade}
                className="bg-[var(--surface-2)]/50 rounded-xl p-3 border border-[var(--glass-border)]/60 text-center"
              >
                <p
                  className={`text-base font-bold mb-1 ${
                    grade === 'A+'
                      ? 'text-yellow-400'
                      : grade === 'A'
                      ? 'text-emerald-400'
                      : 'text-sky-400'
                  }`}
                >
                  {grade}
                </p>
                <p className="text-[10px] text-slate-500">{d.count} signals</p>
                <p className="text-xs font-mono text-emerald-400 mt-1">
                  +{d.avgR.toFixed(1)}R avg
                </p>
                <p className="text-[10px] text-slate-500">
                  {toPct(d.winRate).toFixed(0)}% win
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown by Setup Type */}
      {stats.bySetupType && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingDown size={11} className="text-cyan-400" /> By Setup Type (Spec §25)
          </p>
          <div className="space-y-2">
            {Object.entries(stats.bySetupType)
              .sort((a, b) => b[1].avgR - a[1].avgR)
              .map(([setup, d]) => (
                <div
                  key={setup}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--glass-border)]/40 last:border-0"
                >
                  <div>
                    <span className="text-slate-300 font-medium">{setup.replace(/_/g, ' ')}</span>
                    <span className="text-slate-600 text-[10px] ml-2">({d.count})</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-slate-500 text-[10px]">{toPct(d.winRate).toFixed(0)}% win</span>
                    <span className="font-mono text-emerald-400 font-bold w-12 text-right">
                      +{d.avgR.toFixed(1)}R
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Phase status note */}
      <div className="pt-2 border-t border-[var(--glass-border)]/50">
        <p className="text-[10px] text-slate-500">
          Post-trade evaluation engine active. MFE/MAE excursions, realized R, SL causality & counterfactuals computed automatically.
        </p>
      </div>
    </div>
  );
}
