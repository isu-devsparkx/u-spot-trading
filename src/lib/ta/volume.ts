// ─── U-SPOT Volume Analysis Module ───────────────────────────────────
// Phase 5: Technical Analysis — Volume Moving Averages, Ratios, & Spikes
// Spec Section 8.3 (Volume Module)

import type { OHLCV, VolumeAnalysis } from '../../types/index.ts';

/**
 * Evaluates volume moving averages, expansion ratio, and anomalies
 * Spec Section 8.3: volume_ratio = current_volume / average_volume_20
 */
export function analyzeVolume(klines: OHLCV[]): VolumeAnalysis {
  if (!klines || klines.length === 0) {
    return {
      currentVolume: 0,
      averageVolume20: 0,
      volumeRatio: 1.0,
      isVolumeSpike: false,
      volumeTrend: 'AVERAGE',
      score: 50,
      description: 'Insufficient candlestick data for volume analysis',
    };
  }

  const volumes = klines.map((k) => k.volume);
  const currentVolume = volumes[volumes.length - 1];
  const lastBar = klines[klines.length - 1];
  const isUpBar = lastBar.close >= lastBar.open;

  // 20-period moving average of volume (or available length)
  const period = Math.min(20, volumes.length);
  const recentVolumes = volumes.slice(volumes.length - period);
  const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / period;

  // Volume ratio
  const volumeRatio =
    avgVolume > 0 ? Math.round((currentVolume / avgVolume) * 100) / 100 : 1.0;

  // Volume spike flag (Spec: >= 2.0x is significant spike)
  const isVolumeSpike = volumeRatio >= 2.0;

  // Volume trend across the last 3-5 bars
  let volumeTrend: VolumeAnalysis['volumeTrend'] = 'AVERAGE';
  if (volumes.length >= 3) {
    const v1 = volumes[volumes.length - 3];
    const v2 = volumes[volumes.length - 2];
    const v3 = volumes[volumes.length - 1];
    if (v3 > v2 && v2 > v1) volumeTrend = 'EXPANDING';
    else if (v3 < v2 && v2 < v1) volumeTrend = 'CONTRACTING';
  }

  // Volume score (0-100)
  let score = 50;
  let description = '';

  if (isUpBar && volumeRatio >= 3.0) {
    score = 96; // Massive institutional volume ignition
    description = `Exceptional volume surge (${volumeRatio.toFixed(1)}x avg) on bullish candle`;
  } else if (isUpBar && volumeRatio >= 2.0) {
    score = 88; // Strong volume expansion confirming spot buying
    description = `Strong volume expansion (${volumeRatio.toFixed(1)}x 20-period average) confirming demand`;
  } else if (isUpBar && volumeRatio >= 1.3) {
    score = 75;
    description = `Above-average volume (${volumeRatio.toFixed(1)}x) supporting upward price action`;
  } else if (!isUpBar && volumeRatio >= 2.5) {
    score = 30; // Heavy distribution / dumping
    description = `Elevated selling volume (${volumeRatio.toFixed(1)}x average) indicating aggressive distribution`;
  } else if (isUpBar && volumeRatio < 0.6) {
    score = 45; // Low volume rally (exhaustion or fakeout risk)
    description = `Anemic volume (${volumeRatio.toFixed(1)}x average) on upward move — low institutional participation`;
  } else if (volumeTrend === 'EXPANDING') {
    score = 70;
    description = `Gradual volume acceleration across recent candles (${volumeRatio.toFixed(1)}x)`;
  } else {
    score = 50;
    description = `Normal volume baseline (${volumeRatio.toFixed(1)}x 20-period average)`;
  }

  return {
    currentVolume: Math.round(currentVolume),
    averageVolume20: Math.round(avgVolume),
    volumeRatio,
    isVolumeSpike,
    volumeTrend,
    score,
    description,
  };
}
