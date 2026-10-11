'use client';

// ─── U-SPOT Watchlist Customization Card (Phase 33) ───────────────────
// Allows traders to add, remove, and reorder spot pairs streamed over WebSocket
// on the global ticker bar and scanner, persisting to user profile and localStorage.

import React, { useState } from 'react';
import { useWatchlist, POPULAR_UNIVERSE_SYMBOLS } from '@/hooks/useWatchlist';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Radio,
  Flame,
  Search,
  Sparkles,
} from 'lucide-react';

export default function WatchlistSettingsCard() {
  const {
    symbols,
    addSymbol,
    removeSymbol,
    moveSymbol,
    resetToDefaults,
    isCustomized,
  } = useWatchlist();

  const [inputSymbol, setInputSymbol] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleAddCustom = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputSymbol.trim()) return;

    setIsProcessing(true);
    const res = await addSymbol(inputSymbol);
    setIsProcessing(false);

    if (res.success) {
      showStatus('success', `Added ${inputSymbol.trim().toUpperCase()} to your watchlist.`);
      setInputSymbol('');
    } else {
      showStatus('error', res.error || 'Failed to add symbol.');
    }
  };

  const handleAddQuick = async (sym: string) => {
    setIsProcessing(true);
    const res = await addSymbol(sym);
    setIsProcessing(false);

    if (res.success) {
      showStatus('success', `Added ${sym} to your watchlist.`);
    } else {
      showStatus('error', res.error || 'Failed to add symbol.');
    }
  };

  const handleRemove = async (sym: string) => {
    setIsProcessing(true);
    const res = await removeSymbol(sym);
    setIsProcessing(false);

    if (res.success) {
      showStatus('success', `Removed ${sym} from your watchlist.`);
    } else {
      showStatus('error', res.error || 'Failed to remove symbol.');
    }
  };

  const handleMove = async (sym: string, dir: 'UP' | 'DOWN') => {
    setIsProcessing(true);
    const res = await moveSymbol(sym, dir);
    setIsProcessing(false);

    if (!res.success && res.error) {
      showStatus('error', res.error);
    }
  };

  const handleReset = async () => {
    setIsProcessing(true);
    const res = await resetToDefaults();
    setIsProcessing(false);

    if (res.success) {
      showStatus('success', 'Reset watchlist to default high-liquidity universe.');
    } else {
      showStatus('error', res.error || 'Failed to reset watchlist.');
    }
  };

  return (
    <div id="watchlist" className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--glass-border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">
              Custom Watchlist & Global Ticker Bar
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
              Phase 33 Active
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Customize which Binance spot pairs stream in real-time across your top header marquee and active scanner.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
            <Radio size={12} className="animate-pulse" />
            <span>{symbols.length} Pairs Streaming</span>
          </div>

          {isCustomized && (
            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 text-xs font-medium border border-[var(--glass-border)] transition cursor-pointer disabled:opacity-50"
              title="Reset to default 12 liquid universe pairs"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 animate-fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle size={15} className="shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Input Box to Add Any Custom Pair */}
      <form onSubmit={handleAddCustom} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Add pair (e.g. SUI, NEAR/USDT, RENDER, INJ)..."
            value={inputSymbol}
            onChange={(e) => setInputSymbol(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <button
          type="submit"
          disabled={!inputSymbol.trim() || isProcessing}
          className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Plus size={14} />
          <span>Add Pair</span>
        </button>
      </form>

      {/* Quick Add Suggestions Chips */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={13} className="text-amber-400" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Popular Binance Spot Universe
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_UNIVERSE_SYMBOLS.map((pair) => {
            const isAlreadyAdded = symbols.includes(pair);
            const base = pair.split('/')[0];
            return (
              <button
                key={pair}
                type="button"
                onClick={() => !isAlreadyAdded && handleAddQuick(pair)}
                disabled={isAlreadyAdded || isProcessing}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer border ${
                  isAlreadyAdded
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 opacity-60 cursor-default'
                    : 'bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-slate-300 hover:text-cyan-300 border-[var(--glass-border)] hover:border-cyan-500/40'
                }`}
                title={isAlreadyAdded ? `${pair} already in watchlist` : `Click to add ${pair}`}
              >
                <span>{base}</span>
                {isAlreadyAdded ? (
                  <CheckCircle2 size={11} className="text-emerald-400" />
                ) : (
                  <Plus size={11} className="text-slate-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ordered Active Watchlist List */}
      <div className="space-y-2 pt-2 border-t border-[var(--glass-border)]">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">
            Active Watchlist Display Order
          </span>
          <span className="text-[10px] text-slate-500">
            Reorder pairs using the arrows to adjust display position on ticker strip
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
          {symbols.map((sym, index) => {
            const isFirst = index === 0;
            const isLast = index === symbols.length - 1;
            const baseAsset = sym.split('/')[0];

            return (
              <div
                key={sym}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-2)]/70 hover:bg-[var(--surface-2)] border border-[var(--glass-border)] hover:border-cyan-500/30 transition group"
              >
                {/* Index & Coin Tag */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-xs text-slate-200 group-hover:text-cyan-300 transition-colors truncate">
                      {sym}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">Spot 1x</p>
                  </div>
                </div>

                {/* Control Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMove(sym, 'UP')}
                    disabled={isFirst || isProcessing}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer"
                    title="Move earlier in ticker strip"
                  >
                    <ArrowUp size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMove(sym, 'DOWN')}
                    disabled={isLast || isProcessing}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer"
                    title="Move later in ticker strip"
                  >
                    <ArrowDown size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemove(sym)}
                    disabled={symbols.length <= 1 || isProcessing}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer ml-1"
                    title={symbols.length <= 1 ? 'Watchlist must have at least 1 pair' : `Remove ${sym}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
