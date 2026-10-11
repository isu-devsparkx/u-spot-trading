// ─── U-SPOT Signal Persistence Service ────────────────────────────────
// Phase 8: Signal Persistence (Database Layer)
// Spec Section: Phase 8, Section 40 (Database Schema), Section 35 (Free-first)
// Persists signals, lifecycle events, evaluations, market snapshots, and strategy versions.

import { getSupabaseClient, isSupabaseConfigured } from './supabase.ts';
import { isEntryTriggered } from '../utils.ts';
import type {
  Signal,
  SignalHistoryRecord,
  SignalLifecycleEvent,
  SignalEvaluation,
  MarketSnapshot,
  StrategyVersionRecord,
  StrategyParameterRecord,
  SignalQueryFilters,
  StorageSource,
  SignalResult,
} from '../../types/index.ts';

// ── In-Memory Fallback Cache & Seed Store ─────────────────────────────
// Used when Supabase is not configured or as local write-through cache
class InMemorySignalStore {
  private signals: Map<string, SignalHistoryRecord> = new Map();
  private events: Map<string, SignalLifecycleEvent[]> = new Map();
  private evaluations: Map<string, SignalEvaluation> = new Map();
  private snapshots: MarketSnapshot[] = [];
  private strategyVersions: Map<string, StrategyVersionRecord> = new Map();
  private strategyParameters: StrategyParameterRecord[] = [];

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // Seed default strategy version v1.0.0
    this.strategyVersions.set('v1.0.0', {
      version: 'v1.0.0',
      createdAt: new Date().toISOString(),
      description: 'U-SPOT Core Strategy: Multi-factor scoring with 6 technical modules and volatility-adjusted risk',
      parameters: {
        emaFast: 20,
        emaMid: 50,
        emaSlow: 200,
        rsiPeriod: 14,
        atrPeriod: 14,
        slAtrMultiplier: 1.75,
        dca1AtrMultiplier: 1.0,
        dca2AtrMultiplier: 1.8,
        tp1Ratio: 0.3,
        tp2Ratio: 0.3,
        tp3Ratio: 0.4,
      },
      weights: {
        trend: 20,
        momentum: 15,
        volume: 15,
        structure: 20,
        liquidity: 15,
        volatility: 10,
        regime: 5,
      },
      isActive: true,
    });

    // Seed default strategy parameters
    this.strategyParameters = [
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_trend',
        parameterValue: 20,
        category: 'WEIGHTS',
        description: 'Weight for trend alignment score',
        minValue: 0,
        maxValue: 100,
        defaultValue: 20,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_momentum',
        parameterValue: 15,
        category: 'WEIGHTS',
        description: 'Weight for momentum & RSI score',
        minValue: 0,
        maxValue: 100,
        defaultValue: 15,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_volume',
        parameterValue: 15,
        category: 'WEIGHTS',
        description: 'Weight for volume surge score',
        minValue: 0,
        maxValue: 100,
        defaultValue: 15,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_structure',
        parameterValue: 20,
        category: 'WEIGHTS',
        description: 'Weight for market structure / BOS / CHOCH',
        minValue: 0,
        maxValue: 100,
        defaultValue: 20,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_liquidity',
        parameterValue: 15,
        category: 'WEIGHTS',
        description: 'Weight for order book liquidity score',
        minValue: 0,
        maxValue: 100,
        defaultValue: 15,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_volatility',
        parameterValue: 10,
        category: 'WEIGHTS',
        description: 'Weight for volatility regime score',
        minValue: 0,
        maxValue: 100,
        defaultValue: 10,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'weight_regime',
        parameterValue: 5,
        category: 'WEIGHTS',
        description: 'Weight for macro market regime alignment',
        minValue: 0,
        maxValue: 100,
        defaultValue: 5,
      },
      {
        strategyVersion: 'v1.0.0',
        parameterKey: 'risk_pct_grade_a_plus',
        parameterValue: 1.0,
        category: 'RISK',
        description: 'Max risk % for A+ grade setups',
        minValue: 0.1,
        maxValue: 5.0,
        defaultValue: 1.0,
      },
    ];
  }

  saveSignal(signal: Signal | SignalHistoryRecord): void {
    const existing = this.signals.get(signal.signalId);
    const historyRecord: SignalHistoryRecord = {
      ...signal,
      actualEntry: 'actualEntry' in signal ? signal.actualEntry : existing?.actualEntry ?? null,
      dca1Hit: 'dca1Hit' in signal ? signal.dca1Hit : existing?.dca1Hit ?? false,
      dca2Hit: 'dca2Hit' in signal ? signal.dca2Hit : existing?.dca2Hit ?? false,
      finalResult: 'finalResult' in signal ? signal.finalResult : existing?.finalResult ?? null,
      mfe: 'mfe' in signal ? signal.mfe : existing?.mfe ?? null,
      mae: 'mae' in signal ? signal.mae : existing?.mae ?? null,
      realizedReturn: 'realizedReturn' in signal ? signal.realizedReturn : existing?.realizedReturn ?? null,
      realizedR: 'realizedR' in signal ? signal.realizedR : existing?.realizedR ?? null,
      fees: 'fees' in signal ? signal.fees : existing?.fees ?? null,
      slippage: 'slippage' in signal ? signal.slippage : existing?.slippage ?? null,
      evaluationText: 'evaluationText' in signal ? signal.evaluationText : existing?.evaluationText ?? null,
    };
    this.signals.set(signal.signalId, historyRecord);
  }

  getSignal(signalId: string): SignalHistoryRecord | null {
    return this.signals.get(signalId) ?? null;
  }

  getAllSignals(): SignalHistoryRecord[] {
    return Array.from(this.signals.values());
  }

  saveEvent(event: SignalLifecycleEvent): void {
    const list = this.events.get(event.signalId) ?? [];
    list.push(event);
    this.events.set(event.signalId, list);

    // Update signal lifecycle state if corresponding
    const sig = this.signals.get(event.signalId);
    if (sig) {
      if (event.eventType === 'ENTRY') {
        sig.lifecycle = 'ACTIVE';
        sig.actualEntry = event.price;
      } else if (event.eventType === 'DCA1') {
        sig.dca1Hit = true;
      } else if (event.eventType === 'DCA2') {
        sig.dca2Hit = true;
      } else if (event.eventType === 'TP1') {
        sig.lifecycle = 'TP1_HIT';
        sig.finalResult = 'TP1_ONLY';
      } else if (event.eventType === 'TP2') {
        sig.lifecycle = 'TP2_HIT';
        sig.finalResult = 'TP2_REACHED';
      } else if (event.eventType === 'TP3') {
        sig.lifecycle = 'CLOSED';
        sig.finalResult = 'FULL_TP';
      } else if (event.eventType === 'SL') {
        sig.lifecycle = 'CLOSED';
        const hasHitTp1 = (this.events.get(event.signalId) || []).some((e) => e.eventType === 'TP1');
        sig.finalResult = hasHitTp1 ? 'PARTIAL_TP_THEN_SL' : 'SL';
      } else if (event.eventType === 'EXPIRED') {
        sig.lifecycle = 'CLOSED';
        sig.finalResult = 'EXPIRED';
      } else if (event.eventType === 'CANCELLED' || event.eventType === 'INVALIDATED') {
        sig.lifecycle = 'CLOSED';
        sig.finalResult = event.eventType === 'CANCELLED' ? 'CANCELLED' : 'INVALIDATED_BEFORE_ENTRY';
      }
    }
  }

  deleteEvents(signalId: string): void {
    this.events.delete(signalId);
  }

  getEvents(signalId: string): SignalLifecycleEvent[] {
    return this.events.get(signalId) ?? [];
  }

  saveEvaluation(evaluation: SignalEvaluation): void {
    this.evaluations.set(evaluation.signalId, evaluation);
    const sig = this.signals.get(evaluation.signalId);
    if (sig) {
      sig.finalResult = evaluation.finalResult;
      sig.mfe = evaluation.mfe;
      sig.mae = evaluation.mae;
      sig.realizedReturn = evaluation.realizedReturnPercent;
      sig.realizedR = evaluation.realizedR;
      sig.fees = evaluation.feesUsdt;
      sig.slippage = evaluation.slippageUsdt;
      sig.evaluationText = evaluation.evaluationText;
    }
  }

  getEvaluation(signalId: string): SignalEvaluation | null {
    return this.evaluations.get(signalId) ?? null;
  }

  deleteSignal(signalId: string): boolean {
    this.events.delete(signalId);
    this.evaluations.delete(signalId);
    return this.signals.delete(signalId);
  }

  getAllEvaluations(): SignalEvaluation[] {
    return Array.from(this.evaluations.values());
  }

  saveSnapshot(snapshot: MarketSnapshot): void {
    this.snapshots.unshift(snapshot);
    if (this.snapshots.length > 500) {
      this.snapshots.pop();
    }
  }

  getSnapshots(limit = 50): MarketSnapshot[] {
    return this.snapshots.slice(0, limit);
  }

  saveStrategyVersion(ver: StrategyVersionRecord): void {
    this.strategyVersions.set(ver.version, ver);
  }

  getStrategyVersions(): StrategyVersionRecord[] {
    return Array.from(this.strategyVersions.values());
  }

  saveStrategyParameter(param: StrategyParameterRecord): void {
    const idx = this.strategyParameters.findIndex(
      (p) => p.strategyVersion === param.strategyVersion && p.parameterKey === param.parameterKey
    );
    if (idx >= 0) {
      this.strategyParameters[idx] = param;
    } else {
      this.strategyParameters.push(param);
    }
  }

  getStrategyParameters(version?: string): StrategyParameterRecord[] {
    if (version) {
      return this.strategyParameters.filter((p) => p.strategyVersion === version);
    }
    return [...this.strategyParameters];
  }
}

// Global in-memory singleton
const memoryStore = new InMemorySignalStore();

// ── Database Row Mappings (camelCase <-> snake_case) ──────────────────

export function mapSignalToDbRow(signal: Signal | SignalHistoryRecord): Record<string, unknown> {
  const isHistory = 'actualEntry' in signal;
  const history = isHistory ? (signal as SignalHistoryRecord) : null;

  return {
    signal_id: signal.signalId,
    symbol: signal.symbol,
    direction: signal.direction,
    created_at: signal.createdAt,
    strategy_version: signal.strategyVersion,
    market_regime: signal.marketRegime,
    candidate_score: signal.candidateScore,
    trade_score: signal.tradeScore,
    setup_type: signal.setupType,
    entry_low: signal.entryZone.low,
    entry_high: signal.entryZone.high,
    preferred_entry: signal.preferredEntry,
    dca1: signal.dca1,
    dca2: signal.dca2,
    stop_loss: signal.stopLoss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    risk_pct: signal.riskPercent,
    max_loss: signal.maxLoss,
    initial_allocation: signal.initialAllocation,
    dca1_allocation: signal.dca1Allocation,
    dca2_allocation: signal.dca2Allocation,
    max_deployed: signal.maxDeployed,
    risk_reward: signal.riskReward,
    confidence: signal.confidence,
    status: signal.status,
    lifecycle: signal.lifecycle,
    expires_at: signal.expiresAt,
    exchange: signal.exchange ?? 'BINANCE_SPOT',
    confirmation_condition: signal.confirmationCondition ?? null,
    rationale: signal.rationale ?? null,
    trade_score_breakdown: {
      trend: signal.tradeScoreBreakdown?.trend ?? 0,
      momentum: signal.tradeScoreBreakdown?.momentum ?? 0,
      volume: signal.tradeScoreBreakdown?.volume ?? 0,
      structure: signal.tradeScoreBreakdown?.structure ?? 0,
      liquidity: signal.tradeScoreBreakdown?.liquidity ?? 0,
      volatility: signal.tradeScoreBreakdown?.volatility ?? 0,
      regime: signal.tradeScoreBreakdown?.regime ?? 0,
      total: signal.tradeScoreBreakdown?.total ?? 0,
      ...(signal.aiAnalysis ? { ai_analysis: signal.aiAnalysis } : {}),
      ...(signal.isAiGenerated ? { is_ai_generated: true } : {}),
      ...(history?.trailingStopPrice ? { trailing_stop_price: history.trailingStopPrice } : {}),
      ...(signal.mtfAnalysis ? { mtf_analysis: signal.mtfAnalysis } : {}),
    },
    ta_summary: signal.taSummary ?? null,
    actual_entry: history?.actualEntry ?? null,
    dca1_hit: history?.dca1Hit ?? false,
    dca2_hit: history?.dca2Hit ?? false,
    final_result: history?.finalResult ?? null,
    mfe: history?.mfe ?? null,
    mae: history?.mae ?? null,
    realized_return: history?.realizedReturn ?? null,
    realized_r: history?.realizedR ?? null,
    fees: history?.fees ?? null,
    slippage: history?.slippage ?? null,
    evaluation_text: history?.evaluationText ?? null,
  };
}

export function mapDbRowToSignalRecord(row: Record<string, unknown>): SignalHistoryRecord {
  return {
    signalId: String(row.signal_id),
    symbol: String(row.symbol),
    direction: (row.direction as 'BUY' | 'SELL') ?? 'BUY',
    createdAt: String(row.created_at),
    strategyVersion: String(row.strategy_version ?? 'v1.0.0'),
    marketRegime: (row.market_regime as Signal['marketRegime']) ?? 'NEUTRAL',
    candidateScore: Number(row.candidate_score ?? 0),
    tradeScore: Number(row.trade_score ?? 0),
    setupType: (row.setup_type as Signal['setupType']) ?? 'PULLBACK_EMA20',
    entryZone: {
      low: Number(row.entry_low ?? 0),
      high: Number(row.entry_high ?? 0),
    },
    preferredEntry: Number(row.preferred_entry ?? 0),
    dca1: Number(row.dca1 ?? 0),
    dca2: Number(row.dca2 ?? 0),
    stopLoss: Number(row.stop_loss ?? 0),
    tp1: Number(row.tp1 ?? 0),
    tp2: Number(row.tp2 ?? 0),
    tp3: Number(row.tp3 ?? 0),
    riskPercent: Number(row.risk_pct ?? 1.0),
    maxLoss: Number(row.max_loss ?? 0),
    initialAllocation: Number(row.initial_allocation ?? 0),
    dca1Allocation: Number(row.dca1_allocation ?? 0),
    dca2Allocation: Number(row.dca2_allocation ?? 0),
    maxDeployed: Number(row.max_deployed ?? 0),
    riskReward: Number(row.risk_reward ?? 0),
    confidence: (row.confidence as Signal['confidence']) ?? 'B',
    status: (row.status as Signal['status']) ?? 'WATCH',
    lifecycle: (row.lifecycle as Signal['lifecycle']) ?? 'CREATED',
    expiresAt: String(row.expires_at),
    exchange: row.exchange ? String(row.exchange) : undefined,
    confirmationCondition: row.confirmation_condition ? String(row.confirmation_condition) : undefined,
    rationale: row.rationale ? String(row.rationale) : undefined,
    tradeScoreBreakdown: (() => {
      if (!row.trade_score_breakdown || typeof row.trade_score_breakdown !== 'object') return undefined;
      const raw = row.trade_score_breakdown as Record<string, unknown>;
      return {
        trend: typeof raw.trend === 'number' ? raw.trend : Number(raw.trend ?? 0),
        momentum: typeof raw.momentum === 'number' ? raw.momentum : Number(raw.momentum ?? 0),
        volume: typeof raw.volume === 'number' ? raw.volume : Number(raw.volume ?? 0),
        structure: typeof raw.structure === 'number' ? raw.structure : Number(raw.structure ?? 0),
        liquidity: typeof raw.liquidity === 'number' ? raw.liquidity : Number(raw.liquidity ?? 0),
        volatility: typeof raw.volatility === 'number' ? raw.volatility : Number(raw.volatility ?? 0),
        regime: typeof raw.regime === 'number' ? raw.regime : Number(raw.regime ?? 0),
        total: typeof raw.total === 'number' ? raw.total : Number(raw.total ?? 0),
      };
    })(),
    taSummary: row.ta_summary ? String(row.ta_summary) : undefined,
    actualEntry: row.actual_entry !== null && row.actual_entry !== undefined ? Number(row.actual_entry) : null,
    dca1Hit: Boolean(row.dca1_hit),
    dca2Hit: Boolean(row.dca2_hit),
    finalResult: row.final_result ? (String(row.final_result) as SignalResult) : null,
    mfe: row.mfe !== null && row.mfe !== undefined ? Number(row.mfe) : null,
    mae: row.mae !== null && row.mae !== undefined ? Number(row.mae) : null,
    realizedReturn: row.realized_return !== null && row.realized_return !== undefined ? Number(row.realized_return) : null,
    realizedR: row.realized_r !== null && row.realized_r !== undefined ? Number(row.realized_r) : null,
    fees: row.fees !== null && row.fees !== undefined ? Number(row.fees) : null,
    slippage: row.slippage !== null && row.slippage !== undefined ? Number(row.slippage) : null,
    evaluationText: row.evaluation_text ? String(row.evaluation_text) : null,
    aiAnalysis:
      row.trade_score_breakdown && typeof row.trade_score_breakdown === 'object' && 'ai_analysis' in row.trade_score_breakdown
        ? (row.trade_score_breakdown as Record<string, unknown>).ai_analysis as Signal['aiAnalysis']
        : undefined,
    isAiGenerated:
      row.trade_score_breakdown && typeof row.trade_score_breakdown === 'object' && 'is_ai_generated' in row.trade_score_breakdown
        ? Boolean((row.trade_score_breakdown as Record<string, unknown>).is_ai_generated)
        : false,
    trailingStopPrice:
      row.trade_score_breakdown && typeof row.trade_score_breakdown === 'object' && 'trailing_stop_price' in row.trade_score_breakdown
        ? Number((row.trade_score_breakdown as Record<string, unknown>).trailing_stop_price)
        : undefined,
    mtfAnalysis:
      row.trade_score_breakdown && typeof row.trade_score_breakdown === 'object' && 'mtf_analysis' in row.trade_score_breakdown
        ? (row.trade_score_breakdown as Record<string, unknown>).mtf_analysis as Signal['mtfAnalysis']
        : undefined,
  };
}

export function mapEventToDbRow(event: SignalLifecycleEvent): Record<string, unknown> {
  return {
    event_id: event.eventId,
    signal_id: event.signalId,
    event_type: event.eventType,
    timestamp: event.timestamp,
    price: event.price,
    quantity: (event.metadata?.quantity as number) ?? null,
    metadata: event.metadata ?? {},
  };
}

export function mapDbRowToEvent(row: Record<string, unknown>): SignalLifecycleEvent {
  return {
    eventId: String(row.event_id),
    signalId: String(row.signal_id),
    eventType: row.event_type as SignalLifecycleEvent['eventType'],
    timestamp: String(row.timestamp),
    price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export function mapEvaluationToDbRow(ev: SignalEvaluation): Record<string, unknown> {
  return {
    signal_id: ev.signalId,
    evaluated_at: ev.evaluatedAt,
    final_result: ev.finalResult,
    realized_pnl: ev.netPnlUsdt,
    realized_r: ev.realizedR,
    mfe: ev.mfe,
    mae: ev.mae,
    realized_return_pct: ev.realizedReturnPercent,
    gross_pnl_usdt: ev.grossPnlUsdt,
    net_pnl_usdt: ev.netPnlUsdt,
    fees_usdt: ev.feesUsdt,
    slippage_usdt: ev.slippageUsdt,
    time_to_entry_ms: ev.timeToEvent.timeToEntryMs,
    time_to_dca1_ms: ev.timeToEvent.timeToDca1Ms,
    time_to_dca2_ms: ev.timeToEvent.timeToDca2Ms,
    time_to_tp1_ms: ev.timeToEvent.timeToTp1Ms,
    time_to_tp2_ms: ev.timeToEvent.timeToTp2Ms,
    time_to_tp3_ms: ev.timeToEvent.timeToTp3Ms,
    time_to_sl_ms: ev.timeToEvent.timeToSlMs,
    time_to_expiry_ms: ev.timeToEvent.timeToExpiryMs,
    sl_failure_primary_cause: ev.slFailurePrimaryCause,
    sl_failure_secondary_causes: ev.slFailureSecondaryCauses ?? [],
    stop_tightness_label: ev.stopTightnessLabel,
    counterfactual_note: ev.counterfactualNote,
    evaluation_text: ev.evaluationText,
  };
}

export function mapDbRowToEvaluation(row: Record<string, unknown>): SignalEvaluation {
  return {
    signalId: String(row.signal_id),
    evaluatedAt: String(row.evaluated_at),
    finalResult: row.final_result as SignalResult,
    mfe: row.mfe !== null && row.mfe !== undefined ? Number(row.mfe) : null,
    mae: row.mae !== null && row.mae !== undefined ? Number(row.mae) : null,
    realizedReturnPercent: row.realized_return_pct !== null && row.realized_return_pct !== undefined ? Number(row.realized_return_pct) : null,
    realizedR: row.realized_r !== null && row.realized_r !== undefined ? Number(row.realized_r) : null,
    grossPnlUsdt: row.gross_pnl_usdt !== null && row.gross_pnl_usdt !== undefined ? Number(row.gross_pnl_usdt) : null,
    netPnlUsdt: row.net_pnl_usdt !== null && row.net_pnl_usdt !== undefined ? Number(row.net_pnl_usdt) : null,
    feesUsdt: row.fees_usdt !== null && row.fees_usdt !== undefined ? Number(row.fees_usdt) : null,
    slippageUsdt: row.slippage_usdt !== null && row.slippage_usdt !== undefined ? Number(row.slippage_usdt) : null,
    timeToEvent: {
      timeToEntryMs: row.time_to_entry_ms !== null && row.time_to_entry_ms !== undefined ? Number(row.time_to_entry_ms) : null,
      timeToDca1Ms: row.time_to_dca1_ms !== null && row.time_to_dca1_ms !== undefined ? Number(row.time_to_dca1_ms) : null,
      timeToDca2Ms: row.time_to_dca2_ms !== null && row.time_to_dca2_ms !== undefined ? Number(row.time_to_dca2_ms) : null,
      timeToTp1Ms: row.time_to_tp1_ms !== null && row.time_to_tp1_ms !== undefined ? Number(row.time_to_tp1_ms) : null,
      timeToTp2Ms: row.time_to_tp2_ms !== null && row.time_to_tp2_ms !== undefined ? Number(row.time_to_tp2_ms) : null,
      timeToTp3Ms: row.time_to_tp3_ms !== null && row.time_to_tp3_ms !== undefined ? Number(row.time_to_tp3_ms) : null,
      timeToSlMs: row.time_to_sl_ms !== null && row.time_to_sl_ms !== undefined ? Number(row.time_to_sl_ms) : null,
      timeToExpiryMs: row.time_to_expiry_ms !== null && row.time_to_expiry_ms !== undefined ? Number(row.time_to_expiry_ms) : null,
    },
    slFailurePrimaryCause: (row.sl_failure_primary_cause as SignalEvaluation['slFailurePrimaryCause']) ?? null,
    slFailureSecondaryCauses: (row.sl_failure_secondary_causes as SignalEvaluation['slFailureSecondaryCauses']) ?? [],
    stopTightnessLabel: (row.stop_tightness_label as SignalEvaluation['stopTightnessLabel']) ?? null,
    counterfactualNote: row.counterfactual_note ? String(row.counterfactual_note) : null,
    evaluationText: row.evaluation_text ? String(row.evaluation_text) : '',
  };
}

export function mapSnapshotToDbRow(snap: MarketSnapshot): Record<string, unknown> {
  return {
    symbol: snap.symbol,
    price: snap.price,
    volume_24h: snap.volume24h,
    liquidity: snap.liquidity,
    spread: snap.spread,
    market_regime: snap.marketRegime,
    indicators: snap.indicators ?? {},
    timestamp: snap.timestamp,
  };
}

export function mapDbRowToSnapshot(row: Record<string, unknown>): MarketSnapshot {
  return {
    id: row.id ? String(row.id) : undefined,
    symbol: String(row.symbol),
    price: Number(row.price ?? 0),
    volume24h: Number(row.volume_24h ?? 0),
    liquidity: Number(row.liquidity ?? 0),
    spread: Number(row.spread ?? 0),
    marketRegime: (row.market_regime as MarketSnapshot['marketRegime']) ?? 'NEUTRAL',
    indicators: (row.indicators as Record<string, unknown>) ?? {},
    timestamp: String(row.timestamp),
  };
}

// ── Public Service Functions ──────────────────────────────────────────

/**
 * Returns current persistence storage backend status
 */
export function getStorageStatus(): { configured: boolean; source: StorageSource; details: string } {
  const configured = isSupabaseConfigured();
  return {
    configured,
    source: configured ? 'supabase' : 'local_memory',
    details: configured
      ? 'Supabase Free Tier (Active)'
      : 'In-Memory Store (Supabase credentials not configured in .env.local)',
  };
}

/**
 * Save or update a single signal record
 */
export async function saveSignal(
  signal: Signal | SignalHistoryRecord
): Promise<{ success: boolean; source: StorageSource; error?: string }> {
  // Never persist non-tradeable signals (NO_TRADE, AVOID) unless it's an existing record being updated
  if ('status' in signal && (signal.status === 'NO_TRADE' || signal.status === 'AVOID') && !('actualEntry' in signal)) {
    return { success: true, source: 'local_memory' };
  }

  // Phase A Safety Rule: Synthetic or test fixture signals must never be persisted as actionable BUY_NOW signals
  if ('isSynthetic' in signal && signal.isSynthetic && 'status' in signal && signal.status === 'BUY_NOW') {
    console.warn(`[Signal Store Security] Blocked persistence of synthetic BUY_NOW signal for ${signal.symbol}.`);
    return { success: false, source: 'local_memory', error: 'Synthetic BUY_NOW signals cannot be persisted to database.' };
  }

  // Always update in-memory cache
  memoryStore.saveSignal(signal);

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, source: 'local_memory' };
  }

  try {
    const row = mapSignalToDbRow(signal);
    const { error } = await client.from('signals').upsert(row, {
      onConflict: 'signal_id',
    });

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase upsert error:', error.message);
      return { success: false, source: 'supabase', error: error.message };
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to save signal to Supabase:', msg);
    return { success: false, source: 'supabase', error: msg };
  }
}

/**
 * Batch save generated signals
 */
export async function saveSignals(
  signals: Signal[]
): Promise<{ success: boolean; count: number; source: StorageSource; error?: string }> {
  // Only persist actionable signals; reject NO_TRADE, AVOID, and synthetic evaluations from filling the database
  const actionable = signals.filter(
    (s) => s.status !== 'NO_TRADE' && s.status !== 'AVOID' && !s.isSynthetic && s.dataProvenance !== 'SYNTHETIC_OFFLINE'
  );
  if (actionable.length === 0) {
    return { success: true, count: 0, source: 'local_memory' };
  }

  // Update in-memory cache
  for (const s of actionable) {
    memoryStore.saveSignal(s);
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, count: actionable.length, source: 'local_memory' };
  }

  try {
    // Deduplicate by signalId to avoid PostgreSQL 'ON CONFLICT DO UPDATE cannot affect row a second time'
    const uniqueMap = new Map<string, Signal>();
    for (const s of actionable) {
      uniqueMap.set(s.signalId, s);
    }
    const uniqueSignals = Array.from(uniqueMap.values());
    const rows = uniqueSignals.map(mapSignalToDbRow);

    const { error } = await client.from('signals').upsert(rows, {
      onConflict: 'signal_id',
    });

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase batch upsert error:', error.message);
      return { success: false, count: 0, source: 'supabase', error: error.message };
    }

    return { success: true, count: uniqueSignals.length, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to batch save signals:', msg);
    return { success: false, count: 0, source: 'supabase', error: msg };
  }
}

/**
 * Query signals with filtering, pagination, and sorting
 */
export async function getSignals(
  filters: SignalQueryFilters = {}
): Promise<{ records: SignalHistoryRecord[]; total: number; source: StorageSource }> {
  const client = getSupabaseClient();

  if (client) {
    try {
      let query = client.from('signals').select('*', { count: 'exact' });

      if (filters.direction && filters.direction !== 'ALL') {
        query = query.eq('direction', filters.direction);
      }
      if (filters.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }
      if (filters.confidence && filters.confidence !== 'ALL') {
        query = query.eq('confidence', filters.confidence);
      }
      if (filters.regime && filters.regime !== 'ALL') {
        query = query.eq('market_regime', filters.regime);
      }
      if (filters.strategyVersion) {
        query = query.eq('strategy_version', filters.strategyVersion);
      }
      if (filters.symbol) {
        query = query.ilike('symbol', `%${filters.symbol}%`);
      }
      if (filters.minScore !== undefined && !isNaN(filters.minScore)) {
        query = query.gte('trade_score', filters.minScore);
      }
      if (filters.since) {
        query = query.gte('created_at', filters.since);
      }
      if (filters.until) {
        query = query.lte('created_at', filters.until);
      }
      if (filters.result && filters.result !== 'ALL') {
        if (filters.result === 'TP') {
          query = query.or('final_result.ilike.TP%,final_result.eq.FULL_TP,final_result.eq.PARTIAL_TP_THEN_SL');
        } else if (filters.result === 'SL') {
          query = query.eq('final_result', 'SL');
        } else if (filters.result === 'EXPIRED') {
          query = query.eq('final_result', 'EXPIRED');
        } else {
          query = query.eq('final_result', filters.result);
        }
      }

      if (filters.onlyEntryTriggered) {
        query = query.or('actual_entry.gt.0,lifecycle.in.("ENTRY_TRIGGERED","ACTIVE","DCA1_TRIGGERED","DCA2_TRIGGERED","TP1_HIT","TP2_HIT","TP3_HIT","SL_HIT"),final_result.in.("TP1_ONLY","TP2_REACHED","TP3_REACHED","FULL_TP","PARTIAL_TP_THEN_SL","SL","MANUAL_EXIT")');
      }

      // Order by created_at descending
      query = query.order('created_at', { ascending: false });

      const page = Math.max(1, filters.page ?? 1);
      const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data, count, error } = await query;

      if (!error && data) {
        let records = data.map((r) => mapDbRowToSignalRecord(r as Record<string, unknown>));
        if (filters.onlyEntryTriggered) {
          records = records.filter(isEntryTriggered);
        }
        return {
          records,
          total: count ?? records.length,
          source: 'supabase',
        };
      }
      console.warn('[/lib/services/signal-store] Supabase getSignals error, falling back to memory:', error?.message);
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getSignals query failed, falling back:', err);
    }
  }

  // Fallback: in-memory store
  let all = memoryStore.getAllSignals();

  if (filters.direction && filters.direction !== 'ALL') {
    all = all.filter((s) => s.direction === filters.direction);
  }
  if (filters.status && filters.status !== 'ALL') {
    all = all.filter((s) => s.status === filters.status);
  }
  if (filters.confidence && filters.confidence !== 'ALL') {
    all = all.filter((s) => s.confidence === filters.confidence);
  }
  if (filters.regime && filters.regime !== 'ALL') {
    all = all.filter((s) => s.marketRegime === filters.regime);
  }
  if (filters.strategyVersion) {
    all = all.filter((s) => s.strategyVersion === filters.strategyVersion);
  }
  if (filters.symbol) {
    const sym = filters.symbol.toLowerCase();
    all = all.filter((s) => s.symbol.toLowerCase().includes(sym));
  }
  if (filters.minScore !== undefined && !isNaN(filters.minScore)) {
    all = all.filter((s) => s.tradeScore >= filters.minScore!);
  }
  if (filters.since) {
    const ms = new Date(filters.since).getTime();
    if (!isNaN(ms)) all = all.filter((s) => new Date(s.createdAt).getTime() >= ms);
  }
  if (filters.until) {
    const ms = new Date(filters.until).getTime();
    if (!isNaN(ms)) all = all.filter((s) => new Date(s.createdAt).getTime() <= ms);
  }
  if (filters.result && filters.result !== 'ALL') {
    if (filters.result === 'TP') {
      all = all.filter((s) => s.finalResult?.startsWith('TP') || s.finalResult === 'FULL_TP' || s.finalResult === 'PARTIAL_TP_THEN_SL');
    } else if (filters.result === 'SL') {
      all = all.filter((s) => s.finalResult === 'SL');
    } else if (filters.result === 'EXPIRED') {
      all = all.filter((s) => s.finalResult === 'EXPIRED');
    } else {
      all = all.filter((s) => s.finalResult === filters.result);
    }
  }

  if (filters.onlyEntryTriggered) {
    all = all.filter(isEntryTriggered);
  }

  // Sort newest first
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
  const from = (page - 1) * limit;
  const paginated = all.slice(from, from + limit);

  return {
    records: paginated,
    total: all.length,
    source: 'local_memory',
  };
}

/**
 * Retrieve a single signal by ID
 */
export async function getSignalById(signalId: string): Promise<SignalHistoryRecord | null> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('signals')
        .select('*')
        .eq('signal_id', signalId)
        .maybeSingle();

      if (!error && data) {
        return mapDbRowToSignalRecord(data as Record<string, unknown>);
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getSignalById failed:', err);
    }
  }

  return memoryStore.getSignal(signalId);
}

/**
 * Active lifecycle states where a position or setup is currently alive
 */
export const ACTIVE_LIFECYCLES = [
  'CREATED',
  'ENTRY_TRIGGERED',
  'ACTIVE',
  'DCA1_TRIGGERED',
  'DCA2_TRIGGERED',
  'TP1_HIT',
  'TP2_HIT',
] as const;

/**
 * Checks whether an active signal currently exists for a given symbol
 */
export async function getActiveSignalBySymbol(
  symbol: string
): Promise<SignalHistoryRecord | null> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('signals')
        .select('*')
        .eq('symbol', symbol)
        .in('lifecycle', ACTIVE_LIFECYCLES as unknown as string[])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return mapDbRowToSignalRecord(data as Record<string, unknown>);
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getActiveSignalBySymbol failed:', err);
    }
  }

  // Fallback to memory store
  const all = memoryStore.getAllSignals();
  const active = all.find(
    (s) => s.symbol === symbol && (ACTIVE_LIFECYCLES as readonly string[]).includes(s.lifecycle)
  );
  return active || null;
}

/**
 * Convenience boolean check if a coin pair currently has an active trade or pending setup
 */
export async function hasActiveSignal(symbol: string): Promise<boolean> {
  const active = await getActiveSignalBySymbol(symbol);
  return active !== null;
}

/**
 * Permanently delete signals by IDs (used for deduplication cleanup)
 */
export async function deleteSignals(
  signalIds: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (signalIds.length === 0) return { success: true, count: 0 };

  for (const id of signalIds) {
    memoryStore.deleteSignal(id);
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.from('signals').delete().in('signal_id', signalIds);
      if (error) {
        console.warn('[/lib/services/signal-store] Supabase deleteSignals error:', error.message);
        return { success: false, count: 0, error: error.message };
      }
      return { success: true, count: signalIds.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, count: 0, error: msg };
    }
  }

  return { success: true, count: signalIds.length };
}

/**
 * Save a discrete lifecycle event (CREATED, ENTRY, DCA1, TP1, SL, etc.)
 */
export async function saveSignalEvent(
  event: SignalLifecycleEvent
): Promise<{ success: boolean; source: StorageSource; error?: string }> {
  memoryStore.saveEvent(event);

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, source: 'local_memory' };
  }

  try {
    const row = mapEventToDbRow(event);
    const { error } = await client.from('signal_events').upsert(row, {
      onConflict: 'event_id',
    });

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase saveSignalEvent error:', error.message);
      return { success: false, source: 'supabase', error: error.message };
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to save signal event:', msg);
    return { success: false, source: 'supabase', error: msg };
  }
}

/**
 * Delete all lifecycle events for a specific signal (used for re-audits)
 */
export async function deleteSignalEvents(
  signalId: string
): Promise<{ success: boolean; error?: string }> {
  memoryStore.deleteEvents(signalId);

  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.from('signal_events').delete().eq('signal_id', signalId);
      if (error) {
        console.warn('[/lib/services/signal-store] Supabase deleteSignalEvents error:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  return { success: true };
}

/**
 * Get all lifecycle events for a specific signal
 */
export async function getSignalEvents(signalId: string): Promise<SignalLifecycleEvent[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('signal_events')
        .select('*')
        .eq('signal_id', signalId)
        .order('timestamp', { ascending: true });

      if (!error && data) {
        return data.map((r) => mapDbRowToEvent(r as Record<string, unknown>));
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getSignalEvents error:', err);
    }
  }

  return memoryStore.getEvents(signalId);
}

/**
 * Save post-trade signal evaluation
 */
export async function saveSignalEvaluation(
  evaluation: SignalEvaluation
): Promise<{ success: boolean; source: StorageSource; error?: string }> {
  memoryStore.saveEvaluation(evaluation);

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, source: 'local_memory' };
  }

  try {
    const row = mapEvaluationToDbRow(evaluation);
    const { error } = await client.from('signal_evaluations').upsert(row, {
      onConflict: 'signal_id',
    });

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase saveSignalEvaluation error:', error.message);
      return { success: false, source: 'supabase', error: error.message };
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to save signal evaluation:', msg);
    return { success: false, source: 'supabase', error: msg };
  }
}

/**
 * Get post-trade evaluation for a signal
 */
export async function getSignalEvaluation(signalId: string): Promise<SignalEvaluation | null> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('signal_evaluations')
        .select('*')
        .eq('signal_id', signalId)
        .maybeSingle();

      if (!error && data) {
        return mapDbRowToEvaluation(data as Record<string, unknown>);
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getSignalEvaluation error:', err);
    }
  }

  return memoryStore.getEvaluation(signalId);
}

/**
 * Get all post-trade evaluations
 */
export async function getAllSignalEvaluations(): Promise<SignalEvaluation[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('signal_evaluations')
        .select('*');

      if (!error && data) {
        return data.map((d) => mapDbRowToEvaluation(d as Record<string, unknown>));
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getAllSignalEvaluations error:', err);
    }
  }

  return memoryStore.getAllEvaluations();
}

/**
 * Save market snapshot at time of evaluation
 */
export async function saveMarketSnapshot(
  snapshot: MarketSnapshot
): Promise<{ success: boolean; source: StorageSource; error?: string }> {
  memoryStore.saveSnapshot(snapshot);

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, source: 'local_memory' };
  }

  try {
    const row = mapSnapshotToDbRow(snapshot);
    const { error } = await client.from('market_snapshots').insert(row);

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase saveMarketSnapshot error:', error.message);
      return { success: false, source: 'supabase', error: error.message };
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to save market snapshot:', msg);
    return { success: false, source: 'supabase', error: msg };
  }
}

/**
 * Retrieve latest market snapshots
 */
export async function getLatestMarketSnapshots(limit = 50): Promise<MarketSnapshot[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('market_snapshots')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data.map((r) => mapDbRowToSnapshot(r as Record<string, unknown>));
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getLatestMarketSnapshots error:', err);
    }
  }

  return memoryStore.getSnapshots(limit);
}

/**
 * Get strategy versions
 */
export async function getStrategyVersions(): Promise<StrategyVersionRecord[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('strategy_versions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((r) => ({
          id: String(r.id),
          version: String(r.version),
          createdAt: String(r.created_at),
          description: String(r.description),
          parameters: (r.parameters as Record<string, unknown>) ?? {},
          weights: (r.weights as StrategyVersionRecord['weights']) ?? {
            trend: 20,
            momentum: 15,
            volume: 15,
            structure: 20,
            liquidity: 15,
            volatility: 10,
            regime: 5,
          },
          isActive: Boolean(r.is_active),
        }));
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getStrategyVersions error:', err);
    }
  }

  return memoryStore.getStrategyVersions();
}

/**
 * Save strategy version
 */
export async function saveStrategyVersion(
  versionRecord: StrategyVersionRecord
): Promise<{ success: boolean; source: StorageSource; error?: string }> {
  memoryStore.saveStrategyVersion(versionRecord);

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, source: 'local_memory' };
  }

  try {
    const { error } = await client.from('strategy_versions').upsert(
      {
        version: versionRecord.version,
        description: versionRecord.description,
        parameters: versionRecord.parameters,
        weights: versionRecord.weights,
        is_active: versionRecord.isActive ?? true,
      },
      { onConflict: 'version' }
    );

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase saveStrategyVersion error:', error.message);
      return { success: false, source: 'supabase', error: error.message };
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to save strategy version:', msg);
    return { success: false, source: 'supabase', error: msg };
  }
}

/**
 * Get strategy parameters
 */
export async function getStrategyParameters(
  version?: string
): Promise<StrategyParameterRecord[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      let query = client.from('strategy_parameters').select('*');
      if (version) {
        query = query.eq('strategy_version', version);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map((r) => ({
          id: String(r.id),
          strategyVersion: String(r.strategy_version),
          parameterKey: String(r.parameter_key),
          parameterValue: r.parameter_value as string | number | boolean,
          category: r.category as StrategyParameterRecord['category'],
          description: String(r.description ?? ''),
          minValue: r.min_value !== null ? Number(r.min_value) : undefined,
          maxValue: r.max_value !== null ? Number(r.max_value) : undefined,
          defaultValue: r.default_value as string | number | boolean,
        }));
      }
    } catch (err) {
      console.warn('[/lib/services/signal-store] Supabase getStrategyParameters error:', err);
    }
  }

  return memoryStore.getStrategyParameters(version);
}

/**
 * Save strategy parameter
 */
export async function saveStrategyParameter(
  param: StrategyParameterRecord
): Promise<{ success: boolean; source: StorageSource; error?: string }> {
  memoryStore.saveStrategyParameter(param);

  const client = getSupabaseClient();
  if (!client) {
    return { success: true, source: 'local_memory' };
  }

  try {
    const { error } = await client.from('strategy_parameters').upsert(
      {
        strategy_version: param.strategyVersion,
        parameter_key: param.parameterKey,
        parameter_value: String(param.parameterValue),
        category: param.category,
        description: param.description,
        min_value: param.minValue ?? null,
        max_value: param.maxValue ?? null,
        default_value: String(param.defaultValue),
      },
      { onConflict: 'strategy_version,parameter_key' }
    );

    if (error) {
      console.warn('[/lib/services/signal-store] Supabase saveStrategyParameter error:', error.message);
      return { success: false, source: 'supabase', error: error.message };
    }

    return { success: true, source: 'supabase' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[/lib/services/signal-store] Failed to save strategy parameter:', msg);
    return { success: false, source: 'supabase', error: msg };
  }
}
