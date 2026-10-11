// ─── U-SPOT Order Flow Sound & Visual Toast Tests (Phase 35) ────────
// Tests whale sweep detector, wall imbalance evaluation, CVD divergence,
// deduplication cooldown windows, and Web Audio synthesis safety.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTradeImbalance,
  evaluateWallImbalance,
  evaluateCvdImbalance,
  dispatchOrderFlowAlert,
  resetAlertCooldowns,
  isAlertSuppressed,
} from '../services/order-flow-imbalance.ts';
import {
  getOrderFlowAudioConfig,
  saveOrderFlowAudioConfig,
  playBuyChime,
  playSellChime,
  playWallChime,
  playCvdSurgeChime,
  DEFAULT_ORDER_FLOW_AUDIO_CONFIG,
} from '../services/sound-synthesizer.ts';
import type { LiveTradeTick, OrderBookWall, TradeFlowStats } from '../../types/index.ts';

describe('Phase 35: Order Flow Imbalance Sound & Visual Toast Notifications', () => {
  beforeEach(() => {
    resetAlertCooldowns();
  });

  describe('evaluateTradeImbalance', () => {
    it('returns null for retail trades below whale threshold', () => {
      const smallTrade: LiveTradeTick = {
        id: 1,
        symbol: 'BTC/USDT',
        price: 60000,
        quantity: 0.1,
        volumeUsdt: 6000,
        side: 'BUY',
        isBuyerMaker: false,
        timestamp: Date.now(),
        sizeCategory: 'MEDIUM',
        isWhale: false,
      };

      const alert = evaluateTradeImbalance(smallTrade, 25000);
      assert.equal(alert, null);
    });

    it('generates WHALE_BUY_SWEEP alert for large taker buy sweeps', () => {
      const whaleBuy: LiveTradeTick = {
        id: 2,
        symbol: 'SOL/USDT',
        price: 150,
        quantity: 350,
        volumeUsdt: 52500,
        side: 'BUY',
        isBuyerMaker: false,
        timestamp: 1700000000000,
        sizeCategory: 'WHALE',
        isWhale: true,
      };

      const alert = evaluateTradeImbalance(whaleBuy, 25000);
      assert.ok(alert);
      assert.equal(alert?.type, 'WHALE_BUY_SWEEP');
      assert.equal(alert?.symbol, 'SOL/USDT');
      assert.equal(alert?.severity, 'whale');
      assert.ok(alert?.title.includes('Whale Buy Sweep'));
      assert.ok(alert?.message.includes('$52,500'));
    });

    it('generates WHALE_SELL_SWEEP alert for large taker sell dumps', () => {
      const whaleSell: LiveTradeTick = {
        id: 3,
        symbol: 'ETH/USDT',
        price: 3200,
        quantity: 20,
        volumeUsdt: 64000,
        side: 'SELL',
        isBuyerMaker: true,
        timestamp: 1700000000000,
        sizeCategory: 'WHALE',
        isWhale: true,
      };

      const alert = evaluateTradeImbalance(whaleSell, 25000);
      assert.ok(alert);
      assert.equal(alert?.type, 'WHALE_SELL_SWEEP');
      assert.equal(alert?.symbol, 'ETH/USDT');
      assert.equal(alert?.severity, 'bearish');
      assert.ok(alert?.title.includes('Whale Sell Dump'));
      assert.ok(alert?.message.includes('$64,000'));
    });
  });

  describe('evaluateWallImbalance', () => {
    it('returns null for minor walls below depth multiple threshold', () => {
      const smallWall: OrderBookWall = {
        price: 145,
        volumeUsdt: 15000,
        percentFromPrice: 0.5,
        multipleOfAverage: 1.8,
        type: 'BID',
        distancePercent: 0.5,
      };

      const alert = evaluateWallImbalance('SOL/USDT', smallWall, 'BID');
      assert.equal(alert, null);
    });

    it('generates INSTITUTIONAL_BID_WALL alert for massive bid support floors', () => {
      const massiveBidWall: OrderBookWall = {
        price: 64000,
        volumeUsdt: 120000,
        percentFromPrice: 0.8,
        multipleOfAverage: 4.2,
        type: 'BID',
        distancePercent: 0.8,
      };

      const alert = evaluateWallImbalance('BTC/USDT', massiveBidWall, 'BID');
      assert.ok(alert);
      assert.equal(alert?.type, 'INSTITUTIONAL_BID_WALL');
      assert.equal(alert?.symbol, 'BTC/USDT');
      assert.equal(alert?.severity, 'bullish');
      assert.ok(alert?.title.includes('Bid Floor'));
      assert.ok(alert?.message.includes('4.2x avg'));
    });

    it('generates INSTITUTIONAL_ASK_WALL alert for massive ask resistance ceilings', () => {
      const massiveAskWall: OrderBookWall = {
        price: 66000,
        volumeUsdt: 95000,
        percentFromPrice: 1.2,
        multipleOfAverage: 3.5,
        type: 'ASK',
        distancePercent: 1.2,
      };

      const alert = evaluateWallImbalance('BTC/USDT', massiveAskWall, 'ASK');
      assert.ok(alert);
      assert.equal(alert?.type, 'INSTITUTIONAL_ASK_WALL');
      assert.equal(alert?.symbol, 'BTC/USDT');
      assert.equal(alert?.severity, 'bearish');
      assert.ok(alert?.title.includes('Ask Ceiling'));
    });
  });

  describe('evaluateCvdImbalance', () => {
    it('detects extreme buy CVD pressure above 75% taker ratio', () => {
      const bullishStats: TradeFlowStats = {
        symbol: 'SOL/USDT',
        totalTrades: 30,
        buyCount: 25,
        sellCount: 5,
        buyVolumeUsdt: 85000,
        sellVolumeUsdt: 15000,
        totalVolumeUsdt: 100000,
        netCvdUsdt: 70000,
        takerBuyRatio: 0.85,
        largestTradeUsdt: 20000,
        whaleTradeCount: 2,
        lastUpdated: Date.now(),
      };

      const alert = evaluateCvdImbalance(bullishStats);
      assert.ok(alert);
      assert.equal(alert?.type, 'CVD_EXTREME_BUY');
      assert.equal(alert?.severity, 'bullish');
      assert.ok(alert?.title.includes('Extreme Buy CVD Pressure'));
    });

    it('detects extreme sell CVD pressure below 25% taker ratio', () => {
      const bearishStats: TradeFlowStats = {
        symbol: 'SOL/USDT',
        totalTrades: 25,
        buyCount: 4,
        sellCount: 21,
        buyVolumeUsdt: 12000,
        sellVolumeUsdt: 68000,
        totalVolumeUsdt: 80000,
        netCvdUsdt: -56000,
        takerBuyRatio: 0.15,
        largestTradeUsdt: 25000,
        whaleTradeCount: 1,
        lastUpdated: Date.now(),
      };

      const alert = evaluateCvdImbalance(bearishStats);
      assert.ok(alert);
      assert.equal(alert?.type, 'CVD_EXTREME_SELL');
      assert.equal(alert?.severity, 'bearish');
      assert.ok(alert?.title.includes('Extreme Sell CVD Pressure'));
    });
  });

  describe('Deduplication & Cooldown Windows', () => {
    it('dispatches alert and suppresses identical alerts within cooldown window', () => {
      const alert = {
        id: '1',
        type: 'WHALE_BUY_SWEEP' as const,
        symbol: 'BTC/USDT',
        title: 'Whale Sweep',
        message: 'Fill',
        price: 65000,
        volumeUsdt: 75000,
        timestamp: 1000,
        severity: 'whale' as const,
      };

      const dispatched1 = dispatchOrderFlowAlert(alert, 1000);
      assert.equal(dispatched1, true);

      // Attempt second dispatch 2 seconds later (within 8s cooldown)
      const dispatched2 = dispatchOrderFlowAlert(alert, 3000);
      assert.equal(dispatched2, false);

      // Attempt after 10 seconds (exceeding 8s cooldown)
      const dispatched3 = dispatchOrderFlowAlert(alert, 12000);
      assert.equal(dispatched3, true);
    });

    it('manually resets alert cooldowns', () => {
      const key = 'WHALE_BUY_SWEEP_SOL/USDT_150';
      assert.equal(isAlertSuppressed(key, 8000), false);

      dispatchOrderFlowAlert({
        id: '2',
        type: 'WHALE_BUY_SWEEP',
        symbol: 'SOL/USDT',
        title: 'Whale',
        message: 'Fill',
        price: 150,
        timestamp: 5000,
        severity: 'whale',
      }, 5000);

      assert.equal(isAlertSuppressed(key, 8000, 6000), true);
      resetAlertCooldowns();
      assert.equal(isAlertSuppressed(key, 8000, 6000), false);
    });
  });

  describe('Web Audio Synthesizer Safety', () => {
    it('returns default audio config in headless environment', () => {
      const cfg = getOrderFlowAudioConfig();
      assert.equal(cfg.soundEnabled, true);
      assert.equal(cfg.whaleThresholdUsdt, 25000);
      assert.ok(cfg.soundTypes.buySweep);
      assert.ok(cfg.soundTypes.sellSweep);
      assert.ok(cfg.soundTypes.wallDetected);
    });

    it('safely calls chime functions in headless environment without crashing', () => {
      assert.doesNotThrow(() => playBuyChime(0.5));
      assert.doesNotThrow(() => playSellChime(0.5));
      assert.doesNotThrow(() => playWallChime(0.5));
      assert.doesNotThrow(() => playCvdSurgeChime(0.5));
    });
  });
});
