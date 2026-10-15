'use client';

// ─── U-SPOT Strategy Lab & Backtest Workbench — Phase 13 ─────────────────
// Spec Section 30: Historical Simulation & Backtesting
// Spec Section 32: Realistic Fees, Slippage & Spread Accounting
// Spec Section 33: Strictly No Look-Ahead Bias

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import EquityCurveChart from '@/components/backtest/EquityCurveChart';
import WalkForwardWorkbench from '@/components/backtest/WalkForwardWorkbench';
import StrategyParametersEditor from '@/components/strategy/StrategyParametersEditor';
import StrategyComparisonView from '@/components/strategy/StrategyComparisonView';
import AiStrategyOptimizerWorkbench from '@/components/strategy/AiStrategyOptimizerWorkbench';
import {
  FlaskConical,
  Play,
  RefreshCw,
  TrendingUp,
  SlidersHorizontal,
  Target,
  ShieldAlert,
  BarChart3,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Settings2,
  Sliders,
  DollarSign,
  Compass,
  Scale,
  Brain,
} from 'lucide-react';
import type {
  BacktestResult,
  BacktestConfig,
  SignalWeights,
  Timeframe,
  StrategyResearchParameters,
  StrategyVersionRecord,
} from '@/types';
import { mockMarketRegime } from '@/lib/mock-data';
import { DEFAULT_STRATEGY_PARAMS } from '@/lib/services/strategy-service';

const SUPPORTED_SYMBOLS = ['SOL/USDT', 'BTC/USDT', 'ETH/USDT', 'DOGE/USDT', 'XRP/USDT', 'BNB/USDT'];
const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export default function StrategyLabPage() {
  const [activeTab, setActiveTab] = useState<'backtest' | 'walk-forward' | 'ai-optimizer' | 'parameters' | 'compare'>('backtest');

  // Backtest Config State
  const [symbol, setSymbol] = useState('SOL/USDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [barsCount, setBarsCount] = useState(200);
  const [walletBalance, setWalletBalance] = useState(300);
  const [dcaEnabled, setDcaEnabled] = useState(true);
  const [breakevenTrigger, setBreakevenTrigger] = useState(true);
  const [mtfEnabled, setMtfEnabled] = useState(true);

  // Strategy Lab Parameters & Version State (Phase 16)
  const [strategyParams, setStrategyParams] = useState<StrategyResearchParameters>(DEFAULT_STRATEGY_PARAMS);
  const [activeVersion, setActiveVersion] = useState<string | null>('v1.0.0');
  const [savedVersions, setSavedVersions] = useState<StrategyVersionRecord[]>([]);

  // Custom Weights State
  const [weights, setWeights] = useState<SignalWeights>(DEFAULT_STRATEGY_PARAMS.weights);

  // Backtest Execution State
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTradeFilter, setSelectedTradeFilter] = useState<string>('ALL');

  const runSimulation = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          barsCount,
          initialWalletBalance: walletBalance,
          dcaEnabled,
          breakevenTrigger,
          mtfEnabled,
          weights,
        }),
      });

      const json = await res.json();
      if (json.success && json.result) {
        setResult(json.result);
      } else {
        throw new Error(json.error || 'Backtest failed');
      }
    } catch (err) {
      console.error('Failed to run simulation:', err);
      setError(err instanceof Error ? err.message : 'Unknown simulation error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategyData = async () => {
    try {
      const res = await fetch('/api/strategy');
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.activeVersion) {
          setActiveVersion(json.data.activeVersion.version);
        }
        if (json.data.versions) {
          setSavedVersions(json.data.versions);
        }
      }
    } catch (err) {
      console.warn('Failed to load strategy versions:', err);
    }
  };

  const handleSaveStrategy = async (params: StrategyResearchParameters) => {
    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'version',
        parameters: params,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to save version');
    }
    await fetchStrategyData();
  };

  const handleActivateStrategy = async (ver: string) => {
    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'activate',
        versionName: ver,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to activate version');
    }
    setActiveVersion(ver);
  };

  useEffect(() => {
    runSimulation();
    fetchStrategyData();
  }, []);

  const applyPreset = (preset: 'INSTITUTIONAL' | 'CONSERVATIVE' | 'AGGRESSIVE' | 'SCALPER') => {
    if (preset === 'INSTITUTIONAL') {
      setWeights({ trend: 25, momentum: 15, volume: 15, structure: 25, liquidity: 10, volatility: 5, regime: 5 });
      setBreakevenTrigger(true);
      setDcaEnabled(true);
      setMtfEnabled(true);
    } else if (preset === 'CONSERVATIVE') {
      setWeights({ trend: 25, momentum: 10, volume: 15, structure: 25, liquidity: 15, volatility: 5, regime: 5 });
      setBreakevenTrigger(true);
      setDcaEnabled(true);
      setMtfEnabled(true);
    } else if (preset === 'AGGRESSIVE') {
      setWeights({ trend: 15, momentum: 25, volume: 25, structure: 15, liquidity: 10, volatility: 5, regime: 5 });
      setBreakevenTrigger(false);
      setDcaEnabled(true);
      setMtfEnabled(false);
    } else {
      setWeights({ trend: 10, momentum: 20, volume: 20, structure: 20, liquidity: 15, volatility: 10, regime: 5 });
      setBreakevenTrigger(true);
      setDcaEnabled(false);
      setMtfEnabled(true);
    }
  };

  const filteredTrades = result?.trades.filter((t) => {
    if (selectedTradeFilter === 'ALL') return true;
    if (selectedTradeFilter === 'WIN') return t.realizedR > 0 || t.exitReason === 'PARTIAL_TP_THEN_SL';
    if (selectedTradeFilter === 'LOSS') return (t.realizedR < 0 && t.exitReason !== 'PARTIAL_TP_THEN_SL') || t.exitReason === 'SL';
    if (selectedTradeFilter === 'TP1') return t.exitReason === 'TP1_ONLY' || t.exitReason === 'PARTIAL_TP_THEN_SL';
    if (selectedTradeFilter === 'TP2') return t.exitReason === 'TP2_REACHED';
    if (selectedTradeFilter === 'FULL_TP') return t.exitReason === 'FULL_TP';
    if (selectedTradeFilter === 'SL') return t.exitReason === 'SL';
    return true;
  }) || [];

  const stats = result?.stats;
  const isPositiveReturn = (result?.netProfitUsdt ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-slate-100 pb-16">
      <Header marketRegime={mockMarketRegime} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <FlaskConical size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
                Strategy Lab & Historical Backtester
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span>Strategy Research</span>
              <span>•</span>
              <span>Parameter Tuning & Side-by-Side Comparison</span>
            </p>
          </div>

          {/* Workbench Tabs */}
          <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--glass-border)]">
            <button
              onClick={() => setActiveTab('backtest')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'backtest'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp size={13} />
              <span>Backtest Engine</span>
            </button>
            <button
              onClick={() => setActiveTab('walk-forward')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'walk-forward'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers size={13} />
              <span>Walk-Forward Validation</span>
            </button>
            <button
              onClick={() => setActiveTab('ai-optimizer')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ai-optimizer'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Brain size={13} className="text-cyan-400" />
              <span>AI Optimizer 🧠</span>
            </button>
            <button
              onClick={() => setActiveTab('parameters')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'parameters'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>Strategy Parameters</span>
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'compare'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scale size={13} />
              <span>Version Comparison</span>
            </button>
          </div>
        </div>

        {/* Configuration Bar */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-[var(--glass-border)] space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
            {/* Symbol */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Asset Pair
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-2.5 py-1.5 text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                {SUPPORTED_SYMBOLS.map((s) => (
                  <option key={s} value={s} className="bg-slate-900">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Timeframe */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-2.5 py-1.5 text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf} className="bg-slate-900">
                    {tf}
                  </option>
                ))}
              </select>
            </div>

            {/* Bar Count */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Historical Bars
              </label>
              <select
                value={barsCount}
                onChange={(e) => setBarsCount(Number(e.target.value))}
                className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-2.5 py-1.5 text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value={100} className="bg-slate-900">100 Bars (~25h)</option>
                <option value={200} className="bg-slate-900">200 Bars (~50h)</option>
                <option value={300} className="bg-slate-900">300 Bars (~75h)</option>
                <option value={500} className="bg-slate-900">500 Bars (~5 days)</option>
              </select>
            </div>

            {/* Wallet Initial */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Initial Wallet
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={walletBalance}
                  onChange={(e) => setWalletBalance(Math.max(50, Number(e.target.value)))}
                  className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none"
                />
                <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-500 font-mono">USDT</span>
              </div>
            </div>

            {/* DCA Switch */}
            <div className="flex flex-col justify-center">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                DCA Safety Fills
              </label>
              <button
                type="button"
                onClick={() => setDcaEnabled(!dcaEnabled)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer text-center ${
                  dcaEnabled
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    : 'bg-slate-800/40 text-slate-500 border-slate-700/50'
                }`}
              >
                {dcaEnabled ? 'DCA 1 & 2 Enabled' : 'Single Entry Only'}
              </button>
            </div>

            {/* Breakeven Ratchet Switch */}
            <div className="flex flex-col justify-center">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Breakeven Ratchet
              </label>
              <button
                type="button"
                onClick={() => setBreakevenTrigger(!breakevenTrigger)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer text-center ${
                  breakevenTrigger
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800/40 text-slate-500 border-slate-700/50'
                }`}
              >
                {breakevenTrigger ? 'Trail SL on TP1' : 'Fixed Stop Loss'}
              </button>
            </div>

            {/* MTF Confluence Switch */}
            <div className="flex flex-col justify-center">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                MTF Confluence
              </label>
              <button
                type="button"
                onClick={() => setMtfEnabled(!mtfEnabled)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer text-center ${
                  mtfEnabled
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                    : 'bg-slate-800/40 text-slate-500 border-slate-700/50'
                }`}
              >
                {mtfEnabled ? 'MTF Filter Active' : 'Single TF (Raw)'}
              </button>
            </div>
          </div>

          {/* Presets & Run Action */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-[var(--glass-border)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Presets:</span>
              <button
                onClick={() => applyPreset('INSTITUTIONAL')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-indigo-500/10 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500/50 transition-colors cursor-pointer"
              >
                Institutional MTF
              </button>
              <button
                onClick={() => applyPreset('CONSERVATIVE')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[var(--surface-2)] text-slate-300 hover:text-white border border-[var(--glass-border)] transition-colors cursor-pointer"
              >
                Conservative
              </button>
              <button
                onClick={() => applyPreset('AGGRESSIVE')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[var(--surface-2)] text-slate-300 hover:text-white border border-[var(--glass-border)] transition-colors cursor-pointer"
              >
                Breakout Momentum
              </button>
              <button
                onClick={() => applyPreset('SCALPER')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[var(--surface-2)] text-slate-300 hover:text-white border border-[var(--glass-border)] transition-colors cursor-pointer"
              >
                Range Scalper
              </button>
            </div>

            <button
              onClick={runSimulation}
              disabled={loading}
              className="btn-primary py-2 px-6 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin text-white" />
              ) : (
                <Play size={14} className="text-white fill-white" />
              )}
              <span className="font-semibold text-xs tracking-wide">
                {loading ? 'Simulating Historical Bars...' : 'Run Historical Simulation'}
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Backtest Results & Visualizations */}
        {activeTab === 'backtest' && result && (
          <div className="space-y-6">
            {/* Hero Expectancy & Edge Scorecard */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Expectancy E(R)</span>
                <span
                  className={`text-lg font-mono font-bold block mt-1 ${
                    (stats?.expectancy ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(stats?.expectancy ?? 0) > 0 ? '+' : ''}{(stats?.expectancy ?? 0).toFixed(2)}R
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Statistical edge per trade</span>
              </div>

              <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Profit Factor</span>
                <span
                  className={`text-lg font-mono font-bold block mt-1 ${
                    (stats?.profitFactor ?? 0) >= 1.5 ? 'text-emerald-400' : 'text-slate-200'
                  }`}
                >
                  {stats?.profitFactor ? stats.profitFactor.toFixed(2) : '0.00'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Gross Wins / Gross Losses</span>
              </div>

              <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Win Rate</span>
                <span className="text-lg font-mono font-bold text-emerald-400 block mt-1">
                  {stats?.winRate != null ? stats.winRate.toFixed(1) : '0.0'}%
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {stats?.winCount ?? 0} wins / {stats?.lossCount ?? 0} losses
                </span>
              </div>

              <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Net Realized P&L</span>
                <span
                  className={`text-lg font-mono font-bold block mt-1 ${
                    isPositiveReturn ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositiveReturn ? '+' : ''}${result.netProfitUsdt.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  ROI: {isPositiveReturn ? '+' : ''}{result.totalReturnPercent.toFixed(2)}%
                </span>
              </div>

              <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Max Drawdown</span>
                <span className="text-lg font-mono font-bold text-rose-400 block mt-1">
                  {stats?.maxDrawdown != null ? `${Math.abs(stats.maxDrawdown).toFixed(1)}%` : '0.0%'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Peak-to-trough drop</span>
              </div>

              <div className="glass-card rounded-xl p-4 border border-[var(--glass-border)]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Profit Factor</span>
                <span className="text-lg font-mono font-bold text-cyan-400 block mt-1">
                  {stats?.profitFactor != null ? stats.profitFactor.toFixed(2) : '—'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Gross gains / losses</span>
              </div>
            </div>

            {/* Equity Curve Visualizer */}
            <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[var(--glass-border)] pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 size={15} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Simulated Portfolio Equity Curve
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-slate-400">
                    Initial: <strong className="text-slate-200">${result.initialBalance}</strong>
                  </span>
                  <span className="text-slate-400">
                    Final: <strong className={isPositiveReturn ? 'text-emerald-400' : 'text-rose-400'}>
                      ${result.finalBalance}
                    </strong>
                  </span>
                  <span className="text-slate-400">
                    Trades: <strong className="text-slate-200">{result.trades.length}</strong>
                  </span>
                </div>
              </div>

              <EquityCurveChart
                equityCurve={result.equityCurve}
                initialBalance={result.initialBalance}
              />
            </div>

            {/* Target Ladder & MFE/MAE Gauges */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Target Ladder */}
              <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
                <div className="flex items-center gap-2">
                  <Target size={15} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Simulated Target Ladder Rates
                  </h3>
                </div>
                <div className="space-y-2.5 pt-1">
                  {[
                    { label: 'TP1 Hit Rate (30% scale-out)', val: stats?.tp1Rate ?? 0, color: 'bg-emerald-400' },
                    { label: 'TP2 Hit Rate (30% scale-out)', val: stats?.tp2Rate ?? 0, color: 'bg-emerald-500' },
                    { label: 'TP3 Hit Rate (40% runner exit)', val: stats?.tp3Rate ?? 0, color: 'bg-teal-400' },
                    { label: 'Stop Loss Rate', val: stats?.slRate ?? 0, color: 'bg-rose-500' },
                    { label: 'Signal Expiry Rate', val: stats?.expiryRate ?? 0, color: 'bg-slate-500' },
                  ].map((row) => (
                    <div key={row.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">{row.label}</span>
                        <span className="font-mono font-bold text-slate-200">{row.val.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.color} transition-all duration-500`}
                          style={{ width: `${Math.min(100, Math.max(0, row.val))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Excursion & Stress Metrics */}
              <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={15} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Trade Excursion & Holding Stress
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <span className="text-[10px] uppercase text-slate-500 block">Avg Favorable (MFE)</span>
                    <span className="text-base font-bold font-mono text-emerald-400 block mt-1">
                      +{stats?.avgMfe ? stats.avgMfe.toFixed(2) : '0.00'}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Peak gain reached before close</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
                    <span className="text-[10px] uppercase text-slate-500 block">Avg Adverse (MAE)</span>
                    <span className="text-base font-bold font-mono text-rose-400 block mt-1">
                      {stats?.avgMae ? stats.avgMae.toFixed(2) : '-0.00'}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Deepest drawdown during trade</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] flex items-center justify-between text-xs mt-3">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-500" /> Average Holding Duration:
                  </span>
                  <span className="font-mono font-medium text-slate-200">
                    {stats?.avgHoldingTime || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Trade Execution Log */}
            <div className="glass-card rounded-2xl p-5 border border-[var(--glass-border)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Layers size={15} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-200">
                    Simulated Trade Log ({result.trades.length} Executed)
                  </h3>
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                  {['ALL', 'WIN', 'LOSS', 'FULL_TP', 'TP1', 'SL'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setSelectedTradeFilter(f)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                        selectedTradeFilter === f
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-slate-200 bg-[var(--surface-2)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTrades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--glass-border)] text-slate-500 uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Trade ID</th>
                        <th className="py-2.5 px-3">Setup Pattern</th>
                        <th className="py-2.5 px-3 text-right">Entry / Avg</th>
                        <th className="py-2.5 px-3 text-right">Exit Price</th>
                        <th className="py-2.5 px-3">Result</th>
                        <th className="py-2.5 px-3 text-right">Realized R</th>
                        <th className="py-2.5 px-3 text-right">Gross P&L</th>
                        <th className="py-2.5 px-3 text-right">Slip & Spread</th>
                        <th className="py-2.5 px-3 text-right">Net P&L</th>
                        <th className="py-2.5 px-3 text-right">Bars</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--glass-border)]/50">
                      {filteredTrades.map((t) => {
                        const isWin = t.realizedR > 0;
                        return (
                          <tr key={t.id} className="hover:bg-slate-800/20 transition-colors font-mono">
                            <td className="py-3 px-3 font-semibold text-slate-200">{t.id}</td>
                            <td className="py-3 px-3 text-slate-300 font-sans text-[11px]">
                              {t.setupType.replace(/_/g, ' ')}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-200">
                              ${t.entryPrice.toFixed(2)}
                              {t.dca1Hit && (
                                <span className="text-[10px] text-cyan-400 block font-sans">
                                  DCA1 (${t.avgEntryPrice.toFixed(2)})
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-200">${t.exitPrice.toFixed(2)}</td>
                            <td className="py-3 px-3 font-sans">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  t.exitReason === 'FULL_TP'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : t.exitReason.startsWith('TP')
                                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {t.exitReason}
                              </span>
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-bold ${
                                isWin ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {t.realizedR > 0 ? '+' : ''}{t.realizedR.toFixed(2)}R
                            </td>
                            <td
                              className={`py-3 px-3 text-right ${
                                t.grossPnlUsdt >= 0 ? 'text-slate-200' : 'text-rose-400'
                              }`}
                            >
                              ${t.grossPnlUsdt.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right text-amber-400">
                              ${(t.slippageUsdt + t.spreadUsdt).toFixed(2)}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-bold ${
                                t.netPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {t.netPnlUsdt >= 0 ? '+' : ''}${t.netPnlUsdt.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-400 text-[11px] font-sans">
                              {t.holdingBars} bars
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No simulated trades match the selected filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Walk-Forward Validation */}
        {activeTab === 'walk-forward' && (
          <WalkForwardWorkbench
            symbol={symbol}
            timeframe={timeframe}
            barsCount={barsCount}
          />
        )}

        {/* Tab 2.5: AI Strategy Factor Optimizer (Phase 40) */}
        {activeTab === 'ai-optimizer' && (
          <AiStrategyOptimizerWorkbench
            currentWeights={weights}
            onApplyWeights={(newWeights) => {
              setWeights(newWeights);
              setStrategyParams((prev) => ({
                ...prev,
                weights: newWeights,
              }));
            }}
            onRunBacktestWithWeights={(newWeights) => {
              setWeights(newWeights);
              setStrategyParams((prev) => ({
                ...prev,
                weights: newWeights,
              }));
              setActiveTab('backtest');
              runSimulation();
            }}
          />
        )}

        {/* Tab 3: Strategy Parameter Tuning & Authoring */}
        {activeTab === 'parameters' && (
          <div className="space-y-6">
            <StrategyParametersEditor
              parameters={strategyParams}
              onChange={(updated) => {
                setStrategyParams(updated);
                setWeights(updated.weights);
              }}
              onSave={handleSaveStrategy}
              onActivate={handleActivateStrategy}
              activeVersion={activeVersion}
              savedVersions={savedVersions}
            />
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setActiveTab('backtest');
                  runSimulation();
                }}
                className="btn-primary py-2.5 px-6 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10"
              >
                <TrendingUp size={14} />
                Apply These Parameters & Run Backtest
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Side-by-Side Strategy Comparison */}
        {activeTab === 'compare' && (
          <StrategyComparisonView
            currentCustomParams={strategyParams}
            symbol={symbol}
            timeframe={timeframe}
            barsCount={barsCount}
          />
        )}
      </main>
    </div>
  );
}
