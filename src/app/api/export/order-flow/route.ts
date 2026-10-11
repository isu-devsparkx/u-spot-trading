// ─── U-SPOT Order Flow & Trade Tape Export API Route — Phase 38 ──────
// Generates and streams downloadable CSV and JSON files for Live Trades,
// Order Book DOM Snapshots, and Cumulative Volume Delta metrics.

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchHistoricalTradesFromBinance,
  convertTradesToCSV,
  convertDOMSnapshotToCSV,
  convertCVDStatsToCSV,
  generateOrderFlowExportJSON,
  filterTrades,
  generateExportFileName,
} from '@/lib/services/order-flow-exporter';
import { computeTradeFlowStats } from '@/lib/services/time-and-sales';
import type {
  OrderFlowExportFormat,
  OrderFlowExportType,
  OrderFlowExportFilter,
  LiveTradeTick,
  DOMHeatmapSnapshot,
} from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSymbol = searchParams.get('symbol') || 'BTC/USDT';
    const symbol = rawSymbol.includes('/') ? rawSymbol : `${rawSymbol}/USDT`;

    const formatParam = (searchParams.get('format') || 'csv').toUpperCase();
    const format: OrderFlowExportFormat = formatParam === 'JSON' ? 'JSON' : 'CSV';

    const typeParam = (searchParams.get('type') || 'trades').toUpperCase();
    const exportType: OrderFlowExportType =
      typeParam === 'DOM'
        ? 'DOM_SNAPSHOT'
        : typeParam === 'CVD'
        ? 'CVD_HISTORY'
        : typeParam === 'ALL'
        ? 'ALL_ORDER_FLOW'
        : 'TRADES';

    const limit = Math.min(1000, Math.max(10, parseInt(searchParams.get('limit') || '100', 10)));
    const minVolumeUsdt = searchParams.get('minVolume')
      ? parseFloat(searchParams.get('minVolume')!)
      : undefined;
    const takerSide = searchParams.get('side')
      ? (searchParams.get('side')!.toUpperCase() as 'BUY' | 'SELL' | 'ALL')
      : 'ALL';

    // 1. Fetch trades from Binance
    const rawTrades = await fetchHistoricalTradesFromBinance(symbol, limit);

    // 2. Filter trades
    const trades = filterTrades(rawTrades, {
      minVolumeUsdt,
      takerSide,
      limit,
    });

    // 3. Compute flow metrics
    const flowStats = computeTradeFlowStats(trades, symbol);

    // 4. Generate content based on format and type
    const filename = generateExportFileName(symbol, exportType, format);

    if (format === 'JSON') {
      const jsonPayload = generateOrderFlowExportJSON(symbol, trades, flowStats, undefined, exportType);
      return new NextResponse(JSON.stringify(jsonPayload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // CSV Format
    let csvContent = '';
    if (exportType === 'CVD_HISTORY') {
      csvContent = convertCVDStatsToCSV(symbol, flowStats);
    } else {
      csvContent = convertTradesToCSV(trades, true);
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to export order flow data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol = 'BTC/USDT',
      format = 'CSV',
      exportType = 'TRADES',
      trades = [],
      domSnapshot,
      flowStats,
    } = body;

    const safeFormat: OrderFlowExportFormat = format.toUpperCase() === 'JSON' ? 'JSON' : 'CSV';
    const safeType: OrderFlowExportType = exportType;
    const stats = flowStats || computeTradeFlowStats(trades, symbol);

    const filename = generateExportFileName(symbol, safeType, safeFormat);

    if (safeFormat === 'JSON') {
      const jsonPayload = generateOrderFlowExportJSON(symbol, trades, stats, domSnapshot, safeType);
      return new NextResponse(JSON.stringify(jsonPayload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // CSV format
    let csvContent = '';
    if (safeType === 'DOM_SNAPSHOT' && domSnapshot) {
      csvContent = convertDOMSnapshotToCSV(domSnapshot, true);
    } else if (safeType === 'CVD_HISTORY') {
      csvContent = convertCVDStatsToCSV(symbol, stats);
    } else {
      csvContent = convertTradesToCSV(trades, true);
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process order flow export payload' },
      { status: 500 }
    );
  }
}
