'use client';

// ─── U-SPOT Multi-Exchange Spread Arbitrage & Cross-Pair Liquidity Card (Phase 43) ───
// Live cross-exchange spread monitor tracking Binance vs Coinbase vs Kraken spot prices,
// the institutional Coinbase Premium Index, and real-time cross-venue arbitrage spreads.

import React, { useState, useEffect } from 'react';
import type {
  CrossExchangeSpreadSnapshot,
  InstitutionalFlowBias,
} from '@/types';
import {
  Layers,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sparkles,
  Shield,
  Zap,
  Info,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { MAJOR_ARBITRAGE_SYMBOLS } from '@/lib/services/cross-exchange-arbitrage';

interface CrossExchangeArbitrageCardProps {
  initialSymbol?: string;
  compact?: boolean;
}

export default function CrossExchangeArbitrageCard({
  initialSymbol = 'BTC/USDT',
  compact = false,
}: CrossExchangeArbitrageCardProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol);
  const [snapshot, setSnapshot] = useState<CrossExchangeSpreadSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchSpread = async (sym: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/arbitrage/cross-exchange?symbol=${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.snapshot) {
          setSnapshot(data.snapshot);
          setLastRefreshed(Date.now());
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSpread(selectedSymbol);
    const interval = setInterval(() => {
      fetchSpread(selectedSymbol);
    }, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  const getFlowBiasBadge = (bias?: InstitutionalFlowBias) => {
    switch (bias) {
      case 'STRONG_INSTITUTIONAL_BUY':
        return {
          label: 'STRONG INSTITUTIONAL BUY',
          classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10',
          icon: <TrendingUp size={11} className="text-emerald-400" />,
        };
      case 'MODERATE_BUY':
        return {
          label: 'MODERATE US ACCUMULATION',
          classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          icon: <TrendingUp size={11} />,
        };
      case 'INSTITUTIONAL_SELL_PRESSURE':
        return {
          label: 'INSTITUTIONAL SELL PRESSURE',
          classes: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          icon: <TrendingDown size={11} className="text-rose-400" />,
        };
      case 'NEUTRAL':
      default:
        return {
          label: 'NEUTRAL ALIGNMENT',
          classes: 'bg-slate-800/60 text-slate-400 border-slate-700',
          icon: <ArrowRightLeft size={11} />,
        };
    }
  };

  const biasBadge = getFlowBiasBadge(snapshot?.flowBias);

  return (
    <div className="rounded-xl bg-[var(--surface-2)]/95 border border-[var(--glass-border)] p-4 space-y-3.5">
      {/* ─── Header & Asset Switcher ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <ArrowRightLeft size={13} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-slate-100">
                Multi-Exchange Spread Arbitrage Monitor
              </h4>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20">
                Phase 43
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
              <span>Binance • Coinbase • Kraken</span>
              <span>•</span>
              <span className="text-slate-500" suppressHydrationWarning>
                {isMounted ? new Date(lastRefreshed).toLocaleTimeString() : '--:--:--'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Asset Tabs */}
          <div className="flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono">
            {MAJOR_ARBITRAGE_SYMBOLS.slice(0, 4).map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                  selectedSymbol === sym
                    ? 'bg-sky-500/20 text-sky-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sym.split('/')[0]}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchSpread(selectedSymbol)}
            disabled={isLoading}
            className="p-1 rounded bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
            title="Refresh Quotes"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin text-sky-400' : ''} />
          </button>
        </div>
      </div>

      {/* ─── Cross-Exchange Price Quotes Comparison Grid ─── */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        {/* Binance */}
        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-500 text-[9px] mb-1">
            <span>BINANCE SPOT</span>
            <span className="text-yellow-400/80">Benchmark</span>
          </div>
          <div className="text-sm font-bold text-slate-100">
            ${formatNumber(snapshot?.binance.price || 0)}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5 flex justify-between">
            <span>Bid: {formatNumber(snapshot?.binance.bidPrice || 0)}</span>
            <span>Ask: {formatNumber(snapshot?.binance.askPrice || 0)}</span>
          </div>
        </div>

        {/* Coinbase */}
        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-500 text-[9px] mb-1">
            <span>COINBASE SPOT</span>
            <span
              className={`font-bold ${
                (snapshot?.coinbasePremiumPercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {(snapshot?.coinbasePremiumPercent || 0) >= 0 ? '+' : ''}
              {snapshot?.coinbasePremiumPercent.toFixed(2)}%
            </span>
          </div>
          <div className="text-sm font-bold text-slate-100">
            ${formatNumber(snapshot?.coinbase?.price || snapshot?.binance.price || 0)}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5 flex justify-between">
            <span>Premium:</span>
            <span className="text-slate-200">
              {(snapshot?.coinbasePremiumPercent || 0) >= 0 ? '+' : ''}
              {formatNumber(
                (snapshot?.coinbase?.price || 0) - (snapshot?.binance.price || 0)
              )}{' '}
              USDT
            </span>
          </div>
        </div>

        {/* Kraken */}
        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-500 text-[9px] mb-1">
            <span>KRAKEN SPOT</span>
            <span
              className={`font-bold ${
                (snapshot?.krakenPremiumPercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {(snapshot?.krakenPremiumPercent || 0) >= 0 ? '+' : ''}
              {snapshot?.krakenPremiumPercent.toFixed(2)}%
            </span>
          </div>
          <div className="text-sm font-bold text-slate-100">
            ${formatNumber(snapshot?.kraken?.price || snapshot?.binance.price || 0)}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5 flex justify-between">
            <span>Spread:</span>
            <span className="text-slate-200">{snapshot?.kraken?.spreadPercent || 0.05}%</span>
          </div>
        </div>
      </div>

      {/* ─── Institutional Flow Bias & Premium Indicator Bar ─── */}
      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2 text-[10px] font-mono">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Zap size={11} className="text-sky-400" /> Institutional Flow Indicator:
          </span>
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold ${biasBadge.classes}`}
          >
            {biasBadge.icon}
            {biasBadge.label}
          </span>
        </div>

        {/* Visual Premium Spectrum Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>-0.20% (Heavy Discount)</span>
            <span className="text-slate-400 font-bold">0.00% (Parity)</span>
            <span>+0.20% (Institutional Squeeze)</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
            {/* Center zero line marker */}
            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-600 z-10" />

            {/* Premium Fill */}
            {(snapshot?.coinbasePremiumPercent || 0) >= 0 ? (
              <div
                className="absolute top-0 bottom-0 left-1/2 bg-emerald-500 transition-all duration-300"
                style={{
                  width: `${Math.min(50, (snapshot?.coinbasePremiumPercent || 0) * 250)}%`,
                }}
              />
            ) : (
              <div
                className="absolute top-0 bottom-0 bg-rose-500 transition-all duration-300"
                style={{
                  left: `${Math.max(0, 50 - Math.abs(snapshot?.coinbasePremiumPercent || 0) * 250)}%`,
                  width: `${Math.min(50, Math.abs(snapshot?.coinbasePremiumPercent || 0) * 250)}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Arbitrage Opportunity Strip */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
          <span className="text-slate-400">
            Cross-Exchange Max Spread:{' '}
            <span className="text-sky-300 font-bold">{snapshot?.maxSpreadPercent || 0}%</span>
          </span>
          {snapshot?.isArbitrageViable ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              <Sparkles size={11} /> Arb Viable (+{snapshot.estimatedNetProfitPercent}% Net)
            </span>
          ) : (
            <span className="text-slate-500 text-[9px]">
              Within friction buffer (0.25% fee/transfer band)
            </span>
          )}
        </div>
      </div>

      {/* Summary Note */}
      {snapshot?.summary && (
        <div className="text-[10px] text-slate-400 font-mono flex items-start gap-1.5 px-1 leading-relaxed">
          <Info size={12} className="text-sky-400 shrink-0 mt-0.5" />
          <span>{snapshot.summary}</span>
        </div>
      )}
    </div>
  );
}
