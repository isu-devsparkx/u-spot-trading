'use client';

// ─── U-SPOT Order Flow Sound & Visual Alert Settings (Phase 35) ───────
// Audio synthesizer controls, volume slider, whale thresholds, and test chimes

import React from 'react';
import { useOrderFlowToasts } from '@/context/OrderFlowToastContext';
import {
  Volume2,
  VolumeX,
  Volume1,
  Bell,
  Play,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import {
  playBuyChime,
  playSellChime,
  playWallChime,
  playCvdSurgeChime,
} from '@/lib/services/sound-synthesizer';
import { dispatchOrderFlowAlert } from '@/lib/services/order-flow-imbalance';

const WHALE_THRESHOLDS = [10000, 25000, 50000, 100000];

export default function SoundAlertSettingsCard() {
  const { audioConfig, updateAudioConfig } = useOrderFlowToasts();

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    updateAudioConfig({ volume: vol });
  };

  const handleTestToast = () => {
    dispatchOrderFlowAlert({
      id: `test_${Date.now()}`,
      type: 'WHALE_BUY_SWEEP',
      symbol: 'SOL/USDT',
      title: '🐳 Whale Buy Sweep (Test)',
      message: 'Aggressive institutional sweep lifted $64,500 at $152.40',
      price: 152.4,
      volumeUsdt: 64500,
      timestamp: Date.now(),
      severity: 'whale',
      durationMs: 5000,
    });
  };

  return (
    <div
      className="p-6 rounded-2xl bg-[var(--surface-1)] border border-[var(--glass-border)] shadow-xl space-y-6"
      id="sound-alert-settings"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            {audioConfig.soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Order Flow Sound & Visual Alerts
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-400 font-mono font-medium">
                Phase 35
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Native Web Audio synthesized harmonic chimes and floating toasts for institutional whale sweeps and wall defenses.
            </p>
          </div>
        </div>

        {/* Master Sound Switch */}
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={audioConfig.soundEnabled}
            onChange={(e) => updateAudioConfig({ soundEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {/* Left Column: Volume & Threshold */}
        <div className="space-y-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          {/* Volume Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 flex items-center gap-1.5 font-sans font-medium">
                {audioConfig.volume === 0 ? (
                  <VolumeX size={14} className="text-slate-500" />
                ) : audioConfig.volume < 0.5 ? (
                  <Volume1 size={14} className="text-cyan-400" />
                ) : (
                  <Volume2 size={14} className="text-cyan-400" />
                )}
                Chime Volume
              </span>
              <span className="text-cyan-400 font-bold">
                {Math.round(audioConfig.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioConfig.volume}
              disabled={!audioConfig.soundEnabled}
              onChange={handleVolumeChange}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-40"
            />
          </div>

          {/* Whale Alert Minimum Threshold */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <span className="text-xs font-medium text-slate-300 block">
              Whale Sweep Minimum Size:
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {WHALE_THRESHOLDS.map((th) => (
                <button
                  key={th}
                  onClick={() => updateAudioConfig({ whaleThresholdUsdt: th })}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition cursor-pointer border ${
                    audioConfig.whaleThresholdUsdt === th
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  ${th / 1000}k
                </button>
              ))}
            </div>
          </div>

          {/* Visual Toast Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                Visual Toast Popups
              </span>
              <span className="text-[11px] text-slate-500">
                Floating alert cards with pause on hover
              </span>
            </div>
            <input
              type="checkbox"
              checked={audioConfig.toastsEnabled}
              onChange={(e) => updateAudioConfig({ toastsEnabled: e.target.checked })}
              className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700 focus:ring-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Right Column: Event Types */}
        <div className="space-y-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <span className="text-xs font-medium text-slate-300 block mb-1">
            Audio Sound Triggers:
          </span>

          {/* Buy Sweep */}
          <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60 cursor-pointer hover:bg-slate-950/80 transition">
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp size={14} className="text-emerald-400" />
              <div>
                <span className="text-slate-200 font-medium block">
                  Whale Buy Sweeps
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Ascending harmonic chime (D5 → A5)
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={audioConfig.soundTypes.buySweep}
              disabled={!audioConfig.soundEnabled}
              onChange={(e) =>
                updateAudioConfig({
                  soundTypes: { ...audioConfig.soundTypes, buySweep: e.target.checked },
                })
              }
              className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-slate-700 cursor-pointer"
            />
          </label>

          {/* Sell Sweep */}
          <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60 cursor-pointer hover:bg-slate-950/80 transition">
            <div className="flex items-center gap-2 text-xs">
              <TrendingDown size={14} className="text-rose-400" />
              <div>
                <span className="text-slate-200 font-medium block">
                  Whale Sell Dumps
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Descending cautionary chime (A4 → E4)
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={audioConfig.soundTypes.sellSweep}
              disabled={!audioConfig.soundEnabled}
              onChange={(e) =>
                updateAudioConfig({
                  soundTypes: { ...audioConfig.soundTypes, sellSweep: e.target.checked },
                })
              }
              className="w-4 h-4 rounded text-rose-500 bg-slate-800 border-slate-700 cursor-pointer"
            />
          </label>

          {/* Wall Detected */}
          <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60 cursor-pointer hover:bg-slate-950/80 transition">
            <div className="flex items-center gap-2 text-xs">
              <Shield size={14} className="text-cyan-400" />
              <div>
                <span className="text-slate-200 font-medium block">
                  Institutional Walls
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Crystalline chord ping (G5 + D6)
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={audioConfig.soundTypes.wallDetected}
              disabled={!audioConfig.soundEnabled}
              onChange={(e) =>
                updateAudioConfig({
                  soundTypes: { ...audioConfig.soundTypes, wallDetected: e.target.checked },
                })
              }
              className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700 cursor-pointer"
            />
          </label>

          {/* CVD Divergence */}
          <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/60 cursor-pointer hover:bg-slate-950/80 transition">
            <div className="flex items-center gap-2 text-xs">
              <Zap size={14} className="text-amber-400" />
              <div>
                <span className="text-slate-200 font-medium block">
                  Extreme CVD Surges
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Pulsed frequency chime (E5 → B5)
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={audioConfig.soundTypes.cvdSurge}
              disabled={!audioConfig.soundEnabled}
              onChange={(e) =>
                updateAudioConfig({
                  soundTypes: { ...audioConfig.soundTypes, cvdSurge: e.target.checked },
                })
              }
              className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Interactive Sound Preview Toolbar */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
          <Sparkles size={13} className="text-amber-400" />
          Test Audio Synthesis & Toasts:
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => playBuyChime(audioConfig.volume)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono hover:bg-emerald-500/20 transition cursor-pointer"
            title="Play ascending buy sweep chime"
          >
            <Play size={11} />
            <span>Buy Chime 🎵</span>
          </button>

          <button
            onClick={() => playSellChime(audioConfig.volume)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-mono hover:bg-rose-500/20 transition cursor-pointer"
            title="Play descending sell dump chime"
          >
            <Play size={11} />
            <span>Sell Chime 🔔</span>
          </button>

          <button
            onClick={() => playWallChime(audioConfig.volume)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-mono hover:bg-cyan-500/20 transition cursor-pointer"
            title="Play institutional wall crystalline chord"
          >
            <Play size={11} />
            <span>Wall Chord 🛡️</span>
          </button>

          <button
            onClick={handleTestToast}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-mono hover:bg-amber-500/20 transition cursor-pointer"
            title="Trigger test visual toast notification"
          >
            <Bell size={11} />
            <span>Test Toast 🚀</span>
          </button>
        </div>
      </div>
    </div>
  );
}
