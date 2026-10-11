// ─── U-SPOT Order Flow & Trade Tape Exporter Service — Phase 38 ──────
// Client-side and server-side export engine for Live Trades, Order Book DOM
// snapshots, and Cumulative Volume Delta (CVD) in RFC 4180 CSV & JSON formats.
// Spec Ref: Phase 38 (Time & Sales Tape & Order Flow Data Exporter)

import type {
  LiveTradeTick,
  TradeFlowStats,
  DOMHeatmapSnapshot,
  OrderFlowExportFormat,
  OrderFlowExportType,
  OrderFlowExportFilter,
  OrderFlowExportMetadata,
  OrderFlowExportJSONPayload,
} from '../../types/index.ts';
import { parseTradePayload, computeTradeFlowStats } from './time-and-sales.ts';

/**
 * Escapes a single CSV field following RFC 4180 standards
 */
export function escapeCSVField(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates standardized export filename with timestamp and clean symbols
 */
export function generateExportFileName(
  symbol: string,
  exportType: OrderFlowExportType,
  format: OrderFlowExportFormat,
  timestamp: number = Date.now()
): string {
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const dateStr = new Date(timestamp)
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '')
    .slice(0, 15);
  const typeKey = exportType.toLowerCase().replace('_', '-');
  const ext = format.toLowerCase();
  return `uspot_${cleanSymbol}_${typeKey}_${dateStr}.${ext}`;
}

/**
 * Filters a list of live trade ticks based on volume, side, and time parameters
 */
export function filterTrades(
  trades: LiveTradeTick[],
  filter?: Partial<OrderFlowExportFilter>
): LiveTradeTick[] {
  if (!trades || trades.length === 0) return [];
  if (!filter) return [...trades];

  let result = [...trades];

  // 1. Minimum volume in USDT filter
  if (filter.minVolumeUsdt && filter.minVolumeUsdt > 0) {
    const minVol = filter.minVolumeUsdt;
    result = result.filter((t) => t.volumeUsdt >= minVol);
  }

  // 2. Taker side filter (BUY / SELL / ALL)
  if (filter.takerSide && filter.takerSide !== 'ALL') {
    result = result.filter((t) => t.side === filter.takerSide);
  }

  // 3. Time range filters
  if (filter.startTime && filter.startTime > 0) {
    result = result.filter((t) => t.timestamp >= filter.startTime!);
  }
  if (filter.endTime && filter.endTime > 0) {
    result = result.filter((t) => t.timestamp <= filter.endTime!);
  }

  // 4. Record count limit
  if (filter.limit && filter.limit > 0 && result.length > filter.limit) {
    result = result.slice(0, filter.limit);
  }

  return result;
}

/**
 * Converts array of LiveTradeTick records into RFC 4180 CSV string
 */
export function convertTradesToCSV(
  trades: LiveTradeTick[],
  includeHeader: boolean = true
): string {
  const lines: string[] = [];

  if (includeHeader) {
    lines.push(
      [
        'TradeId',
        'Timestamp',
        'TimeISO',
        'Symbol',
        'Side',
        'Price',
        'Quantity',
        'VolumeUSDT',
        'SizeCategory',
        'IsWhale',
      ].join(',')
    );
  }

  for (const t of trades) {
    lines.push(
      [
        escapeCSVField(t.id),
        escapeCSVField(t.timestamp),
        escapeCSVField(new Date(t.timestamp).toISOString()),
        escapeCSVField(t.symbol),
        escapeCSVField(t.side),
        escapeCSVField(t.price),
        escapeCSVField(t.quantity),
        escapeCSVField(t.volumeUsdt),
        escapeCSVField(t.sizeCategory),
        escapeCSVField(t.isWhale),
      ].join(',')
    );
  }

  return lines.join('\n');
}

/**
 * Converts a DOM Heatmap snapshot into RFC 4180 CSV string
 */
export function convertDOMSnapshotToCSV(
  dom: DOMHeatmapSnapshot,
  includeHeader: boolean = true
): string {
  const lines: string[] = [];

  if (includeHeader) {
    lines.push(
      [
        'Side',
        'LevelIndex',
        'Price',
        'Quantity',
        'VolumeUSDT',
        'CumulativeVolumeUSDT',
        'PercentDepth',
        'HeatIntensity',
        'IsWall',
      ].join(',')
    );
  }

  // Asks
  for (let i = 0; i < dom.askRows.length; i++) {
    const row = dom.askRows[i];
    lines.push(
      [
        'ASK',
        escapeCSVField(i + 1),
        escapeCSVField(row.price),
        escapeCSVField(row.quantity),
        escapeCSVField(row.volumeUsdt),
        escapeCSVField(row.cumulativeVolumeUsdt),
        escapeCSVField(row.cumulativeDepthPercent.toFixed(2)),
        escapeCSVField(row.heatIntensity.toFixed(2)),
        escapeCSVField(row.isWall),
      ].join(',')
    );
  }

  // Bids
  for (let i = 0; i < dom.bidRows.length; i++) {
    const row = dom.bidRows[i];
    lines.push(
      [
        'BID',
        escapeCSVField(i + 1),
        escapeCSVField(row.price),
        escapeCSVField(row.quantity),
        escapeCSVField(row.volumeUsdt),
        escapeCSVField(row.cumulativeVolumeUsdt),
        escapeCSVField(row.cumulativeDepthPercent.toFixed(2)),
        escapeCSVField(row.heatIntensity.toFixed(2)),
        escapeCSVField(row.isWall),
      ].join(',')
    );
  }

  return lines.join('\n');
}

/**
 * Converts Cumulative Volume Delta (CVD) stats into summary CSV format
 */
export function convertCVDStatsToCSV(symbol: string, stats: TradeFlowStats): string {
  const lines: string[] = ['Metric,Value,Unit'];
  lines.push(`Symbol,${escapeCSVField(symbol)},Ticker`);
  lines.push(`TotalTrades,${stats.totalTrades},Count`);
  lines.push(`BuyTrades,${stats.buyCount},Count`);
  lines.push(`SellTrades,${stats.sellCount},Count`);
  lines.push(`TotalVolumeUSDT,${stats.totalVolumeUsdt.toFixed(2)},USDT`);
  lines.push(`BuyVolumeUSDT,${stats.buyVolumeUsdt.toFixed(2)},USDT`);
  lines.push(`SellVolumeUSDT,${stats.sellVolumeUsdt.toFixed(2)},USDT`);
  lines.push(`NetCVDUSDT,${stats.netCvdUsdt.toFixed(2)},USDT`);
  lines.push(`TakerBuyRatio,${stats.takerBuyRatio.toFixed(4)},Ratio`);
  lines.push(`LargestTradeUSDT,${stats.largestTradeUsdt.toFixed(2)},USDT`);
  lines.push(`WhaleTradeCount,${stats.whaleTradeCount},Count`);
  lines.push(`Timestamp,${Date.now()},UnixMS`);
  return lines.join('\n');
}

/**
 * Generates complete Order Flow JSON export structure
 */
export function generateOrderFlowExportJSON(
  symbol: string,
  trades: LiveTradeTick[],
  stats: TradeFlowStats,
  dom?: DOMHeatmapSnapshot,
  exportType: OrderFlowExportType = 'ALL_ORDER_FLOW'
): OrderFlowExportJSONPayload {
  const metadata: OrderFlowExportMetadata = {
    symbol,
    timestamp: Date.now(),
    recordCount: trades.length,
    totalVolumeUsdt: stats.totalVolumeUsdt,
    netCvdUsdt: stats.netCvdUsdt,
    takerBuyVolumeUsdt: stats.buyVolumeUsdt,
    takerSellVolumeUsdt: stats.sellVolumeUsdt,
    format: 'JSON',
    exportType,
    platform: 'U-SPOT Enterprise Trading System',
  };

  return {
    metadata,
    flowStats: stats,
    trades: exportType === 'DOM_SNAPSHOT' ? undefined : trades,
    domSnapshot: exportType === 'TRADES' || exportType === 'CVD_HISTORY' ? undefined : dom,
  };
}

/**
 * Triggers client-side browser download for generated file content
 */
export function downloadFileClientSide(
  content: string,
  filename: string,
  mimeType: string = 'text/csv;charset=utf-8;'
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches recent public executed trades from Binance REST endpoint
 */
export async function fetchHistoricalTradesFromBinance(
  symbol: string,
  limit: number = 100
): Promise<LiveTradeTick[]> {
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const url = `https://api.binance.com/api/v3/trades?symbol=${cleanSymbol}&limit=${Math.min(1000, limit)}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'U-Spot/1.0' }, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Binance API returned status ${res.status}`);
    }

    const rawTrades = await res.json();
    if (!Array.isArray(rawTrades)) return [];

    return rawTrades.map((t: any) =>
      parseTradePayload(
        {
          e: 'trade',
          E: t.time,
          s: cleanSymbol,
          t: t.id,
          p: String(t.price),
          q: String(t.qty),
          m: Boolean(t.isBuyerMaker), // m === true means buyer was maker -> seller was taker -> SELL
          T: t.time,
        },
        symbol
      )
    );
  } catch (err: any) {
    // If rate-limited or offline, return empty array gracefully
    return [];
  }
}
