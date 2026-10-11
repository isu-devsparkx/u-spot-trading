'use client';

// ─── U-SPOT Header Component ───────────────────────────────────────────
// Top navigation bar with live market regime, wallet balance,
// quick market scanner trigger, and user authentication status.

import { Wallet, Bell, RefreshCw, User, LogOut, ShieldAlert, LogIn, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { formatUsd, getRegimeBadgeClass, formatStatus } from '@/lib/utils';
import type { MarketRegime } from '@/types';
import { useWallet } from '@/context/WalletContext';
import { useAuth } from '@/context/AuthContext';
import { useOrderFlowToasts } from '@/context/OrderFlowToastContext';
import MarketTickerStrip from '@/components/dashboard/MarketTickerStrip';

interface HeaderProps {
  walletBalance?: number;
  marketRegime?: MarketRegime;
  onScanNow?: () => void;
  isScanning?: boolean;
  showTickerStrip?: boolean;
}

export default function Header({
  walletBalance: propWalletBalance,
  marketRegime = 'BULL',
  onScanNow,
  isScanning = false,
  showTickerStrip = true,
}: HeaderProps) {
  const { walletBalance: contextBalance } = useWallet();
  const { user, isAdmin, logout } = useAuth();
  const { audioConfig, toggleSound } = useOrderFlowToasts();
  const walletBalance = propWalletBalance ?? contextBalance;

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--glass-border)] bg-[var(--surface-0)]/90 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
        {/* Left — mobile spacer */}
        <div className="lg:hidden w-8" />

        {/* Center — Market Regime */}
        <div className="flex items-center gap-4">
          <div
            className={`
              inline-flex items-center gap-2 px-3 py-1.5 rounded-full
              border text-xs font-semibold tracking-wide
              ${getRegimeBadgeClass(marketRegime)}
            `}
            id="market-regime-badge"
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            {formatStatus(marketRegime)}
          </div>
        </div>

        {/* Right — Actions & Authentication */}
        <div className="flex items-center gap-2.5">
          {/* Quick Sound Mute/Unmute (Phase 35) */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
              audioConfig.soundEnabled
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
                : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title={
              audioConfig.soundEnabled
                ? `Order Flow Sound Alerts: Active (${Math.round(audioConfig.volume * 100)}%) — Click to Mute`
                : 'Order Flow Sound Alerts: Muted — Click to Enable Chimes'
            }
          >
            {audioConfig.soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* Wallet Balance Widget */}
          <Link
            href="/settings"
            className="hidden sm:flex items-center gap-2 glass-card px-3.5 py-1.5 rounded-xl hover:border-cyan-500/40 transition-colors group cursor-pointer"
            id="wallet-display"
            title="Edit Portfolio Balance in Settings"
          >
            <Wallet size={15} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold font-mono text-slate-200">
              {formatUsd(walletBalance)}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">USDT</span>
          </Link>

          {/* Scan Now Button */}
          {onScanNow && (
            <button
              onClick={onScanNow}
              disabled={isScanning}
              className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 cursor-pointer"
              id="scan-now-btn"
              title="Scan Now — Refresh live Binance market data"
            >
              <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
              <span className="hidden md:inline">
                {isScanning ? 'Scanning...' : 'Scan Now'}
              </span>
            </button>
          )}

          {/* User Profile / Auth State */}
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--glass-border)] hover:border-cyan-500/40 transition group"
                title={`Logged in as ${user.name} (${user.role})`}
              >
                <div className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-[10px] uppercase">
                  {user.name ? user.name[0] : 'U'}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-medium text-slate-200 leading-none group-hover:text-cyan-300 transition">
                    {user.name}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 capitalize">
                    {user.role === 'admin' ? (
                      <span className="text-amber-400 font-bold">Admin</span>
                    ) : (
                      'Trader'
                    )}
                  </span>
                </div>
              </Link>

              <button
                onClick={() => logout()}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-[var(--glass-border)] transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] text-slate-300 hover:text-white border border-[var(--glass-border)] hover:border-cyan-500/30 text-xs font-medium transition"
              >
                <LogIn size={13} className="text-cyan-400" />
                <span>Sign In</span>
              </Link>
              <Link
                href="/register"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-semibold transition"
              >
                <span>Register</span>
              </Link>
            </div>
          )}
        </div>
      </div>
      {showTickerStrip && <MarketTickerStrip />}
    </header>
  );
}
