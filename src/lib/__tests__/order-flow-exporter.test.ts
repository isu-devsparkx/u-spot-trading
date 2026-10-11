// ─── U-SPOT Order Flow Exporter Unit Tests — Phase 38 ──────────────────
// Tests CSV RFC 4180 conversion, DOM ladder serialization, CVD stats export,
// volume and side filtering, filename generation, and JSON schema packaging.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeCSVField,
  generateExportFileName,
  convertTradesToCSV,
  convertDOMSnapshotToCSV,
  convertCVDStatsToCSV,
  generateOrderFlowExportJSON,
  filterTrades,
} from '../services/order-flow-exporter.ts';
import type { LiveTradeTick, TradeFlowStats, DOMHeatmapSnapshot } from '../../types/index.ts';

test('Phase 38: Time & Sales Tape & Order Flow Data Exporter', async (t) => {
  await t.test('1. escapeCSVField RFC 4180 compliance', () => {
    assert.equal(escapeCSVField(null), '');
    assert.equal(escapeCSVField(undefined), '');
    assert.equal(escapeCSVField(1234.56), '1234.56');
    assert.equal(escapeCSVField('BTC/USDT'), 'BTC/USDT');
    // Commas should trigger quotes
    assert.equal(escapeCSVField('Hello, World'), '"Hello, World"');
    // Double quotes should be escaped as ""
    assert.equal(escapeCSVField('Order "Whale"'), '"Order ""Whale"""');
    // Newlines should trigger quotes
    assert.equal(escapeCSVField('Line1\nLine2'), '"Line1\nLine2"');
  });

  await t.test('2. generateExportFileName standardization', () => {
    const fixedTime = new Date('2026-10-06T12:30:00.000Z').getTime();
    const csvName = generateExportFileName('BTC/USDT', 'TRADES', 'CSV', fixedTime);
    assert.ok(csvName.startsWith('uspot_BTCUSDT_trades_2026-10-06'));
    assert.ok(csvName.endsWith('.csv'));

    const jsonName = generateExportFileName('SOL/USDT', 'DOM_SNAPSHOT', 'JSON', fixedTime);
    assert.ok(jsonName.startsWith('uspot_SOLUSDT_dom-snapshot_2026-10-06'));
    assert.ok(jsonName.endsWith('.json'));
  });

  await t.test('3. convertTradesToCSV formatting', () => {
    const mockTrades: LiveTradeTick[] = [
      {
        id: '1001',
        symbol: 'BTC/USDT',
        price: 64250.5,
        quantity: 0.5,
        volumeUsdt: 32125.25,
        side: 'BUY',
        isBuyerMaker: false,
        timestamp: 1700000000000,
        isWhale: false,
        sizeCategory: 'LARGE',
      },
      {
        id: '1002',
        symbol: 'BTC/USDT',
        price: 64240.0,
        quantity: 1.2,
        volumeUsdt: 77088.0,
        side: 'SELL',
        isBuyerMaker: true,
        timestamp: 1700000001000,
        isWhale: true,
        sizeCategory: 'WHALE',
      },
    ];

    const csv = convertTradesToCSV(mockTrades, true);
    const lines = csv.split('\n');

    assert.equal(lines.length, 3);
    assert.equal(
      lines[0],
      'TradeId,Timestamp,TimeISO,Symbol,Side,Price,Quantity,VolumeUSDT,SizeCategory,IsWhale'
    );
    assert.ok(lines[1].includes('1001,1700000000000'));
    assert.ok(lines[1].includes('BUY,64250.5,0.5,32125.25,LARGE,false'));
    assert.ok(lines[2].includes('1002,1700000001000'));
    assert.ok(lines[2].includes('SELL,64240,1.2,77088,WHALE,true'));
  });

  await t.test('4. convertDOMSnapshotToCSV formatting', () => {
    const mockDOM: DOMHeatmapSnapshot = {
      symbol: 'ETH/USDT',
      timestamp: 1700000000000,
      midPrice: 3450.0,
      spread: 0.1,
      spreadPercent: 0.0029,
      bestBid: 3450.0,
      bestAsk: 3450.1,
      totalBidDepthUsdt: 86250.0,
      totalAskDepthUsdt: 34501.0,
      bidAskRatio: 2.5,
      depthImbalance: 0.43,
      peakLevelVolumeUsdt: 86250.0,
      detectedWalls: [],
      askRows: [
        {
          price: 3450.1,
          side: 'ASK',
          quantity: 10.0,
          volumeUsdt: 34501.0,
          cumulativeVolumeUsdt: 34501.0,
          cumulativeDepthPercent: 40.0,
          heatIntensity: 0.8,
          isWall: false,
          isBestBid: false,
          isBestAsk: true,
          distancePercentFromMid: 0.0029,
        },
      ],
      bidRows: [
        {
          price: 3450.0,
          side: 'BID',
          quantity: 25.0,
          volumeUsdt: 86250.0,
          cumulativeVolumeUsdt: 86250.0,
          cumulativeDepthPercent: 100.0,
          heatIntensity: 1.0,
          isWall: true,
          isBestBid: true,
          isBestAsk: false,
          distancePercentFromMid: 0.0,
        },
      ],
    };

    const csv = convertDOMSnapshotToCSV(mockDOM, true);
    const lines = csv.split('\n');

    assert.equal(lines.length, 3);
    assert.equal(
      lines[0],
      'Side,LevelIndex,Price,Quantity,VolumeUSDT,CumulativeVolumeUSDT,PercentDepth,HeatIntensity,IsWall'
    );
    assert.ok(lines[1].startsWith('ASK,1,3450.1,10,34501,34501,40.00,0.80,false'));
    assert.ok(lines[2].startsWith('BID,1,3450,25,86250,86250,100.00,1.00,true'));
  });

  await t.test('5. convertCVDStatsToCSV summary formatting', () => {
    const stats: TradeFlowStats = {
      symbol: 'SOL/USDT',
      totalTrades: 50,
      buyCount: 30,
      sellCount: 20,
      totalVolumeUsdt: 500000,
      buyVolumeUsdt: 350000,
      sellVolumeUsdt: 150000,
      netCvdUsdt: 200000,
      takerBuyRatio: 0.7,
      largestTradeUsdt: 85000,
      whaleTradeCount: 4,
      lastUpdated: 1700000000000,
    };

    const csv = convertCVDStatsToCSV('SOL/USDT', stats);
    assert.ok(csv.includes('Symbol,SOL/USDT,Ticker'));
    assert.ok(csv.includes('TotalTrades,50,Count'));
    assert.ok(csv.includes('BuyVolumeUSDT,350000.00,USDT'));
    assert.ok(csv.includes('NetCVDUSDT,200000.00,USDT'));
    assert.ok(csv.includes('TakerBuyRatio,0.7000,Ratio'));
  });

  await t.test('6. filterTrades filtering operations', () => {
    const trades: LiveTradeTick[] = [
      {
        id: '1',
        symbol: 'BTC/USDT',
        price: 60000,
        quantity: 0.05,
        volumeUsdt: 3000,
        side: 'BUY',
        isBuyerMaker: false,
        timestamp: 100,
        isWhale: false,
        sizeCategory: 'MEDIUM',
      },
      {
        id: '2',
        symbol: 'BTC/USDT',
        price: 60000,
        quantity: 0.5,
        volumeUsdt: 30000,
        side: 'BUY',
        isBuyerMaker: false,
        timestamp: 200,
        isWhale: true,
        sizeCategory: 'LARGE',
      },
      {
        id: '3',
        symbol: 'BTC/USDT',
        price: 60000,
        quantity: 0.3,
        volumeUsdt: 18000,
        side: 'SELL',
        isBuyerMaker: true,
        timestamp: 300,
        isWhale: false,
        sizeCategory: 'LARGE',
      },
    ];

    // Filter by min volume >= 10k
    const whales = filterTrades(trades, { minVolumeUsdt: 10000 });
    assert.equal(whales.length, 2);
    assert.equal(whales[0].id, '2');
    assert.equal(whales[1].id, '3');

    // Filter by side BUY only
    const buysOnly = filterTrades(trades, { takerSide: 'BUY' });
    assert.equal(buysOnly.length, 2);

    // Filter by limit 1
    const limitOne = filterTrades(trades, { limit: 1 });
    assert.equal(limitOne.length, 1);
    assert.equal(limitOne[0].id, '1');
  });

  await t.test('7. generateOrderFlowExportJSON packaging', () => {
    const stats: TradeFlowStats = {
      symbol: 'BTC/USDT',
      totalTrades: 1,
      buyCount: 1,
      sellCount: 0,
      totalVolumeUsdt: 25000,
      buyVolumeUsdt: 25000,
      sellVolumeUsdt: 0,
      netCvdUsdt: 25000,
      takerBuyRatio: 1.0,
      largestTradeUsdt: 25000,
      whaleTradeCount: 0,
      lastUpdated: Date.now(),
    };
    const mockTrade: LiveTradeTick = {
      id: '99',
      symbol: 'BTC/USDT',
      price: 65000,
      quantity: 0.38,
      volumeUsdt: 24700,
      side: 'BUY',
      isBuyerMaker: false,
      timestamp: Date.now(),
      isWhale: false,
      sizeCategory: 'LARGE',
    };

    const payload = generateOrderFlowExportJSON('BTC/USDT', [mockTrade], stats);
    assert.equal(payload.metadata.symbol, 'BTC/USDT');
    assert.equal(payload.metadata.recordCount, 1);
    assert.equal(payload.metadata.format, 'JSON');
    assert.equal(payload.trades?.length, 1);
    assert.equal(payload.flowStats.netCvdUsdt, 25000);
  });
});
