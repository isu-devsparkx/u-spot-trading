'use client';

// ─── U-SPOT Depth of Market (DOM) & Order Flow Heatmap (Phase 31) ─────
// Sub-second 100ms order book depth ladder with cumulative volume profiling,
// custom tick aggregation, and liquidity band distribution analysis.

import React, { useState, useMemo } from 'react';
import { useLiveOrderBook } from '@/hooks/useBinanceWebSocket';
import {
  buildDOMHeatmapSnapshot,
  getRecommendedTickSizes,
  computeLiquidityBands,
} from '@/lib/services/order-flow-dom';
import type { DOMRow } from '@/types';
import {
  Layers,
  Shield,
  Radio,
  Sliders,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Info,
  Maximize2,
  Minimize2,
  Download,
} from 'lucide-react';
import {
  convertDOMSnapshotToCSV,
  generateExportFileName,
  downloadFileClientSide,
} from '@/lib/services/order-flow-exporter';
import { formatNumber } from '@/lib/utils';

interface DepthOfMarketVisualizerProps {
  symbol: string;
  initialLevels?: number;
  compact?: boolean;
}

export default function DepthOfMarketVisualizer({
  symbol,
  initialLevels = 12,
  compact = false,
}: DepthOfMarketVisualizerProps) {
  const [maxLevels, setMaxLevels] = useState<number>(initialLevels);
  const [tickSize, setTickSize] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'dom' | 'bands'>('dom');
  const [isExpanded, setIsExpanded] = useState<boolean>(!compact);

  // Stream sub-second depth via Phase 29 WebSocket hook
  const {
    depth,
    isLiveWs,
    connectionState,
    isLoading,
  } = useLiveOrderBook(symbol);

  // Compute recommended tick sizes based on mid-price
  const midPriceApprox = depth ? (depth.bestBid + depth.bestAsk) / 2 : 0;
  const recommendedTickSizes = useMemo(() => {
    return getRecommendedTickSizes(midPriceApprox);
  }, [midPriceApprox]);

  // Build complete DOM Heatmap Snapshot
  const snapshot = useMemo(() => {
    if (!depth) return null;
    return buildDOMHeatmapSnapshot(depth, { maxLevels, tickSize });
  }, [depth, maxLevels, tickSize]);

  // Compute liquidity distribution across +/- 0.5%, 1%, 2% bands
  const liquidityBands = useMemo(() => {
    if (!snapshot) return [];
    return computeLiquidityBands(snapshot, [0.5, 1.0, 2.0]);
  }, [snapshot]);

  const formatPrice = (val: number) => {
    if (!val || isNaN(val)) return '$0.00';
    if (val >= 1000) {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (val >= 1) {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    }
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  };

  const formatVolumeUsdt = (vol: number) => {
    if (!vol) return '$0';
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
    return `$${Math.round(vol)}`;
  };

  if (!snapshot && isLoading) {
    return (
      <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--glass-border)] flex flex-col items-center justify-center gap-2.5 text-xs font-mono text-cyan-400 py-12">
        <Radio size={16} className="animate-spin text-cyan-400" />
        <span>Loading Real-Time Order Flow & DOM Ladder for {symbol}...</span>
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  const bidRatio = Math.round(((snapshot.depthImbalance + 1) / 2) * 100);
  const askRatio = 100 - bidRatio;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--glass-border)] shadow-xl space-y-4 font-mono">
      {/* 1. Header Toolbar: Title, Feed Status & Mode Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]/60">
        <div className="flex items-center gap-2.5">
          <Layers size={16} className="text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100 font-sans tracking-tight">
            {symbol} Depth of Market (DOM)
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
            Spot Order Flow
          </span>

          {/* Live WS Status */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
              isLiveWs
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLiveWs ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
              }`}
            />
            <span>{isLiveWs ? 'Live 100ms' : connectionState}</span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          {/* View Tab Selector */}
          <div className="flex items-center gap-1 bg-[var(--surface-2)] p-0.5 rounded-lg border border-[var(--glass-border)] text-xs">
            <button
              onClick={() => setActiveTab('dom')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === 'dom'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DOM Ladder
            </button>
            <button
              onClick={() => setActiveTab('bands')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === 'bands'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Liquidity Bands
            </button>
          </div>

          {/* Level Depth Count */}
          <select
            value={maxLevels}
            onChange={(e) => setMaxLevels(Number(e.target.value))}
            className="bg-[var(--surface-2)] text-slate-300 text-xs px-2 py-1 rounded-lg border border-[var(--glass-border)] focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            title="Max visible levels per side"
          >
            <option value={8}>8 Levels</option>
            <option value={12}>12 Levels</option>
            <option value={16}>16 Levels</option>
            <option value={20}>20 Levels</option>
          </select>

          {/* Tick Grouping Selector */}
          <select
            value={tickSize}
            onChange={(e) => setTickSize(Number(e.target.value))}
            className="bg-[var(--surface-2)] text-slate-300 text-xs px-2 py-1 rounded-lg border border-[var(--glass-border)] focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            title="Tick Aggregation Size"
          >
            <option value={0}>Raw Ticks</option>
            {recommendedTickSizes.map((sz) => (
              <option key={sz} value={sz}>
                Bin {sz}
              </option>
            ))}
          </select>

          {/* Export DOM CSV */}
          <button
            onClick={() => {
              if (snapshot) {
                const csv = convertDOMSnapshotToCSV(snapshot, true);
                const filename = generateExportFileName(symbol, 'DOM_SNAPSHOT', 'CSV');
                downloadFileClientSide(csv, filename, 'text/csv;charset=utf-8;');
              }
            }}
            disabled={!snapshot}
            className="p-1.5 rounded-lg bg-[var(--surface-2)] text-cyan-400 hover:text-cyan-200 border border-[var(--glass-border)] transition cursor-pointer disabled:opacity-40"
            title="Export DOM Ladder to CSV"
          >
            <Download size={13} />
          </button>

          {/* Collapse/Expand */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-[var(--surface-2)] text-slate-400 hover:text-slate-200 border border-[var(--glass-border)] transition cursor-pointer"
            title={isExpanded ? 'Collapse View' : 'Expand View'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* 2. Depth Imbalance & Book Summary Bar */}
          <div className="space-y-1.5 bg-[var(--surface-2)]/40 p-3 rounded-xl border border-[var(--glass-border)]/50">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <TrendingUp size={13} />
                <span>Bids: {formatVolumeUsdt(snapshot.totalBidDepthUsdt)}</span>
                <span className="text-[10px] text-slate-500">({bidRatio}%)</span>
              </span>

              <span className="text-slate-400 text-[11px]">
                Spread: <b className="text-slate-200">{formatPrice(snapshot.spread)}</b> (
                <span className="text-cyan-300">{snapshot.spreadPercent.toFixed(3)}%</span>)
              </span>

              <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                <span className="text-[10px] text-slate-500">({askRatio}%)</span>
                <span>Asks: {formatVolumeUsdt(snapshot.totalAskDepthUsdt)}</span>
                <TrendingDown size={13} />
              </span>
            </div>

            {/* Split Imbalance Meter */}
            <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-900">
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${bidRatio}%` }}
              />
              <div
                className="bg-rose-500 transition-all duration-300"
                style={{ width: `${askRatio}%` }}
              />
            </div>
          </div>

          {/* 3. TAB 1: DOM LADDER TABLE VIEW */}
          {activeTab === 'dom' && (
            <div className="border border-[var(--glass-border)]/60 rounded-xl overflow-hidden bg-slate-950/40 text-xs">
              {/* Header Columns */}
              <div className="grid grid-cols-12 bg-[var(--surface-2)]/80 py-2 px-3 text-[10px] text-slate-400 uppercase tracking-wider font-bold border-b border-[var(--glass-border)]">
                <div className="col-span-3 text-left">Cumul Bids</div>
                <div className="col-span-2 text-right">Bid Volume</div>
                <div className="col-span-2 text-center text-slate-200">Price</div>
                <div className="col-span-2 text-left">Ask Volume</div>
                <div className="col-span-3 text-right">Cumul Asks</div>
              </div>

              {/* ASKS (Selling Ladder: descending from highest ask down to best ask) */}
              <div className="divide-y divide-slate-900/60">
                {snapshot.askRows.map((row) => (
                  <div
                    key={`ask-${row.price}`}
                    className="grid grid-cols-12 py-1 px-3 items-center hover:bg-slate-800/40 transition-colors relative"
                  >
                    {/* Ask Cumulative Depth Fill (Starts from center and expands rightwards across cols 8-12) */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none transition-all duration-200"
                      style={{ width: `${row.cumulativeDepthPercent / 2}%` }}
                    />

                    {/* Empty Bid Columns */}
                    <div className="col-span-3 text-slate-600 text-[11px]">—</div>
                    <div className="col-span-2 text-slate-600 text-[11px] text-right">—</div>

                    {/* Ask Price */}
                    <div
                      className={`col-span-2 text-center font-bold relative z-10 ${
                        row.isBestAsk ? 'text-rose-300 ring-1 ring-rose-500/50 rounded py-0.5' : 'text-rose-400'
                      }`}
                    >
                      {formatPrice(row.price)}
                    </div>

                    {/* Ask Level Volume */}
                    <div className="col-span-2 text-left pl-2 relative z-10 flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.2 rounded font-semibold ${
                          row.heatIntensity >= 0.7
                            ? 'bg-rose-500/30 text-rose-200 font-bold'
                            : row.heatIntensity >= 0.4
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {formatVolumeUsdt(row.volumeUsdt)}
                      </span>
                      {row.isWall && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-sans font-bold">
                          🧱 {row.wallMultiple}x
                        </span>
                      )}
                    </div>

                    {/* Ask Cumulative Depth */}
                    <div className="col-span-3 text-right text-slate-400 text-[11px] relative z-10">
                      {formatVolumeUsdt(row.cumulativeVolumeUsdt)}
                    </div>
                  </div>
                ))}
              </div>

              {/* SPREAD & MID PRICE DIVIDER */}
              <div className="bg-cyan-500/10 border-y border-cyan-500/30 py-1.5 px-3 flex items-center justify-between text-xs font-bold text-cyan-300">
                <span className="text-[10px] text-slate-400 font-normal">
                  Best Bid: <b className="text-emerald-400">{formatPrice(snapshot.bestBid)}</b>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">MID: {formatPrice(snapshot.midPrice)}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                    Spread: {formatPrice(snapshot.spread)} ({snapshot.spreadPercent.toFixed(3)}%)
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">
                  Best Ask: <b className="text-rose-400">{formatPrice(snapshot.bestAsk)}</b>
                </span>
              </div>

              {/* BIDS (Buying Ladder: descending from best bid down to lowest bid) */}
              <div className="divide-y divide-slate-900/60">
                {snapshot.bidRows.map((row) => (
                  <div
                    key={`bid-${row.price}`}
                    className="grid grid-cols-12 py-1 px-3 items-center hover:bg-slate-800/40 transition-colors relative"
                  >
                    {/* Bid Cumulative Depth Fill (Starts from center and expands leftwards across cols 1-5) */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none transition-all duration-200"
                      style={{ width: `${row.cumulativeDepthPercent / 2}%` }}
                    />

                    {/* Bid Cumulative Depth */}
                    <div className="col-span-3 text-left text-slate-400 text-[11px] relative z-10">
                      {formatVolumeUsdt(row.cumulativeVolumeUsdt)}
                    </div>

                    {/* Bid Level Volume */}
                    <div className="col-span-2 text-right pr-2 relative z-10 flex items-center justify-end gap-1.5">
                      {row.isWall && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-sans font-bold">
                          🛡️ {row.wallMultiple}x
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.2 rounded font-semibold ${
                          row.heatIntensity >= 0.7
                            ? 'bg-emerald-500/30 text-emerald-200 font-bold'
                            : row.heatIntensity >= 0.4
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {formatVolumeUsdt(row.volumeUsdt)}
                      </span>
                    </div>

                    {/* Bid Price */}
                    <div
                      className={`col-span-2 text-center font-bold relative z-10 ${
                        row.isBestBid ? 'text-emerald-300 ring-1 ring-emerald-500/50 rounded py-0.5' : 'text-emerald-400'
                      }`}
                    >
                      {formatPrice(row.price)}
                    </div>

                    {/* Empty Ask Columns */}
                    <div className="col-span-2 text-slate-600 text-[11px] text-left">—</div>
                    <div className="col-span-3 text-slate-600 text-[11px] text-right">—</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. TAB 2: LIQUIDITY BANDS DISTRIBUTION */}
          {activeTab === 'bands' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {liquidityBands.map((band) => (
                  <div
                    key={band.rangePercent}
                    className="p-3.5 rounded-xl bg-[var(--surface-2)]/70 border border-[var(--glass-border)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">
                        ±{band.rangePercent}% Range
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          band.buyerDominancePercent >= 55
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : band.buyerDominancePercent <= 45
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {band.buyerDominancePercent}% Buyers
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-slate-900">
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${band.buyerDominancePercent}%` }}
                      />
                      <div
                        className="bg-rose-500"
                        style={{ width: `${100 - band.buyerDominancePercent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                      <span className="text-emerald-400">
                        Bid: {formatVolumeUsdt(band.bidVolumeUsdt)}
                      </span>
                      <span className="text-rose-400">
                        Ask: {formatVolumeUsdt(band.askVolumeUsdt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Institutional Wall Alerts Breakdown */}
              {snapshot.detectedWalls.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Shield size={14} />
                    <span>Institutional Liquidity Walls Detected ({snapshot.detectedWalls.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {snapshot.detectedWalls.map((w, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-[var(--glass-border)]"
                      >
                        <span
                          className={`font-bold ${
                            w.type === 'BID' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {w.type === 'BID' ? '🛡️ Buy Support' : '🧱 Sell Resistance'} @{' '}
                          {formatPrice(w.price)}
                        </span>
                        <span className="text-slate-300">
                          {formatVolumeUsdt(w.volumeUsdt)}{' '}
                          <span className="text-amber-400 font-bold">
                            ({w.multipleOfAverage ?? 0}x)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
