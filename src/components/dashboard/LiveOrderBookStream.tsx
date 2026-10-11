'use client';

// ─── U-SPOT Live Order Book & Wall Detection Stream Component ──────────
// Phase 29: Real-time 100ms WebSocket order book depth ladder with institutional wall detection

import React, { useState } from 'react';
import { useLiveOrderBook } from '@/hooks/useBinanceWebSocket';
import { Shield, Layers, Radio, AlertCircle, BarChart2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import DepthOfMarketVisualizer from './DepthOfMarketVisualizer';
import TimeAndSalesTape from './TimeAndSalesTape';
import OrderFlowHeatmapVisualizer from './OrderFlowHeatmapVisualizer';

interface LiveOrderBookStreamProps {
  symbol: string;
  maxLevels?: number;
  compact?: boolean;
}

export default function LiveOrderBookStream({
  symbol,
  maxLevels = 6,
  compact = false,
}: LiveOrderBookStreamProps) {
  const [viewMode, setViewMode] = useState<'ladder' | 'dom' | 'trades' | 'heatmap'>('ladder');
  const {
    depth,
    depthImbalance,
    bidWalls,
    askWalls,
    spread,
    spreadPercent,
    isLiveWs,
    connectionState,
    isLoading,
  } = useLiveOrderBook(symbol);

  const bids = depth?.bids?.slice(0, maxLevels) || [];
  const asks = depth?.asks?.slice(0, maxLevels) || [];

  const maxBidVol = Math.max(1, ...bids.map(([p, q]) => p * q));
  const maxAskVol = Math.max(1, ...asks.map(([p, q]) => p * q));
  const maxVol = Math.max(maxBidVol, maxAskVol);

  const bidRatio = Math.round(((depthImbalance + 1) / 2) * 100);
  const askRatio = 100 - bidRatio;

  return (
    <div className="space-y-3">
      {/* Header View Switcher Card */}
      <div className="p-4 rounded-xl bg-[var(--surface-2)]/90 border border-[var(--glass-border)] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Layers size={13} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">
                Live Order Flow & Wall Scanner
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                Binance Spot L2 Top-20
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono">
              <button
                onClick={() => setViewMode('ladder')}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  viewMode === 'ladder'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ladder
              </button>
              <button
                onClick={() => setViewMode('dom')}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  viewMode === 'dom'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Full DOM
              </button>
              <button
                onClick={() => setViewMode('trades')}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  viewMode === 'trades'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Time & Sales
              </button>
              <button
                onClick={() => setViewMode('heatmap')}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  viewMode === 'heatmap'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Heatmap 2.0
              </button>
            </div>

            {/* Live WS Status Indicator */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border bg-slate-900/60 border-slate-800">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isLiveWs
                    ? 'bg-emerald-400 animate-pulse'
                    : connectionState === 'CONNECTING' || connectionState === 'RECONNECTING'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-slate-500'
                }`}
              />
              <span className={isLiveWs ? 'text-emerald-400' : 'text-slate-400'}>
                {isLiveWs ? 'Live WS (100ms)' : 'Polling Fallback'}
              </span>
            </div>
          </div>
        </div>

        {viewMode === 'heatmap' ? (
          <OrderFlowHeatmapVisualizer symbol={symbol} compact={compact} />
        ) : viewMode === 'trades' ? (
          <TimeAndSalesTape symbol={symbol} maxHistory={50} compact={compact} />
        ) : viewMode === 'dom' ? (
          <DepthOfMarketVisualizer symbol={symbol} initialLevels={Math.max(12, maxLevels)} />
        ) : (
          <>

      {/* Depth Imbalance Ratio Bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[10px] font-mono">
          <span className="text-emerald-400 font-bold">
            Bids: {bidRatio}% ({formatUsd(depth?.bidDepthUsdt)})
          </span>
          <span className="text-slate-500">
            Spread: {spread.toFixed(4)} ({spreadPercent.toFixed(3)}%)
          </span>
          <span className="text-rose-400 font-bold">
            Asks: {askRatio}% ({formatUsd(depth?.askDepthUsdt)})
          </span>
        </div>

        {/* Visual split progress bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
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

      {/* Detected Institutional Liquidity Walls (Phase 23 & 29) */}
      {(bidWalls.length > 0 || askWalls.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {bidWalls.slice(0, 1).map((wall, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono"
            >
              <Shield size={12} className="text-emerald-400" />
              <span>
                <strong>Bid Wall:</strong> ${formatNumber(wall.price, wall.price < 1 ? 4 : 2)}
              </span>
              <span className="text-emerald-400/80 font-semibold">
                ({formatUsd(wall.volumeUsdt)} • {wall.multipleOfAverage}x avg)
              </span>
            </div>
          ))}

          {askWalls.slice(0, 1).map((wall, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[10px] text-rose-300 font-mono"
            >
              <AlertCircle size={12} className="text-rose-400" />
              <span>
                <strong>Ask Wall:</strong> ${formatNumber(wall.price, wall.price < 1 ? 4 : 2)}
              </span>
              <span className="text-rose-400/80 font-semibold">
                ({formatUsd(wall.volumeUsdt)} • {wall.multipleOfAverage}x avg)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Order Book Ladder Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {/* Bids Column */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-wider pb-0.5 border-b border-slate-800">
            <span>Bid Price</span>
            <span>Size</span>
          </div>
          {bids.length > 0 ? (
            bids.map(([price, qty], idx) => {
              const vol = price * qty;
              const fillPct = Math.min(100, Math.round((vol / maxVol) * 100));
              return (
                <div
                  key={idx}
                  className="relative flex justify-between items-center px-1.5 py-0.5 rounded overflow-hidden"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/15 pointer-events-none transition-all duration-200"
                    style={{ width: `${fillPct}%` }}
                  />
                  <span className="text-emerald-400 font-semibold z-10">
                    ${formatNumber(price, price < 1 ? 4 : 2)}
                  </span>
                  <span className="text-slate-400 text-[11px] z-10">
                    {formatNumber(qty, qty < 1 ? 4 : 2)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-[10px] text-slate-600 italic py-2 text-center">
              {isLoading ? 'Streaming bids...' : 'No bids available'}
            </div>
          )}
        </div>

        {/* Asks Column */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-wider pb-0.5 border-b border-slate-800">
            <span>Ask Price</span>
            <span>Size</span>
          </div>
          {asks.length > 0 ? (
            asks.map(([price, qty], idx) => {
              const vol = price * qty;
              const fillPct = Math.min(100, Math.round((vol / maxVol) * 100));
              return (
                <div
                  key={idx}
                  className="relative flex justify-between items-center px-1.5 py-0.5 rounded overflow-hidden"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-rose-500/15 pointer-events-none transition-all duration-200"
                    style={{ width: `${fillPct}%` }}
                  />
                  <span className="text-rose-400 font-semibold z-10">
                    ${formatNumber(price, price < 1 ? 4 : 2)}
                  </span>
                  <span className="text-slate-400 text-[11px] z-10">
                    {formatNumber(qty, qty < 1 ? 4 : 2)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-[10px] text-slate-600 italic py-2 text-center">
              {isLoading ? 'Streaming asks...' : 'No asks available'}
            </div>
          )}
        </div>
      </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatUsd(val?: number): string {
  if (!val || isNaN(val)) return '$0';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}
