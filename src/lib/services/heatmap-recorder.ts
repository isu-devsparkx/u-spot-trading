// ─── U-SPOT Real-Time Liquidity Heatmap Snapshot Recording & Replay Service (Phase 44) ───
// Enables capture, serialization, playback scrubbing, and post-trade debriefs of sub-second
// order flow depth heatmaps and institutional wall migrations.

import type {
  OrderFlowHeatmapSlice,
  HeatmapPriceBucket,
  HeatmapRecordingSession,
  HeatmapRecordingTag,
  HeatmapPlaybackSpeed,
} from '@/types';

// In-memory store for recorded sessions
const activeSessionsStore = new Map<string, HeatmapRecordingSession>();

/**
 * Initializes a new recording session.
 */
export function createRecordingSession(
  symbol: string,
  tag: HeatmapRecordingTag = 'MANUAL',
  associatedSignalId?: string,
  note?: string
): HeatmapRecordingSession {
  const now = Date.now();
  const id = `REC-${now}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const session: HeatmapRecordingSession = {
    id,
    symbol,
    startTime: now,
    endTime: now,
    durationSeconds: 0,
    frameCount: 0,
    slices: [],
    initialMidPrice: 0,
    finalMidPrice: 0,
    priceChangePercent: 0,
    maxDepthDeltaUsdt: 0,
    totalWhaleWallsObserved: 0,
    associatedSignalId,
    tag,
    note,
  };

  activeSessionsStore.set(id, session);
  return session;
}

/**
 * Appends a live heatmap depth slice to an active recording session.
 */
export function recordSlice(
  session: HeatmapRecordingSession,
  slice: OrderFlowHeatmapSlice
): HeatmapRecordingSession {
  const updatedSlices = [...session.slices, slice];
  const frameCount = updatedSlices.length;
  const initialMidPrice = session.initialMidPrice || slice.midPrice;
  const finalMidPrice = slice.midPrice;

  const priceChangePercent =
    initialMidPrice > 0
      ? Math.round(((finalMidPrice - initialMidPrice) / initialMidPrice) * 10000) / 100
      : 0;

  const maxDepthDeltaUsdt = Math.max(
    session.maxDepthDeltaUsdt,
    Math.abs(slice.depthDeltaUsdt)
  );

  const totalWhaleWallsObserved = session.totalWhaleWallsObserved + slice.whaleWallsCount;
  const endTime = slice.timestamp || Date.now();
  const durationSeconds = Math.max(0, Math.round((endTime - session.startTime) / 1000));

  const updatedSession: HeatmapRecordingSession = {
    ...session,
    endTime,
    durationSeconds,
    frameCount,
    slices: updatedSlices,
    initialMidPrice,
    finalMidPrice,
    priceChangePercent,
    maxDepthDeltaUsdt: Math.round(maxDepthDeltaUsdt * 100) / 100,
    totalWhaleWallsObserved,
  };

  activeSessionsStore.set(updatedSession.id, updatedSession);
  return updatedSession;
}

/**
 * Finalizes and seals an active recording session.
 */
export function finalizeRecordingSession(
  session: HeatmapRecordingSession
): HeatmapRecordingSession {
  const now = Date.now();
  const durationSeconds = Math.max(
    session.durationSeconds,
    Math.round((now - session.startTime) / 1000)
  );

  const finalized: HeatmapRecordingSession = {
    ...session,
    endTime: now,
    durationSeconds,
  };

  activeSessionsStore.set(finalized.id, finalized);
  return finalized;
}

/**
 * Serializes a recording session into formatted JSON string for export.
 */
export function serializeSessionToJSON(session: HeatmapRecordingSession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Parses and validates an imported JSON recording session.
 */
export function parseSessionFromJSON(jsonString: string): HeatmapRecordingSession {
  const data = JSON.parse(jsonString);

  if (!data.id || !data.symbol || !Array.isArray(data.slices)) {
    throw new Error('Invalid recording session format: missing required fields or slices array.');
  }

  const session: HeatmapRecordingSession = {
    id: String(data.id),
    symbol: String(data.symbol),
    startTime: Number(data.startTime) || Date.now(),
    endTime: Number(data.endTime) || Date.now(),
    durationSeconds: Number(data.durationSeconds) || 0,
    frameCount: Array.isArray(data.slices) ? data.slices.length : 0,
    slices: data.slices,
    initialMidPrice: Number(data.initialMidPrice) || 0,
    finalMidPrice: Number(data.finalMidPrice) || 0,
    priceChangePercent: Number(data.priceChangePercent) || 0,
    maxDepthDeltaUsdt: Number(data.maxDepthDeltaUsdt) || 0,
    totalWhaleWallsObserved: Number(data.totalWhaleWallsObserved) || 0,
    associatedSignalId: data.associatedSignalId ? String(data.associatedSignalId) : undefined,
    tag: data.tag || 'MANUAL',
    note: data.note ? String(data.note) : undefined,
  };

  activeSessionsStore.set(session.id, session);
  return session;
}

/**
 * Extracts the slice window for replay at a specific frame index.
 */
export function getReplaySliceWindow(
  session: HeatmapRecordingSession,
  currentFrameIndex: number,
  windowSize: number = 30
): OrderFlowHeatmapSlice[] {
  if (!session.slices || session.slices.length === 0) return [];

  const safeIndex = Math.min(
    session.slices.length - 1,
    Math.max(0, currentFrameIndex)
  );

  const startIndex = Math.max(0, safeIndex - windowSize + 1);
  return session.slices.slice(startIndex, safeIndex + 1);
}

/**
 * Steps the replay frame index forward or backward with bounds checking.
 */
export function stepReplayFrame(
  currentFrameIndex: number,
  totalFrames: number,
  step: number = 1
): number {
  if (totalFrames <= 0) return 0;
  return Math.min(totalFrames - 1, Math.max(0, currentFrameIndex + step));
}

/**
 * Computes frame interval milliseconds for a given playback speed.
 */
export function getFrameIntervalMs(
  playbackSpeed: HeatmapPlaybackSpeed,
  baseIntervalMs: number = 200
): number {
  return Math.round(baseIntervalMs / playbackSpeed);
}

/**
 * Retrieves all stored recording sessions.
 */
export function getStoredRecordingSessions(): HeatmapRecordingSession[] {
  return Array.from(activeSessionsStore.values()).sort((a, b) => b.startTime - a.startTime);
}

/**
 * Retrieves a specific session by ID.
 */
export function getRecordingSessionById(id: string): HeatmapRecordingSession | null {
  return activeSessionsStore.get(id) || null;
}

/**
 * Generates an educational sample replay session (Whale Liquidity Sweep)
 * allowing instant demonstration without requiring live recording.
 */
export function generateSampleReplaySession(symbol: string = 'BTC/USDT'): HeatmapRecordingSession {
  const now = Date.now();
  let session = createRecordingSession(
    symbol,
    'WHALE_SWEEP',
    'SIG-DEMO-44',
    'Institutional Bid Spoof & Liquidity Sweep Drill'
  );

  const baseMid = symbol.toUpperCase().includes('ETH') ? 2650 : 67450;
  let cumDelta = 0;

  for (let i = 0; i < 40; i++) {
    const time = now - (40 - i) * 600;
    const priceDrift =
      Math.sin(i * 0.18) * (baseMid * 0.0012) + (i > 22 ? (i - 22) * (baseMid * 0.00035) : 0);
    const midPrice = Math.round((baseMid + priceDrift) * 100) / 100;
    const isWhalePresent = i >= 12 && i <= 28;

    const buckets: HeatmapPriceBucket[] = [];

    // Bid buckets
    for (let b = 1; b <= 10; b++) {
      const p = Math.round((midPrice - b * (baseMid * 0.00025)) * 100) / 100;
      const isWall = isWhalePresent && b === 2;
      const vol = isWall ? 480000 : 18000 + ((b * 3141) % 22000);
      buckets.push({
        price: p,
        volumeUsdt: vol,
        intensity: isWall ? 0.98 : Math.min(0.65, vol / 50000),
        side: 'BID',
        isWall,
      });
    }

    // Ask buckets
    for (let a = 1; a <= 10; a++) {
      const p = Math.round((midPrice + a * (baseMid * 0.00025)) * 100) / 100;
      const vol = 16000 + ((a * 2718) % 19000);
      buckets.push({
        price: p,
        volumeUsdt: vol,
        intensity: Math.min(0.6, vol / 50000),
        side: 'ASK',
        isWall: false,
      });
    }

    const bidDepthUsdt = buckets
      .filter((x) => x.side === 'BID')
      .reduce((sum, x) => sum + x.volumeUsdt, 0);
    const askDepthUsdt = buckets
      .filter((x) => x.side === 'ASK')
      .reduce((sum, x) => sum + x.volumeUsdt, 0);
    const depthDeltaUsdt = Math.round(bidDepthUsdt - askDepthUsdt);
    cumDelta += depthDeltaUsdt;

    const slice: OrderFlowHeatmapSlice = {
      timestamp: time,
      midPrice,
      bestBid: Math.round((midPrice - baseMid * 0.0001) * 100) / 100,
      bestAsk: Math.round((midPrice + baseMid * 0.0001) * 100) / 100,
      spreadUsdt: Math.round(baseMid * 0.0002 * 100) / 100,
      buckets,
      totalBidLiquidityUsdt: bidDepthUsdt,
      totalAskLiquidityUsdt: askDepthUsdt,
      depthDeltaUsdt,
      cumulativeDeltaUsdt: cumDelta,
      whaleWallsCount: isWhalePresent ? 1 : 0,
    };

    session = recordSlice(session, slice);
  }

  return finalizeRecordingSession(session);
}

