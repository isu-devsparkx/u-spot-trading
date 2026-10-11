'use client';

// ─── U-SPOT Multi-Asset Live WebSocket Watchlist Strip (Phase 30) ──────
// Sub-second streaming market pulse across top universe pairs
// Real-time price tick flash, 24h gainers/losers filters, and instant navigation

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useMultiAssetTicker } from '@/hooks/useBinanceWebSocket';
import { DEFAULT_WATCHLIST_SYMBOLS } from '@/lib/services/binance-websocket';
import { useWatchlist } from '@/hooks/useWatchlist';
import type { WatchlistFilterMode, WatchlistTickerItem } from '@/types';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  ChevronLeft,
  ChevronRight,
  Radio,
  Eye,
  EyeOff,
  SlidersHorizontal,
} from 'lucide-react';
import WebSocketTelemetryWidget from './WebSocketTelemetryWidget';

interface MarketTickerStripProps {
  customSymbols?: string[];
  initialCollapsed?: boolean;
}

export default function MarketTickerStrip({
  customSymbols,
  initialCollapsed = false,
}: MarketTickerStripProps) {
  const { symbols: userWatchlist } = useWatchlist();
  const activeSymbols = customSymbols || userWatchlist || DEFAULT_WATCHLIST_SYMBOLS;

  const [filterMode, setFilterMode] = useState<WatchlistFilterMode>('ALL');
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    tickerList,
    connectionState,
    isLiveWs,
    isLoading,
    topGainer,
    totalVolumeUsdt,
  } = useMultiAssetTicker(activeSymbols);

  // Filter and sort items based on selected mode
  const displayedTickers = useMemo(() => {
    const list = [...tickerList];
    if (filterMode === 'GAINERS') {
      return list.sort((a, b) => b.priceChangePercent - a.priceChangePercent);
    }
    if (filterMode === 'LOSERS') {
      return list.sort((a, b) => a.priceChangePercent - b.priceChangePercent);
    }
    if (filterMode === 'VOLUME') {
      return list.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    }
    return list;
  }, [tickerList, filterMode]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const offset = direction === 'left' ? -240 : 240;
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const formatPrice = (val: number) => {
    if (!val || isNaN(val)) return '$0.00';
    if (val >= 1000) {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (val >= 1) {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    }
    if (val >= 0.01) {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    }
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
  };

  const formatVolumeCompact = (vol: number) => {
    if (!vol) return '$0';
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(1)}K`;
    return `$${Math.round(vol)}`;
  };

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-between px-4 sm:px-6 py-1 bg-[var(--surface-0)]/90 border-b border-[var(--glass-border)] text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Radio size={11} className={isLiveWs ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
            <span className="font-semibold">{isLiveWs ? 'LIVE FEED' : 'FEED IDLE'}</span>
          </span>
          {topGainer && (
            <span className="hidden sm:inline text-slate-500">
              Top: <span className="text-emerald-400 font-bold">{topGainer.baseAsset} +{topGainer.priceChangePercent.toFixed(2)}%</span>
            </span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition cursor-pointer"
          title="Show Live Market Ticker Strip"
        >
          <Eye size={12} />
          <span>Show Strip</span>
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--glass-border)]/60 bg-[var(--surface-0)]/80 backdrop-blur-md px-3 sm:px-6 py-2 select-none">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Mode Filter Chips & Live Indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {/* WebSocket Heartbeat Telemetry & Status (Phase 36) */}
          <div className="hidden md:block">
            <WebSocketTelemetryWidget compact={true} />
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1 bg-[var(--surface-2)]/80 p-0.5 rounded-lg border border-[var(--glass-border)]">
            {(['ALL', 'GAINERS', 'LOSERS', 'VOLUME'] as WatchlistFilterMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                  filterMode === mode
                    ? 'bg-cyan-500/20 text-cyan-300 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'ALL' && 'All'}
                {mode === 'GAINERS' && '🚀 Gainers'}
                {mode === 'LOSERS' && '🔻 Losers'}
                {mode === 'VOLUME' && '🔥 Vol'}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Horizontal Scrollable Marquee */}
        <div className="relative flex-1 min-w-0 overflow-hidden flex items-center">
          {/* Left Arrow Button */}
          <button
            onClick={() => handleScroll('left')}
            className="hidden sm:flex items-center justify-center w-5 h-7 rounded-l bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition z-10 shrink-0 cursor-pointer border-r border-[var(--glass-border)]"
            title="Scroll Left"
          >
            <ChevronLeft size={13} />
          </button>

          {/* Scroll Container */}
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-1.5 flex-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {isLoading && displayedTickers.length === 0 ? (
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500 py-1">
                <Activity size={12} className="animate-spin text-cyan-400" />
                <span>Connecting live Binance watchlist stream...</span>
              </div>
            ) : (
              displayedTickers.map((item) => {
                const isPositive = item.priceChangePercent >= 0;
                const isUpTick = item.tickDirection === 'UP';
                const isDownTick = item.tickDirection === 'DOWN';

                return (
                  <Link
                    key={item.symbol}
                    href={`/signals?search=${item.baseAsset}`}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all duration-300 group shrink-0 cursor-pointer ${
                      isUpTick
                        ? 'bg-emerald-500/20 border-emerald-500/50 shadow-xs scale-102 ring-1 ring-emerald-500/40'
                        : isDownTick
                        ? 'bg-rose-500/20 border-rose-500/50 shadow-xs scale-102 ring-1 ring-rose-500/40'
                        : 'bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] border-[var(--glass-border)] hover:border-cyan-500/30'
                    }`}
                    title={`${item.symbol} | 24h High: ${formatPrice(item.highPrice)} | 24h Low: ${formatPrice(item.lowPrice)} | Click to filter signals`}
                  >
                    {/* Coin Identity */}
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-xs text-slate-200 group-hover:text-cyan-300 transition-colors">
                        {item.baseAsset}
                      </span>
                    </div>

                    {/* Price with Tick Highlight */}
                    <span
                      className={`font-mono text-xs font-semibold tracking-tight transition-colors ${
                        isUpTick
                          ? 'text-emerald-300 font-bold'
                          : isDownTick
                          ? 'text-rose-300 font-bold'
                          : 'text-slate-100'
                      }`}
                    >
                      {formatPrice(item.price)}
                    </span>

                    {/* 24h Change Pill */}
                    <span
                      className={`flex items-center text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        isPositive
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {item.priceChangePercent.toFixed(2)}%
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          {/* Right Arrow Button */}
          <button
            onClick={() => handleScroll('right')}
            className="hidden sm:flex items-center justify-center w-5 h-7 rounded-r bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white transition z-10 shrink-0 cursor-pointer border-l border-[var(--glass-border)]"
            title="Scroll Right"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Right: Aggregate Summary & Hide Button */}
        <div className="hidden lg:flex items-center gap-3 shrink-0 text-xs font-mono text-slate-400 border-l border-[var(--glass-border)]/60 pl-3">
          {topGainer && (
            <div className="flex items-center gap-1.5">
              <Flame size={12} className="text-amber-400" />
              <span>
                Top: <b className="text-emerald-400">{topGainer.baseAsset}</b> (+{topGainer.priceChangePercent.toFixed(1)}%)
              </span>
            </div>
          )}

          {totalVolumeUsdt > 0 && (
            <span className="text-slate-500">
              Vol: <b className="text-slate-300">{formatVolumeCompact(totalVolumeUsdt)}</b>
            </span>
          )}

          <Link
            href="/settings#watchlist"
            className="p-1 rounded text-slate-500 hover:text-cyan-400 transition cursor-pointer"
            title="Customize Watchlist Pairs"
          >
            <SlidersHorizontal size={13} />
          </Link>

          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 transition cursor-pointer"
            title="Collapse Ticker Strip"
          >
            <EyeOff size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
