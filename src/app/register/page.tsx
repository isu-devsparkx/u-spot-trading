'use client';

// ─── U-SPOT Authentication: Register Page ──────────────────────────────

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Send,
  Info,
} from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { register, user } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already signed in
  if (user) {
    router.push('/settings');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await register(
        email,
        password,
        name,
        telegramChatId.trim() || undefined
      );
      if (res.success) {
        router.push('/settings');
      } else {
        setError(res.error || 'Failed to create account.');
      }
    } catch {
      setError('An unexpected error occurred during registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
      <div className="glass-card max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative overflow-hidden space-y-6">
        {/* Glow accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono mb-2">
            <Sparkles size={12} />
            <span>Create Trader Account</span>
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">
            Join U-SPOT Platform
          </h1>
          <p className="text-xs text-slate-400">
            Get instant spot trading signals with exact position sizing and direct Telegram delivery.
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
              Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-2)] text-xs text-slate-200 placeholder-slate-600 border border-[var(--glass-border)] focus:border-cyan-500/50 focus:outline-none transition"
              />
              <User
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </div>

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
                placeholder="alex@example.com"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-2)] text-xs text-slate-200 placeholder-slate-600 border border-[var(--glass-border)] focus:border-cyan-500/50 focus:outline-none transition font-mono"
              />
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Password (Min 6 Characters)
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
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

          {/* Telegram Chat ID (Optional) */}
          <div className="pt-2 border-t border-[var(--glass-border)]">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Send size={13} className="text-cyan-400" />
                <span>Your Telegram Chat ID (Optional)</span>
              </label>
              <span className="text-[10px] text-slate-500">Can add later in Settings</span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-2)] text-xs text-slate-200 placeholder-slate-600 border border-[var(--glass-border)] focus:border-cyan-500/50 focus:outline-none transition font-mono"
              />
              <Send
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 flex items-start gap-1">
              <Info size={11} className="shrink-0 mt-0.5 text-cyan-400" />
              <span>
                To receive trade signal alerts on your phone, message <code className="text-cyan-300 font-mono">@userinfobot</code> on Telegram to get your numeric Chat ID.
              </span>
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50 mt-4"
          >
            <span>{isSubmitting ? 'Creating Account...' : 'Register Account'}</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center text-xs text-slate-400 pt-1">
          <span>Already have an account? </span>
          <Link
            href="/login"
            className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4"
          >
            Sign In Here
          </Link>
        </div>
      </div>
    </div>
  );
}
