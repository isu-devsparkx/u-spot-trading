'use client';

// ─── U-SPOT Backtest Equity Curve Visualizer ──────────────────────────
// Phase 13: SVG Equity Curve Chart with dynamic gradient, baseline & crosshairs
// Spec Section 30: Performance Statistics & Equity Trajectory

import { useState } from 'react';
import type { EquityPoint } from '@/types';

interface EquityCurveChartProps {
  equityCurve: EquityPoint[];
  initialBalance: number;
}

export default function EquityCurveChart({
  equityCurve,
  initialBalance,
}: EquityCurveChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<EquityPoint | null>(null);

  if (!equityCurve || equityCurve.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-slate-500">
        No equity curve data available.
      </div>
    );
  }

  const values = equityCurve.map((p) => p.equityUsdt);
  const minVal = Math.min(...values, initialBalance * 0.98);
  const maxVal = Math.max(...values, initialBalance * 1.02);
  const valRange = Math.max(1, maxVal - minVal);

  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 30, left: 50 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const getX = (idx: number) => {
    if (equityCurve.length === 1) return padding.left + chartW / 2;
    return padding.left + (idx / (equityCurve.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    return padding.top + chartH - ((val - minVal) / valRange) * chartH;
  };

  const points = equityCurve.map((p, i) => `${getX(i)},${getY(p.equityUsdt)}`).join(' ');
  const baselineY = getY(initialBalance);

  const finalEquity = equityCurve[equityCurve.length - 1].equityUsdt;
  const isNetProfit = finalEquity >= initialBalance;
  const strokeColor = isNetProfit ? '#10b981' : '#f43f5e';
  const fillColor = isNetProfit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';

  // Area path for gradient fill
  const firstX = getX(0);
  const lastX = getX(equityCurve.length - 1);
  const areaPath = `M ${firstX},${baselineY} L ${points.split(' ').join(' L ')} L ${lastX},${baselineY} Z`;

  return (
    <div className="relative w-full">
      {/* Chart Tooltip Overlay */}
      {hoveredPoint && (
        <div className="absolute top-2 right-4 z-10 bg-[var(--surface-2)] border border-[var(--glass-border)] rounded-xl px-3 py-1.5 shadow-lg text-xs space-y-0.5 pointer-events-none animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500">Point #{hoveredPoint.index}</span>
            <span className="font-mono font-bold text-slate-100">
              ${hoveredPoint.equityUsdt.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span
              className={`font-mono font-semibold ${
                hoveredPoint.equityUsdt >= initialBalance ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {hoveredPoint.equityUsdt >= initialBalance ? '+' : ''}
              {(hoveredPoint.equityUsdt - initialBalance).toFixed(2)} USDT (
              {(((hoveredPoint.equityUsdt - initialBalance) / initialBalance) * 100).toFixed(2)}%)
            </span>
            <span className="text-slate-400 font-mono">
              Running R: {hoveredPoint.runningR > 0 ? '+' : ''}
              {hoveredPoint.runningR.toFixed(2)}R
            </span>
            {hoveredPoint.drawdownPercent > 0 && (
              <span className="text-rose-400 font-mono">
                DD: -{hoveredPoint.drawdownPercent.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-64 overflow-visible cursor-crosshair"
      >
        <defs>
          <linearGradient id="equityFillGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y Gridlines & Labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const val = minVal + ratio * valRange;
          const y = getY(val);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--glass-border)"
                strokeDasharray="3 3"
                opacity={0.3}
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                fill="#64748b"
                fontSize={9}
                textAnchor="end"
                fontFamily="monospace"
              >
                ${val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Initial Baseline ($300) */}
        <line
          x1={padding.left}
          y1={baselineY}
          x2={width - padding.right}
          y2={baselineY}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          strokeWidth={1}
          opacity={0.5}
        />
        <text
          x={width - padding.right}
          y={baselineY - 4}
          fill="#94a3b8"
          fontSize={8}
          textAnchor="end"
          fontFamily="monospace"
          opacity={0.8}
        >
          Initial: ${initialBalance.toFixed(0)}
        </text>

        {/* Shaded Area under Curve */}
        <path d={areaPath} fill="url(#equityFillGradient)" />

        {/* Main Equity Path */}
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Circles / Hover Targets */}
        {equityCurve.map((p, idx) => {
          const cx = getX(idx);
          const cy = getY(p.equityUsdt);
          const isHovered = hoveredPoint?.index === p.index;

          return (
            <g
              key={idx}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {/* Invisible large hit target */}
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              {/* Visible dot on hover or endpoints */}
              {(isHovered || idx === 0 || idx === equityCurve.length - 1) && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 4.5 : 3}
                  fill={isHovered ? '#ffffff' : strokeColor}
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 2 : 1}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Axis Footer */}
      <div className="flex justify-between items-center text-[10px] text-slate-500 px-12 -mt-2 font-mono">
        <span>Start (Bar 0)</span>
        <span>Simulated Sequence ({equityCurve.length} Points)</span>
        <span>End</span>
      </div>
    </div>
  );
}
