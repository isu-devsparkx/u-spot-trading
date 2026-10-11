'use client';

// ─── U-SPOT Strategy Parameters Editor Component ───────────────────────
// Phase 16: Strategy Research Lab (Spec Sections 29, 36)
// Complete interactive parameter authoring for all 9 strategy factors

import { useState } from 'react';
import {
  SlidersHorizontal,
  Activity,
  BarChart2,
  Shield,
  Target,
  Layers,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { StrategyResearchParameters, MarketRegime } from '@/types';
import {
  DEFAULT_STRATEGY_PARAMS,
  STRATEGY_PRESETS,
  validateStrategyParameters,
} from '@/lib/services/strategy-service';

interface StrategyParametersEditorProps {
  parameters: StrategyResearchParameters;
  onChange: (updated: StrategyResearchParameters) => void;
  onSave?: (params: StrategyResearchParameters) => Promise<void>;
  onActivate?: (version: string) => Promise<void>;
  activeVersion?: string | null;
  savedVersions?: Array<{ version: string; name?: string; description?: string }>;
}

const ALL_REGIMES: MarketRegime[] = [
  'BULL',
  'NEUTRAL',
  'HIGH_VOLATILITY',
  'LOW_LIQUIDITY',
  'BEAR',
];

export default function StrategyParametersEditor({
  parameters,
  onChange,
  onSave,
  onActivate,
  activeVersion,
  savedVersions = [],
}: StrategyParametersEditorProps) {
  const [activeCategory, setActiveCategory] = useState<
    'weights' | 'indicators' | 'risk' | 'execution' | 'regimes' | 'mtf'
  >('weights');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  const validation = validateStrategyParameters(parameters);
  const totalWeight = Object.values(parameters.weights).reduce((a, b) => a + b, 0);
  const totalTpAlloc =
    parameters.takeProfit.tp1Alloc +
    parameters.takeProfit.tp2Alloc +
    parameters.takeProfit.tp3Alloc;
  const totalDcaAlloc =
    parameters.dca.entryAlloc +
    parameters.dca.dca1Alloc +
    parameters.dca.dca2Alloc;

  const handleWeightChange = (key: keyof typeof parameters.weights, val: number) => {
    onChange({
      ...parameters,
      weights: {
        ...parameters.weights,
        [key]: val,
      },
    });
  };

  const applyPreset = (preset: StrategyResearchParameters) => {
    onChange({ ...preset });
    setStatusMessage({
      type: 'success',
      text: `Loaded preset "${preset.name}".`,
    });
  };

  const handleSave = async () => {
    if (!onSave) return;
    try {
      setSaving(true);
      await onSave(parameters);
      setStatusMessage({
        type: 'success',
        text: `Strategy "${parameters.name}" (${parameters.version}) saved successfully!`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save strategy version.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!onActivate) return;
    try {
      await onActivate(parameters.version);
      setStatusMessage({
        type: 'success',
        text: `Strategy version ${parameters.version} is now the ACTIVE production strategy!`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'Failed to activate strategy version.',
      });
    }
  };

  const toggleRegime = (regime: MarketRegime) => {
    const current = parameters.regimeFilters.allowedRegimes;
    const exists = current.includes(regime);
    const updated = exists
      ? current.filter((r) => r !== regime)
      : [...current, regime];
    onChange({
      ...parameters,
      regimeFilters: {
        ...parameters.regimeFilters,
        allowedRegimes: updated,
      },
    });
  };

  const isCurrentActive = activeVersion === parameters.version;

  return (
    <div className="space-y-6">
      {/* Top Bar: Presets & Version Header */}
      <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                {parameters.version}
              </span>
              <h2 className="text-base font-bold text-slate-100">{parameters.name}</h2>
              {isCurrentActive && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 size={10} /> Active Production Strategy
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">{parameters.description}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyPreset(DEFAULT_STRATEGY_PARAMS)}
              className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded-xl border border-[var(--glass-border)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} />
              Reset Defaults
            </button>

            {onActivate && !isCurrentActive && (
              <button
                onClick={handleActivate}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl border border-emerald-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Zap size={13} />
                Set as Active
              </button>
            )}

            {onSave && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Save size={13} />
                {saving ? 'Saving...' : 'Save Version'}
              </button>
            )}
          </div>
        </div>

        {/* Preset Chips */}
        <div className="pt-3 border-t border-[var(--glass-border)] flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
            <Sparkles size={12} className="text-cyan-400" /> Presets:
          </span>
          {STRATEGY_PRESETS.map((preset) => (
            <button
              key={preset.version}
              onClick={() => applyPreset(preset)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                parameters.name === preset.name
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-medium'
                  : 'bg-[var(--surface-2)] text-slate-400 border-[var(--glass-border)] hover:text-slate-200'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                : statusMessage.type === 'warning'
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--glass-border)] overflow-x-auto">
        <button
          onClick={() => setActiveCategory('weights')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeCategory === 'weights'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal size={13} />
          <span>Factor Weights ({totalWeight}%)</span>
        </button>

        <button
          onClick={() => setActiveCategory('indicators')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeCategory === 'indicators'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity size={13} />
          <span>EMA & RSI Settings</span>
        </button>

        <button
          onClick={() => setActiveCategory('risk')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeCategory === 'risk'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield size={13} />
          <span>Risk & Volatility (ATR)</span>
        </button>

        <button
          onClick={() => setActiveCategory('execution')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeCategory === 'execution'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Target size={13} />
          <span>TP & DCA Ladders</span>
        </button>

        <button
          onClick={() => setActiveCategory('regimes')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeCategory === 'regimes'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart2 size={13} />
          <span>Market Regime Filters</span>
        </button>

        <button
          onClick={() => setActiveCategory('mtf')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeCategory === 'mtf'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers size={13} />
          <span>MTF Confluence (15M•1H•4H)</span>
        </button>
      </div>

      {/* ─── Category 1: 7-Factor Weights ─── */}
      {activeCategory === 'weights' && (
        <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--glass-border)] gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <SlidersHorizontal size={15} className="text-cyan-400" />
                7-Factor Scoring Weights (Spec Section 5 & 10)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Balances technical indicators into a unified 0–100 Trade Score
              </p>
            </div>
            <div className="text-xs flex items-center gap-2">
              <span className="text-slate-400">Total Sum:</span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded-lg ${
                  totalWeight === 100
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {totalWeight}% {totalWeight === 100 ? '✓' : '(Target: 100%)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { key: 'trend', label: 'Trend Alignment (EMA 20/50/200)', val: parameters.weights.trend, desc: 'Golden crosses, slope, and price position above key moving averages' },
              { key: 'momentum', label: 'Momentum (RSI 14 / MACD)', val: parameters.weights.momentum, desc: 'Wilder RSI expansion, bullish MACD crossovers, and histogram surges' },
              { key: 'volume', label: 'Volume Surge Ratio (MA 20)', val: parameters.weights.volume, desc: 'Volume multiplier versus historical 20-bar baseline' },
              { key: 'structure', label: 'Market Structure (BOS / Pivots)', val: parameters.weights.structure, desc: 'Bullish breaks of structure, higher highs, and liquidity sweeps' },
              { key: 'liquidity', label: 'Order Book Depth & Spread', val: parameters.weights.liquidity, desc: 'Bid-to-ask depth imbalance and tight bid-ask spread' },
              { key: 'volatility', label: 'ATR Volatility Ratio', val: parameters.weights.volatility, desc: 'Normal volatility conditions optimal for trending expansion' },
              { key: 'regime', label: 'Macro Regime Alignment', val: parameters.weights.regime, desc: 'Alignment with broader crypto market sentiment and momentum' },
            ].map((f) => (
              <div
                key={f.key}
                className="p-4 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2.5"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-200 font-semibold">{f.label}</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">{f.val}%</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">{f.desc}</p>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={f.val}
                  onChange={(e) => handleWeightChange(f.key as keyof typeof parameters.weights, Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Category 2: EMA & RSI Settings ─── */}
      {activeCategory === 'indicators' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* EMA Settings */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
            <div className="border-b border-[var(--glass-border)] pb-3">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Activity size={15} className="text-cyan-400" />
                Exponential Moving Averages (EMA)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Defines fast and slow moving average periods for trend detection
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Fast EMA Period</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.ema.fastPeriod} bars</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={parameters.ema.fastPeriod}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      ema: { ...parameters.ema, fastPeriod: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Slow EMA Period</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.ema.slowPeriod} bars</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={1}
                  value={parameters.ema.slowPeriod}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      ema: { ...parameters.ema, slowPeriod: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Macro Trend Filter (EMA 200)</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.ema.trendPeriod} bars</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={300}
                  step={10}
                  value={parameters.ema.trendPeriod}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      ema: { ...parameters.ema, trendPeriod: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* RSI Settings */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
            <div className="border-b border-[var(--glass-border)] pb-3">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <BarChart2 size={15} className="text-cyan-400" />
                Relative Strength Index (RSI)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configures momentum thresholds for overbought and oversold boundaries
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>RSI Lookback Period</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.rsi.period} bars</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={25}
                  step={1}
                  value={parameters.rsi.period}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      rsi: { ...parameters.rsi, period: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Overbought Ceiling</span>
                  <span className="font-mono text-rose-400 font-bold">{parameters.rsi.overbought}</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={85}
                  step={1}
                  value={parameters.rsi.overbought}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      rsi: { ...parameters.rsi, overbought: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-rose-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Oversold Floor</span>
                  <span className="font-mono text-emerald-400 font-bold">{parameters.rsi.oversold}</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={40}
                  step={1}
                  value={parameters.rsi.oversold}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      rsi: { ...parameters.rsi, oversold: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Category 3: Risk & Volatility ─── */}
      {activeCategory === 'risk' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dynamic Risk Allocations */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
            <div className="border-b border-[var(--glass-border)] pb-3">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Shield size={15} className="text-cyan-400" />
                Capital Sizing & Risk per Grade (Spec Section 2 & 14)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Maximum portfolio percentage risked based on setup confidence
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Grade A+ Risk
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">{parameters.risk.gradeAPlusRisk}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={parameters.risk.gradeAPlusRisk}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      risk: { ...parameters.risk, gradeAPlusRisk: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" /> Grade A Risk
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.risk.gradeARisk}%</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={1.5}
                  step={0.05}
                  value={parameters.risk.gradeARisk}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      risk: { ...parameters.risk, gradeARisk: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Grade B Risk
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{parameters.risk.gradeBRisk}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={parameters.risk.gradeBRisk}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      risk: { ...parameters.risk, gradeBRisk: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Hard Max Loss Cap</span>
                  <span className="font-mono text-rose-400 font-bold">{parameters.risk.maxLossCap}%</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={4.0}
                  step={0.1}
                  value={parameters.risk.maxLossCap}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      risk: { ...parameters.risk, maxLossCap: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-rose-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Volatility & Volume Multipliers */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
            <div className="border-b border-[var(--glass-border)] pb-3">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Target size={15} className="text-cyan-400" />
                ATR Stop Loss & Volume Surges
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Controls dynamic distance buffers derived from Average True Range
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>ATR Stop Loss Multiplier</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.volatility.slMultiplier}x ATR</span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={3.0}
                  step={0.1}
                  value={parameters.volatility.slMultiplier}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      volatility: { ...parameters.volatility, slMultiplier: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Higher multipliers widen stop loss distance to resist volatility wicks.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>ATR Period</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.volatility.atrPeriod} bars</span>
                </div>
                <input
                  type="range"
                  min={7}
                  max={28}
                  step={1}
                  value={parameters.volatility.atrPeriod}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      volatility: { ...parameters.volatility, atrPeriod: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Volume Surge Multiplier</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.volume.surgeMultiplier}x MA20</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  value={parameters.volume.surgeMultiplier}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      volume: { ...parameters.volume, surgeMultiplier: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Category 4: Take Profit & DCA Ladders ─── */}
      {activeCategory === 'execution' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Take Profit Ladder */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--glass-border)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Target size={15} className="text-emerald-400" />
                  Take Profit Ladder (Spec Section 13)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Scale-out percentages & R-multiples</p>
              </div>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                  totalTpAlloc === 100
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                Sum: {totalTpAlloc}%
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* TP1 */}
              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>Target 1 (Scale-Out + Breakeven SL Ratchet)</span>
                  <span className="font-mono text-emerald-400 font-bold">{parameters.takeProfit.tp1Alloc}% @ {parameters.takeProfit.tp1RMultiple}R</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Exit Allocation %</label>
                    <input
                      type="number"
                      value={parameters.takeProfit.tp1Alloc}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          takeProfit: { ...parameters.takeProfit, tp1Alloc: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">R-Multiple</label>
                    <input
                      type="number"
                      step={0.1}
                      value={parameters.takeProfit.tp1RMultiple}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          takeProfit: { ...parameters.takeProfit, tp1RMultiple: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* TP2 */}
              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>Target 2 (Core Profit Realization)</span>
                  <span className="font-mono text-emerald-400 font-bold">{parameters.takeProfit.tp2Alloc}% @ {parameters.takeProfit.tp2RMultiple}R</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Exit Allocation %</label>
                    <input
                      type="number"
                      value={parameters.takeProfit.tp2Alloc}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          takeProfit: { ...parameters.takeProfit, tp2Alloc: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">R-Multiple</label>
                    <input
                      type="number"
                      step={0.1}
                      value={parameters.takeProfit.tp2RMultiple}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          takeProfit: { ...parameters.takeProfit, tp2RMultiple: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* TP3 */}
              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>Target 3 (Trend Runner)</span>
                  <span className="font-mono text-emerald-400 font-bold">{parameters.takeProfit.tp3Alloc}% @ {parameters.takeProfit.tp3RMultiple}R</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Exit Allocation %</label>
                    <input
                      type="number"
                      value={parameters.takeProfit.tp3Alloc}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          takeProfit: { ...parameters.takeProfit, tp3Alloc: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">R-Multiple</label>
                    <input
                      type="number"
                      step={0.1}
                      value={parameters.takeProfit.tp3RMultiple}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          takeProfit: { ...parameters.takeProfit, tp3RMultiple: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DCA Tranches */}
          <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--glass-border)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Layers size={15} className="text-cyan-400" />
                  3-Tranche DCA Order Plan (Spec Section 2)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Staggered limit accumulation ladder</p>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={parameters.dca.enabled}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      dca: { ...parameters.dca, enabled: e.target.checked },
                    })
                  }
                  className="rounded border-[var(--glass-border)] text-cyan-500 accent-cyan-400 cursor-pointer"
                />
                <span className="text-slate-300 font-semibold">Enable DCA</span>
              </label>
            </div>

            <div className="space-y-4 text-xs">
              {/* Initial Entry */}
              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>Tranche 1: Initial Entry</span>
                  <span className="font-mono text-cyan-400 font-bold">{parameters.dca.entryAlloc}% of position</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={5}
                  value={parameters.dca.entryAlloc}
                  onChange={(e) =>
                    onChange({
                      ...parameters,
                      dca: { ...parameters.dca, entryAlloc: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* DCA 1 */}
              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>Tranche 2: DCA 1 Limit</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {parameters.dca.dca1Alloc}% @ -{parameters.dca.dca1DropPercent}% drop
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Allocation %</label>
                    <input
                      type="number"
                      value={parameters.dca.dca1Alloc}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          dca: { ...parameters.dca, dca1Alloc: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Drop from Entry %</label>
                    <input
                      type="number"
                      step={0.1}
                      value={parameters.dca.dca1DropPercent}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          dca: { ...parameters.dca, dca1DropPercent: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* DCA 2 */}
              <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>Tranche 3: DCA 2 Limit</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {parameters.dca.dca2Alloc}% @ -{parameters.dca.dca2DropPercent}% drop
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Allocation %</label>
                    <input
                      type="number"
                      value={parameters.dca.dca2Alloc}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          dca: { ...parameters.dca, dca2Alloc: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Drop from Entry %</label>
                    <input
                      type="number"
                      step={0.1}
                      value={parameters.dca.dca2DropPercent}
                      onChange={(e) =>
                        onChange({
                          ...parameters,
                          dca: { ...parameters.dca, dca2DropPercent: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-[var(--surface-0)] border border-[var(--glass-border)] rounded-lg px-2.5 py-1 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Category 5: Market Regime Filters ─── */}
      {activeCategory === 'regimes' && (
        <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-5">
          <div className="border-b border-[var(--glass-border)] pb-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <BarChart2 size={15} className="text-cyan-400" />
              Allowed Market Regimes for Signal Generation (Spec Section 6)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Uncheck regimes where the strategy should completely suppress signal generation to avoid choppy whipsaws
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_REGIMES.map((regime) => {
              const checked = parameters.regimeFilters.allowedRegimes.includes(regime);
              return (
                <div
                  key={regime}
                  onClick={() => toggleRegime(regime)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    checked
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-slate-200'
                      : 'bg-[var(--surface-2)]/40 border-[var(--glass-border)] text-slate-500 hover:text-slate-400'
                  }`}
                >
                  <div className="space-y-1">
                    <span className="text-xs font-bold font-mono">{regime}</span>
                    <p className="text-[11px] text-slate-400">
                      {regime === 'BULL' && 'Strong macro uptrend, higher highs, and positive volume delta.'}
                      {regime === 'NEUTRAL' && 'Balanced consolidation with steady two-way liquidity.'}
                      {regime === 'HIGH_VOLATILITY' && 'Extreme candle range expansions and sharp intraday swings.'}
                      {regime === 'LOW_LIQUIDITY' && 'Thin order books and wide bid-ask spread risk.'}
                      {regime === 'BEAR' && 'Macro downtrends with descending moving average alignment.'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="ml-3 accent-cyan-400 rounded cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Category 6: Multi-Timeframe Confluence (Phase 27) ─── */}
      {activeCategory === 'mtf' && (
        <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--glass-border)] gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Layers size={15} className="text-cyan-400" />
                Multi-Timeframe Confluence Engine (Phase 25 & 27)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aligns 15m execution signals with 1H intermediate and 4H macro trend structure
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium border ${
                parameters.mtf?.enabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-700/50 text-slate-400 border-slate-600'
              }`}
            >
              {parameters.mtf?.enabled ? 'MTF ACTIVE' : 'MTF DISABLED'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Master Toggle */}
            <div className="p-4 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  Enforce Multi-Timeframe Confluence Filtering
                </p>
                <p className="text-[11px] text-slate-400">
                  When enabled, backtesting and live signal scoring check 1H EMA stack & 4H trend alignment.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...parameters,
                    mtf: {
                      ...parameters.mtf,
                      enabled: !parameters.mtf?.enabled,
                      blockCounterTrend: parameters.mtf?.blockCounterTrend ?? true,
                      bonusPoints: parameters.mtf?.bonusPoints ?? 10,
                    },
                  })
                }
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                  parameters.mtf?.enabled ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    parameters.mtf?.enabled ? 'left-6.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Block Counter-Trend Traps Toggle */}
            <div className="p-4 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  Block Counter-Trend Traps (Circuit Breaker)
                </p>
                <p className="text-[11px] text-slate-400">
                  Strictly rejects BUY signals when 1H is in a bear stack or trapped below 1H EMA 200 (where altcoin bounces fail &gt;65%).
                </p>
              </div>
              <button
                type="button"
                disabled={!parameters.mtf?.enabled}
                onClick={() =>
                  onChange({
                    ...parameters,
                    mtf: {
                      ...parameters.mtf,
                      enabled: parameters.mtf?.enabled ?? true,
                      blockCounterTrend: !parameters.mtf?.blockCounterTrend,
                      bonusPoints: parameters.mtf?.bonusPoints ?? 10,
                    },
                  })
                }
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                  !parameters.mtf?.enabled
                    ? 'bg-slate-800 opacity-50 cursor-not-allowed'
                    : parameters.mtf?.blockCounterTrend
                    ? 'bg-cyan-500'
                    : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                    parameters.mtf?.blockCounterTrend ? 'left-6.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Confluence Bonus Points Slider */}
            <div className="p-4 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    Full Confluence Trade Score Bonus
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Additional score points awarded when 15M, 1H, and 4H are all bullishly stacked.
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-cyan-400">
                  +{parameters.mtf?.bonusPoints ?? 10} pts
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                disabled={!parameters.mtf?.enabled}
                value={parameters.mtf?.bonusPoints ?? 10}
                onChange={(e) =>
                  onChange({
                    ...parameters,
                    mtf: {
                      ...parameters.mtf,
                      enabled: parameters.mtf?.enabled ?? true,
                      blockCounterTrend: parameters.mtf?.blockCounterTrend ?? true,
                      bonusPoints: Number(e.target.value),
                    },
                  })
                }
                className="w-full accent-cyan-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
