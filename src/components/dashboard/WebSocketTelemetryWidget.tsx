'use client';

// ─── U-SPOT WebSocket Reconnect & Heartbeat Telemetry Widget (Phase 36) ─
// Real-time network vitals, RTT ping latency gauge, throughput, & manual reboot

import React, { useState } from 'react';
import { useWebSocketTelemetry } from '@/hooks/useBinanceWebSocket';
import type { ConnectionQuality } from '@/types';
import {
  Activity,
  Wifi,
  Radio,
  RefreshCw,
  Clock,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Server,
  Zap,
} from 'lucide-react';

interface WebSocketTelemetryWidgetProps {
  compact?: boolean;
}

export default function WebSocketTelemetryWidget({
  compact = false,
}: WebSocketTelemetryWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { telemetry, triggerReconnect, uptimeFormatted, isHealthy } = useWebSocketTelemetry();

  const handleManualReconnect = () => {
    setIsReconnecting(true);
    triggerReconnect();
    setTimeout(() => setIsReconnecting(false), 2000);
  };

  const qualityBadge = getQualityBadge(telemetry.quality);
  const isConnected = telemetry.connectionState === 'CONNECTED';

  return (
    <div className="relative font-sans text-xs">
      {/* ─── Compact Collapsed Strip ─────────────────────────────────── */}
      <div
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all ${
          isConnected
            ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
            : 'bg-rose-950/20 border-rose-500/30'
        }`}
      >
        {/* Pulsing Status Dot */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : telemetry.connectionState === 'CONNECTING' ||
                  telemetry.connectionState === 'RECONNECTING'
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500'
            }`}
          />
          <span className="font-mono text-[11px] font-semibold text-slate-300">
            {telemetry.connectionState}
          </span>
        </div>

        <span className="text-slate-700">|</span>

        {/* Latency RTT Badge */}
        <div
          className={`flex items-center gap-1 font-mono text-[11px] font-bold ${getLatencyColor(
            telemetry.latencyMs,
            isConnected
          )}`}
          title="Round-Trip Time (RTT) latency to Binance WebSocket stream"
        >
          <Radio size={12} className="inline animate-pulse" />
          <span>{isConnected ? `${telemetry.latencyMs}ms` : '—'}</span>
        </div>

        {!compact && (
          <>
            <span className="text-slate-700 hidden sm:inline">|</span>

            {/* Throughput */}
            <div
              className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-400"
              title="Throughput: Incoming WebSocket frames per second"
            >
              <Zap size={11} className="text-cyan-400" />
              <span>{telemetry.messagesPerSecond} msgs/s</span>
            </div>

            <span className="text-slate-700 hidden md:inline">|</span>

            {/* Quality Rating */}
            <span
              className={`hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${qualityBadge.className}`}
            >
              {qualityBadge.label}
            </span>
          </>
        )}

        {/* Toggle Details Chevron */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 ml-auto cursor-pointer"
          title={isExpanded ? 'Collapse Network Telemetry' : 'View Network Telemetry Vitals'}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* ─── Expandable Telemetry Diagnostic Drawer ──────────────────── */}
      {isExpanded && (
        <div className="absolute bottom-full mb-2 right-0 sm:right-auto sm:left-0 z-50 w-80 p-4 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-2xl space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-cyan-400" />
              <h5 className="font-bold text-xs text-slate-200">
                WebSocket Stream Telemetry
              </h5>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${qualityBadge.className}`}
            >
              {qualityBadge.label}
            </span>
          </div>

          {/* Vitals Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {/* RTT Ping Latency */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">
                Ping RTT Latency
              </span>
              <span
                className={`text-sm font-bold flex items-center gap-1 ${getLatencyColor(
                  telemetry.latencyMs,
                  isConnected
                )}`}
              >
                <Radio size={12} />
                {isConnected ? `${telemetry.latencyMs} ms` : 'Offline'}
              </span>
            </div>

            {/* Message Throughput */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">
                Throughput
              </span>
              <span className="text-sm font-bold text-cyan-300">
                {telemetry.messagesPerSecond}{' '}
                <span className="text-[10px] text-slate-400 font-normal">msgs/s</span>
              </span>
            </div>

            {/* Total Packet Frames */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">
                Total Frames
              </span>
              <span className="text-xs font-semibold text-slate-200">
                {telemetry.packetCount.toLocaleString()}
              </span>
            </div>

            {/* Stream Uptime */}
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block">
                Session Uptime
              </span>
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                <Clock size={11} className="text-slate-400" />
                {isConnected ? uptimeFormatted : '0s'}
              </span>
            </div>
          </div>

          {/* Active Multiplexed Streams & Diagnostics */}
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 space-y-1.5 text-[11px] font-mono text-slate-400">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1 text-slate-400">
                <Layers size={12} className="text-cyan-400" /> Active Multiplex Streams:
              </span>
              <span className="text-slate-200 font-bold">
                {telemetry.activeStreamCount} streams
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1 text-slate-400">
                <RefreshCw size={12} className="text-amber-400" /> Reconnects:
              </span>
              <span className="text-slate-200 font-semibold">
                {telemetry.reconnectCount} times
              </span>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
              <span>Heartbeat Probe:</span>
              <span>
                {telemetry.lastPingTimestamp
                  ? `${Math.max(0, Math.floor((Date.now() - telemetry.lastPingTimestamp) / 1000))}s ago`
                  : 'Pending'}
              </span>
            </div>
          </div>

          {/* Action Button: Manual Reconnect */}
          <button
            onClick={handleManualReconnect}
            disabled={isReconnecting}
            className="w-full py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isReconnecting ? 'animate-spin' : ''} />
            <span>{isReconnecting ? 'Reconnecting Socket...' : 'Reboot WebSocket Connection'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function getLatencyColor(ms: number, isConnected: boolean): string {
  if (!isConnected) return 'text-slate-500';
  if (ms <= 100) return 'text-emerald-400';
  if (ms <= 250) return 'text-cyan-300';
  if (ms <= 500) return 'text-amber-400';
  return 'text-rose-400';
}

function getQualityBadge(quality: ConnectionQuality) {
  switch (quality) {
    case 'EXCELLENT':
      return {
        label: 'Excellent',
        className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      };
    case 'GOOD':
      return {
        label: 'Good',
        className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      };
    case 'FAIR':
      return {
        label: 'Fair',
        className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
    case 'POOR':
      return {
        label: 'Poor',
        className: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      };
    case 'OFFLINE':
    default:
      return {
        label: 'Offline',
        className: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      };
  }
}
