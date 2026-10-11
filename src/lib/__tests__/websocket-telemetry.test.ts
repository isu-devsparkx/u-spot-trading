// ─── U-SPOT WebSocket Telemetry Unit Tests (Phase 36) ────────────────
// Tests connection quality classification, RTT latency monitoring,
// packet throughput calculations, and telemetry subscriber registration.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyConnectionQuality,
  BinanceWebSocketManager,
} from '../services/binance-websocket.ts';
import type { WebSocketTelemetry } from '../../types/index.ts';

describe('Phase 36: WebSocket Reconnect & Heartbeat Telemetry', () => {
  describe('classifyConnectionQuality', () => {
    it('categorizes non-connected states as OFFLINE regardless of latency', () => {
      assert.equal(classifyConnectionQuality('DISCONNECTED', 20), 'OFFLINE');
      assert.equal(classifyConnectionQuality('CONNECTING', 50), 'OFFLINE');
      assert.equal(classifyConnectionQuality('RECONNECTING', 40), 'OFFLINE');
      assert.equal(classifyConnectionQuality('ERROR', 10), 'OFFLINE');
    });

    it('categorizes low latency (<= 120ms) as EXCELLENT', () => {
      assert.equal(classifyConnectionQuality('CONNECTED', 15), 'EXCELLENT');
      assert.equal(classifyConnectionQuality('CONNECTED', 75), 'EXCELLENT');
      assert.equal(classifyConnectionQuality('CONNECTED', 120), 'EXCELLENT');
    });

    it('categorizes medium latency (121ms - 280ms) as GOOD', () => {
      assert.equal(classifyConnectionQuality('CONNECTED', 121), 'GOOD');
      assert.equal(classifyConnectionQuality('CONNECTED', 200), 'GOOD');
      assert.equal(classifyConnectionQuality('CONNECTED', 280), 'GOOD');
    });

    it('categorizes moderate latency (281ms - 600ms) as FAIR', () => {
      assert.equal(classifyConnectionQuality('CONNECTED', 281), 'FAIR');
      assert.equal(classifyConnectionQuality('CONNECTED', 450), 'FAIR');
      assert.equal(classifyConnectionQuality('CONNECTED', 600), 'FAIR');
    });

    it('categorizes high latency (> 600ms) as POOR', () => {
      assert.equal(classifyConnectionQuality('CONNECTED', 601), 'POOR');
      assert.equal(classifyConnectionQuality('CONNECTED', 1200), 'POOR');
      assert.equal(classifyConnectionQuality('CONNECTED', 5000), 'POOR');
    });
  });

  describe('BinanceWebSocketManager Telemetry API', () => {
    it('returns a structured telemetry snapshot from getTelemetry()', () => {
      const manager = BinanceWebSocketManager.getInstance();
      const telemetry = manager.getTelemetry();

      assert.ok(telemetry);
      assert.ok('connectionState' in telemetry);
      assert.ok(typeof telemetry.latencyMs === 'number');
      assert.ok(typeof telemetry.packetCount === 'number');
      assert.ok(typeof telemetry.messagesPerSecond === 'number');
      assert.ok(typeof telemetry.reconnectCount === 'number');
      assert.ok(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'OFFLINE'].includes(telemetry.quality));
      assert.ok(typeof telemetry.activeStreamCount === 'number');
    });

    it('subscribes to telemetry updates and unsubscribes cleanly', () => {
      const manager = BinanceWebSocketManager.getInstance();
      let receivedTelemetry: WebSocketTelemetry | null = null;

      const unsub = manager.onTelemetry((data) => {
        receivedTelemetry = data;
      });

      assert.ok(receivedTelemetry);
      assert.equal((receivedTelemetry as WebSocketTelemetry).connectionState, manager.getConnectionState());

      // Clean unsubscription
      unsub();
    });

    it('triggerReconnect executes without throwing in headless environment', () => {
      const manager = BinanceWebSocketManager.getInstance();
      assert.doesNotThrow(() => {
        manager.triggerReconnect();
      });
    });
  });
});
