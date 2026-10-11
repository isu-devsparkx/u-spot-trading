'use client';

// ─── U-SPOT Order Flow Export Modal — Phase 38 ─────────────────────────
// Interactive modal for exporting Live Trades Tape, DOM Depth Ladder,
// and Cumulative Volume Delta metrics in RFC 4180 CSV or JSON formats.

import React, { useState } from 'react';
import type {
  LiveTradeTick,
  TradeFlowStats,
  DOMHeatmapSnapshot,
  OrderFlowExportFormat,
  OrderFlowExportType,
} from '@/types';
import {
  convertTradesToCSV,
  convertDOMSnapshotToCSV,
  convertCVDStatsToCSV,
  generateOrderFlowExportJSON,
  filterTrades,
  generateExportFileName,
  downloadFileClientSide,
} from '@/lib/services/order-flow-exporter';
import {
  Download,
  FileSpreadsheet,
  FileJson,
  X,
  Filter,
  CheckCircle2,
  Layers,
  Database,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface OrderFlowExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  activeTrades: LiveTradeTick[];
  flowStats: TradeFlowStats;
  domSnapshot?: DOMHeatmapSnapshot;
}

export default function OrderFlowExportModal({
  isOpen,
  onClose,
  symbol,
  activeTrades,
  flowStats,
  domSnapshot,
}: OrderFlowExportModalProps) {
  const [format, setFormat] = useState<OrderFlowExportFormat>('CSV');
  const [exportType, setExportType] = useState<OrderFlowExportType>('TRADES');
  const [filterWhalesOnly, setFilterWhalesOnly] = useState<boolean>(false);
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [sourceMode, setSourceMode] = useState<'ACTIVE_BUFFER' | 'BINANCE_REST'>('ACTIVE_BUFFER');
  const [historyLimit, setHistoryLimit] = useState<number>(100);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  // Compute preview count
  const filteredTrades = filterTrades(activeTrades, {
    minVolumeUsdt: filterWhalesOnly ? 10000 : 0,
    takerSide: sideFilter,
  });

  const previewCount =
    exportType === 'DOM_SNAPSHOT'
      ? (domSnapshot ? domSnapshot.askRows.length + domSnapshot.bidRows.length : 0)
      : exportType === 'CVD_HISTORY'
      ? 11
      : sourceMode === 'ACTIVE_BUFFER'
      ? filteredTrades.length
      : historyLimit;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportStatus(null);

      // If Server-side REST mode
      if (sourceMode === 'BINANCE_REST' && exportType === 'TRADES') {
        const queryParams = new URLSearchParams({
          symbol,
          format: format.toLowerCase(),
          type: exportType.toLowerCase(),
          limit: String(historyLimit),
          side: sideFilter,
        });
        if (filterWhalesOnly) {
          queryParams.set('minVolume', '10000');
        }

        // Trigger direct browser download from API
        window.location.href = `/api/export/order-flow?${queryParams.toString()}`;
        setExportStatus(`Downloading ${historyLimit} historical trades from Binance...`);
        setTimeout(() => onClose(), 1500);
        return;
      }

      // Client-side buffer export
      const filename = generateExportFileName(symbol, exportType, format);

      if (format === 'JSON') {
        const payload = generateOrderFlowExportJSON(
          symbol,
          filteredTrades,
          flowStats,
          domSnapshot,
          exportType
        );
        const jsonStr = JSON.stringify(payload, null, 2);
        downloadFileClientSide(jsonStr, filename, 'application/json;charset=utf-8;');
      } else {
        // CSV Format
        let csv = '';
        if (exportType === 'DOM_SNAPSHOT' && domSnapshot) {
          csv = convertDOMSnapshotToCSV(domSnapshot, true);
        } else if (exportType === 'CVD_HISTORY') {
          csv = convertCVDStatsToCSV(symbol, flowStats);
        } else {
          csv = convertTradesToCSV(filteredTrades, true);
        }
        downloadFileClientSide(csv, filename, 'text/csv;charset=utf-8;');
      }

      setExportStatus(`Downloaded ${filename} successfully!`);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setExportStatus(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--surface-1)] border border-[var(--glass-border)] shadow-2xl p-5 space-y-4 font-sans text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2">
            <Download size={18} className="text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Export Order Flow Data: {symbol}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[var(--surface-2)] transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Export Type Selection */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Dataset to Export
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'TRADES' as const, label: 'Trade Tape' },
              { id: 'DOM_SNAPSHOT' as const, label: 'DOM Ladder' },
              { id: 'CVD_HISTORY' as const, label: 'CVD Flow Stats' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setExportType(t.id)}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition text-center ${
                  exportType === t.id
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-[var(--surface-2)]/60 border-[var(--glass-border)] text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Format Selection (CSV vs JSON) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            File Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setFormat('CSV')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                format === 'CSV'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-[var(--surface-2)]/60 border-[var(--glass-border)] text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet size={15} />
              <span>RFC 4180 CSV</span>
            </button>
            <button
              onClick={() => setFormat('JSON')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                format === 'JSON'
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-[var(--surface-2)]/60 border-[var(--glass-border)] text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileJson size={15} />
              <span>Standard JSON</span>
            </button>
          </div>
        </div>

        {/* Trade-specific filters */}
        {exportType === 'TRADES' && (
          <div className="p-3 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--glass-border)] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Source Mode</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSourceMode('ACTIVE_BUFFER')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    sourceMode === 'ACTIVE_BUFFER'
                      ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
                      : 'border-transparent text-slate-500'
                  }`}
                >
                  Active Buffer ({activeTrades.length})
                </button>
                <button
                  onClick={() => setSourceMode('BINANCE_REST')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    sourceMode === 'BINANCE_REST'
                      ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
                      : 'border-transparent text-slate-500'
                  }`}
                >
                  Binance REST API
                </button>
              </div>
            </div>

            {sourceMode === 'BINANCE_REST' ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Fetch Depth</span>
                <select
                  value={historyLimit}
                  onChange={(e) => setHistoryLimit(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  <option value={100}>Recent 100 Fills</option>
                  <option value={250}>Recent 250 Fills</option>
                  <option value={500}>Recent 500 Fills</option>
                  <option value={1000}>Recent 1,000 Fills</option>
                </select>
              </div>
            ) : null}

            {/* Filter checkboxes & side */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--glass-border)] text-xs">
              <button
                onClick={() => setFilterWhalesOnly(!filterWhalesOnly)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] transition ${
                  filterWhalesOnly
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 font-semibold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400'
                }`}
              >
                <span>🐳 Whales (≥$10k)</span>
              </button>

              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value as any)}
                className="bg-slate-900/60 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Taker Sides</option>
                <option value="BUY">Taker Buy Only (🟢)</option>
                <option value="SELL">Taker Sell Only (🔴)</option>
              </select>
            </div>
          </div>
        )}

        {/* Summary Metric Preview */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400">
          <span>Target Payload:</span>
          <span className="font-mono text-slate-200 font-semibold">
            {previewCount} records • {format} format
          </span>
        </div>

        {exportStatus && (
          <p className="text-xs text-emerald-400 text-center font-medium animate-pulse">
            {exportStatus}
          </p>
        )}

        {/* Action Button */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isExporting ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Download size={14} className="stroke-[2.5]" />
          )}
          <span>{isExporting ? 'Generating Export...' : `Export ${format} File Now`}</span>
        </button>
      </div>
    </div>
  );
}
