'use client';

// ─── U-SPOT Telegram Settings Component — Phase 15 ────────────────────
// Real-time mobile alert configuration, bot credentials, event toggles, and test dispatcher

import { useState, useEffect } from 'react';
import {
  Send,
  Bell,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  HelpCircle,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import type { TelegramAlertConfig } from '@/types';

export default function TelegramSettingsCard() {
  const [config, setConfig] = useState<TelegramAlertConfig>({
    botToken: '',
    chatId: '',
    enabled: false,
    events: {
      onSignalCreated: true,
      onEntryFilled: true,
      onDcaFilled: true,
      onTpHit: true,
      onSlHit: true,
      onExpiredOrCancelled: true,
      onInstitutionalWall: true,
      onWebSocketHealth: true,
    },
    deduplicationWindowMs: 300000,
  });

  const [hasRealToken, setHasRealToken] = useState(false);
  const [hasRealChatId, setHasRealChatId] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/telegram');
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
        setHasRealToken(data.config.hasRealToken);
        setHasRealChatId(data.config.hasRealChatId);
      }
    } catch (err) {
      console.error('Failed to load Telegram configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updatedConfig = config) => {
    try {
      setSaving(true);
      setStatusMessage(null);
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });

      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setHasRealToken(data.config.hasRealToken);
        setHasRealChatId(data.config.hasRealChatId);
        setStatusMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error saving settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleToggleEvent = (eventKey: keyof TelegramAlertConfig['events']) => {
    const updated = {
      ...config,
      events: {
        ...config.events,
        [eventKey]: !config.events[eventKey],
      },
    };
    setConfig(updated);
    handleSave(updated);
  };

  const handleToggleMaster = () => {
    const updated = {
      ...config,
      enabled: !config.enabled,
    };
    setConfig(updated);
    handleSave(updated);
  };

  const handleSendTest = async () => {
    try {
      setTesting(true);
      setStatusMessage(null);
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: config.botToken,
          chatId: config.chatId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: data.message || 'Test alert dispatched successfully!',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to dispatch test alert',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error dispatching test alert' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] flex items-center justify-center py-12 text-slate-500 text-xs">
        <RefreshCw size={16} className="animate-spin mr-2" />
        Loading Telegram Settings...
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 border border-[var(--glass-border)] space-y-6">
      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--glass-border)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Send size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-200">
              Telegram Alerts & Notifications
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
              System Dispatcher Active
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Instant mobile alerts for newly generated signals, DCA safety tranches, TP targets, and SL hits.
          </p>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-medium">
            {config.enabled ? 'Alerts Active' : 'Alerts Disabled'}
          </span>
          <button
            type="button"
            onClick={handleToggleMaster}
            className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
              config.enabled ? 'bg-cyan-500' : 'bg-[var(--surface-3)]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-slate-950 absolute top-0.5 transition-transform ${
                config.enabled ? 'left-5.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

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

      {/* Bot Credentials Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bot Token */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-slate-400">
              Telegram Bot Token
            </label>
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer"
            >
              {showToken ? <EyeOff size={11} /> : <Eye size={11} />}
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type={showToken ? 'text' : 'password'}
            placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
            value={config.botToken}
            onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
            className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Chat ID */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-slate-400">
              Telegram Chat ID / Channel ID
            </label>
            <span className="text-[10px] text-slate-500">e.g. 987654321 or -100123...</span>
          </div>
          <input
            type="text"
            placeholder="987654321"
            value={config.chatId}
            onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
            className="w-full bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Action Buttons & Help Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-xs text-slate-500 hover:text-cyan-400 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <HelpCircle size={13} />
          <span>How to create a Telegram Bot (30 seconds)</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-slate-300 text-xs font-semibold border border-[var(--glass-border)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {testing ? (
              <RefreshCw size={13} className="animate-spin text-cyan-400" />
            ) : (
              <Send size={13} className="text-cyan-400" />
            )}
            <span>Send Test Alert</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="btn-primary py-1.5 px-4 text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
            <span>Save Configuration</span>
          </button>
        </div>
      </div>

      {/* Quick Setup Guide Accordion */}
      {showHelp && (
        <div className="p-4 rounded-xl bg-[var(--surface-2)]/80 border border-cyan-500/20 text-xs space-y-2 text-slate-400 animate-fade-in">
          <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Sparkles size={14} className="text-cyan-400" />
            Creating your free Telegram Bot
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-slate-300">
            <li>
              Open Telegram and search for <strong>@BotFather</strong>.
            </li>
            <li>
              Send <code>/newbot</code> and follow instructions to name your bot.
            </li>
            <li>
              Copy the HTTP API Token into the <strong>Bot Token</strong> field above.
            </li>
            <li>
              Send any message to your new bot, then talk to <strong>@userinfobot</strong> to get your numerical <strong>Chat ID</strong>.
            </li>
            <li>
              Paste your Chat ID above and click <strong>Send Test Alert</strong>!
            </li>
          </ol>
        </div>
      )}

      {/* Event Alert Preferences Matrix */}
      <div className="space-y-3 pt-2 border-t border-[var(--glass-border)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
            Subscribed Event Types
          </span>
          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
            <ShieldCheck size={12} />
            Duplicate Protection Active (5m window)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              key: 'onSignalCreated' as const,
              label: 'New Signal Generated',
              desc: 'Emitted when scanner/TA identifies A+/A trade setup',
              active: config.events.onSignalCreated,
            },
            {
              key: 'onEntryFilled' as const,
              label: 'Entry Order Triggered',
              desc: 'Market reaches preferred entry zone (~50% tranche)',
              active: config.events.onEntryFilled,
            },
            {
              key: 'onDcaFilled' as const,
              label: 'Safety DCA Tranche Filled',
              desc: 'Tranche DCA 1 / DCA 2 triggered with updated cost basis',
              active: config.events.onDcaFilled,
            },
            {
              key: 'onTpHit' as const,
              label: 'Take Profit Target Reached',
              desc: 'TP1 (30%), TP2 (30%), or TP3 (40% runner) hit with Breakeven ratchet',
              active: config.events.onTpHit,
            },
            {
              key: 'onSlHit' as const,
              label: 'Stop Loss Triggered',
              desc: 'Capital preservation exit notice and realized loss metric',
              active: config.events.onSlHit,
            },
            {
              key: 'onExpiredOrCancelled' as const,
              label: 'Signal Expired / Cancelled',
              desc: '4h entry timeout or pre-entry invalidation notice',
              active: config.events.onExpiredOrCancelled,
            },
            {
              key: 'onInstitutionalWall' as const,
              label: 'Institutional Liquidity Wall',
              desc: 'Massive Bid/Ask wall (≥3x avg depth or ≥$50k) defending entry or blocking TP',
              active: config.events.onInstitutionalWall ?? true,
            },
            {
              key: 'onWebSocketHealth' as const,
              label: 'WebSocket Stream Health',
              desc: 'Binance stream transitions (DISCONNECTED, RECONNECTED, ERROR) with 15m rate limit',
              active: config.events.onWebSocketHealth ?? true,
            },
            {
              key: 'onDivergence' as const,
              label: 'Multi-Timeframe Divergences',
              desc: 'High-conviction RSI, MACD & OBV Bullish/Bearish divergences and multi-TF confluences',
              active: config.events.onDivergence ?? true,
            },
          ].map((item) => (
            <div
              key={item.key}
              onClick={() => handleToggleEvent(item.key)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                item.active
                  ? 'bg-cyan-500/5 border-cyan-500/30'
                  : 'bg-[var(--surface-2)]/40 border-[var(--glass-border)] opacity-60'
              }`}
            >
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-200">{item.label}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
              <div
                className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                  item.active
                    ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                    : 'border-slate-700 bg-slate-900'
                }`}
              >
                {item.active && <CheckCircle2 size={12} className="stroke-[3]" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
