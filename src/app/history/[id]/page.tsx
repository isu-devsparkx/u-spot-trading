'use client';

// ─── U-SPOT Dedicated Signal Detail Page & Trade Plan — Phase 11 ─────────────
// Spec Section 26: Signal Detail Page
// Spec Section 45: Signal History Visualization
// Complete audit trail, candlestick replay, MFE/MAE, causality diagnosis,
// interactive position sizing engine, DCA tranches, and profit/loss projections

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import ChartReplay from '@/components/history/ChartReplay';
import LiveOrderBookStream from '@/components/dashboard/LiveOrderBookStream';
import { calculatePositionSize, getDefaultRiskForGrade } from '@/lib/risk-engine';
import type {
  SignalHistoryRecord,
  SignalLifecycleEvent,
  SignalEvaluation,
} from '@/types';
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Target,
  Layers,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Calendar,
  DollarSign,
  Activity,
  FileText,
  Compass,
  Calculator,
  Sliders,
  Wallet,
  Coins,
  Scale,
  ArrowUpRight,
  PieChart,
  CheckCircle2,
  Zap,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SignalDetailPage({ params }: PageProps) {
  const { id } = use(params);

  const [signal, setSignal] = useState<SignalHistoryRecord | null>(null);
  const [events, setEvents] = useState<SignalLifecycleEvent[]>([]);
  const [evaluation, setEvaluation] = useState<SignalEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [copiedReview, setCopiedReview] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'sizing' | 'timeline' | 'review' | 'setup'>('sizing');
  const [walletBalance, setWalletBalance] = useState<number>(300);
  const [customRiskPercent, setCustomRiskPercent] = useState<number | null>(null);

  // Load signal, events, and evaluation
  const loadSignalData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/signals/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setSignal(json.data.signal);
          setEvents(json.data.events || []);
          setEvaluation(json.data.evaluation || null);
        }
      }
    } catch (err) {
      console.error('Failed to load signal detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSignalData();
  }, [id]);

  // Base currency symbol (e.g. "UNI" from "UNI/USDT")
  const baseAsset = useMemo(() => {
    if (!signal?.symbol) return 'COIN';
    return signal.symbol.includes('/')
      ? signal.symbol.split('/')[0]
      : signal.symbol.replace('USDT', '');
  }, [signal?.symbol]);

  // Effective risk percentage based on signal confidence or user override
  const effectiveRiskPercent = useMemo(() => {
    if (customRiskPercent !== null) return customRiskPercent;
    if (signal) {
      return signal.riskPercent || getDefaultRiskForGrade(signal.confidence) || 1.0;
    }
    return 1.0;
  }, [customRiskPercent, signal]);

  // Position sizing engine calculation
  const sizing = useMemo(() => {
    if (!signal) return null;
    const entryPrice = signal.preferredEntry || signal.entryZone?.low || 0;
    const stopLossPrice = signal.stopLoss || 0;
    if (entryPrice <= 0 || stopLossPrice <= 0 || stopLossPrice >= entryPrice) {
      return null;
    }

    const hasDca1 =
      typeof signal.dca1 === 'number' &&
      signal.dca1 > 0 &&
      signal.dca1 < entryPrice &&
      signal.dca1 > stopLossPrice;

    const hasDca2 =
      hasDca1 &&
      typeof signal.dca2 === 'number' &&
      signal.dca2 > 0 &&
      signal.dca2 < signal.dca1 &&
      signal.dca2 > stopLossPrice;

    return calculatePositionSize({
      walletBalance,
      riskPercent: effectiveRiskPercent,
      entryPrice,
      stopLossPrice,
      dca1Price: hasDca1 ? signal.dca1 : undefined,
      dca2Price: hasDca2 ? signal.dca2 : undefined,
      takeProfits: {
        tp1: signal.tp1 > 0 ? signal.tp1 : undefined,
        tp2: signal.tp2 > 0 ? signal.tp2 : undefined,
        tp3: signal.tp3 > 0 ? signal.tp3 : undefined,
      },
    });
  }, [signal, walletBalance, effectiveRiskPercent]);

  // Tranche allocations
  const entryTranche = sizing?.tranches.find((t) => t.orderName === 'Entry');
  const dca1Tranche = sizing?.tranches.find((t) => t.orderName === 'DCA #1');
  const dca2Tranche = sizing?.tranches.find((t) => t.orderName === 'DCA #2');

  // Take profit targets
  const tp1Target = sizing?.takeProfits.find((tp) => tp.target === 'TP1');
  const tp2Target = sizing?.takeProfits.find((tp) => tp.target === 'TP2');
  const tp3Target = sizing?.takeProfits.find((tp) => tp.target === 'TP3');

  // Coins to sell per target
  const tp1Coins = (sizing?.totalQuantity ?? 0) * ((tp1Target?.portionPercent ?? 30) / 100);
  const tp2Coins = (sizing?.totalQuantity ?? 0) * ((tp2Target?.portionPercent ?? 30) / 100);
  const tp3Coins = (sizing?.totalQuantity ?? 0) * ((tp3Target?.portionPercent ?? 40) / 100);

  // Trigger manual post-trade re-evaluation
  const handleReevaluate = async () => {
    if (!signal) return;
    setIsEvaluating(true);
    try {
      const res = await fetch(`/api/signals/${id}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setEvaluation(json.data);
          await loadSignalData();
        }
      }
    } catch (err) {
      console.error('Failed to re-evaluate signal:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleCopyReview = () => {
    const textToCopy =
      evaluation?.evaluationText ||
      signal?.evaluationText ||
      'No evaluation text available.';
    navigator.clipboard.writeText(textToCopy);
    setCopiedReview(true);
    setTimeout(() => setCopiedReview(false), 2000);
  };

  const formatUsd = (val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    if (Math.abs(val) >= 100) return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (Math.abs(val) >= 1) return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    if (Math.abs(val) >= 0.01) return `$${val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
  };

  const formatCoins = (qty?: number | null) => {
    if (qty === undefined || qty === null || isNaN(qty)) return '—';
    if (qty >= 1000) return qty.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (qty >= 1) return qty.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return qty.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const formatMs = (ms?: number | null) => {
    if (ms === undefined || ms === null || ms < 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-cyan-400 font-mono text-sm">
            <RefreshCw size={18} className="animate-spin" />
            <span>Loading Trade Plan & Audit Trail...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle size={36} className="text-amber-400 mb-3" />
          <h2 className="text-lg font-bold text-slate-200">Signal Not Found</h2>
          <p className="text-sm text-slate-500 mb-4">
            Could not locate signal record with ID: <span className="font-mono text-slate-400">{id}</span>
          </p>
          <Link
            href="/history"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition"
          >
            <ArrowLeft size={14} /> Back to Signal History
          </Link>
        </div>
      </div>
    );
  }

  const isProfit = (signal.realizedR ?? 0) > 0;
  const isLoss = (signal.realizedR ?? 0) < 0 || signal.finalResult === 'SL';
  const entryPrice = signal.preferredEntry || signal.entryZone.low;
  const stopLossPrice = signal.stopLoss;

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <Header />

      <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Breadcrumb & Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Link
              href="/signals"
              className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-400 transition group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              <span>Live Signals</span>
            </Link>
            <span className="text-slate-600">/</span>
            <Link
              href="/history"
              className="text-slate-400 hover:text-cyan-400 transition"
            >
              <span>Signal History</span>
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-cyan-400 font-mono">{signal.symbol} Trade Plan</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReevaluate}
              disabled={isEvaluating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] text-slate-300 hover:text-cyan-400 border border-[var(--glass-border)] text-xs font-medium transition disabled:opacity-50"
            >
              <RefreshCw size={13} className={isEvaluating ? 'animate-spin text-cyan-400' : ''} />
              <span>{isEvaluating ? 'Evaluating...' : 'Re-evaluate Signal'}</span>
            </button>

            <button
              onClick={handleCopyReview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-medium transition"
            >
              {copiedReview ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copiedReview ? 'Copied Review!' : 'Copy Review Markdown'}</span>
            </button>
          </div>
        </div>

        {/* Master Signal Hero Banner */}
        <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 lg:p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 relative z-10">
            {/* Left: Identity */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl lg:text-3xl font-bold font-mono tracking-tight text-slate-100">
                  {signal.symbol}
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold font-mono ${
                    signal.direction === 'BUY'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {signal.direction} SPOT (1x)
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono">
                  Grade {signal.confidence}
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
                  {signal.lifecycle}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-mono">
                  <Calendar size={12} className="text-slate-500" />
                  {new Date(signal.createdAt).toLocaleString()}
                </span>
                <span>•</span>
                <span className="font-mono text-slate-400">
                  ID: <span className="text-slate-300">{signal.signalId}</span>
                </span>
                <span>•</span>
                <span className="text-slate-400">
                  Setup: <span className="text-cyan-300 font-semibold">{signal.setupType}</span>
                </span>
                <span>•</span>
                <span className="text-slate-400">
                  Regime: <span className="text-slate-200 font-medium">{signal.marketRegime}</span>
                </span>
              </div>
            </div>

            {/* Right: Outcome Scorecard */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Final Result Badge */}
              <div className="bg-[var(--surface-2)]/80 px-4 py-2 rounded-xl border border-[var(--glass-border)] text-right">
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Final Result</p>
                <p
                  className={`font-mono font-bold text-sm lg:text-base ${
                    isProfit
                      ? 'text-emerald-400'
                      : isLoss
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {signal.finalResult || signal.lifecycle}
                </p>
              </div>

              {/* Realized R Multiple */}
              <div className="bg-[var(--surface-2)]/80 px-4 py-2 rounded-xl border border-[var(--glass-border)] text-right min-w-[90px]">
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Realized R</p>
                <p
                  className={`font-mono font-bold text-base lg:text-lg ${
                    isProfit
                      ? 'text-emerald-400'
                      : isLoss
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {signal.realizedR !== null && signal.realizedR !== undefined
                    ? signal.realizedR > 0
                      ? `+${signal.realizedR.toFixed(2)}R`
                      : `${signal.realizedR.toFixed(2)}R`
                    : '—'}
                </p>
              </div>

              {/* Net P&L in USDT */}
              <div className="bg-[var(--surface-2)]/80 px-4 py-2 rounded-xl border border-[var(--glass-border)] text-right min-w-[100px]">
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Net P&L</p>
                <p
                  className={`font-mono font-bold text-base lg:text-lg ${
                    (evaluation?.netPnlUsdt ?? 0) > 0
                      ? 'text-emerald-400'
                      : (evaluation?.netPnlUsdt ?? 0) < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {evaluation?.netPnlUsdt !== null && evaluation?.netPnlUsdt !== undefined
                    ? evaluation.netPnlUsdt > 0
                      ? `+$${evaluation.netPnlUsdt.toFixed(2)}`
                      : `$${evaluation.netPnlUsdt.toFixed(2)}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Left Column (2 Cols wide on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Candlestick Chart Replay */}
            <ChartReplay
              signal={signal}
              events={events}
              evaluation={evaluation}
              initialInterval="15m"
            />

            {/* Navigation Tabs for Details */}
            <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-2 text-xs font-medium overflow-x-auto">
              <button
                onClick={() => setActiveTab('sizing')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'sizing'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calculator size={13} />
                <span>Trade Plan & Position Sizing</span>
              </button>

              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'timeline'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity size={13} />
                <span>Execution Timeline ({events.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('review')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'review'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText size={13} />
                <span>Post-Trade Review</span>
              </button>

              <button
                onClick={() => setActiveTab('setup')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'setup'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass size={13} />
                <span>Strategy Thesis & Factor Weights</span>
              </button>
            </div>

            {/* TAB: TRADE PLAN & POSITION SIZING */}
            {activeTab === 'sizing' && (
              <div className="space-y-6">
                {/* 1. Interactive Portfolio Sizer Bar */}
                <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-4 lg:p-5 shadow-lg space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sliders size={16} className="text-cyan-400" />
                      <h3 className="text-sm font-semibold text-slate-200">
                        Portfolio Sizing & Risk Controls
                      </h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                        Spot 1x
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 font-mono">
                      Risk Budget:{' '}
                      <span className="text-cyan-300 font-bold">
                        ${sizing ? sizing.maxRiskUsdt.toFixed(2) : '—'} USDT
                      </span>{' '}
                      ({effectiveRiskPercent}%)
                    </div>
                  </div>

                  {/* Portfolio Size Chips + Input */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-[var(--glass-border)]/60">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Wallet size={12} className="text-cyan-400" />
                          Account Balance (USDT)
                        </span>
                        <span className="font-mono text-slate-300 font-bold">${walletBalance}</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[100, 300, 500, 1000, 2500, 5000].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setWalletBalance(amt)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                              walletBalance === amt
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-sm'
                                : 'bg-[var(--surface-2)] text-slate-400 hover:text-slate-200 border border-[var(--glass-border)]'
                            }`}
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Scale size={12} className="text-cyan-400" />
                          Risk Tolerance per Trade
                        </span>
                        <span className="font-mono text-cyan-300 font-bold">{effectiveRiskPercent}%</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[0.5, 0.75, 1.0, 1.5, 2.0].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => setCustomRiskPercent(pct)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                              effectiveRiskPercent === pct
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold shadow-sm'
                                : 'bg-[var(--surface-2)] text-slate-400 hover:text-slate-200 border border-[var(--glass-border)]'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {sizing?.isCappedByWallet && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>
                        Position size capped at 30% of portfolio ($
                        {((walletBalance * 0.3)).toFixed(2)} USDT) per institutional spot risk rules.
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Top Summary KPI Cards */}
                {sizing && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Card 1: Initial Entry */}
                    <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-xl p-3.5 space-y-1 shadow-sm">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        How Much to Trade (Entry)
                      </p>
                      <p className="text-lg lg:text-xl font-bold font-mono text-cyan-300">
                        ${sizing.initialAllocation.toFixed(2)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        {formatCoins(sizing.initialQuantity)} {baseAsset}
                      </p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">
                        58.1% of capital
                      </span>
                    </div>

                    {/* Card 2: Max Deployed */}
                    <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-xl p-3.5 space-y-1 shadow-sm">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        Total Capital (With DCA)
                      </p>
                      <p className="text-lg lg:text-xl font-bold font-mono text-slate-100">
                        ${sizing.maxDeployed.toFixed(2)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        {formatCoins(sizing.totalQuantity)} {baseAsset} total
                      </p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {sizing.percentOfWallet}% of wallet
                      </span>
                    </div>

                    {/* Card 3: Potential Profit */}
                    <div className="bg-[var(--surface-1)] border border-emerald-500/30 rounded-xl p-3.5 space-y-1 shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                        How Much Will Profit
                      </p>
                      <p className="text-lg lg:text-xl font-bold font-mono text-emerald-400">
                        +${sizing.totalPotentialNetProfitUsdt.toFixed(2)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        +{((sizing.totalPotentialNetProfitUsdt / sizing.maxDeployed) * 100).toFixed(1)}% on trade
                      </p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono font-bold">
                        R:R {sizing.riskRewardRatio.toFixed(2)}:1
                      </span>
                    </div>

                    {/* Card 4: How Much Loss */}
                    <div className="bg-[var(--surface-1)] border border-rose-500/30 rounded-xl p-3.5 space-y-1 shadow-sm bg-gradient-to-br from-rose-500/5 to-transparent">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-rose-400">
                        How Much Loss (Max)
                      </p>
                      <p className="text-lg lg:text-xl font-bold font-mono text-rose-400">
                        -${sizing.plannedLossAtSlUsdt.toFixed(2)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        -{sizing.riskPercent.toFixed(2)}% wallet risk ceiling
                      </p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 font-mono">
                        Guaranteed Invalidation
                      </span>
                    </div>
                  </div>
                )}

                {/* 3. Detailed Tranche & DCA Execution Levels */}
                <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Layers size={15} className="text-cyan-400" />
                      How Much to Trade & Dollar Cost Averaging (DCA) Levels
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      Blended Avg Entry: <b className="text-slate-200">{formatUsd(sizing?.averageEntryPrice)}</b>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {/* Tranche 1: Initial Entry */}
                    <div className="bg-[var(--surface-2)]/60 border border-cyan-500/30 rounded-xl p-4 space-y-3 relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                          Initial Entry (58.1%)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Order 1</span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] text-slate-400">Entry Trigger Price</p>
                        <p className="text-lg font-bold font-mono text-slate-100">
                          {formatUsd(entryPrice)}
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[var(--glass-border)] text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">USDT to Trade:</span>
                          <span className="text-cyan-300 font-bold">
                            ${entryTranche?.allocationUsdt.toFixed(2) ?? '—'} USDT
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coins to Buy:</span>
                          <span className="text-slate-200 font-bold">
                            {formatCoins(entryTranche?.quantityCoins)} {baseAsset}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1">
                          <span className="text-slate-500">Loss if SL alone:</span>
                          <span className="text-rose-400">
                            -${entryTranche?.plannedLossUsdt.toFixed(2) ?? '—'} USDT
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tranche 2: DCA #1 */}
                    <div className="bg-[var(--surface-2)]/60 border border-amber-500/30 rounded-xl p-4 space-y-3 relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          DCA #1 Dip (23.3%)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Order 2</span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] text-slate-400">DCA 1 Trigger Price</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-lg font-bold font-mono text-slate-100">
                            {formatUsd(signal.dca1)}
                          </p>
                          {signal.dca1 > 0 && entryPrice > 0 && (
                            <span className="text-[10px] font-mono text-amber-400">
                              (-{(((entryPrice - signal.dca1) / entryPrice) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[var(--glass-border)] text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">USDT to Trade:</span>
                          <span className="text-amber-300 font-bold">
                            ${dca1Tranche?.allocationUsdt.toFixed(2) ?? '—'} USDT
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coins to Buy:</span>
                          <span className="text-slate-200 font-bold">
                            {formatCoins(dca1Tranche?.quantityCoins)} {baseAsset}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1">
                          <span className="text-slate-500">Cumulative:</span>
                          <span className="text-slate-300">
                            ${((entryTranche?.allocationUsdt ?? 0) + (dca1Tranche?.allocationUsdt ?? 0)).toFixed(2)} USDT
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tranche 3: DCA #2 */}
                    <div className="bg-[var(--surface-2)]/60 border border-amber-500/30 rounded-xl p-4 space-y-3 relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          DCA #2 Deep Support (18.6%)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Order 3</span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] text-slate-400">DCA 2 Trigger Price</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-lg font-bold font-mono text-slate-100">
                            {formatUsd(signal.dca2)}
                          </p>
                          {signal.dca2 > 0 && entryPrice > 0 && (
                            <span className="text-[10px] font-mono text-amber-400">
                              (-{(((entryPrice - signal.dca2) / entryPrice) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[var(--glass-border)] text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">USDT to Trade:</span>
                          <span className="text-amber-300 font-bold">
                            ${dca2Tranche?.allocationUsdt.toFixed(2) ?? '—'} USDT
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coins to Buy:</span>
                          <span className="text-slate-200 font-bold">
                            {formatCoins(dca2Tranche?.quantityCoins)} {baseAsset}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1">
                          <span className="text-slate-500">Max Position:</span>
                          <span className="text-slate-300">
                            ${sizing?.maxDeployed.toFixed(2)} USDT (100%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Take Profit Targets & Projected Profits */}
                <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Target size={15} className="text-emerald-400" />
                      Take Profit Execution & Projected Returns (How Much Will Profit)
                    </h3>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      Total Potential: +${sizing?.totalPotentialNetProfitUsdt.toFixed(2)} USDT
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {/* TP 1 */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          TP1 (30% Scale Out)
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          +{tp1Target?.rMultiple.toFixed(2)}R
                        </span>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-400">Target Exit Price</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-lg font-bold font-mono text-slate-100">
                            {formatUsd(signal.tp1)}
                          </p>
                          <span className="text-xs font-mono text-emerald-400">
                            (+{tp1Target?.gainPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-emerald-500/20 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coins to Sell:</span>
                          <span className="text-slate-200">
                            {formatCoins(tp1Coins)} {baseAsset}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Net Profit:</span>
                          <span className="text-emerald-400 font-bold">
                            +${tp1Target?.netProfitUsdt.toFixed(2)} USDT
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 pt-1">
                          Strategy: Move stop loss to break-even to de-risk trade.
                        </p>
                      </div>
                    </div>

                    {/* TP 2 */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          TP2 (30% Scale Out)
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          +{tp2Target?.rMultiple.toFixed(2)}R
                        </span>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-400">Target Exit Price</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-lg font-bold font-mono text-slate-100">
                            {formatUsd(signal.tp2)}
                          </p>
                          <span className="text-xs font-mono text-emerald-400">
                            (+{tp2Target?.gainPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-emerald-500/20 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coins to Sell:</span>
                          <span className="text-slate-200">
                            {formatCoins(tp2Coins)} {baseAsset}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Net Profit:</span>
                          <span className="text-emerald-400 font-bold">
                            +${tp2Target?.netProfitUsdt.toFixed(2)} USDT
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 pt-1">
                          Cumulative so far: +${((tp1Target?.netProfitUsdt ?? 0) + (tp2Target?.netProfitUsdt ?? 0)).toFixed(2)} USDT
                        </p>
                      </div>
                    </div>

                    {/* TP 3 */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          TP3 (40% Runner Exit)
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          +{tp3Target?.rMultiple.toFixed(2)}R
                        </span>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-400">Target Exit Price</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-lg font-bold font-mono text-slate-100">
                            {formatUsd(signal.tp3)}
                          </p>
                          <span className="text-xs font-mono text-emerald-400">
                            (+{tp3Target?.gainPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 pt-2 border-t border-emerald-500/20 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Coins to Sell:</span>
                          <span className="text-slate-200">
                            {formatCoins(tp3Coins)} {baseAsset}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Net Profit:</span>
                          <span className="text-emerald-400 font-bold">
                            +${tp3Target?.netProfitUsdt.toFixed(2)} USDT
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 pt-1">
                          Full target achieved: Macro trend runner closed.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Downside Risk Scenarios (How Much Loss) */}
                <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Shield size={15} className="text-rose-400" />
                      Downside Risk & Invalidation Scenarios (How Much Loss)
                    </h3>
                    <span className="text-xs font-mono text-rose-400">
                      Stop Loss: <b className="text-slate-200">{formatUsd(stopLossPrice)}</b>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Scenario A */}
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">
                          Scenario A: Stopped at Initial Entry Only
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        If price triggers your initial entry and falls directly through stop loss without filling DCA orders:
                      </p>

                      <div className="space-y-1.5 pt-2 border-t border-rose-500/20 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Capital at Risk:</span>
                          <span className="text-slate-200">${entryTranche?.allocationUsdt.toFixed(2)} USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Realized Loss:</span>
                          <span className="text-rose-400 font-bold">
                            -${entryTranche?.plannedLossUsdt.toFixed(2)} USDT
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Impact on Account:</span>
                          <span className="text-rose-400">
                            -{(((entryTranche?.plannedLossUsdt ?? 0) / walletBalance) * 100).toFixed(2)}% of wallet
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1">
                          <span className="text-emerald-400">Unused DCA Capital Preserved:</span>
                          <span className="text-emerald-400 font-bold">
                            ${((dca1Tranche?.allocationUsdt ?? 0) + (dca2Tranche?.allocationUsdt ?? 0)).toFixed(2)} USDT
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Scenario B */}
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">
                          Scenario B: Full DCA Deployment Stopped Out
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Worst-case scenario: All tranches (Entry + DCA1 + DCA2) fill and then invalidation price is breached:
                      </p>

                      <div className="space-y-1.5 pt-2 border-t border-rose-500/20 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Capital Deployed:</span>
                          <span className="text-slate-200">${sizing?.maxDeployed.toFixed(2)} USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Max Invalidation Loss:</span>
                          <span className="text-rose-400 font-bold">
                            -${sizing?.plannedLossAtSlUsdt.toFixed(2)} USDT
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Guaranteed Max Risk Ceiling:</span>
                          <span className="text-rose-400 font-bold">
                            -{sizing?.riskPercent.toFixed(2)}% of wallet
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1">
                          <span className="text-emerald-400">Remaining Wallet Equity:</span>
                          <span className="text-emerald-400 font-bold">
                            ${(walletBalance - (sizing?.plannedLossAtSlUsdt ?? 0)).toFixed(2)} USDT
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: EXECUTION TIMELINE */}
            {activeTab === 'timeline' && (
              <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Activity size={15} className="text-cyan-400" />
                    Lifecycle Audit Log
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">
                    {events.length} Recorded Transitions
                  </span>
                </div>

                {events.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">
                    No discrete lifecycle events logged for this signal yet.
                  </p>
                ) : (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--glass-border)]">
                    {events.map((ev, index) => {
                      const isSL = ev.eventType === 'SL';
                      const isTP = ev.eventType.startsWith('TP');
                      const isEntry = ev.eventType === 'ENTRY';
                      const isDCA = ev.eventType.startsWith('DCA');

                      const dotColor = isTP
                        ? 'bg-emerald-400'
                        : isSL
                        ? 'bg-rose-400'
                        : isEntry
                        ? 'bg-cyan-400'
                        : isDCA
                        ? 'bg-amber-400'
                        : 'bg-slate-400';

                      return (
                        <div key={ev.eventId || index} className="relative group">
                          <span
                            className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-slate-900 ${dotColor}`}
                          />
                          <div className="bg-[var(--surface-2)]/60 rounded-xl p-3 border border-[var(--glass-border)]/70 hover:border-cyan-500/30 transition">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <span
                                className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                                  isTP
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : isSL
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : isEntry
                                    ? 'bg-cyan-500/10 text-cyan-400'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {ev.eventType}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                {new Date(ev.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                              {ev.price && (
                                <span>
                                  Execution Price:{' '}
                                  <b className="font-mono text-slate-200">
                                    {formatUsd(ev.price)}
                                  </b>
                                </span>
                              )}
                              {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                                <span className="text-[11px] text-slate-500">
                                  {JSON.stringify(ev.metadata)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: POST-TRADE REVIEW */}
            {activeTab === 'review' && (
              <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <FileText size={15} className="text-cyan-400" />
                    Structured Post-Trade Evaluation Report
                  </h3>
                  <button
                    onClick={handleCopyReview}
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition"
                  >
                    {copiedReview ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedReview ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Stop Loss Root Cause Diagnostic Banner */}
                {evaluation?.slFailurePrimaryCause && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                      <AlertTriangle size={14} />
                      <span>SL Primary Root Cause: {evaluation.slFailurePrimaryCause}</span>
                    </div>
                    {evaluation.slFailureSecondaryCauses &&
                      evaluation.slFailureSecondaryCauses.length > 0 && (
                        <p className="text-[11px] text-slate-400">
                          Secondary Contributing Causes:{' '}
                          <span className="text-slate-300">
                            {evaluation.slFailureSecondaryCauses.join(', ')}
                          </span>
                        </p>
                      )}
                  </div>
                )}

                {/* Stop Tightness Assessment Card */}
                {evaluation?.stopTightnessLabel && (
                  <div className="bg-[var(--surface-2)]/60 border border-[var(--glass-border)] rounded-xl p-3 text-xs space-y-1">
                    <p className="text-slate-500 font-mono text-[10px] uppercase">
                      Stop Tightness Assessment
                    </p>
                    <p className="font-semibold text-cyan-300">
                      {evaluation.stopTightnessLabel}
                    </p>
                    {evaluation.counterfactualNote && (
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {evaluation.counterfactualNote}
                      </p>
                    )}
                  </div>
                )}

                {/* Markdown Review Output */}
                <div className="bg-slate-950/80 rounded-xl p-4 border border-[var(--glass-border)] font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {evaluation?.evaluationText || signal.evaluationText || 'Evaluation pending.'}
                </div>
              </div>
            )}

            {/* TAB: STRATEGY THESIS & FACTOR WEIGHTS */}
            {activeTab === 'setup' && (
              <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-5">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Compass size={15} className="text-cyan-400" />
                  Original Setup & Factor Scoring Thesis
                </h3>

                <div className="space-y-3">
                  <div className="bg-[var(--surface-2)]/60 rounded-xl p-3.5 border border-[var(--glass-border)]">
                    <p className="text-[10px] font-mono uppercase text-slate-500 mb-1">
                      Confirmation Condition
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {signal.confirmationCondition || 'Price entered optimal zone.'}
                    </p>
                  </div>

                  <div className="bg-[var(--surface-2)]/60 rounded-xl p-3.5 border border-[var(--glass-border)]">
                    <p className="text-[10px] font-mono uppercase text-slate-500 mb-1">
                      Setup Rationale & Thesis
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {signal.rationale || signal.taSummary || 'Multi-factor alignment confirmed.'}
                    </p>
                  </div>

                  {signal.aiAnalysis && (
                    <div className="bg-purple-950/20 border border-purple-500/25 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-purple-300 font-bold flex items-center gap-1.5">
                          <Zap size={11} className="text-purple-400" />
                          AI Officer Audit ({signal.aiAnalysis.source === 'GEMINI' ? 'Gemini 2.5 Flash' : 'Quantitative Gatekeeper'})
                        </span>
                        <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/30">
                          {signal.aiAnalysis.confidenceScore}% Confidence • {signal.aiAnalysis.verdict}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{signal.aiAnalysis.aiRationale}</p>
                      {signal.aiAnalysis.keyRisks && signal.aiAnalysis.keyRisks.length > 0 && (
                        <p className="text-[10px] text-amber-300/90 pt-1 font-mono">
                          Key Risk: {signal.aiAnalysis.keyRisks[0]}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {signal.tradeScoreBreakdown && (
                  <div className="space-y-2 pt-2 border-t border-[var(--glass-border)]/60">
                    <p className="text-[10px] font-mono uppercase text-slate-500">
                      7-Factor Trade Score Breakdown (Score: {signal.tradeScore}/100)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                      {Object.entries(signal.tradeScoreBreakdown)
                        .filter(([k, v]) => k !== 'total' && typeof v === 'number' && !isNaN(v))
                        .map(([factor, score]) => {
                          const numScore = Number(score);
                          return (
                            <div
                              key={factor}
                              className="bg-[var(--surface-2)]/40 rounded-lg p-2.5 border border-[var(--glass-border)]/40"
                            >
                              <div className="flex justify-between items-center text-[11px] mb-1">
                                <span className="capitalize text-slate-400">{factor}</span>
                                <span className="font-mono font-bold text-slate-200">{numScore}</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-cyan-400 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(0, numScore))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Key Metrics & Financial Audit (1 Col wide) */}
          <div className="space-y-6">
            {/* Live Binance Order Book Depth Stream (Phase 29) */}
            <LiveOrderBookStream
              symbol={signal.symbol}
              maxLevels={10}
            />

            {/* Planned Order Ladder with Quantities & Profits */}
            <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Target size={15} className="text-cyan-400" />
                Planned Order Ladder
              </h3>

              <div className="space-y-2 text-xs font-mono">
                {/* Take Profits */}
                <div className="bg-emerald-500/5 p-2.5 rounded-xl border border-emerald-500/20 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-emerald-400 font-bold block">TP3 (40% Runner)</span>
                      <span className="text-[10px] text-slate-400">
                        Sell {formatCoins(tp3Coins)} {baseAsset}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-200 block">{formatUsd(signal.tp3)}</span>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        +${tp3Target?.netProfitUsdt.toFixed(2)} Net
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-start pt-1 border-t border-emerald-500/10">
                    <div>
                      <span className="text-emerald-400 font-bold block">TP2 (30% Scale)</span>
                      <span className="text-[10px] text-slate-400">
                        Sell {formatCoins(tp2Coins)} {baseAsset}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-200 block">{formatUsd(signal.tp2)}</span>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        +${tp2Target?.netProfitUsdt.toFixed(2)} Net
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-start pt-1 border-t border-emerald-500/10">
                    <div>
                      <span className="text-emerald-400 font-bold block">TP1 (30% Scale)</span>
                      <span className="text-[10px] text-slate-400">
                        Sell {formatCoins(tp1Coins)} {baseAsset}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-200 block">{formatUsd(signal.tp1)}</span>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        +${tp1Target?.netProfitUsdt.toFixed(2)} Net
                      </span>
                    </div>
                  </div>
                </div>

                {/* Entry */}
                <div className="bg-cyan-500/5 p-2.5 rounded-xl border border-cyan-500/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-cyan-400 font-bold block">Planned Entry (58.1%)</span>
                      <span className="text-[10px] text-slate-400">
                        Buy {formatCoins(entryTranche?.quantityCoins)} {baseAsset} (${entryTranche?.allocationUsdt.toFixed(2)} USDT)
                      </span>
                    </div>
                    <span className="font-bold text-slate-200">
                      {formatUsd(entryPrice)}
                    </span>
                  </div>
                  {signal.actualEntry && (
                    <div className="flex justify-between text-[11px] text-slate-400 mt-1 pt-1 border-t border-cyan-500/20">
                      <span>Actual Fill:</span>
                      <span className="text-cyan-300 font-bold">{formatUsd(signal.actualEntry)}</span>
                    </div>
                  )}
                </div>

                {/* DCAs */}
                <div className="bg-amber-500/5 p-2.5 rounded-xl border border-amber-500/20 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-amber-400 font-bold block">DCA 1 (23.3%)</span>
                      <span className="text-[10px] text-slate-400">
                        Buy {formatCoins(dca1Tranche?.quantityCoins)} {baseAsset} (${dca1Tranche?.allocationUsdt.toFixed(2)} USDT)
                      </span>
                    </div>
                    <span className="font-bold text-slate-200">{formatUsd(signal.dca1)}</span>
                  </div>

                  <div className="flex justify-between items-start pt-1 border-t border-amber-500/10">
                    <div>
                      <span className="text-amber-400 font-bold block">DCA 2 (18.6%)</span>
                      <span className="text-[10px] text-slate-400">
                        Buy {formatCoins(dca2Tranche?.quantityCoins)} {baseAsset} (${dca2Tranche?.allocationUsdt.toFixed(2)} USDT)
                      </span>
                    </div>
                    <span className="font-bold text-slate-200">{formatUsd(signal.dca2)}</span>
                  </div>
                </div>

                {/* Stop Loss */}
                <div className="bg-rose-500/5 p-2.5 rounded-xl border border-rose-500/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-rose-400 font-bold block">Stop Loss Invalidation</span>
                      <span className="text-[10px] text-rose-300">
                        Max Loss: -${sizing?.plannedLossAtSlUsdt.toFixed(2)} USDT
                      </span>
                    </div>
                    <span className="font-bold text-rose-300">{formatUsd(stopLossPrice)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Accounting */}
            <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <DollarSign size={15} className="text-cyan-400" />
                Capital & Projected P&L
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Selected Portfolio:</span>
                  <span className="font-mono text-cyan-300 font-bold">${walletBalance.toFixed(2)} USDT</span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Initial Allocation:</span>
                  <span className="font-mono text-slate-200">
                    ${sizing ? sizing.initialAllocation.toFixed(2) : signal.initialAllocation.toFixed(2)} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Max Capital Deployed:</span>
                  <span className="font-mono text-slate-200">
                    ${sizing ? sizing.maxDeployed.toFixed(2) : signal.maxDeployed.toFixed(2)} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Max Risk Budget:</span>
                  <span className="font-mono text-rose-400 font-bold">
                    -${sizing ? sizing.plannedLossAtSlUsdt.toFixed(2) : signal.maxLoss.toFixed(2)} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Total Potential Net Profit:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    +${sizing ? sizing.totalPotentialNetProfitUsdt.toFixed(2) : '—'} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Estimated Slippage (0.05%):</span>
                  <span className="font-mono text-slate-400">
                    ${sizing ? sizing.estimatedSlippageCostUsdt.toFixed(2) : '—'} USDT
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2 text-sm font-bold">
                  <span className="text-slate-200">Actual Realized P&L:</span>
                  <span
                    className={`font-mono ${
                      (evaluation?.netPnlUsdt ?? 0) > 0
                        ? 'text-emerald-400'
                        : (evaluation?.netPnlUsdt ?? 0) < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {evaluation?.netPnlUsdt !== null && evaluation?.netPnlUsdt !== undefined
                      ? evaluation.netPnlUsdt > 0
                        ? `+$${evaluation.netPnlUsdt.toFixed(2)}`
                        : `$${evaluation.netPnlUsdt.toFixed(2)}`
                      : '— (Trade Open)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Time-to-Event Summary */}
            <div className="bg-[var(--surface-1)] border border-[var(--glass-border)] rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Clock size={15} className="text-cyan-400" />
                Time-to-Event Analytics
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Time to Entry:</span>
                  <span className="text-slate-200">{formatMs(evaluation?.timeToEvent?.timeToEntryMs)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Time to DCA 1:</span>
                  <span className="text-slate-200">{formatMs(evaluation?.timeToEvent?.timeToDca1Ms)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Time to DCA 2:</span>
                  <span className="text-slate-200">{formatMs(evaluation?.timeToEvent?.timeToDca2Ms)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Time to TP1:</span>
                  <span className="text-emerald-400">{formatMs(evaluation?.timeToEvent?.timeToTp1Ms)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Time to TP2:</span>
                  <span className="text-emerald-400">{formatMs(evaluation?.timeToEvent?.timeToTp2Ms)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]/40">
                  <span className="text-slate-400">Time to Stop Loss:</span>
                  <span className="text-rose-400">{formatMs(evaluation?.timeToEvent?.timeToSlMs)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
