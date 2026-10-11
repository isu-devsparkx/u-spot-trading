'use client';

// ─── U-SPOT Liquidity Heatmap Snapshot Recording & Replay Workbench (Phase 44) ───
// Provides sub-second liquidity recording, frame scrubber playback, variable speeds,
// session persistence, tag annotations, and JSON export/import for post-trade debriefs.

import React, { useState, useEffect, useRef } from 'react';
import type {
  HeatmapRecordingSession,
  HeatmapRecordingTag,
  HeatmapPlaybackSpeed,
  OrderFlowHeatmapSlice,
} from '@/types';
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
} from '@/lib/services/heatmap-recorder';
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Sparkles,
  Layers,
  Clock,
  History,
  Tag as TagIcon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface HeatmapReplayWorkbenchProps {
  symbol: string;
  latestSlice?: OrderFlowHeatmapSlice | null;
  onReplaySlicesChange?: (slices: OrderFlowHeatmapSlice[] | null) => void;
  isReplayModeActive: boolean;
  setIsReplayModeActive: (active: boolean) => void;
}

export default function HeatmapReplayWorkbench({
  symbol,
  latestSlice,
  onReplaySlicesChange,
  isReplayModeActive,
  setIsReplayModeActive,
}: HeatmapReplayWorkbenchProps) {
  // Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [selectedTag, setSelectedTag] = useState<HeatmapRecordingTag>('MANUAL');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const recordingSessionRef = useRef<HeatmapRecordingSession | null>(null);
  const [sessionList, setSessionList] = useState<HeatmapRecordingSession[]>([]);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);

  // Playback State
  const [activeReplaySession, setActiveReplaySession] = useState<HeatmapRecordingSession | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<HeatmapPlaybackSpeed>(1);
  const [notification, setNotification] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-clear notification banner
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 3500);
    return () => clearTimeout(t);
  }, [notification]);

  // Handle active recording slice ingestion from live WebSocket feed
  useEffect(() => {
    if (!isRecording || !latestSlice || !recordingSessionRef.current) return;

    recordingSessionRef.current = recordSlice(recordingSessionRef.current, latestSlice);
  }, [latestSlice, isRecording]);

  // Live recording duration timer ticker
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Playback timer ticker
  useEffect(() => {
    if (!isReplayModeActive || !isPlaying || !activeReplaySession) return;

    const frameInterval = getFrameIntervalMs(playbackSpeed, 250);
    const timer = setInterval(() => {
      setCurrentFrameIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= activeReplaySession.slices.length) {
          setIsPlaying(false);
          return activeReplaySession.slices.length - 1;
        }
        return nextIndex;
      });
    }, frameInterval);

    return () => clearInterval(timer);
  }, [isReplayModeActive, isPlaying, activeReplaySession, playbackSpeed]);

  // Propagate replay slice window whenever frame index changes
  useEffect(() => {
    if (!isReplayModeActive || !activeReplaySession) {
      if (onReplaySlicesChange) onReplaySlicesChange(null);
      return;
    }

    const windowSlices = getReplaySliceWindow(activeReplaySession, currentFrameIndex, 36);
    if (onReplaySlicesChange) {
      onReplaySlicesChange(windowSlices);
    }
  }, [isReplayModeActive, activeReplaySession, currentFrameIndex, onReplaySlicesChange]);

  // Start Live Recording
  const handleStartRecording = () => {
    const session = createRecordingSession(symbol, selectedTag);
    recordingSessionRef.current = session;
    setRecordingDuration(0);
    setIsRecording(true);
    setNotification(`🔴 Recording started [${selectedTag}] for ${symbol}`);
  };

  // Stop & Finalize Recording
  const handleStopRecording = () => {
    if (!recordingSessionRef.current) return;

    const finalized = finalizeRecordingSession(recordingSessionRef.current);
    recordingSessionRef.current = null;
    setIsRecording(false);

    setSessionList((prev) => [finalized, ...prev]);
    setActiveReplaySession(finalized);
    setCurrentFrameIndex(0);
    setNotification(`✅ Session saved: ${finalized.frameCount} frames recorded`);
  };

  // Load a demo sample session
  const handleLoadSampleDemo = () => {
    const demo = generateSampleReplaySession(symbol);
    setSessionList((prev) => [demo, ...prev.filter((s) => s.id !== demo.id)]);
    setActiveReplaySession(demo);
    setCurrentFrameIndex(0);
    setIsReplayModeActive(true);
    setIsPlaying(false);
    setNotification(`⚡ Demo Session Loaded: Whale Liquidity Sweep (${demo.frameCount} frames)`);
  };

  // Select an existing session for playback
  const handleSelectSession = (session: HeatmapRecordingSession) => {
    setActiveReplaySession(session);
    setCurrentFrameIndex(0);
    setIsReplayModeActive(true);
    setIsPlaying(false);
    setNotification(`Loaded session ${session.id.slice(0, 12)} (${session.frameCount} frames)`);
  };

  // Export current session to JSON
  const handleExportJSON = () => {
    if (!activeReplaySession) return;
    const jsonStr = serializeSessionToJSON(activeReplaySession);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `U-SPOT-Heatmap-${activeReplaySession.symbol.replace('/', '-')}-${activeReplaySession.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setNotification(`💾 Exported session JSON`);
  };

  // Import session from JSON file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = parseSessionFromJSON(text);
        setSessionList((prev) => [imported, ...prev.filter((s) => s.id !== imported.id)]);
        setActiveReplaySession(imported);
        setCurrentFrameIndex(0);
        setIsReplayModeActive(true);
        setIsPlaying(false);
        setNotification(`📂 Imported session ${imported.id} (${imported.frameCount} frames)`);
      } catch (err: any) {
        setNotification(`❌ Failed to parse session file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const currentSlice = activeReplaySession?.slices[currentFrameIndex];
  const totalFrames = activeReplaySession?.slices.length || 0;

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-3 font-mono text-xs">
      {/* ─── Notification Alert ─── */}
      {notification && (
        <div className="px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-[11px] flex items-center justify-between animate-fade-in">
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-cyan-400 hover:text-cyan-200 ml-2 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Top Control Bar: Mode Toggle, Recording, Session Drawer ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Mode Switch: Live vs Replay */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            <button
              onClick={() => {
                setIsReplayModeActive(false);
                setIsPlaying(false);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                !isReplayModeActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${!isReplayModeActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              LIVE FEED
            </button>
            <button
              onClick={() => {
                if (!activeReplaySession && sessionList.length === 0) {
                  handleLoadSampleDemo();
                } else if (!activeReplaySession && sessionList.length > 0) {
                  setActiveReplaySession(sessionList[0]);
                }
                setIsReplayModeActive(true);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                isReplayModeActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History size={11} />
              REPLAY MODE
            </button>
          </div>

          {/* Recording Controls */}
          {!isRecording ? (
            <div className="flex items-center gap-1">
              {/* Tag Selector */}
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value as HeatmapRecordingTag)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] rounded px-1.5 py-1 outline-none cursor-pointer"
                title="Recording Tag Context"
              >
                <option value="MANUAL">Tag: Manual</option>
                <option value="ENTRY_FILL">Tag: Entry Fill</option>
                <option value="TP_HIT">Tag: TP Hit</option>
                <option value="SL_HIT">Tag: SL Hit</option>
                <option value="WHALE_SWEEP">Tag: Whale Sweep</option>
              </select>

              <button
                onClick={handleStartRecording}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-[10px] font-bold cursor-pointer transition"
                title="Start sub-second depth recording"
              >
                <Circle size={10} className="fill-rose-400 text-rose-400 animate-pulse" />
                Record
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/50 text-rose-300 text-[10px] font-bold animate-pulse">
                <Circle size={8} className="fill-rose-400 text-rose-400" />
                REC: {recordingDuration}s ({recordingSessionRef.current?.frameCount || 0} frames)
              </span>
              <button
                onClick={handleStopRecording}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer transition shadow-sm"
              >
                <Square size={10} className="fill-white" />
                Stop & Save
              </button>
            </div>
          )}
        </div>

        {/* Right Action Tools: Demo, JSON Export/Import, Session Drawer */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleLoadSampleDemo}
            className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 text-[10px] cursor-pointer transition"
            title="Load Pre-Recorded Whale Sweep Demo"
          >
            <Sparkles size={11} className="text-cyan-400" />
            Whale Demo
          </button>

          {activeReplaySession && (
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] cursor-pointer transition"
              title="Download Session as JSON"
            >
              <Download size={11} />
              JSON
            </button>
          )}

          <label className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] cursor-pointer transition">
            <Upload size={11} />
            Load
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] cursor-pointer transition"
          >
            <Layers size={11} />
            Sessions ({sessionList.length})
            {showDrawer ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* ─── Collapsible Saved Sessions Drawer ─── */}
      {showDrawer && (
        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex justify-between">
            <span>Saved Liquidity Recording Sessions</span>
            <span>{sessionList.length} Sessions Available</span>
          </div>
          {sessionList.length === 0 ? (
            <div className="text-[11px] text-slate-500 py-3 text-center">
              No recorded sessions yet. Click <span className="text-rose-400 font-bold">Record</span> above or load the <span className="text-cyan-400 font-bold">Whale Demo</span>.
            </div>
          ) : (
            <div className="space-y-1">
              {sessionList.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-1.5 rounded border transition cursor-pointer text-[10px] ${
                    activeReplaySession?.id === s.id
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                  }`}
                  onClick={() => handleSelectSession(s)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1 rounded text-[9px] font-bold ${
                        s.tag === 'WHALE_SWEEP'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : s.tag === 'TP_HIT'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : s.tag === 'SL_HIT'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {s.tag}
                    </span>
                    <span className="font-bold text-slate-200">{s.symbol}</span>
                    <span className="text-slate-500">
                      {s.frameCount} frames • {s.durationSeconds}s
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        s.priceChangePercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                      }
                    >
                      {s.priceChangePercent >= 0 ? '+' : ''}
                      {s.priceChangePercent}%
                    </span>
                    <span className="text-slate-500 text-[9px]">
                      {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Replay Controls & Scrubber Slider (Only in Replay Mode) ─── */}
      {isReplayModeActive && activeReplaySession && (
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          {/* Scrubber Progress Bar & Metric Tags */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5 font-bold text-amber-300">
                <History size={11} />
                Frame {currentFrameIndex + 1} / {totalFrames}
              </span>
              {currentSlice && (
                <div className="flex items-center gap-3">
                  <span className="text-slate-300">
                    Mid: <span className="font-bold text-amber-300">{currentSlice.midPrice.toFixed(2)}</span>
                  </span>
                  <span
                    className={
                      currentSlice.depthDeltaUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    Δ: {currentSlice.depthDeltaUsdt >= 0 ? '+' : ''}
                    {formatNumber(currentSlice.depthDeltaUsdt)} USDT
                  </span>
                  {currentSlice.whaleWallsCount > 0 && (
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 px-1 rounded text-[9px] font-bold">
                      🐋 WALL ACTIVE
                    </span>
                  )}
                  <span className="text-slate-500">
                    {new Date(currentSlice.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            {/* Range Scrubber Input */}
            <input
              type="range"
              min={0}
              max={Math.max(0, totalFrames - 1)}
              value={currentFrameIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentFrameIndex(parseInt(e.target.value, 10));
              }}
              className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            />
          </div>

          {/* Transport Controls & Playback Speed Pills */}
          <div className="flex items-center justify-between">
            {/* Playback Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex(0);
                }}
                disabled={currentFrameIndex === 0}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                title="First Frame"
              >
                <SkipBack size={12} />
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex((prev) => stepReplayFrame(prev, totalFrames, -1));
                }}
                disabled={currentFrameIndex === 0}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                title="Step -1 Frame"
              >
                <ChevronLeft size={12} />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-3 py-1 rounded border font-bold flex items-center gap-1.5 cursor-pointer transition ${
                  isPlaying
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex((prev) => stepReplayFrame(prev, totalFrames, 1));
                }}
                disabled={currentFrameIndex >= totalFrames - 1}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                title="Step +1 Frame"
              >
                <ChevronRight size={12} />
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentFrameIndex(Math.max(0, totalFrames - 1));
                }}
                disabled={currentFrameIndex >= totalFrames - 1}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                title="Last Frame"
              >
                <SkipForward size={12} />
              </button>
            </div>

            {/* Playback Speed Selectors */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-500 mr-1">Speed:</span>
              {([0.5, 1, 2, 5] as HeatmapPlaybackSpeed[]).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    playbackSpeed === spd
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
