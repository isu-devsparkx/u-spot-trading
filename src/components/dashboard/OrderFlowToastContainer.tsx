'use client';

// ─── U-SPOT Order Flow Toast Notification Container (Phase 35) ─────────
// Floating glassmorphic toast notifications with countdown timer and pause-on-hover

import React, { useState, useEffect } from 'react';
import { useOrderFlowToasts } from '@/context/OrderFlowToastContext';
import type { OrderFlowToastAlert } from '@/types';
import { X, ShieldAlert, TrendingUp, TrendingDown, Zap } from 'lucide-react';

export default function OrderFlowToastContainer() {
  const { alerts, removeToast } = useOrderFlowToasts();

  if (alerts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
      aria-live="polite"
    >
      {alerts.map((alert) => (
        <ToastItem key={alert.id} alert={alert} onDismiss={() => removeToast(alert.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  alert,
  onDismiss,
}: {
  alert: OrderFlowToastAlert;
  onDismiss: () => void;
}) {
  const duration = alert.durationMs ?? 5000;
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const onDismissRef = React.useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (isPaused) return;

    const interval = 50; // Update every 50ms
    const decrement = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - decrement;
        return next > 0 ? next : 0;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration, isPaused]);

  useEffect(() => {
    if (progress <= 0) {
      onDismissRef.current();
    }
  }, [progress]);

  const severityStyles = getSeverityStyles(alert.severity);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100 ${severityStyles.container}`}
    >
      <div className="p-3.5 flex items-start gap-3">
        {/* Icon Badge */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${severityStyles.badge}`}
        >
          {getAlertIcon(alert.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1.5">
            <h5 className={`text-xs font-bold font-sans ${severityStyles.title}`}>
              {alert.title}
            </h5>
          </div>
          <p className="text-[11px] text-slate-300 font-mono mt-0.5 leading-snug">
            {alert.message}
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-slate-300 transition-colors p-1 -mr-1 -mt-1 cursor-pointer"
          title="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>

      {/* Auto-Dismiss Countdown Bar */}
      <div className="h-1 w-full bg-slate-900/60 overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ease-linear ${severityStyles.progressBar}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function getAlertIcon(type: OrderFlowToastAlert['type']) {
  switch (type) {
    case 'WHALE_BUY_SWEEP':
      return <span className="text-sm">🐳</span>;
    case 'WHALE_SELL_SWEEP':
      return <ShieldAlert size={15} className="text-rose-400" />;
    case 'INSTITUTIONAL_BID_WALL':
      return <TrendingUp size={15} className="text-emerald-400" />;
    case 'INSTITUTIONAL_ASK_WALL':
      return <TrendingDown size={15} className="text-amber-400" />;
    case 'CVD_EXTREME_BUY':
    case 'CVD_EXTREME_SELL':
      return <Zap size={15} className="text-cyan-400" />;
    default:
      return <span className="text-sm">⚡</span>;
  }
}

function getSeverityStyles(severity: OrderFlowToastAlert['severity']) {
  switch (severity) {
    case 'whale':
      return {
        container:
          'bg-slate-950/90 border-amber-500/50 shadow-amber-500/10 ring-1 ring-amber-500/30',
        badge: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
        title: 'text-amber-300',
        progressBar: 'bg-gradient-to-r from-amber-500 to-emerald-400',
      };
    case 'bearish':
      return {
        container:
          'bg-slate-950/90 border-rose-500/50 shadow-rose-500/10 ring-1 ring-rose-500/30',
        badge: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
        title: 'text-rose-300',
        progressBar: 'bg-rose-500',
      };
    case 'bullish':
      return {
        container:
          'bg-slate-950/90 border-emerald-500/50 shadow-emerald-500/10 ring-1 ring-emerald-500/30',
        badge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
        title: 'text-emerald-300',
        progressBar: 'bg-emerald-500',
      };
    default:
      return {
        container:
          'bg-slate-950/90 border-cyan-500/50 shadow-cyan-500/10 ring-1 ring-cyan-500/30',
        badge: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
        title: 'text-cyan-300',
        progressBar: 'bg-cyan-500',
      };
  }
}
