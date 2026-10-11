'use client';

// ─── U-SPOT User Telegram & Profile Settings Card ──────────────────────
// Allows logged-in traders to configure their personal Telegram Chat ID
// and receive instant real-time spot trade alerts on their mobile device.

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  Send,
  Check,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Bell,
  User,
  LogIn,
  Zap,
} from 'lucide-react';

export default function UserTelegramCard() {
  const { user, updateTelegramSettings } = useAuth();

  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [isSendingSample, setIsSendingSample] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setChatId(user.telegramChatId || '');
      setEnabled(user.telegramEnabled ?? Boolean(user.telegramChatId));
    }
  }, [user]);

  if (!user) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Send size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Personal Telegram Signal Alerts
            </h2>
            <p className="text-xs text-slate-400">
              Sign in to connect your Telegram account and receive instant mobile notifications for entries, DCA fills, TPs, and Stop Losses.
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-2.5">
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-sm"
          >
            <LogIn size={13} />
            <span>Sign In to Connect Telegram</span>
          </Link>
          <Link
            href="/register"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--surface-2)] text-slate-300 hover:text-white border border-[var(--glass-border)] text-xs font-medium transition"
          >
            <span>Register Account</span>
          </Link>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await updateTelegramSettings(chatId.trim() || null, enabled);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(res.error || 'Failed to save Telegram settings.');
      }
    } catch {
      setSaveError('Network error while saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!chatId.trim()) {
      setSaveError('Please enter your Telegram Chat ID first.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId.trim(),
          customMessage: `🔔 *U-SPOT Personal Alert Test*\n\nHello *${user.name}*, your personal Telegram alert channel is connected and verified! You will receive live trade plan updates for all spot signals.`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || 'Test alert delivered to your Telegram successfully!',
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to deliver test message to Telegram.',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Network error communicating with Telegram dispatcher.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendSampleSignal = async () => {
    if (!chatId.trim()) {
      setSaveError('Please enter your Telegram Chat ID first.');
      return;
    }

    setIsSendingSample(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId.trim(),
          sendConfirmedSignal: true,
          symbol: 'SOL/USDT',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || 'Sample confirmed signal sent with full trade plan and position sizes!',
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to deliver sample signal to Telegram.',
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Network error communicating with Telegram dispatcher.',
      });
    } finally {
      setIsSendingSample(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5 border border-[var(--glass-border)] shadow-lg">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Send size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200">
                Personal Telegram Signal Delivery
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-mono font-bold border border-cyan-500/30">
                Active Subscriber
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Logged in as <b className="text-slate-200">{user.name}</b> ({user.email})
            </p>
          </div>
        </div>

        {/* Enable / Disable Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-slate-400">Alerts</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              enabled ? 'bg-cyan-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Messages */}
      {saveSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2 animate-fade-in">
          <Check size={14} className="shrink-0" />
          <span>Telegram alert settings updated successfully.</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2 animate-fade-in">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-fade-in ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {testResult.success ? (
            <Check size={14} className="shrink-0" />
          ) : (
            <AlertTriangle size={14} className="shrink-0" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Your Telegram Chat ID
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="e.g. 123456789"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-2)] text-xs text-slate-200 placeholder-slate-600 border border-[var(--glass-border)] focus:border-cyan-500/50 focus:outline-none transition font-mono"
              />
              <Send
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
              <span>Save</span>
            </button>

            <button
              type="button"
              onClick={handleSendTest}
              disabled={isTesting || !chatId.trim()}
              className="px-3 py-2 rounded-xl bg-[var(--surface-2)] hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-300 border border-[var(--glass-border)] text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Send a basic connection test ping to your Telegram"
            >
              {isTesting ? <RefreshCw size={12} className="animate-spin text-cyan-400" /> : <Bell size={12} />}
              <span className="hidden sm:inline">Test Ping</span>
            </button>

            <button
              type="button"
              onClick={handleSendSampleSignal}
              disabled={isSendingSample || !chatId.trim()}
              className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Preview a complete confirmed signal with entry, DCA 1, DCA 2, TP1/2/3, SL, and all position sizes"
            >
              {isSendingSample ? <RefreshCw size={12} className="animate-spin text-emerald-400" /> : <Zap size={12} />}
              <span className="hidden sm:inline">Preview Confirmed Signal</span>
            </button>
          </div>
        </div>

        {/* Telegram Chat ID Instructions */}
        <div className="p-3.5 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--glass-border)] text-xs text-slate-400 space-y-1.5">
          <p className="font-semibold text-slate-300 flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-cyan-400" />
            How to get your Telegram Chat ID:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400 pl-1">
            <li>
              Open Telegram and search for{' '}
              <a
                href="https://t.me/userinfobot"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline font-mono inline-flex items-center gap-0.5"
              >
                @userinfobot <ExternalLink size={9} />
              </a>
            </li>
            <li>Press <b>Start</b>. The bot will instantly return your numeric <code>Id</code>.</li>
            <li>Paste your ID above and click <b>Save</b>, then click <b>Send Test Alert</b> to verify.</li>
          </ol>
        </div>
      </form>
    </div>
  );
}
