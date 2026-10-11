'use client';

// ─── U-SPOT Real-Time Order Flow Heatmap 2.0 with Depth Delta Bars ─────────
// Phase 41: High-performance 2D Canvas Depth Heatmap with dynamic color themes,
// institutional wall detection overlays, mid-price trajectory, and synchronized
// per-slice Depth Delta Bars (Net Bid/Ask Volume Delta & Cumulative Delta).

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveOrderBook } from '@/hooks/useBinanceWebSocket';
import {
  createHeatmapSlice,
  appendHeatmapSlice,
  getHeatmapColor,
  calculateDepthDeltaStats,
  generateSyntheticHeatmapHistory,
  DEFAULT_HEATMAP_CONFIG,
} from '@/lib/services/order-flow-heatmap';
import type {
  OrderFlowHeatmapSlice,
  HeatmapRenderConfig,
  HeatmapColorTheme,
  HeatmapResolution,
  HeatmapPriceBucket,
} from '@/types';
import {
  Layers,
  Activity,
  Sliders,
  Play,
  Pause,
  Eye,
  Zap,
  TrendingUp,
  TrendingDown,
  Info,
  Sparkles,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import HeatmapReplayWorkbench from './HeatmapReplayWorkbench';

interface OrderFlowHeatmapVisualizerProps {
  symbol: string;
  compact?: boolean;
}

export default function OrderFlowHeatmapVisualizer({
  symbol,
  compact = false,
}: OrderFlowHeatmapVisualizerProps) {
  const { depth, isLiveWs } = useLiveOrderBook(symbol);

  // Heatmap rendering configuration state
  const [config, setConfig] = useState<HeatmapRenderConfig>(DEFAULT_HEATMAP_CONFIG);
  const [slices, setSlices] = useState<OrderFlowHeatmapSlice[]>([]);
  const lastCumulativeDeltaRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  // Phase 44: Heatmap Snapshot Recording & Replay Engine state
  const [replaySlices, setReplaySlices] = useState<OrderFlowHeatmapSlice[] | null>(null);
  const [isReplayModeActive, setIsReplayModeActive] = useState<boolean>(false);

  // Active slices rendered by canvas (live streaming slices or replay window slices)
  const activeSlices = useMemo(() => {
    return isReplayModeActive && replaySlices && replaySlices.length > 0 ? replaySlices : slices;
  }, [isReplayModeActive, replaySlices, slices]);

  // Mouse hover crosshair inspection state
  const [hoveredSlice, setHoveredSlice] = useState<{
    slice: OrderFlowHeatmapSlice;
    x: number;
    y: number;
    price: number;
    bucket?: HeatmapPriceBucket;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const deltaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize synthetic historical depth slices on initial live depth load
  useEffect(() => {
    if (depth && !initializedRef.current && slices.length === 0) {
      const history = generateSyntheticHeatmapHistory(depth, 36, 1500);
      setSlices(history);
      if (history.length > 0) {
        lastCumulativeDeltaRef.current = history[history.length - 1].cumulativeDeltaUsdt;
      }
      initializedRef.current = true;
    }
  }, [depth, slices.length]);

  // Append new depth slice when live WebSocket ticks arrive
  useEffect(() => {
    if (!depth || config.paused) return;

    const newSlice = createHeatmapSlice(depth, lastCumulativeDeltaRef.current, config);
    lastCumulativeDeltaRef.current = newSlice.cumulativeDeltaUsdt;

    setSlices((prev) => appendHeatmapSlice(prev, newSlice, config.maxHistorySlices));
  }, [depth, config.paused, config.maxHistorySlices, config.contrastMultiplier]);

  // Derived delta summary stats
  const deltaStats = useMemo(() => calculateDepthDeltaStats(activeSlices), [activeSlices]);

  // Render 2D Canvas Depth Heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeSlices.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI crisp rendering
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 640;
    const height = compact ? 220 : 280;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Dark obsidian background
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, width, height);

    // Compute global price extremes across active slices
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const slice of activeSlices) {
      for (const bucket of slice.buckets) {
        if (bucket.price < minPrice) minPrice = bucket.price;
        if (bucket.price > maxPrice) maxPrice = bucket.price;
      }
    }

    if (minPrice === Infinity || maxPrice === -Infinity || minPrice >= maxPrice) {
      minPrice = (activeSlices[0]?.midPrice || 100) * 0.995;
      maxPrice = (activeSlices[0]?.midPrice || 100) * 1.005;
    }

    // Add 1.5% margin to top/bottom
    const priceRange = maxPrice - minPrice;
    const paddedMin = minPrice - priceRange * 0.02;
    const paddedMax = maxPrice + priceRange * 0.02;
    const paddedRange = paddedMax - paddedMin;

    const priceToY = (p: number) => {
      return height - ((p - paddedMin) / paddedRange) * height;
    };

    // Draw horizontal price grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = (height / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width - 55, y);
      ctx.stroke();

      // Price labels on right margin
      const p = paddedMax - (paddedRange / gridSteps) * i;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(p >= 1000 ? p.toFixed(1) : p.toFixed(4), width - 8, y + 3);
    }

    // Render slices horizontally from left to right
    const numSlices = activeSlices.length;
    const sliceWidth = (width - 55) / numSlices;

    activeSlices.forEach((slice, sIdx) => {
      const x = sIdx * sliceWidth;

      // Draw liquidity buckets
      for (const bucket of slice.buckets) {
        const y = priceToY(bucket.price);
        const cellH = Math.max(3, height / 30);

        ctx.fillStyle = getHeatmapColor(
          bucket.intensity,
          bucket.side,
          config.theme,
          bucket.isWall,
          config.contrastMultiplier
        );

        ctx.fillRect(x, y - cellH / 2, Math.max(1, sliceWidth - 0.5), cellH);

        // Institutional wall highlight overlay
        if (bucket.isWall && config.showWallOverlays) {
          ctx.strokeStyle =
            bucket.side === 'BID' ? 'rgba(52, 211, 153, 0.9)' : 'rgba(244, 63, 94, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x - 1, y - cellH / 2, sliceWidth + 1, cellH);
        }
      }
    });

    // Draw continuous mid-price polyline across slices
    if (config.showMidPriceLine && activeSlices.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#facc15'; // Neon yellow-amber
      ctx.lineWidth = 1.8;
      ctx.shadowColor = 'rgba(250, 204, 21, 0.7)';
      ctx.shadowBlur = 4;

      activeSlices.forEach((slice, sIdx) => {
        const x = sIdx * sliceWidth + sliceWidth / 2;
        const y = priceToY(slice.midPrice);
        if (sIdx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow
    }

    // Latest price tag marker
    const latestSlice = activeSlices[activeSlices.length - 1];
    if (latestSlice) {
      const latestY = priceToY(latestSlice.midPrice);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.2)';
      ctx.fillRect(width - 55, latestY - 8, 55, 16);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        latestSlice.midPrice >= 1000
          ? latestSlice.midPrice.toFixed(1)
          : latestSlice.midPrice.toFixed(4),
        width - 4,
        latestY + 3
      );
    }
  }, [activeSlices, config, compact]);


  // Render Depth Delta Bars Canvas (below heatmap)
  useEffect(() => {
    if (!config.showDeltaBars) return;

    const canvas = deltaCanvasRef.current;
    if (!canvas || activeSlices.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 640;
    const height = 64;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, width, height);

    // Zero line in the vertical center
    const zeroY = height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width - 55, zeroY);
    ctx.stroke();

    // Find max delta magnitude for scaling
    const maxDeltaMag = Math.max(
      1,
      ...activeSlices.map((s) => Math.abs(s.depthDeltaUsdt))
    );

    const numSlices = activeSlices.length;
    const sliceWidth = (width - 55) / numSlices;

    // 1. Draw Depth Delta Histogram bars
    activeSlices.forEach((slice, sIdx) => {
      const x = sIdx * sliceWidth;
      const barW = Math.max(1, sliceWidth - 1);
      const normalizedH = (Math.abs(slice.depthDeltaUsdt) / maxDeltaMag) * (height / 2 - 4);

      if (slice.depthDeltaUsdt >= 0) {
        // Net Bid dominance: green bar rising above zero line
        ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
        ctx.fillRect(x, zeroY - normalizedH, barW, normalizedH);
      } else {
        // Net Ask dominance: rose bar falling below zero line
        ctx.fillStyle = 'rgba(244, 63, 94, 0.85)';
        ctx.fillRect(x, zeroY, barW, normalizedH);
      }
    });

    // 2. Draw Cumulative Delta Line
    const cumDeltas = activeSlices.map((s) => s.cumulativeDeltaUsdt);
    const minCum = Math.min(...cumDeltas);
    const maxCum = Math.max(...cumDeltas);
    const cumRange = Math.max(1, maxCum - minCum);

    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8'; // Sky blue
    ctx.lineWidth = 1.5;

    activeSlices.forEach((slice, sIdx) => {
      const x = sIdx * sliceWidth + sliceWidth / 2;
      const y = height - 4 - ((slice.cumulativeDeltaUsdt - minCum) / cumRange) * (height - 8);
      if (sIdx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Delta axis label
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Δ Depth', width - 8, zeroY - 4);
    ctx.fillText('CVD Line', width - 8, height - 6);
  }, [activeSlices, config.showDeltaBars]);

  // Handle canvas mouse move for interactive crosshair inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || activeSlices.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const sliceWidth = (rect.width - 55) / activeSlices.length;
    const sliceIndex = Math.min(
      activeSlices.length - 1,
      Math.max(0, Math.floor(x / sliceWidth))
    );

    const targetSlice = activeSlices[sliceIndex];
    if (!targetSlice) return;

    // Approximate price at cursor Y
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const slice of activeSlices) {
      for (const bucket of slice.buckets) {
        if (bucket.price < minPrice) minPrice = bucket.price;
        if (bucket.price > maxPrice) maxPrice = bucket.price;
      }
    }
    const paddedMin = minPrice - (maxPrice - minPrice) * 0.02;
    const paddedMax = maxPrice + (maxPrice - minPrice) * 0.02;
    const priceAtCursor = paddedMax - (y / rect.height) * (paddedMax - paddedMin);

    // Find closest bucket in slice
    let closestBucket: HeatmapPriceBucket | undefined;
    let minDiff = Infinity;
    for (const b of targetSlice.buckets) {
      const diff = Math.abs(b.price - priceAtCursor);
      if (diff < minDiff) {
        minDiff = diff;
        closestBucket = b;
      }
    }

    setHoveredSlice({
      slice: targetSlice,
      x,
      y,
      price: priceAtCursor,
      bucket: closestBucket,
    });
  };


  const handleMouseLeave = () => {
    setHoveredSlice(null);
  };

  return (
    <div
      ref={containerRef}
      className="space-y-2.5 rounded-xl bg-[var(--surface-2)]/95 border border-[var(--glass-border)] p-3.5"
    >
      {/* ─── Top Stats & Controls Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers size={13} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-100">
                Order Flow Heatmap 2.0
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">
                L2 Depth Delta
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
              <span>
                {activeSlices.length} {isReplayModeActive ? 'Replay Slices' : 'Historical Slices'}
              </span>
              <span>•</span>
              <span
                className={
                  deltaStats.deltaTrend === 'BUY_PRESSURE'
                    ? 'text-emerald-400 font-bold'
                    : deltaStats.deltaTrend === 'SELL_PRESSURE'
                    ? 'text-rose-400 font-bold'
                    : 'text-slate-300'
                }
              >
                {deltaStats.deltaTrend === 'BUY_PRESSURE' ? (
                  <span className="flex items-center gap-0.5">
                    <TrendingUp size={10} /> Buy Dominance ({deltaStats.bidDominancePct}%)
                  </span>
                ) : deltaStats.deltaTrend === 'SELL_PRESSURE' ? (
                  <span className="flex items-center gap-0.5">
                    <TrendingDown size={10} /> Sell Pressure ({deltaStats.askDominancePct}%)
                  </span>
                ) : (
                  'Balanced Flow'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono flex-wrap">
          {/* Theme Selector */}
          <div className="flex items-center bg-slate-900/80 p-0.5 rounded border border-[var(--glass-border)]">
            {(['CYAN_EMERALD', 'NEON_FIRE', 'CLASSIC_DEPTH'] as HeatmapColorTheme[]).map((thm) => (
              <button
                key={thm}
                onClick={() => setConfig((c) => ({ ...c, theme: thm }))}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                  config.theme === thm
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Theme: ${thm}`}
              >
                {thm === 'CYAN_EMERALD' ? 'Cyan' : thm === 'NEON_FIRE' ? 'Neon' : 'Classic'}
              </button>
            ))}
          </div>

          {/* Contrast Multiplier */}
          <div className="flex items-center bg-slate-900/80 p-0.5 rounded border border-[var(--glass-border)]">
            <span className="px-1 text-[9px] text-slate-500">Heat:</span>
            {[0.8, 1.2, 1.8, 2.5].map((val) => (
              <button
                key={val}
                onClick={() => setConfig((c) => ({ ...c, contrastMultiplier: val }))}
                className={`px-1 py-0.5 rounded cursor-pointer ${
                  config.contrastMultiplier === val
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {val}x
              </button>
            ))}
          </div>

          {/* Overlays Toggle Buttons */}
          <button
            onClick={() => setConfig((c) => ({ ...c, showWallOverlays: !c.showWallOverlays }))}
            className={`px-1.5 py-1 rounded border cursor-pointer transition ${
              config.showWallOverlays
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 font-bold'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title="Toggle Institutional Wall Outlines"
          >
            Walls
          </button>

          <button
            onClick={() => setConfig((c) => ({ ...c, showMidPriceLine: !c.showMidPriceLine }))}
            className={`px-1.5 py-1 rounded border cursor-pointer transition ${
              config.showMidPriceLine
                ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300 font-bold'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title="Toggle Mid-Price Trajectory Line"
          >
            Mid Line
          </button>

          <button
            onClick={() => setConfig((c) => ({ ...c, showDeltaBars: !c.showDeltaBars }))}
            className={`px-1.5 py-1 rounded border cursor-pointer transition ${
              config.showDeltaBars
                ? 'bg-sky-500/15 border-sky-500/30 text-sky-300 font-bold'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title="Toggle Depth Delta Histogram"
          >
            Delta Bars
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setConfig((c) => ({ ...c, paused: !c.paused }))}
            className={`p-1 rounded border cursor-pointer transition flex items-center gap-1 ${
              config.paused
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 font-bold'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
            title={config.paused ? 'Resume Live Stream' : 'Freeze Visualizer'}
          >
            {config.paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
        </div>
      </div>

      {/* ─── Delta Telemetry Strip ─── */}
      <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono bg-slate-950/60 p-2 rounded-lg border border-[var(--glass-border)]">
        <div>
          <span className="text-slate-500 block text-[9px]">Slice Depth Delta</span>
          <span
            className={`font-bold ${
              deltaStats.currentDepthDeltaUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {deltaStats.currentDepthDeltaUsdt >= 0 ? '+' : ''}
            {formatNumber(deltaStats.currentDepthDeltaUsdt)} USDT
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px]">Cumulative Delta (CVD)</span>
          <span
            className={`font-bold ${
              deltaStats.cumulativeDeltaUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {deltaStats.cumulativeDeltaUsdt >= 0 ? '+' : ''}
            {formatNumber(deltaStats.cumulativeDeltaUsdt)} USDT
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px]">Bid vs Ask Share</span>
          <span className="text-slate-200 font-bold">
            <span className="text-emerald-400">{deltaStats.bidDominancePct}%</span> /{' '}
            <span className="text-rose-400">{deltaStats.askDominancePct}%</span>
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[9px]">Whale Walls Detected</span>
          <span className="text-amber-400 font-bold flex items-center justify-center gap-1">
            <Sparkles size={10} />
            {deltaStats.totalWhaleWalls}
          </span>
        </div>
      </div>

      {/* ─── Phase 44: Liquidity Heatmap Snapshot Recording & Replay Workbench ─── */}
      <HeatmapReplayWorkbench
        symbol={symbol}
        latestSlice={slices.length > 0 ? slices[slices.length - 1] : null}
        onReplaySlicesChange={setReplaySlices}
        isReplayModeActive={isReplayModeActive}
        setIsReplayModeActive={setIsReplayModeActive}
      />

      {/* ─── Canvas Heatmap Rendering Area ─── */}
      <div className="relative rounded-lg overflow-hidden border border-slate-800">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full cursor-crosshair block"
          style={{ height: compact ? 220 : 280 }}
        />

        {/* Hover Crosshair Tooltip */}
        {hoveredSlice && (
          <div
            className="absolute pointer-events-none bg-slate-900/90 border border-slate-700 p-2 rounded-lg shadow-xl text-[10px] font-mono text-slate-200 z-10 space-y-0.5"
            style={{
              left: Math.min(hoveredSlice.x + 12, (containerRef.current?.clientWidth || 500) - 170),
              top: Math.max(10, hoveredSlice.y - 40),
            }}
          >
            <div className="text-slate-400 text-[9px]">
              {new Date(hoveredSlice.slice.timestamp).toLocaleTimeString()}
            </div>
            <div className="text-amber-300 font-bold">
              Mid: {hoveredSlice.slice.midPrice.toFixed(2)}
            </div>
            {hoveredSlice.bucket && (
              <div className="flex items-center gap-1">
                <span
                  className={
                    hoveredSlice.bucket.side === 'BID' ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  {hoveredSlice.bucket.side}: {hoveredSlice.bucket.price.toFixed(2)}
                </span>
                <span className="text-slate-400 font-normal">
                  (${formatNumber(hoveredSlice.bucket.volumeUsdt)})
                </span>
                {hoveredSlice.bucket.isWall && (
                  <span className="text-amber-400 font-bold text-[9px] bg-amber-500/20 px-1 rounded">
                    WALL
                  </span>
                )}
              </div>
            )}
            <div className="text-slate-300 pt-0.5 border-t border-slate-800 text-[9px]">
              Slice Delta:{' '}
              <span
                className={
                  hoveredSlice.slice.depthDeltaUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                {hoveredSlice.slice.depthDeltaUsdt >= 0 ? '+' : ''}
                {formatNumber(hoveredSlice.slice.depthDeltaUsdt)} USDT
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Synchronized Depth Delta Bars Canvas ─── */}
      {config.showDeltaBars && (
        <div className="relative rounded-lg overflow-hidden border border-slate-800">
          <canvas
            ref={deltaCanvasRef}
            className="w-full block"
            style={{ height: 64 }}
          />
        </div>
      )}

      {/* ─── Bottom Legend ─── */}
      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500 inline-block" /> Bids (Buy Support)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-cyan-400 inline-block" /> Asks (Sell Resistance)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-400 inline-block" /> Institutional Wall
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-yellow-400 inline-block" /> Mid-Price Path
          </span>
        </div>
        <div className="text-right">
          <span>Binance Spot 100ms L2 • Sub-Second Heat Engine</span>
        </div>
      </div>
    </div>
  );
}
