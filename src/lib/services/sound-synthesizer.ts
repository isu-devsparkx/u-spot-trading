// ─── U-SPOT Web Audio Sound Synthesizer (Phase 35) ───────────────────
// Zero-dependency native Web Audio API sound synthesis for order flow alerts
// Provides harmonic, subtle chimes for buy sweeps, sell sweeps, walls, and CVD surges

import type { OrderFlowAudioConfig } from '../../types/index.ts';

export const ORDER_FLOW_AUDIO_STORAGE_KEY = 'uspot_orderflow_audio_config';
export const AUDIO_CONFIG_CHANGED_EVENT = 'uspot_audio_config_updated';

export const DEFAULT_ORDER_FLOW_AUDIO_CONFIG: OrderFlowAudioConfig = {
  soundEnabled: true,
  volume: 0.45,
  toastsEnabled: true,
  whaleThresholdUsdt: 25000,
  soundTypes: {
    buySweep: true,
    sellSweep: true,
    wallDetected: true,
    cvdSurge: true,
  },
};

let sharedAudioContext: AudioContext | null = null;

/**
 * Returns a singleton instance of the browser AudioContext,
 * safely handling webkit audio prefix and suspension states.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!sharedAudioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioContext = new AudioCtx();
      }
    }

    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }

    return sharedAudioContext;
  } catch {
    return null;
  }
}

/** Check if Web Audio API is supported in the current environment */
export function isAudioSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * Retrieves the stored audio configuration from localStorage or default values
 */
export function getOrderFlowAudioConfig(): OrderFlowAudioConfig {
  if (typeof window === 'undefined') return DEFAULT_ORDER_FLOW_AUDIO_CONFIG;

  try {
    const raw = localStorage.getItem(ORDER_FLOW_AUDIO_STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER_FLOW_AUDIO_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ORDER_FLOW_AUDIO_CONFIG,
      ...parsed,
      soundTypes: {
        ...DEFAULT_ORDER_FLOW_AUDIO_CONFIG.soundTypes,
        ...(parsed.soundTypes || {}),
      },
    };
  } catch {
    return DEFAULT_ORDER_FLOW_AUDIO_CONFIG;
  }
}

/**
 * Persists updated audio configuration to localStorage and broadcasts update event
 */
export function saveOrderFlowAudioConfig(
  updates: Partial<OrderFlowAudioConfig>
): OrderFlowAudioConfig {
  const current = getOrderFlowAudioConfig();
  const next: OrderFlowAudioConfig = {
    ...current,
    ...updates,
    soundTypes: {
      ...current.soundTypes,
      ...(updates.soundTypes || {}),
    },
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(ORDER_FLOW_AUDIO_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(AUDIO_CONFIG_CHANGED_EVENT, { detail: next }));
    } catch {}
  }

  return next;
}

/**
 * Toggles master audio alert mute state
 */
export function toggleSoundEnabled(): boolean {
  const cfg = getOrderFlowAudioConfig();
  const updated = saveOrderFlowAudioConfig({ soundEnabled: !cfg.soundEnabled });
  return updated.soundEnabled;
}

/**
 * Plays an ascending dual-tone chime (D5: 587.3Hz -> A5: 880Hz)
 * Indicating aggressive institutional buy sweeps lifting asks.
 */
export function playBuyChime(volumeOverride?: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const config = getOrderFlowAudioConfig();
  if (!config.soundEnabled && volumeOverride === undefined) return;
  const masterVolume = Math.max(0, Math.min(1, volumeOverride ?? config.volume));
  if (masterVolume <= 0) return;

  try {
    const now = ctx.currentTime;

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVolume * 0.3, now);
    masterGain.connect(ctx.destination);

    // Note 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.7, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Note 2: A5 (880.00 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.08);
    gain2.gain.setValueAtTime(0.9, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (err) {
    // Gracefully handle browser audio restrictions
  }
}

/**
 * Plays a descending dual-tone cautionary chime (A4: 440Hz -> E4: 329.6Hz)
 * Indicating aggressive institutional sell sweeps hitting bids.
 */
export function playSellChime(volumeOverride?: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const config = getOrderFlowAudioConfig();
  if (!config.soundEnabled && volumeOverride === undefined) return;
  const masterVolume = Math.max(0, Math.min(1, volumeOverride ?? config.volume));
  if (masterVolume <= 0) return;

  try {
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVolume * 0.3, now);
    masterGain.connect(ctx.destination);

    // Note 1: A4 (440.00 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(440.0, now);
    gain1.gain.setValueAtTime(0.8, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Note 2: E4 (329.63 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(329.63, now + 0.09);
    gain2.gain.setValueAtTime(0.85, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.35);
  } catch (err) {}
}

/**
 * Plays a resonant crystalline harmonic chord (G5: 784Hz + D6: 1174.6Hz)
 * Indicating detection of an institutional order book wall.
 */
export function playWallChime(volumeOverride?: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const config = getOrderFlowAudioConfig();
  if (!config.soundEnabled && volumeOverride === undefined) return;
  const masterVolume = Math.max(0, Math.min(1, volumeOverride ?? config.volume));
  if (masterVolume <= 0) return;

  try {
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVolume * 0.25, now);
    masterGain.connect(ctx.destination);

    // Harmonic 1: G5 (783.99 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, now);
    gain1.gain.setValueAtTime(0.8, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // Harmonic 2: D6 (1174.66 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now);
    gain2.gain.setValueAtTime(0.6, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now);
    osc2.stop(now + 0.35);
  } catch (err) {}
}

/**
 * Plays a pulsed frequency chime (E5: 659.25Hz -> B5: 987.77Hz)
 * Indicating significant Cumulative Volume Delta (CVD) divergence.
 */
export function playCvdSurgeChime(volumeOverride?: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const config = getOrderFlowAudioConfig();
  if (!config.soundEnabled && volumeOverride === undefined) return;
  const masterVolume = Math.max(0, Math.min(1, volumeOverride ?? config.volume));
  if (masterVolume <= 0) return;

  try {
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(masterVolume * 0.25, now);
    masterGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.15);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (err) {}
}
