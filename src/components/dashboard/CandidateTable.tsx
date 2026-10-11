'use client';

// ─── U-SPOT Candidate Table & Top 20 Market Scanner ─────────────────
// Phase 4: Multi-factor evaluation, configurable weights, regime filtering, order book & OHLCV
// Spec Sections: 5 (Top-20 Scanner), 6 (Market Regime Engine), 7 (Timeframes), 35

import { useState } from 'react';
import {
  formatNumber,
  formatPercent,
  formatVolume,
  getChangeColor,
  getScoreColor,
} from '@/lib/utils';
import type {
  MarketCandidate,
  OrderBook,
  OHLCV,
  Timeframe,
  MarketRegimeAnalysis,
  ScannerWeights,
  ScannerPresetName,
  ScannerFilters,
  TechnicalAnalysisResult,
} from '@/types';
import {
  DEFAULT_SCANNER_WEIGHTS,
  SCANNER_PRESETS,
} from '@/lib/services/scanner-service';
import TechnicalAnalysisCard from './TechnicalAnalysisCard';
import {
  RefreshCw,
  TrendingUp,
  Layers,
  BarChart2,
  X,
  Radio,
  Sliders,
  Sparkles,
  Zap,
  ShieldCheck,
  Flame,
  Gauge,
  Info,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';

interface CandidateTableProps {
  candidates: MarketCandidate[];
  isRefreshing?: boolean;
  isScanning?: boolean;
  onRefresh?: () => void;
  lastUpdated?: Date | null;
  regimeAnalysis?: MarketRegimeAnalysis | null;
  appliedWeights?: ScannerWeights;
  activePreset?: ScannerPresetName;
  onApplyWeights?: (
    weights: Partial<ScannerWeights>,
    filters?: ScannerFilters,
    presetName?: ScannerPresetName
  ) => void;
  onApplyPreset?: (presetName: ScannerPresetName) => void;
}

export default function CandidateTable({
  candidates,
  isRefreshing = false,
  isScanning = false,
  onRefresh,
  lastUpdated,
  regimeAnalysis,
  appliedWeights = DEFAULT_SCANNER_WEIGHTS,
  activePreset = 'BALANCED',
  onApplyWeights,
  onApplyPreset,
}: CandidateTableProps) {
  // Inspection drawer state
  const [selectedCoin, setSelectedCoin] = useState<MarketCandidate | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15m');
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [klines, setKlines] = useState<OHLCV[]>([]);
  const [techAnalysis, setTechAnalysis] = useState<TechnicalAnalysisResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);

  // Scanner customization drawer state
  const [showWeightSliders, setShowWeightSliders] = useState<boolean>(false);
  const [customWeights, setCustomWeights] = useState<ScannerWeights>(appliedWeights);
  const [activeFilterTab, setActiveFilterTab] = useState<string>('ALL');

  // Handle factor slider change
  const handleSliderChange = (factor: keyof ScannerWeights, value: number) => {
    setCustomWeights((prev) => ({
      ...prev,
      [factor]: value,
    }));
  };

  const currentWeightSum =
    customWeights.momentum +
    customWeights.volume +
    customWeights.liquidity +
    customWeights.trend +
    customWeights.structure +
    customWeights.volatility +
    customWeights.catalyst;

  const handleApplyCustomWeights = () => {
    if (onApplyWeights) {
      onApplyWeights(customWeights, undefined, 'CUSTOM');
    }
  };

  const handleResetWeights = () => {
    setCustomWeights(DEFAULT_SCANNER_WEIGHTS);
    if (onApplyPreset) {
      onApplyPreset('BALANCED');
    }
  };

  const handleFilterTabClick = (tab: string) => {
    setActiveFilterTab(tab);
    if (onApplyWeights) {
      let regimeFilter: any = 'ALL';
      let minVolumeUsdt: number | undefined = undefined;
      let minLiquidityScore: number | undefined = undefined;

      if (tab === 'BULL') regimeFilter = 'BULL';
      else if (tab === 'HIGH_VOL') regimeFilter = 'HIGH_VOLATILITY';
      else if (tab === 'LIQUIDITY') minLiquidityScore = 80;
      else if (tab === 'VOLUME') minVolumeUsdt = 5_000_000;

      onApplyWeights(
        customWeights,
        {
          regimeFilter,
          minVolumeUsdt,
          minLiquidityScore,
          limit: 20,
        },
        activePreset
      );
    }
  };

  const handleInspectCoin = async (c: MarketCandidate) => {
    setSelectedCoin(c);
    setInspectLoading(true);
    setOrderBook(null);
    setKlines([]);
    setTechAnalysis(null);

    try {
      const clean = c.symbol.replace('/', '').toUpperCase();
      const [depthRes, klinesRes, taRes] = await Promise.all([
        fetch(`/api/markets/${clean}/depth?limit=10`),
        fetch(`/api/markets/${clean}/klines?interval=${selectedTimeframe}&limit=12`),
        fetch(`/api/analysis/${clean}?timeframe=${selectedTimeframe}&limit=100`),
      ]);

      if (depthRes.ok) {
        const d = await depthRes.json();
        if (d.success && d.orderBook) setOrderBook(d.orderBook);
      }

      if (klinesRes.ok) {
        const k = await klinesRes.json();
        if (k.success && Array.isArray(k.klines)) setKlines(k.klines);
      }

      if (taRes.ok) {
        const ta = await taRes.json();
        if (ta.success && ta.analysis) setTechAnalysis(ta.analysis);
      }
    } catch (err) {
      console.error('Failed to inspect market:', err);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleTimeframeChange = async (tf: Timeframe) => {
    setSelectedTimeframe(tf);
    if (!selectedCoin) return;

    try {
      const clean = selectedCoin.symbol.replace('/', '').toUpperCase();
      const [klinesRes, taRes] = await Promise.all([
        fetch(`/api/markets/${clean}/klines?interval=${tf}&limit=12`),
        fetch(`/api/analysis/${clean}?timeframe=${tf}&limit=100`),
      ]);

      if (klinesRes.ok) {
        const k = await klinesRes.json();
        if (k.success && Array.isArray(k.klines)) setKlines(k.klines);
      }

      if (taRes.ok) {
        const ta = await taRes.json();
        if (ta.success && ta.analysis) setTechAnalysis(ta.analysis);
      }
    } catch (err) {
      console.error('Failed to change timeframe:', err);
    }
  };

  // Helper for regime color
  const getRegimeColorClass = (regime: string) => {
    switch (regime) {
      case 'BULL':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'BEAR':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'HIGH_VOLATILITY':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'LOW_LIQUIDITY':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      default:
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in-delay-2">
      {/* 1. Header Toolbar */}
      <div className="px-5 py-4 border-b border-[var(--glass-border)] space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-slate-200">
                  Top 20 Market Candidates
                </h2>
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30">
                  <Sparkles size={10} />
                  Multi-Factor Scanner
                </span>
                {regimeAnalysis && (
                  <span
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${getRegimeColorClass(
                      regimeAnalysis.regime
                    )}`}
                    title={regimeAnalysis.description}
                  >
                    <Radio size={9} className="animate-pulse" />
                    Regime: {regimeAnalysis.regime}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Spec Section 5: Configurable 7-Factor Scoring (Mom 20%, Vol 20%, Liq 15%, Trd 15%, Str 15%, Vlt 10%, Cat 5%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            {/* Toggle Factor Weight Sliders */}
            <button
              onClick={() => setShowWeightSliders(!showWeightSliders)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                showWeightSliders
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-[var(--surface-3)] text-slate-300 hover:text-cyan-400 border-[var(--glass-border)]'
              }`}
            >
              <Sliders size={12} />
              <span>Factor Weights</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 ml-0.5">
                {currentWeightSum}%
              </span>
            </button>

            {/* Refresh */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing || isScanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-3)] text-slate-300 hover:text-cyan-400 text-xs font-medium border border-[var(--glass-border)] cursor-pointer transition-colors"
                title="Refresh market candidates"
              >
                <RefreshCw
                  size={12}
                  className={isRefreshing || isScanning ? 'animate-spin text-cyan-400' : ''}
                />
                <span className="hidden sm:inline">
                  {isRefreshing || isScanning ? 'Scanning...' : 'Refresh'}
                </span>
              </button>
            )}

            {lastUpdated && (
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline" suppressHydrationWarning>
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* 2. Strategy Presets & Regime Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[var(--glass-border)] text-xs">
          {/* Strategy Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Zap size={11} className="text-amber-400" />
              Presets:
            </span>
            {Object.values(SCANNER_PRESETS).map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setCustomWeights(p.weights);
                  if (onApplyPreset) onApplyPreset(p.name);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                  activePreset === p.name
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 border border-[var(--glass-border)]'
                }`}
                title={p.description}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Regime Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { id: 'ALL', label: 'All Candidates' },
              { id: 'BULL', label: 'Bull Setups' },
              { id: 'VOLUME', label: 'Volume Surges' },
              { id: 'LIQUIDITY', label: 'Tier-1 Liq' },
              { id: 'HIGH_VOL', label: 'Volatility Plays' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleFilterTabClick(tab.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  activeFilterTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Market Regime Live Guidance Banner */}
        {regimeAnalysis && (
          <div className="p-2.5 rounded-xl bg-[var(--surface-2)]/70 border border-[var(--glass-border)] flex items-start gap-2.5 text-xs">
            <Info size={14} className="text-cyan-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-300">
                Regime Context ({regimeAnalysis.regime}):
              </span>{' '}
              <span className="text-slate-400">{regimeAnalysis.description}</span>
              <p className="text-[11px] text-cyan-400/90 font-mono">
                Guidance: {regimeAnalysis.tradingGuidance} (Score Filter Adjustment:{' '}
                {regimeAnalysis.scoreThresholdAdjustment > 0 ? '+' : ''}
                {regimeAnalysis.scoreThresholdAdjustment} pts)
              </p>
            </div>
          </div>
        )}

        {/* 4. Expandable Factor Weights Sliders */}
        {showWeightSliders && (
          <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-cyan-500/30 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-2">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sliders size={13} className="text-cyan-400" />
                  Custom Multi-Factor Weight Configuration (Spec Section 5)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Weights automatically normalize to 100% upon scoring evaluation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono font-bold ${
                    currentWeightSum === 100 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  Total: {currentWeightSum}%
                </span>
                <button
                  onClick={handleResetWeights}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 text-[11px] cursor-pointer"
                  title="Reset to default weights"
                >
                  <RotateCcw size={10} />
                  Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Momentum */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Momentum</span>
                  <span className="font-mono text-cyan-400">{customWeights.momentum}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customWeights.momentum}
                  onChange={(e) => handleSliderChange('momentum', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">24h Gain & BTC relative strength</span>
              </div>

              {/* Volume */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Volume Expansion</span>
                  <span className="font-mono text-cyan-400">{customWeights.volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customWeights.volume}
                  onChange={(e) => handleSliderChange('volume', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Ratio vs universe median volume</span>
              </div>

              {/* Liquidity */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Liquidity Depth</span>
                  <span className="font-mono text-cyan-400">{customWeights.liquidity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customWeights.liquidity}
                  onChange={(e) => handleSliderChange('liquidity', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Order book depth & tight spread</span>
              </div>

              {/* Trend */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Trend Alignment</span>
                  <span className="font-mono text-cyan-400">{customWeights.trend}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customWeights.trend}
                  onChange={(e) => handleSliderChange('trend', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Closing near upper 24h range</span>
              </div>

              {/* Structure */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Market Structure</span>
                  <span className="font-mono text-cyan-400">{customWeights.structure}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customWeights.structure}
                  onChange={(e) => handleSliderChange('structure', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Breakout test vs support floor</span>
              </div>

              {/* Volatility */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Volatility Ratio</span>
                  <span className="font-mono text-cyan-400">{customWeights.volatility}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={customWeights.volatility}
                  onChange={(e) => handleSliderChange('volatility', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Healthy 4-12% spot trade range</span>
              </div>

              {/* Catalyst */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>Catalyst & Discovery</span>
                  <span className="font-mono text-cyan-400">{customWeights.catalyst}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="5"
                  value={customWeights.catalyst}
                  onChange={(e) => handleSliderChange('catalyst', Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">Cap rank & stealth volume surge</span>
              </div>

              {/* Apply Action Button */}
              <div className="flex items-end">
                <button
                  onClick={handleApplyCustomWeights}
                  disabled={isScanning}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={12} />
                  {isScanning ? 'Scoring...' : 'Apply & Re-Rank Top 20'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" id="candidate-table">
          <thead>
            <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-[var(--glass-border)]">
              <th className="text-left px-5 py-3 font-medium">#</th>
              <th className="text-left px-3 py-3 font-medium">Coin</th>
              <th className="text-right px-3 py-3 font-medium">Price</th>
              <th className="text-right px-3 py-3 font-medium">24h Change</th>
              <th className="text-right px-3 py-3 font-medium">24h Volume</th>
              <th className="text-right px-3 py-3 font-medium">Vol Ratio</th>
              <th className="text-right px-3 py-3 font-medium">Liquidity</th>
              <th className="text-right px-3 py-3 font-medium">Score</th>
              <th className="text-left px-3 py-3 font-medium hidden md:table-cell">
                Factor Breakdown
              </th>
              <th className="text-left px-3 py-3 font-medium hidden xl:table-cell">
                Discovery Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw size={24} className="animate-spin text-cyan-400" />
                    <span className="text-sm font-medium">
                      {isScanning || isRefreshing
                        ? 'Scanning live markets & ranking top candidates...'
                        : 'Loading candidate market pairs...'}
                    </span>
                    <span className="text-xs text-slate-500">
                      Querying Binance live market data & 24h volume metrics
                    </span>
                  </div>
                </td>
              </tr>
            ) : candidates.map((c, i) => (
                <tr
                  key={c.symbol}
                  onClick={() => handleInspectCoin(c)}
                  className={`
                    border-b border-[var(--glass-border)] hover:bg-[var(--surface-2)]/60 transition-colors cursor-pointer group
                    ${selectedCoin?.symbol === c.symbol ? 'bg-cyan-500/10' : ''}
                  `}
                >
                <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                      i === 0
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : i === 1
                        ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                        : i === 2
                        ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40'
                        : 'text-slate-500'
                    }`}
                  >
                    {c.rank || i + 1}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                      {c.symbol.split('/')[0]}
                    </span>
                    <span className="text-slate-500 text-xs">
                      /{c.symbol.split('/')[1]}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">{c.name}</p>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-slate-200 font-medium">
                  ${formatNumber(c.price, c.price < 1 ? 4 : 2)}
                </td>
                <td
                  className={`px-3 py-3.5 text-right font-mono font-semibold ${getChangeColor(
                    c.change24h
                  )}`}
                >
                  {formatPercent(c.change24h)}
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-slate-400">
                  {formatVolume(c.volume24h)}
                </td>
                <td className="px-3 py-3.5 text-right font-mono">
                  <span
                    className={
                      c.volumeRatio >= 2
                        ? 'text-emerald-400 font-medium'
                        : c.volumeRatio >= 1.3
                        ? 'text-amber-400 font-medium'
                        : 'text-slate-400'
                    }
                  >
                    {c.volumeRatio.toFixed(1)}x
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-slate-300">
                  <span
                    className={`
                      px-2 py-0.5 rounded text-[10px] font-bold
                      ${
                        c.liquidity >= 90
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : c.liquidity >= 75
                          ? 'bg-cyan-500/15 text-cyan-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }
                    `}
                  >
                    {c.liquidity}/100
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 score-bar">
                      <div
                        className="score-bar-fill"
                        style={{
                          width: `${c.candidateScore}%`,
                          background:
                            c.candidateScore >= 80
                              ? 'var(--profit)'
                              : c.candidateScore >= 70
                              ? 'var(--warning)'
                              : 'var(--loss)',
                        }}
                      />
                    </div>
                    <span
                      className={`font-mono font-bold text-xs ${getScoreColor(
                        c.candidateScore
                      )}`}
                    >
                      {c.candidateScore}
                    </span>
                  </div>
                </td>
                {/* Factor Breakdown Mini-Chips */}
                <td className="px-3 py-3.5 hidden md:table-cell">
                  {c.factors ? (
                    <div className="flex items-center gap-1 text-[9px] font-mono">
                      <span
                        className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300"
                        title={`Momentum Score: ${c.factors.momentum}/100`}
                      >
                        M:{c.factors.momentum}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300"
                        title={`Volume Score: ${c.factors.volume}/100`}
                      >
                        V:{c.factors.volume}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300"
                        title={`Liquidity Score: ${c.factors.liquidity}/100`}
                      >
                        L:{c.factors.liquidity}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300"
                        title={`Trend Score: ${c.factors.trend}/100`}
                      >
                        T:{c.factors.trend}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500">Balanced</span>
                  )}
                </td>
                <td className="px-3 py-3.5 text-xs text-slate-500 max-w-[240px] truncate hidden xl:table-cell">
                  {c.reasonSelected}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Market Inspector Drawer (Order Book & OHLCV + 7-Factor Breakdown) */}
      {selectedCoin && (
        <div className="p-5 border-t border-cyan-500/20 bg-[var(--surface-1)] space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--glass-border)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 font-bold">
                {selectedCoin.symbol.split('/')[0].slice(0, 3)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-100">
                    {selectedCoin.symbol} Multi-Factor Market Inspection
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    ${formatNumber(selectedCoin.price, selectedCoin.price < 1 ? 4 : 2)}
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold ${getChangeColor(
                      selectedCoin.change24h
                    )}`}
                  >
                    {formatPercent(selectedCoin.change24h)}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${getScoreColor(
                      selectedCoin.candidateScore
                    )} bg-[var(--surface-3)] border border-[var(--glass-border)]`}
                  >
                    Candidate Score: {selectedCoin.candidateScore}/100
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {selectedCoin.reasonSelected}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedCoin(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* 7-Factor Quantitative Evaluation Breakdown Card (Spec Section 5) */}
          {selectedCoin.factors && (
            <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Gauge size={13} className="text-cyan-400" />
                  7-Factor Quantitative Evaluation Breakdown (Spec Section 5)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Composite: <strong className="text-cyan-400">{selectedCoin.candidateScore}/100</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                {/* Momentum */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Momentum</span>
                  <span className="font-mono text-cyan-400 font-bold text-sm">
                    {selectedCoin.factors.momentum}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-cyan-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.momentum}%` }}
                    />
                  </div>
                  {selectedCoin.rawMetrics && (
                    <span className="text-[9px] text-slate-500 block">
                      vs BTC: {selectedCoin.rawMetrics.relativeStrengthBtc > 0 ? '+' : ''}
                      {selectedCoin.rawMetrics.relativeStrengthBtc}%
                    </span>
                  )}
                </div>

                {/* Volume */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Volume</span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">
                    {selectedCoin.factors.volume}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.volume}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 block">
                    Ratio: {selectedCoin.volumeRatio.toFixed(1)}x
                  </span>
                </div>

                {/* Liquidity */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Liquidity</span>
                  <span className="font-mono text-blue-400 font-bold text-sm">
                    {selectedCoin.factors.liquidity}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-blue-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.liquidity}%` }}
                    />
                  </div>
                  {selectedCoin.rawMetrics && (
                    <span className="text-[9px] text-slate-500 block">
                      Spread: {selectedCoin.rawMetrics.spreadPercent}%
                    </span>
                  )}
                </div>

                {/* Trend */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Trend</span>
                  <span className="font-mono text-amber-400 font-bold text-sm">
                    {selectedCoin.factors.trend}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.trend}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 block">Range Position</span>
                </div>

                {/* Structure */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Structure</span>
                  <span className="font-mono text-purple-400 font-bold text-sm">
                    {selectedCoin.factors.structure}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-purple-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.structure}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 block">High Proximity</span>
                </div>

                {/* Volatility */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Volatility</span>
                  <span className="font-mono text-rose-400 font-bold text-sm">
                    {selectedCoin.factors.volatility}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-rose-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.volatility}%` }}
                    />
                  </div>
                  {selectedCoin.rawMetrics && (
                    <span className="text-[9px] text-slate-500 block">
                      Range: {selectedCoin.rawMetrics.dailyRangePercent}%
                    </span>
                  )}
                </div>

                {/* Catalyst */}
                <div className="p-2.5 rounded-lg bg-[var(--surface-3)]/60 border border-[var(--glass-border)] space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Catalyst</span>
                  <span className="font-mono text-indigo-400 font-bold text-sm">
                    {selectedCoin.factors.catalyst}/100
                  </span>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div
                      className="bg-indigo-400 h-full rounded-full"
                      style={{ width: `${selectedCoin.factors.catalyst}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 block">Discovery Surge</span>
                </div>
              </div>
            </div>
          )}

          {/* Phase 5: Technical Analysis Suite (Spec Section 8: Trend, Momentum, Volume, Volatility, Structure, Liquidity) */}
          <TechnicalAnalysisCard
            symbol={selectedCoin.symbol}
            timeframe={selectedTimeframe}
            analysis={techAnalysis}
            isLoading={inspectLoading}
            onTimeframeChange={handleTimeframeChange}
          />

          {inspectLoading ? (
            <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin text-cyan-400" />
              Loading live Binance order book & candles...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Live Order Book Depth */}
              <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Layers size={13} className="text-cyan-400" />
                    Live Order Book Depth (Binance Spot)
                  </span>
                  {orderBook && (
                    <span className="text-[10px] font-mono text-slate-400">
                      Spread: {orderBook.spreadPercent}% (${orderBook.spread})
                    </span>
                  )}
                </div>

                {orderBook ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">
                          Top Bid Depth
                        </span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          ${formatNumber(orderBook.bidDepthUsdt, 0)} USDT
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">
                          Top Ask Depth
                        </span>
                        <span className="font-mono text-rose-400 font-semibold">
                          ${formatNumber(orderBook.askDepthUsdt, 0)} USDT
                        </span>
                      </div>
                    </div>

                    {/* Bids & Asks Ladder */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-[var(--glass-border)]">
                      {/* Bids */}
                      <div>
                        <span className="text-[10px] text-emerald-500 font-bold block mb-1">
                          Bids (Buyers)
                        </span>
                        <div className="space-y-1">
                          {orderBook.bids.slice(0, 5).map(([p, q], idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-slate-300"
                            >
                              <span className="text-emerald-400/90">
                                ${formatNumber(p, p < 1 ? 4 : 2)}
                              </span>
                              <span className="text-slate-500">
                                {formatNumber(q, 2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Asks */}
                      <div>
                        <span className="text-[10px] text-rose-500 font-bold block mb-1 text-right">
                          Asks (Sellers)
                        </span>
                        <div className="space-y-1">
                          {orderBook.asks.slice(0, 5).map(([p, q], idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-slate-300"
                            >
                              <span className="text-slate-500">
                                {formatNumber(q, 2)}
                              </span>
                              <span className="text-rose-400/90">
                                ${formatNumber(p, p < 1 ? 4 : 2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Order book depth unavailable.
                  </p>
                )}
              </div>

              {/* Recent OHLCV Candles */}
              <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <BarChart2 size={13} className="text-cyan-400" />
                    Recent OHLCV Candles (Spec Section 7)
                  </span>

                  {/* Timeframe Chips */}
                  <div className="flex items-center gap-1">
                    {(['5m', '15m', '1h', '4h'] as Timeframe[]).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => handleTimeframeChange(tf)}
                        className={`
                          px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer
                          ${
                            selectedTimeframe === tf
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-[var(--surface-3)] text-slate-500 hover:text-slate-300 border border-transparent'
                          }
                        `}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {klines.length > 0 ? (
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="grid grid-cols-5 text-[10px] text-slate-500 uppercase tracking-wider pb-1 border-b border-[var(--glass-border)]">
                      <span>Time</span>
                      <span className="text-right">Open</span>
                      <span className="text-right">High</span>
                      <span className="text-right">Low</span>
                      <span className="text-right">Close</span>
                    </div>
                    {klines.slice(-5).reverse().map((k) => {
                      const isUp = k.close >= k.open;
                      const date = new Date(k.timestamp);
                      const timeStr = `${String(date.getHours()).padStart(
                        2,
                        '0'
                      )}:${String(date.getMinutes()).padStart(2, '0')}`;
                      return (
                        <div
                          key={k.timestamp}
                          className="grid grid-cols-5 text-[11px] text-slate-300 hover:bg-[var(--surface-3)]/40 p-0.5 rounded"
                        >
                          <span className="text-slate-500">{timeStr}</span>
                          <span className="text-right text-slate-400">
                            ${formatNumber(k.open, k.open < 1 ? 4 : 2)}
                          </span>
                          <span className="text-right text-emerald-400/80">
                            ${formatNumber(k.high, k.high < 1 ? 4 : 2)}
                          </span>
                          <span className="text-right text-rose-400/80">
                            ${formatNumber(k.low, k.low < 1 ? 4 : 2)}
                          </span>
                          <span
                            className={`text-right font-semibold ${
                              isUp ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            ${formatNumber(k.close, k.close < 1 ? 4 : 2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No recent candle data available.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
