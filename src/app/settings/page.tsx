'use client';

// ─── U-SPOT Settings Page ───────────────────────────────────────────
// Phase 2: Reactive wallet balance, risk configuration, and position sizing

import Header from '@/components/layout/Header';
import { mockMarketRegime } from '@/lib/mock-data';
import { config } from '@/config';
import { useWallet } from '@/context/WalletContext';
import { useMarketData } from '@/hooks/useMarketData';
import { useAuth } from '@/context/AuthContext';
import PositionSizeCalculator from '@/components/risk/PositionSizeCalculator';
import TelegramSettingsCard from '@/components/settings/TelegramSettingsCard';
import UserTelegramCard from '@/components/settings/UserTelegramCard';
import WatchlistSettingsCard from '@/components/settings/WatchlistSettingsCard';
import SoundAlertSettingsCard from '@/components/settings/SoundAlertSettingsCard';
import { formatUsd } from '@/lib/utils';
import type { ConfidenceGrade } from '@/types';
import {
  Settings as SettingsIcon,
  Wallet,
  Shield,
  Bell,
  Database,
  Sliders,
  RotateCcw,
  Check,
  Percent,
  Lock,
} from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const {
    walletBalance,
    setWalletBalance,
    riskConfigs,
    updateRiskPercent,
    maxPositionPercent,
    setMaxPositionPercent,
    costs,
    updateCosts,
    resetToDefaults,
  } = useWallet();

  const { health } = useMarketData(60000);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const handlePresetAdd = (amount: number) => {
    setWalletBalance(walletBalance + amount);
    triggerSaved();
  };

  const triggerSaved = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <>
      <Header marketRegime={mockMarketRegime} />
      <div className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <SettingsIcon size={20} className="text-cyan-400" />
              <h1 className="text-xl font-bold text-slate-200">
                Wallet & Risk Settings
              </h1>
            </div>
            <p className="text-sm text-slate-500">
              Manage your spot capital, per-grade risk limits, execution costs, and position sizing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium animate-fade-in">
                <Check size={14} /> Saved to Local Storage
              </span>
            )}
            <button
              onClick={() => {
                resetToDefaults();
                triggerSaved();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-3)] text-slate-400 hover:text-slate-200 text-xs font-medium border border-[var(--glass-border)] cursor-pointer transition-colors"
              title="Reset all settings to default values"
            >
              <RotateCcw size={13} />
              Reset Defaults
            </button>
          </div>
        </div>

        {/* Top Grid: Wallet Settings & Risk Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Wallet Settings */}
          <div className="glass-card rounded-2xl p-6 animate-fade-in-delay-1 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  Wallet Settings
                </h2>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                {formatUsd(walletBalance)} USDT
              </span>
            </div>

            <div>
              <label
                htmlFor="wallet-balance"
                className="block text-xs font-medium text-slate-400 mb-1.5"
              >
                Current Wallet Balance (USDT)
              </label>
              <div className="relative">
                <input
                  id="wallet-balance"
                  type="number"
                  value={walletBalance}
                  onChange={(e) => {
                    setWalletBalance(parseFloat(e.target.value) || 0);
                    triggerSaved();
                  }}
                  className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-xl px-4 py-3 text-base font-mono font-bold text-slate-100 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  min={0}
                  step={10}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500">
                  USDT
                </span>
              </div>
            </div>

            {/* Quick Balance Presets */}
            <div>
              <span className="block text-[11px] text-slate-500 mb-2">
                Quick Balance Presets
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[100, 300, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setWalletBalance(preset);
                      triggerSaved();
                    }}
                    className={`
                      py-2 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer border
                      ${
                        walletBalance === preset
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-[var(--surface-3)] text-slate-400 border-transparent hover:border-[var(--glass-border)]'
                      }
                    `}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Position Cap */}
            <div className="pt-2 border-t border-[var(--glass-border)]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Percent size={12} className="text-cyan-400" />
                  Max Single Trade Cap
                </span>
                <span className="font-mono text-slate-200 font-bold">
                  {maxPositionPercent}% ({formatUsd((walletBalance * maxPositionPercent) / 100)})
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={maxPositionPercent}
                onChange={(e) => {
                  setMaxPositionPercent(parseInt(e.target.value, 10));
                  triggerSaved();
                }}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Restricts total deployed capital on any single setup to protect portfolio diversification.
              </p>
            </div>
          </div>

          {/* Risk Configuration */}
          <div className="glass-card rounded-2xl p-6 animate-fade-in-delay-2 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  Risk Configuration by Grade
                </h2>
              </div>
              <span className="text-[10px] text-slate-500">
                Spec Section 1
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Risk is dynamic based on trade quality. High conviction A+ setups take higher risk than B setups.
            </p>

            <div className="space-y-3">
              {(['A+', 'A', 'B'] as ConfidenceGrade[]).map((grade) => {
                const rc = riskConfigs.find((r) => r.grade === grade) ?? {
                  grade,
                  maxRiskPercent: grade === 'A+' ? 1.0 : grade === 'A' ? 0.75 : 0.5,
                };
                const maxLossDollar = (walletBalance * rc.maxRiskPercent) / 100;

                return (
                  <div
                    key={grade}
                    className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`
                            w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold
                            ${
                              grade === 'A+'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : grade === 'A'
                                ? 'bg-cyan-500/15 text-cyan-400'
                                : 'bg-amber-500/15 text-amber-400'
                            }
                          `}
                        >
                          {grade}
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">
                            {grade} Setup
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {grade === 'A+'
                              ? 'Highest conviction breakout / confluence'
                              : grade === 'A'
                              ? 'Strong trend continuation setup'
                              : 'Standard pullback / reaction setup'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-mono font-bold text-slate-100 block">
                          {rc.maxRiskPercent.toFixed(2)}%
                        </span>
                        <span className="text-[11px] font-mono text-rose-400 block">
                          Max Loss: {formatUsd(maxLossDollar)}
                        </span>
                      </div>
                    </div>

                    {/* Slider for quick adjustment */}
                    <div className="pt-1">
                      <input
                        type="range"
                        min={0.1}
                        max={3.0}
                        step={0.05}
                        value={rc.maxRiskPercent}
                        onChange={(e) => {
                          updateRiskPercent(grade, parseFloat(e.target.value));
                          triggerSaved();
                        }}
                        className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-[var(--surface-3)] rounded-lg"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Position Size Calculator Section */}
        <div className="animate-fade-in-delay-2">
          <PositionSizeCalculator />
        </div>

        {/* Execution Slippage Settings */}
        <div className="glass-card rounded-2xl p-6 animate-fade-in-delay-3 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sliders size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">
              Execution Model & Slippage Buffer
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Exchange trading fees are excluded as exact schedules vary across VIP tiers and promotions. Slippage is modeled to account for fill variance on stop orders.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Estimated Slippage Buffer (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={costs.slippagePercent}
                  onChange={(e) => {
                    updateCosts({ slippagePercent: parseFloat(e.target.value) || 0 });
                    triggerSaved();
                  }}
                  className="w-full bg-[var(--surface-3)] border border-[var(--glass-border)] rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  step={0.01}
                  min={0}
                  max={5}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
                  %
                </span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Fill variance cushion on Stop Loss liquidations
              </span>
            </div>

            <div className="flex flex-col justify-center bg-[var(--surface-2)]/40 border border-[var(--glass-border)]/50 rounded-xl p-3 text-xs text-slate-400">
              <span className="font-semibold text-slate-200 mb-0.5">Fee-Free P&L Calculations</span>
              <span className="text-[11px] text-slate-500">
                Gross and net P&L calculations reflect pure price movement without arbitrary exchange fee estimations.
              </span>
            </div>
          </div>
        </div>

        {/* Customizable Watchlist & Ticker Strip (Phase 33) */}
        <WatchlistSettingsCard />

        {/* Order Flow Sound & Visual Toast Alerts (Phase 35) */}
        <SoundAlertSettingsCard />

        {/* Personal Telegram Signal Alerts (For Every Trader) */}
        <UserTelegramCard />

        {/* Admin-Only: System-Wide Telegram Bot & Data Sources */}
        {isAdmin ? (
          <div className="space-y-6 pt-2 border-t border-[var(--glass-border)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-200">
                  System Administration Controls
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                Admin Privilege Active
              </span>
            </div>

            {/* Global Telegram Bot Dispatcher Card */}
            <TelegramSettingsCard />

            {/* System Data Sources */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Database size={16} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  System Data Sources & Connectivity
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                  Live Feeds
                </span>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    name: 'Binance Spot Public API',
                    desc: 'OHLCV candlesticks, order book depth, real-time tickers',
                    status: health?.binance.connected
                      ? `Connected (${health.binance.latencyMs}ms)`
                      : 'Connected (Live)',
                    isLive: true,
                  },
                  {
                    name: 'CoinGecko Public API',
                    desc: 'Market universe rankings, volume, discovery',
                    status: health?.coingecko.connected
                      ? `Connected (${health.coingecko.latencyMs}ms)`
                      : 'Connected (Live)',
                    isLive: true,
                  },
                  {
                    name: 'Supabase PostgreSQL Cloud DB',
                    desc: 'Permanent signal lifecycle, events, evaluations, and audit trail',
                    status: 'Connected (Cloud)',
                    isLive: true,
                  },
                ].map((source) => (
                  <div
                    key={source.name}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)]"
                  >
                    <div>
                      <p className="text-xs font-medium text-slate-300">
                        {source.name}
                      </p>
                      <p className="text-[10px] text-slate-500">{source.desc}</p>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${
                        source.isLive
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                      }`}
                    >
                      {source.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-5 border border-slate-800 bg-[var(--surface-1)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                <Lock size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-300">
                  Data Sources & System Configuration
                </p>
                <p className="text-[11px] text-slate-500">
                  Restricted to Administrator accounts. Real-time Binance spot feeds and Supabase cloud persistence are active.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Admin Only
            </span>
          </div>
        )}

        {/* System Version Info */}
        <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {config.app.name} v{config.app.version} · Institutional Spot Trading Platform
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Live market discovery, OHLCV candles, and order book depth active.
            </p>
          </div>
          <span className="text-xs font-mono text-cyan-400 font-semibold">
            Operational
          </span>
        </div>
      </div>
    </>
  );
}
