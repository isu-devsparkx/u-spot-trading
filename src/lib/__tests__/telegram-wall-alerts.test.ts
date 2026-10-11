// ─── U-SPOT Institutional Wall & WebSocket Health Alerts Tests ────────
// Phase 32: Telegram Liquidity Wall & WebSocket Stream Alert Integration
// Tests: High-contrast formatting, deduplication, suppression windows, event preferences,
// and broadcast helpers for institutional order book walls and WS health.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatInstitutionalWallMessage,
  formatWebSocketHealthMessage,
  formatLifecycleEventMessage,
  generateAlertKey,
  isDuplicateAlert,
  recordAlertSent,
  clearDeduplicationCache,
  isEventEnabled,
  dispatchTelegramAlert,
  broadcastInstitutionalWall,
  broadcastWebSocketHealth,
  checkAndBroadcastWalls,
  DEFAULT_TELEGRAM_CONFIG,
} from '../services/telegram-service.ts';

import type {
  OrderBookWall,
  TelegramAlertPayload,
  TelegramAlertConfig,
} from '../../types/index.ts';

describe('Phase 32: Telegram Institutional Wall & WebSocket Health Alerts', () => {
  beforeEach(() => {
    clearDeduplicationCache();
  });

  describe('1. Message Formatting Engine', () => {
    it('formats a high-contrast Institutional Bid Wall (Support Floor) alert', () => {
      const payload: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'SOL/USDT',
        wallType: 'BID',
        wallPrice: 148.5,
        wallVolumeUsdt: 245000,
        wallMultiple: 4.2,
        distancePercent: 1.15,
        details: 'Defending key swing support pivot before DCA tranche 1',
      };

      const msg = formatInstitutionalWallMessage(payload);

      assert.ok(msg.includes('🛡️ *INSTITUTIONAL SUPPORT BID WALL: SOL/USDT*'), 'Header must contain shield icon and support label');
      assert.ok(msg.includes('$148.50'), 'Must include formatted price');
      assert.ok(msg.includes('245,000 USDT'), 'Must format volume in USDT with commas');
      assert.ok(msg.includes('4.2x avg depth'), 'Must include depth multiple');
      assert.ok(msg.includes('1.15% away'), 'Must include distance percentage');
      assert.ok(msg.includes('Defending entry/DCA support floor'), 'Must describe tactical support role');
      assert.ok(msg.includes('Defending key swing support pivot'), 'Must include custom analysis details');
      assert.ok(msg.includes('Live Order Book Depth Monitoring Active'), 'Must include footer status');
    });

    it('formats a high-contrast Institutional Ask Wall (Resistance Ceiling) alert', () => {
      const payload: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'BTC/USDT',
        wallType: 'ASK',
        wallPrice: 68500.0,
        wallVolumeUsdt: 1850000,
        wallMultiple: 5.8,
        distancePercent: 0.85,
      };

      const msg = formatInstitutionalWallMessage(payload);

      assert.ok(msg.includes('🧱 *INSTITUTIONAL RESISTANCE ASK WALL: BTC/USDT*'), 'Header must contain brick icon and resistance label');
      assert.ok(msg.includes('$68,500.00') || msg.includes('$68500.00'), 'Must include formatted price');
      assert.ok(msg.includes('1,850,000 USDT'), 'Must format volume in USDT with commas');
      assert.ok(msg.includes('5.8x avg depth'), 'Must include depth multiple');
      assert.ok(msg.includes('0.85% away'), 'Must include distance percentage');
      assert.ok(msg.includes('Immediate resistance ceiling / front-run take profit target'), 'Must describe tactical ceiling role');
    });

    it('formats WebSocket Disconnect alert with warning styling and fallback notice', () => {
      const payload: TelegramAlertPayload = {
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'DISCONNECTED',
        details: 'Connection lost to Binance wss://stream.binance.com:9443',
      };

      const msg = formatWebSocketHealthMessage(payload);

      assert.ok(msg.includes('⚠️ *BINANCE WEBSOCKET ALERT: DISCONNECTED*'), 'Header must highlight disconnect state');
      assert.ok(msg.includes('Fallback REST polling active'), 'Must mention REST safety fallback');
      assert.ok(msg.includes('Connection lost to Binance'), 'Must include details');
      assert.ok(msg.includes('U-SPOT High-Availability Stream Guard'), 'Must include stream guard footer');
    });

    it('formats WebSocket Reconnected / Connected alert with positive green check styling', () => {
      const payload: TelegramAlertPayload = {
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'CONNECTED',
      };

      const msg = formatWebSocketHealthMessage(payload);

      assert.ok(msg.includes('✅ *BINANCE WEBSOCKET FEED RESTORED*'), 'Header must highlight feed restoration');
      assert.ok(msg.includes('Real-time order book depth and live ticker streaming operational'), 'Must confirm operational state');
    });

    it('routes through formatLifecycleEventMessage seamlessly for both event types', () => {
      const wallMsg = formatLifecycleEventMessage({
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'ETH/USDT',
        wallType: 'BID',
        wallPrice: 3200,
        wallVolumeUsdt: 800000,
      });
      assert.ok(wallMsg.includes('SUPPORT BID WALL: ETH/USDT'));

      const wsMsg = formatLifecycleEventMessage({
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'RECONNECTING',
      });
      assert.ok(wsMsg.includes('BINANCE WEBSOCKET RECONNECTING'));
    });
  });

  describe('2. Deduplication Key Generation', () => {
    it('generates consistent keys for institutional walls by symbol, side, and price tier', () => {
      const payload1: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'SOL/USDT',
        wallType: 'BID',
        wallPrice: 150.2,
      };

      const payload2: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'SOL/USDT',
        wallType: 'BID',
        wallPrice: 150.4, // Rounds to same integer price tier: 150
      };

      const payloadDiffSide: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'SOL/USDT',
        wallType: 'ASK',
        wallPrice: 150.0,
      };

      const key1 = generateAlertKey(payload1);
      const key2 = generateAlertKey(payload2);
      const keyDiffSide = generateAlertKey(payloadDiffSide);

      assert.strictEqual(key1, 'WALL_SOL/USDT_BID_150');
      assert.strictEqual(key2, 'WALL_SOL/USDT_BID_150');
      assert.strictEqual(key1, key2, 'Same price tier must yield identical deduplication key');
      assert.notStrictEqual(key1, keyDiffSide, 'Opposite side wall must yield distinct key');
    });

    it('generates consistent keys for WebSocket health alerts by connection state', () => {
      const keyDisc = generateAlertKey({
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'DISCONNECTED',
      });

      const keyConn = generateAlertKey({
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'CONNECTED',
      });

      assert.strictEqual(keyDisc, 'WS_HEALTH_DISCONNECTED');
      assert.strictEqual(keyConn, 'WS_HEALTH_CONNECTED');
    });
  });

  describe('3. Rate-Limiting & Suppression Windows', () => {
    it('suppresses duplicate wall alerts within the 10-minute window for the same price tier', () => {
      const payload: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'AVAX/USDT',
        wallType: 'BID',
        wallPrice: 28.5,
        wallVolumeUsdt: 120000,
      };

      assert.strictEqual(isDuplicateAlert(payload), false, 'First occurrence must not be duplicate');
      recordAlertSent(payload);

      assert.strictEqual(isDuplicateAlert(payload), true, 'Immediate repeat must be suppressed');

      // A different price tier must NOT be suppressed
      const differentPricePayload: TelegramAlertPayload = {
        ...payload,
        wallPrice: 32.0,
      };
      assert.strictEqual(isDuplicateAlert(differentPricePayload), false, 'Different price tier must not be suppressed');
    });

    it('suppresses duplicate WebSocket health alerts within the 15-minute window for the same state', () => {
      const payload: TelegramAlertPayload = {
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'DISCONNECTED',
      };

      assert.strictEqual(isDuplicateAlert(payload), false, 'Initial disconnect must not be duplicate');
      recordAlertSent(payload);

      assert.strictEqual(isDuplicateAlert(payload), true, 'Immediate repeat disconnect must be suppressed');

      // State transition to CONNECTED must NOT be suppressed
      const connectedPayload: TelegramAlertPayload = {
        eventType: 'WEBSOCKET_HEALTH_ALERT',
        symbol: 'GLOBAL',
        wsState: 'CONNECTED',
      };
      assert.strictEqual(isDuplicateAlert(connectedPayload), false, 'State transition to CONNECTED must not be suppressed');
    });
  });

  describe('4. Event Preference Configuration & Dispatcher', () => {
    it('honors onInstitutionalWall toggle in user configuration', () => {
      const enabledConfig: TelegramAlertConfig = {
        ...DEFAULT_TELEGRAM_CONFIG,
        enabled: true,
        events: {
          ...DEFAULT_TELEGRAM_CONFIG.events,
          onInstitutionalWall: true,
        },
      };

      const disabledConfig: TelegramAlertConfig = {
        ...DEFAULT_TELEGRAM_CONFIG,
        enabled: true,
        events: {
          ...DEFAULT_TELEGRAM_CONFIG.events,
          onInstitutionalWall: false,
        },
      };

      assert.strictEqual(isEventEnabled('INSTITUTIONAL_WALL_DETECTED', enabledConfig), true);
      assert.strictEqual(isEventEnabled('INSTITUTIONAL_WALL_DETECTED', disabledConfig), false);
    });

    it('honors onWebSocketHealth toggle in user configuration', () => {
      const enabledConfig: TelegramAlertConfig = {
        ...DEFAULT_TELEGRAM_CONFIG,
        enabled: true,
        events: {
          ...DEFAULT_TELEGRAM_CONFIG.events,
          onWebSocketHealth: true,
        },
      };

      const disabledConfig: TelegramAlertConfig = {
        ...DEFAULT_TELEGRAM_CONFIG,
        enabled: true,
        events: {
          ...DEFAULT_TELEGRAM_CONFIG.events,
          onWebSocketHealth: false,
        },
      };

      assert.strictEqual(isEventEnabled('WEBSOCKET_HEALTH_ALERT', enabledConfig), true);
      assert.strictEqual(isEventEnabled('WEBSOCKET_HEALTH_ALERT', disabledConfig), false);
    });

    it('blocks dispatch when wall alerts are disabled in config override', async () => {
      const payload: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'BNB/USDT',
        wallType: 'BID',
        wallPrice: 590,
      };

      const res = await dispatchTelegramAlert(payload, {
        enabled: true,
        events: {
          ...DEFAULT_TELEGRAM_CONFIG.events,
          onInstitutionalWall: false,
        },
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.error?.includes('disabled'));
    });

    it('dispatches mock alert cleanly when enabled and credentials are not configured', async () => {
      const payload: TelegramAlertPayload = {
        eventType: 'INSTITUTIONAL_WALL_DETECTED',
        symbol: 'BNB/USDT',
        wallType: 'BID',
        wallPrice: 590,
        wallVolumeUsdt: 500000,
      };

      const res = await dispatchTelegramAlert(payload, {
        enabled: true,
        botToken: '',
        chatId: '',
        events: {
          ...DEFAULT_TELEGRAM_CONFIG.events,
          onInstitutionalWall: true,
        },
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.mocked, true);
      assert.ok(res.messageId !== undefined);
    });
  });

  describe('5. High-Level Broadcast Helpers', () => {
    it('broadcastInstitutionalWall creates valid payload and dispatches', async () => {
      const wall: OrderBookWall = {
        type: 'BID',
        price: 145.0,
        volumeUsdt: 310000,
        multipleOfAverage: 4.5,
        distancePercent: 1.2,
        percentFromPrice: 1.2,
      };

      const res = await broadcastInstitutionalWall('SOL/USDT', wall, 146.75, {
        enabled: true,
        botToken: '',
        chatId: '',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.mocked, true);
    });

    it('broadcastWebSocketHealth dispatches state transition alert', async () => {
      const res = await broadcastWebSocketHealth(
        'DISCONNECTED',
        'Heartbeat timeout after 60s',
        'GLOBAL',
        {
          enabled: true,
          botToken: '',
          chatId: '',
        }
      );

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.mocked, true);
    });

    it('checkAndBroadcastWalls triggers broadcasts for walls exceeding thresholds', async () => {
      const mockPayload = {
        symbol: 'SOL/USDT',
        bestBid: 150.0,
        bestAsk: 150.1,
        bidWalls: [
          {
            type: 'BID' as const,
            price: 148.0,
            volumeUsdt: 150000, // Exceeds 50k threshold
            multipleOfAverage: 3.5,
            distancePercent: 1.33,
            percentFromPrice: 1.33,
          },
          {
            type: 'BID' as const,
            price: 140.0,
            volumeUsdt: 12000, // Below 50k threshold, multiple 1.5
            multipleOfAverage: 1.5,
            distancePercent: 6.67,
            percentFromPrice: 6.67,
          },
        ],
        askWalls: [
          {
            type: 'ASK' as const,
            price: 154.0,
            volumeUsdt: 220000, // Exceeds 50k threshold
            multipleOfAverage: 4.0,
            distancePercent: 2.67,
            percentFromPrice: 2.67,
          },
        ],
      };

      const results = await checkAndBroadcastWalls(mockPayload, {
        minVolumeUsdt: 50000,
        minMultiple: 3.0,
        configOverride: { enabled: true, botToken: '', chatId: '' },
      });

      assert.strictEqual(results.length, 2, 'Should broadcast the 2 walls exceeding threshold and skip the small wall');
      assert.ok(results.every((r) => r.success));
    });
  });
});
