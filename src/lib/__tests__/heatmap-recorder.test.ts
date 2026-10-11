// ─── Phase 44: Liquidity Heatmap Snapshot Recording & Replay Unit Tests ────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createRecordingSession,
  recordSlice,
  finalizeRecordingSession,
  serializeSessionToJSON,
  parseSessionFromJSON,
  getReplaySliceWindow,
  stepReplayFrame,
  getFrameIntervalMs,
  generateSampleReplaySession,
} from '../services/heatmap-recorder.ts';
import type { OrderFlowHeatmapSlice } from '../../types/index.ts';

describe('Liquidity Heatmap Snapshot Recording & Replay Service (Phase 44)', () => {
  const mockSlice1: OrderFlowHeatmapSlice = {
    timestamp: 1700000000000,
    midPrice: 68000,
    bestBid: 67990,
    bestAsk: 68010,
    spreadUsdt: 20,
    buckets: [],
    totalBidLiquidityUsdt: 500000,
    totalAskLiquidityUsdt: 450000,
    depthDeltaUsdt: 50000,
    cumulativeDeltaUsdt: 50000,
    whaleWallsCount: 1,
  };

  const mockSlice2: OrderFlowHeatmapSlice = {
    timestamp: 1700000002000,
    midPrice: 68150,
    bestBid: 68140,
    bestAsk: 68160,
    spreadUsdt: 20,
    buckets: [],
    totalBidLiquidityUsdt: 600000,
    totalAskLiquidityUsdt: 420000,
    depthDeltaUsdt: 180000,
    cumulativeDeltaUsdt: 230000,
    whaleWallsCount: 2,
  };

  describe('1. Session Creation & Frame Ingestion', () => {
    it('creates an empty recording session with unique ID', () => {
      const session = createRecordingSession('BTC/USDT', 'ENTRY_FILL', 'SIG-101', 'Test entry');

      assert.strictEqual(session.symbol, 'BTC/USDT');
      assert.strictEqual(session.tag, 'ENTRY_FILL');
      assert.strictEqual(session.associatedSignalId, 'SIG-101');
      assert.strictEqual(session.frameCount, 0);
      assert.ok(session.id.startsWith('REC-'));
    });

    it('records slices and updates cumulative telemetry', () => {
      let session = createRecordingSession('BTC/USDT', 'MANUAL');
      session = recordSlice(session, mockSlice1);

      assert.strictEqual(session.frameCount, 1);
      assert.strictEqual(session.initialMidPrice, 68000);
      assert.strictEqual(session.finalMidPrice, 68000);
      assert.strictEqual(session.maxDepthDeltaUsdt, 50000);
      assert.strictEqual(session.totalWhaleWallsObserved, 1);

      session = recordSlice(session, mockSlice2);

      assert.strictEqual(session.frameCount, 2);
      assert.strictEqual(session.initialMidPrice, 68000);
      assert.strictEqual(session.finalMidPrice, 68150);
      assert.strictEqual(session.priceChangePercent, 0.22);
      assert.strictEqual(session.maxDepthDeltaUsdt, 180000);
      assert.strictEqual(session.totalWhaleWallsObserved, 3);
    });

    it('finalizes a recording session cleanly', () => {
      let session = createRecordingSession('ETH/USDT');
      session = recordSlice(session, mockSlice1);
      const finalized = finalizeRecordingSession(session);

      assert.ok(finalized.endTime >= finalized.startTime);
      assert.strictEqual(finalized.frameCount, 1);
    });
  });

  describe('2. Serialization & JSON Import/Export', () => {
    it('serializes to JSON and parses back with zero data loss', () => {
      let session = createRecordingSession('SOL/USDT', 'TP_HIT');
      session = recordSlice(session, mockSlice1);
      session = recordSlice(session, mockSlice2);

      const jsonStr = serializeSessionToJSON(session);
      const parsed = parseSessionFromJSON(jsonStr);

      assert.strictEqual(parsed.id, session.id);
      assert.strictEqual(parsed.symbol, session.symbol);
      assert.strictEqual(parsed.frameCount, 2);
      assert.strictEqual(parsed.tag, 'TP_HIT');
      assert.strictEqual(parsed.maxDepthDeltaUsdt, 180000);
      assert.strictEqual(parsed.slices[1].midPrice, 68150);
    });

    it('throws error when parsing corrupted JSON session', () => {
      assert.throws(() => {
        parseSessionFromJSON('{"corrupt": true}');
      });
    });
  });

  describe('3. Replay Engine Navigation & Frame Rate Scaling', () => {
    it('slices playback window bounded by windowSize', () => {
      let session = createRecordingSession('BTC/USDT');
      session = recordSlice(session, mockSlice1);
      session = recordSlice(session, mockSlice2);

      const window1 = getReplaySliceWindow(session, 0, 10);
      assert.strictEqual(window1.length, 1);
      assert.strictEqual(window1[0].midPrice, 68000);

      const window2 = getReplaySliceWindow(session, 1, 10);
      assert.strictEqual(window2.length, 2);
      assert.strictEqual(window2[1].midPrice, 68150);
    });

    it('steps frames safely within [0, totalFrames - 1] bounds', () => {
      assert.strictEqual(stepReplayFrame(0, 5, 1), 1);
      assert.strictEqual(stepReplayFrame(4, 5, 1), 4); // Clamped at max
      assert.strictEqual(stepReplayFrame(1, 5, -1), 0);
      assert.strictEqual(stepReplayFrame(0, 5, -1), 0); // Clamped at min
    });

    it('computes correct timer intervals for various playback speeds', () => {
      assert.strictEqual(getFrameIntervalMs(0.5, 200), 400);
      assert.strictEqual(getFrameIntervalMs(1, 200), 200);
      assert.strictEqual(getFrameIntervalMs(2, 200), 100);
      assert.strictEqual(getFrameIntervalMs(5, 200), 40);
    });

    it('generates a valid sample whale sweep replay session', () => {
      const sample = generateSampleReplaySession('BTC/USDT');
      assert.strictEqual(sample.symbol, 'BTC/USDT');
      assert.strictEqual(sample.tag, 'WHALE_SWEEP');
      assert.strictEqual(sample.frameCount, 40);
      assert.strictEqual(sample.slices.length, 40);
      assert(sample.totalWhaleWallsObserved > 0);
      assert(sample.initialMidPrice > 0);
      assert(sample.finalMidPrice > 0);
    });
  });
});

