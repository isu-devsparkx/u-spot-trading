'use client';

// ─── U-SPOT Authentication: Sign In Page ───────────────────────────────

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in
  if (user) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="glass-card max-w-md w-full p-8 rounded-3xl text-center space-y-4 border border-[var(--glass-border)] shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Already Signed In</h2>
          <p className="text-xs text-slate-400">
            You are logged in as <b className="text-cyan-300 font-mono">{user.email}</b> ({user.role}).
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/settings"
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition text-center shadow-lg shadow-cyan-500/20"
            >
              Go to Account Settings
            </Link>
            <Link
              href="/"
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--surface-2)] text-slate-300 hover:text-white font-medium text-xs transition text-center border border-[var(--glass-border)]"
            >
              Go to Trading Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        router.push('/settings');
      } else {
        setError(res.error || 'Failed to sign in. Please check your credentials.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemo = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setIsSubmitting(true);
    const res = await login(demoEmail, demoPass);
    setIsSubmitting(false);
    if (res.success) {
      router.push('/settings');
    } else {
      setError(res.error || 'Demo login failed');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
      <div className="glass-card max-w-md w-full p-6 sm:p-8 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative overflow-hidden space-y-6">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-2">
            <Sparkles size={12} />
            <span>Institutional Spot Trading</span>
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">
            Sign In to U-SPOT
          </h1>
          <p className="text-xs text-slate-400">
            Access live trade plans, configure your personal Telegram alerts, and manage risk.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-xs text-rose-400 animate-fade-in">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-2)] text-xs text-slate-200 placeholder-slate-600 border border-[var(--glass-border)] focus:border-cyan-500/50 focus:outline-none transition font-mono"
              />
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-400">
                Password
              </label>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-2)] text-xs text-slate-200 placeholder-slate-600 border border-[var(--glass-border)] focus:border-cyan-500/50 focus:outline-none transition font-mono"
              />
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50 mt-2"
          >
            <span>{isSubmitting ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {/* Quick Demo Logins */}
        <div className="pt-2 border-t border-[var(--glass-border)] space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider text-center font-mono">
            Fast Demo Access
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemo('admin@uspot.trade', 'admin123')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--surface-2)] hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-300 border border-[var(--glass-border)] text-xs font-medium transition cursor-pointer"
            >
              <Zap size={12} className="text-amber-400" />
              <span>Demo Admin</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('trader@uspot.trade', 'trader123')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--surface-2)] hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-300 border border-[var(--glass-border)] text-xs font-medium transition cursor-pointer"
            >
              <User size={12} className="text-cyan-400" />
              <span>Demo Trader</span>
            </button>
          </div>
        </div>

        {/* Footer Link */}
        <div className="text-center text-xs text-slate-400">
          <span>Don&apos;t have an account? </span>
          <Link
            href="/register"
            className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4"
          >
            Register Here
          </Link>
        </div>
      </div>
    </div>
  );
}
