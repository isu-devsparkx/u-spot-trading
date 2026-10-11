'use client';

// ─── U-SPOT Time & Sales Live Trade Tape Component ─────────────────────
// Phase 34: High-frequency Binance @trade stream visualizer
// Features: Real-time tape, CVD flow meter, whale filtering, pause/resume

import React, { useState, useMemo } from 'react';
import { useLiveTrades } from '@/hooks/useBinanceWebSocket';
import type { LiveTradeTick } from '@/types';
import { formatNumber } from '@/lib/utils';
import {
  Activity,
  Play,
  Pause,
  Trash2,
  Filter,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Download,
} from 'lucide-react';
import OrderFlowExportModal from '@/components/dashboard/OrderFlowExportModal';

interface TimeAndSalesTapeProps {
  symbol: string;
  maxHistory?: number;
  compact?: boolean;
}

export default function TimeAndSalesTape({
  symbol,
  maxHistory = 60,
  compact = false,
}: TimeAndSalesTapeProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'whales'>('all');
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const {
    trades,
    flowStats,
    isLiveWs,
    connectionState,
    isLoading,
    isPaused,
    togglePause,
    clearTrades,
  } = useLiveTrades(symbol, { maxHistory, enabled: true });

  // Filter trades based on user selection
  const filteredTrades = useMemo(() => {
    if (filterMode === 'whales') {
      return trades.filter((t) => t.isWhale || t.volumeUsdt >= 10000);
    }
    return trades;
  }, [trades, filterMode]);

  const takerBuyPercent = Math.round(flowStats.takerBuyRatio * 100);
  const takerSellPercent = 100 - takerBuyPercent;
  const isCvdBullish = flowStats.netCvdUsdt >= 0;

  return (
    <div className="space-y-3 font-sans">
      {/* ─── HUD: Cumulative Volume Delta (CVD) & Flow Meter ─────────── */}
      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Taker Order Flow:</span>
            <span className="text-emerald-400 font-mono font-bold">
              {takerBuyPercent}% Buy
            </span>
            <span className="text-slate-600 font-mono">/</span>
            <span className="text-rose-400 font-mono font-bold">
              {takerSellPercent}% Sell
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-slate-400">Net CVD:</span>
            <span
              className={`font-bold flex items-center gap-0.5 ${
                isCvdBullish ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isCvdBullish ? (
                <TrendingUp size={12} className="inline" />
              ) : (
                <TrendingDown size={12} className="inline" />
              )}
              {isCvdBullish ? '+' : ''}
              {formatUsdCompact(flowStats.netCvdUsdt)}
            </span>
          </div>
        </div>

        {/* Dynamic Split Ratio Bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden flex shadow-inner">
          <div
            className="bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
            style={{ width: `${takerBuyPercent}%` }}
          />
          <div
            className="bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-300"
            style={{ width: `${takerSellPercent}%` }}
          />
        </div>

        {/* Micro Stats Bar */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono text-slate-400">
          <div className="bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800/60">
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
              Total Vol
            </span>
            <span className="text-slate-200 font-semibold">
              {formatUsdCompact(flowStats.totalVolumeUsdt)}
            </span>
          </div>

          <div className="bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800/60">
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
              Largest Fill
            </span>
            <span className="text-amber-300 font-semibold">
              {formatUsdCompact(flowStats.largestTradeUsdt)}
            </span>
          </div>

          <div className="bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800/60">
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
              Whale Fills
            </span>
            <span className="text-cyan-300 font-semibold">
              {flowStats.whaleTradeCount} <span className="text-[10px]">🐳</span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── Tape Toolbar & Filters ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 text-xs">
        {/* Filter Chips */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer border ${
              filterMode === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            All Trades ({trades.length})
          </button>
          <button
            onClick={() => setFilterMode('whales')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer border ${
              filterMode === 'whales'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <span>🐳 Whales (≥$10k)</span>
            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
              {flowStats.whaleTradeCount}
            </span>
          </button>
        </div>

        {/* Play/Pause & Clear Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={togglePause}
            title={isPaused ? 'Resume live tape' : 'Pause live tape to inspect'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer border ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {isPaused ? <Play size={11} /> : <Pause size={11} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            title="Export trades & order flow data (CSV / JSON)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition cursor-pointer"
          >
            <Download size={11} />
            <span>Export</span>
          </button>

          <button
            onClick={clearTrades}
            title="Clear trade history buffer"
            className="p-1 rounded-lg bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700 transition cursor-pointer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ─── Streaming Trades Table ───────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/80 text-[10px] font-mono uppercase tracking-wider text-slate-400">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Side</div>
          <div className="col-span-3 text-right">Price</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-3 text-right">Total ($)</div>
        </div>

        {/* Table Body Sliding Feed */}
        <div
          className={`${
            compact ? 'max-h-60' : 'max-h-80'
          } overflow-y-auto divide-y divide-slate-800/40 font-mono text-xs`}
        >
          {filteredTrades.length > 0 ? (
            filteredTrades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              {isLoading
                ? 'Connecting to live trades feed...'
                : filterMode === 'whales'
                ? 'No whale trades (≥$10k) detected in recent history'
                : 'Waiting for executed trades...'}
            </div>
          )}
        </div>
      </div>

      {/* Export Modal */}
      <OrderFlowExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        symbol={symbol}
        activeTrades={filteredTrades}
        flowStats={flowStats}
      />
    </div>
  );
}

/** Individual Trade Row Component with Highlight & Animation */
function TradeRow({ trade }: { trade: LiveTradeTick }) {
  const isBuy = trade.side === 'BUY';
  const timeFormatted = formatTime(trade.timestamp);
  const pricePrecision = trade.price < 1 ? 4 : trade.price < 100 ? 3 : 2;

  return (
    <div
      className={`grid grid-cols-12 gap-1 px-3 py-1 items-center transition-colors hover:bg-slate-900/50 ${
        trade.isWhale
          ? 'bg-amber-500/5 border-l-2 border-amber-400/80'
          : 'border-l-2 border-transparent'
      }`}
    >
      {/* Time */}
      <div className="col-span-2 text-[10px] text-slate-500">
        {timeFormatted}
      </div>

      {/* Side Badge */}
      <div className="col-span-2 flex items-center gap-1">
        <span
          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider border ${
            isBuy
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          }`}
        >
          {trade.side}
        </span>
      </div>

      {/* Price */}
      <div
        className={`col-span-3 text-right font-semibold ${
          isBuy ? 'text-emerald-400' : 'text-rose-400'
        }`}
      >
        ${formatNumber(trade.price, pricePrecision)}
      </div>

      {/* Quantity */}
      <div className="col-span-2 text-right text-slate-400 text-[11px]">
        {formatNumber(trade.quantity, trade.quantity < 1 ? 4 : 2)}
      </div>

      {/* Total USDT & Whale Emoji */}
      <div className="col-span-3 text-right text-slate-200 font-medium flex items-center justify-end gap-1">
        {trade.isWhale && (
          <span
            title={`Whale Order: ${trade.sizeCategory} ($${trade.volumeUsdt.toLocaleString()})`}
            className="text-[11px]"
          >
            🐳
          </span>
        )}
        <span className={trade.isWhale ? 'text-amber-300 font-bold' : ''}>
          ${trade.volumeUsdt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}

/** Formats timestamp to HH:mm:ss */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Formats dollar amounts into compact human-readable string */
function formatUsdCompact(val?: number): string {
  if (val === undefined || isNaN(val)) return '$0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
