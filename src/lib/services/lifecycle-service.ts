// ─── U-SPOT Signal Lifecycle Tracking Engine ───────────────────────────
// Phase 9: Signal Lifecycle Tracking
// Spec Sections: 15 (Signal Lifecycle), 17 (TP/SL Determination), 18 (Result Types)
// Monitors price action, detects entries, DCAs, TPs, SLs, invalidations, and expiry

import {
  getSignals,
  saveSignal,
  saveSignalEvent,
  saveSignalEvaluation,
  deleteSignals,
  deleteSignalEvents,
} from './signal-store.ts';
import { fetchAllTickers24h, fetchKlines } from './binance-service.ts';
import { evaluateSignalOutcome } from './evaluation-service.ts';
import { dispatchTelegramAlert } from './telegram-service.ts';
import type {
  SignalHistoryRecord,
  SignalLifecycle,
  SignalLifecycleEvent,
  LifecycleTransition,
  LifecycleEvaluationSummary,
  SignalEvaluation,
  SignalResult,
  TelegramAlertPayload,
} from '../../types/index.ts';

/**
 * Calculates current volume-weighted average entry price and total coins
 */
export function calculatePositionAverage(signal: SignalHistoryRecord): {
  averageEntryPrice: number;
  totalDeployedUsdt: number;
  totalCoins: number;
} {
  const entryPrice = signal.actualEntry || signal.preferredEntry;
  let totalCoins = signal.initialAllocation / entryPrice;
  let totalDeployed = signal.initialAllocation;

  if (signal.dca1Hit && signal.dca1 > 0 && signal.dca1Allocation > 0) {
    totalCoins += signal.dca1Allocation / signal.dca1;
    totalDeployed += signal.dca1Allocation;
  }

  if (signal.dca2Hit && signal.dca2 > 0 && signal.dca2Allocation > 0) {
    totalCoins += signal.dca2Allocation / signal.dca2;
    totalDeployed += signal.dca2Allocation;
  }

  return {
    averageEntryPrice: totalCoins > 0 ? totalDeployed / totalCoins : entryPrice,
    totalDeployedUsdt: totalDeployed,
    totalCoins,
  };
}

/**
 * Evaluates a single price step / candle for a signal and determines transitions
 */
export function evaluateSignalLifecycleStep(
  signal: SignalHistoryRecord,
  tick: {
    price: number;
    high?: number;
    low?: number;
    timestamp?: string;
  }
): {
  updatedSignal: SignalHistoryRecord;
  events: SignalLifecycleEvent[];
  transitions: LifecycleTransition[];
} {
  const nowStr = tick.timestamp || new Date().toISOString();
  const currentPrice = tick.price;
  const candleHigh = tick.high ?? currentPrice;
  const candleLow = tick.low ?? currentPrice;

  // Clone signal to prevent side effects
  const updated: SignalHistoryRecord = { ...signal };
  const events: SignalLifecycleEvent[] = [];
  const transitions: LifecycleTransition[] = [];

  // Terminal signals cannot transition any further
  if (updated.lifecycle === 'CLOSED') {
    return { updatedSignal: updated, events, transitions };
  }

  const addEventAndTransition = (
    eventType: SignalLifecycleEvent['eventType'],
    newLifecycle: SignalLifecycle,
    price: number,
    message: string,
    metadata: Record<string, unknown> = {}
  ) => {
    const event: SignalLifecycleEvent = {
      eventId: `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      signalId: signal.signalId,
      eventType,
      timestamp: nowStr,
      price,
      metadata,
    };
    events.push(event);

    transitions.push({
      signalId: signal.signalId,
      symbol: signal.symbol,
      previousLifecycle: updated.lifecycle,
      newLifecycle,
      event,
      currentPrice: price,
      message,
    });

    updated.lifecycle = newLifecycle;
  };

  // ── 1. PRE-ENTRY STATE: Signal is CREATED / WAITING FOR CONFIRMATION
  if (updated.lifecycle === 'CREATED') {
    // A. Expiry Check (Spec Section 12 & 15)
    if (new Date(nowStr).getTime() >= new Date(signal.expiresAt).getTime()) {
      updated.finalResult = 'EXPIRED';
      updated.status = 'NO_TRADE';
      updated.evaluationText = 'Signal expired after 4 hours without reaching entry zone.';
      addEventAndTransition(
        'EXPIRED',
        'CLOSED',
        currentPrice,
        `Signal ${signal.signalId} expired without reaching entry.`
      );
      return { updatedSignal: updated, events, transitions };
    }

    // B. Structural Invalidation Before Entry (Spec Section 12)
    // If price drops below stop loss or breaks down before entry triggered
    if (candleLow <= signal.stopLoss) {
      updated.finalResult = 'INVALIDATED_BEFORE_ENTRY';
      updated.status = 'AVOID';
      updated.realizedR = 0;
      updated.realizedReturn = 0;
      updated.evaluationText = `Setup invalidated: price broke below stop loss ($${signal.stopLoss}) before entry zone was confirmed.`;
      addEventAndTransition(
        'INVALIDATED',
        'CLOSED',
        currentPrice,
        `Setup invalidated below $${signal.stopLoss} before entry.`
      );
      return { updatedSignal: updated, events, transitions };
    }

    // B2. Take Profit Reached Before Entry (Target Runaway Invalidation)
    // If price rallies to or above TP1 before entry is triggered, the setup missed the entry and ran away to target.
    // In spot trading, a pending buy limit is canceled/invalidated rather than chasing an already reached target.
    if (candleHigh >= signal.tp1) {
      updated.finalResult = 'INVALIDATED_BEFORE_ENTRY';
      updated.status = 'AVOID';
      updated.realizedR = 0;
      updated.realizedReturn = 0;
      updated.evaluationText = `Setup invalidated: price reached TP1 ($${signal.tp1}) before entry zone was filled (missed move).`;
      addEventAndTransition(
        'INVALIDATED',
        'CLOSED',
        currentPrice,
        `Setup invalidated: price reached TP1 ($${signal.tp1}) before entry fill.`
      );
      return { updatedSignal: updated, events, transitions };
    }

    // C. Entry Trigger Check (Spec Section 11)
    // In a spot long trade, entry zone high must be strictly below TP1
    const effectiveEntryHigh = Math.min(signal.entryZone.high, signal.tp1 * 0.99);
    const inEntryZone =
      candleLow <= effectiveEntryHigh && candleHigh >= signal.entryZone.low;
    const crossedPreferred =
      signal.preferredEntry < signal.tp1 &&
      candleLow <= signal.preferredEntry && candleHigh >= signal.preferredEntry;

    if (inEntryZone || crossedPreferred) {
      const entryFillPrice = Math.min(effectiveEntryHigh, Math.max(signal.entryZone.low, currentPrice));
      if (entryFillPrice >= signal.tp1) {
        // Price already at or above TP1, entry cannot fill
        return { updatedSignal: updated, events, transitions };
      }
      updated.actualEntry = entryFillPrice;
      updated.status = 'BUY_NOW';
      updated.mfe = 0;
      updated.mae = 0;

      addEventAndTransition(
        'ENTRY',
        'ACTIVE',
        entryFillPrice,
        `Entry filled at $${entryFillPrice.toFixed(4)} in entry zone [$${signal.entryZone.low}, $${effectiveEntryHigh.toFixed(4)}].`,
        {
          filledPrice: entryFillPrice,
          allocationUsdt: signal.initialAllocation,
          entryType: inEntryZone ? 'ZONE_FILL' : 'PREFERRED_TOUCH',
        }
      );
      return { updatedSignal: updated, events, transitions };
    }

    // If entry did not trigger on this step, return current state
    return { updatedSignal: updated, events, transitions };
  }

  // ── 2. ACTIVE POSITION STATE: Tracking DCA, Stop Loss, Take Profits & Excursions
  if (
    updated.lifecycle === 'ACTIVE' ||
    updated.lifecycle === 'ENTRY_TRIGGERED' ||
    updated.lifecycle === 'DCA1_TRIGGERED' ||
    updated.lifecycle === 'DCA2_TRIGGERED' ||
    updated.lifecycle === 'TP1_HIT' ||
    updated.lifecycle === 'TP2_HIT'
  ) {
    const { averageEntryPrice } = calculatePositionAverage(updated);

    // Track MFE / MAE excursions (Spec Section 16 & 20)
    const favorable = ((candleHigh - averageEntryPrice) / averageEntryPrice) * 100;
    const adverse = ((averageEntryPrice - candleLow) / averageEntryPrice) * 100;
    updated.mfe = Math.max(updated.mfe ?? 0, Math.max(0, favorable));
    updated.mae = Math.max(updated.mae ?? 0, Math.max(0, adverse));

    // A. Indeterminate Conflict Check (Spec Section 17)
    // If a single candle touches BOTH Stop Loss and TP1, order is ambiguous without sub-ticks
    if (candleLow <= signal.stopLoss && candleHigh >= signal.tp1) {
      updated.finalResult = 'INDETERMINATE';
      updated.evaluationText = `Indeterminate outcome: single candle spanned between SL ($${signal.stopLoss}) and TP1 ($${signal.tp1}).`;
      addEventAndTransition(
        'INDETERMINATE',
        'CLOSED',
        currentPrice,
        `Candle spanned across both SL and TP1; flagged as INDETERMINATE per Spec Section 17.`,
        { candleLow, candleHigh, stopLoss: signal.stopLoss, tp1: signal.tp1 }
      );
      return { updatedSignal: updated, events, transitions };
    }

    // Stop Loss Ratchet & Trailing Stop Rules (Spec Section 13, 26, Phase 24 & Phase 26):
    // 1. Once TP1 is hit: Stop Loss moves to Breakeven (averageEntryPrice), and dynamically trails if price advances >= 1.25R
    // 2. Once TP2 is hit: Stop Loss ratchets to at least TP1, and dynamically trails candle highs
    const isTp1AlreadyHit =
      updated.lifecycle === 'TP1_HIT' ||
      updated.finalResult === 'TP1_ONLY' ||
      updated.lifecycle === 'TP2_HIT' ||
      updated.finalResult === 'TP2_REACHED';

    const isTp2AlreadyHit =
      updated.lifecycle === 'TP2_HIT' ||
      updated.finalResult === 'TP2_REACHED';

    let effectiveStopLoss = signal.stopLoss;
    if (isTp2AlreadyHit) {
      effectiveStopLoss = updated.trailingStopPrice ?? Math.max(averageEntryPrice, signal.tp1);
    } else if (isTp1AlreadyHit) {
      effectiveStopLoss = updated.trailingStopPrice
        ? Math.max(averageEntryPrice, updated.trailingStopPrice)
        : Math.max(signal.stopLoss, averageEntryPrice);
    }

    // B. Stop Loss / Breakeven / Trailing Stop Hit Check (Spec Section 12, 13, Phase 24 & Phase 26)
    if (candleLow <= effectiveStopLoss) {
      const isPartial = isTp1AlreadyHit;
      const isTp2Partial = isTp2AlreadyHit;
      updated.finalResult = isTp2Partial
        ? 'TP2_REACHED'
        : isPartial
        ? (effectiveStopLoss > averageEntryPrice ? 'TP1_ONLY' : 'PARTIAL_TP_THEN_SL')
        : 'SL';

      const unitRisk = Math.max(0.000001, Math.abs(averageEntryPrice - signal.stopLoss));
      if (isTp2Partial) {
        // Phase 24 Trailing Stop Exit: 30% secured at TP1, 30% secured at TP2, 40% closed at trailingStopPrice >= TP1
        const tp1Gain = signal.tp1 - averageEntryPrice;
        const tp2Gain = signal.tp2 - averageEntryPrice;
        const trailGain = effectiveStopLoss - averageEntryPrice;
        const blendedGain = 0.30 * tp1Gain + 0.30 * tp2Gain + 0.40 * trailGain;
        updated.realizedR = Number((blendedGain / unitRisk).toFixed(2));
        const blendedGainPct = (blendedGain / averageEntryPrice) * 100;
        updated.realizedReturn = Number(blendedGainPct.toFixed(2));
        updated.evaluationText = `Secured TP1 and TP2 profit. Remaining 40% closed via Trailing Stop at $${effectiveStopLoss.toFixed(4)} (+${updated.realizedR}R). Position closed in profit. Outcome: TP2 HIT.`;
      } else if (isPartial) {
        // Partial win: 30% secured at TP1, remaining 70% closed at effectiveStopLoss (Breakeven/SL or Trailing Stop)
        const tp1Gain = signal.tp1 - averageEntryPrice;
        const slGain = effectiveStopLoss - averageEntryPrice;
        const blendedGain = 0.30 * tp1Gain + 0.70 * slGain;
        updated.realizedR = Number((blendedGain / unitRisk).toFixed(2));
        const blendedGainPct = (blendedGain / averageEntryPrice) * 100;
        updated.realizedReturn = Number(blendedGainPct.toFixed(2));
        if (effectiveStopLoss > averageEntryPrice) {
          updated.evaluationText = `Secured TP1 profit. Remaining 70% closed via Trailing Stop at $${effectiveStopLoss.toFixed(4)} (+${updated.realizedR}R). Position closed in profit. Outcome: TP1 HIT.`;
        } else {
          updated.evaluationText = `Secured TP1 profit (+${updated.realizedReturn}%). Remaining position closed at Breakeven ($${effectiveStopLoss.toFixed(4)}). Outcome: TP HIT.`;
        }
      } else {
        updated.realizedR = -1.0;
        updated.realizedReturn = Number((-((averageEntryPrice - signal.stopLoss) / averageEntryPrice) * 100).toFixed(2));
        updated.evaluationText = `Stop Loss triggered at $${signal.stopLoss}. Position fully liquidated.`;
      }

      const isTrailingStopWin = isTp2Partial || (isPartial && effectiveStopLoss > averageEntryPrice);

      addEventAndTransition(
        'SL',
        'CLOSED',
        effectiveStopLoss,
        isTp2Partial
          ? `Trailing stop triggered at $${effectiveStopLoss.toFixed(4)} after TP2 (+${updated.realizedR}R). Position closed.`
          : isPartial && effectiveStopLoss > averageEntryPrice
          ? `Trailing stop triggered at $${effectiveStopLoss.toFixed(4)} after TP1 (+${updated.realizedR}R). Position closed.`
          : isPartial
          ? `Stop / Breakeven reached at $${effectiveStopLoss.toFixed(4)} after TP1. Position closed.`
          : `Stop Loss hit at $${signal.stopLoss}. Position closed.`,
        {
          lossPrice: effectiveStopLoss,
          trailingStopPrice: (isTp2Partial || effectiveStopLoss > averageEntryPrice) ? effectiveStopLoss : undefined,
          averageEntry: averageEntryPrice,
          isPartialWin: isPartial,
          isTrailingStopWin,
          realizedR: updated.realizedR,
        }
      );
      return { updatedSignal: updated, events, transitions };
    }

    // C. DCA #1 Trigger Check (Spec Section 14)
    // Only active prior to TP1 hit
    if (!isTp1AlreadyHit && !updated.dca1Hit && signal.dca1 > 0 && candleLow <= signal.dca1 && candleLow > signal.stopLoss) {
      updated.dca1Hit = true;
      addEventAndTransition(
        'DCA1',
        'DCA1_TRIGGERED',
        signal.dca1,
        `DCA #1 triggered at $${signal.dca1}. Added $${signal.dca1Allocation} USDT to position.`,
        {
          dcaLevel: 1,
          trancheAllocationUsdt: signal.dca1Allocation,
        }
      );
    }

    // D. DCA #2 Trigger Check (Spec Section 14)
    // Only active prior to TP1 hit
    if (
      !isTp1AlreadyHit &&
      updated.dca1Hit &&
      !updated.dca2Hit &&
      signal.dca2 > 0 &&
      candleLow <= signal.dca2 &&
      candleLow > signal.stopLoss
    ) {
      updated.dca2Hit = true;
      addEventAndTransition(
        'DCA2',
        'DCA2_TRIGGERED',
        signal.dca2,
        `DCA #2 triggered at $${signal.dca2}. Added $${signal.dca2Allocation} USDT to position.`,
        {
          dcaLevel: 2,
          trancheAllocationUsdt: signal.dca2Allocation,
        }
      );
    }

    // Recalculate average entry price if DCA occurred
    const postDcaAvg = calculatePositionAverage(updated).averageEntryPrice;

    // E. Take Profit 1 Check (30% scale-out per Spec Section 13)
    if (
      candleHigh >= signal.tp1 &&
      signal.tp1 > postDcaAvg &&
      updated.finalResult !== 'TP1_ONLY' &&
      updated.finalResult !== 'TP2_REACHED' &&
      updated.finalResult !== 'FULL_TP' &&
      updated.finalResult !== 'PARTIAL_TP_THEN_SL' &&
      updated.finalResult !== 'SL'
    ) {
      updated.finalResult = 'TP1_ONLY';
      const gainPct = ((signal.tp1 - postDcaAvg) / postDcaAvg) * 100;
      const initialR = Math.abs(postDcaAvg - signal.stopLoss);
      updated.realizedR = initialR > 0 ? Number(((signal.tp1 - postDcaAvg) / initialR * 0.3).toFixed(2)) : 0.6;

      addEventAndTransition(
        'TP1',
        'TP1_HIT',
        signal.tp1,
        `TP1 hit at $${signal.tp1} (+${gainPct.toFixed(2)}%). Scaled out 30% of position. Stop loss moved to Breakeven.`,
        {
          tpLevel: 1,
          scaledOutRatio: 0.3,
          gainPercent: gainPct,
          breakevenStop: postDcaAvg,
        }
      );
    }

    // F. Take Profit 2 Check (Additional 30% scale-out per Spec Section 13)
    // STRICT RULE: Can only trigger if TP1 was hit AND position has NOT been closed/stopped out!
    if (
      candleHigh >= signal.tp2 &&
      signal.tp2 > postDcaAvg &&
      (updated.lifecycle === 'TP1_HIT' || updated.finalResult === 'TP1_ONLY') &&
      (updated.lifecycle as string) !== 'CLOSED' &&
      updated.finalResult !== 'SL' &&
      updated.finalResult !== 'PARTIAL_TP_THEN_SL' &&
      updated.finalResult !== 'TP2_REACHED' &&
      updated.finalResult !== 'FULL_TP'
    ) {
      updated.finalResult = 'TP2_REACHED';
      const gainPct = ((signal.tp2 - postDcaAvg) / postDcaAvg) * 100;
      const initialR = Math.abs(postDcaAvg - signal.stopLoss);
      updated.realizedR = initialR > 0 ? Number((((signal.tp1 - postDcaAvg) * 0.3 + (signal.tp2 - postDcaAvg) * 0.3) / initialR).toFixed(2)) : 1.4;

      // Phase 24: Ratchet stop loss to at least TP1 on remaining 40% position and initialize trailing stop
      const unitRisk = Math.max(0.000001, Math.abs(postDcaAvg - signal.stopLoss));
      const initialTrail = Math.max(signal.tp1, candleHigh - unitRisk * 0.75);
      updated.trailingStopPrice = Number(initialTrail.toFixed(4));

      addEventAndTransition(
        'TP2',
        'TP2_HIT',
        signal.tp2,
        `TP2 hit at $${signal.tp2} (+${gainPct.toFixed(2)}%). Scaled out another 30% of position. Trailing stop ratcheted to $${updated.trailingStopPrice.toFixed(4)} on remaining 40%.`,
        {
          tpLevel: 2,
          scaledOutRatio: 0.3,
          gainPercent: gainPct,
          trailingStopPrice: updated.trailingStopPrice,
        }
      );
    }

    // G. Take Profit 3 Check (Final 40% full close per Spec Section 13)
    // STRICT RULE: Can only trigger if TP2 was hit AND position has NOT been closed/stopped out!
    if (
      candleHigh >= signal.tp3 &&
      signal.tp3 > postDcaAvg &&
      (updated.lifecycle === 'TP2_HIT' || updated.finalResult === 'TP2_REACHED') &&
      (updated.lifecycle as string) !== 'CLOSED' &&
      updated.finalResult !== 'SL' &&
      updated.finalResult !== 'PARTIAL_TP_THEN_SL'
    ) {
      updated.finalResult = 'FULL_TP';
      const gainPct = ((signal.tp3 - postDcaAvg) / postDcaAvg) * 100;
      const initialR = Math.abs(postDcaAvg - signal.stopLoss);
      updated.realizedReturn = Number(gainPct.toFixed(2));
      updated.realizedR = signal.riskReward && signal.riskReward > 0
        ? signal.riskReward
        : initialR > 0
        ? Number((((signal.tp1 - postDcaAvg) * 0.3 + (signal.tp2 - postDcaAvg) * 0.3 + (signal.tp3 - postDcaAvg) * 0.4) / initialR).toFixed(2))
        : 2.5;
      updated.evaluationText = `FULL TP reached at $${signal.tp3} (+${gainPct.toFixed(2)}%, +${updated.realizedR.toFixed(2)}R). Position closed in maximum profit.`;

      addEventAndTransition(
        'TP3',
        'CLOSED',
        signal.tp3,
        `TP3 hit at $${signal.tp3} (+${gainPct.toFixed(2)}%). Final 40% position closed. FULL TP ACHIEVED.`,
        {
          tpLevel: 3,
          scaledOutRatio: 0.4,
          finalReturnPercent: gainPct,
          realizedR: updated.realizedR,
        }
      );
    }
    
    // Phase 24 & Phase 26: Dynamic Trailing Stop Ratchet
    if (
      (updated.lifecycle === 'TP2_HIT' || updated.finalResult === 'TP2_REACHED') &&
      (updated.lifecycle as string) !== 'CLOSED'
    ) {
      const minTrailStop = Math.max(postDcaAvg, signal.tp1);
      const unitRisk = Math.max(0.000001, Math.abs(postDcaAvg - signal.stopLoss));
      const dynamicTrailCandidate = candleHigh - unitRisk * 0.75;
      const currentTrail = updated.trailingStopPrice ?? minTrailStop;
      updated.trailingStopPrice = Number(Math.max(currentTrail, minTrailStop, dynamicTrailCandidate).toFixed(4));
    } else if (
      (updated.lifecycle === 'TP1_HIT' || updated.finalResult === 'TP1_ONLY') &&
      (updated.lifecycle as string) !== 'CLOSED' &&
      updated.finalResult !== 'SL' &&
      updated.finalResult !== 'PARTIAL_TP_THEN_SL'
    ) {
      const minTrailStop = postDcaAvg; // Breakeven baseline floor
      const unitRisk = Math.max(0.000001, Math.abs(postDcaAvg - signal.stopLoss));
      // Dynamic post-TP1 ratchet when price moves >= 1.25R above entry:
      if (candleHigh >= postDcaAvg + unitRisk * 1.25) {
        const dynamicTrailCandidate = candleHigh - unitRisk * 0.85;
        const currentTrail = updated.trailingStopPrice ?? minTrailStop;
        updated.trailingStopPrice = Number(Math.max(currentTrail, minTrailStop, dynamicTrailCandidate).toFixed(4));
      }
    }
  }

  return { updatedSignal: updated, events, transitions };
}

/**
 * Maps a discrete lifecycle event to a Telegram alert payload
 */
function mapEventToTelegramPayload(
  event: SignalLifecycleEvent,
  signal: SignalHistoryRecord
): TelegramAlertPayload | null {
  const price = event.price !== null ? event.price : undefined;
  const realizedR = signal.realizedR !== null ? signal.realizedR : undefined;
  const details = typeof event.metadata?.reason === 'string'
    ? event.metadata.reason
    : typeof event.metadata?.message === 'string'
    ? event.metadata.message
    : undefined;

  switch (event.eventType) {
    case 'ENTRY':
      return {
        eventType: 'ENTRY_FILLED',
        signalId: signal.signalId,
        symbol: signal.symbol,
        price,
        targetReached: 'ENTRY',
        details,
        confidence: signal.confidence,
        setupType: signal.setupType,
        entryZone: signal.entryZone,
        dca1: signal.dca1,
        dca2: signal.dca2,
        initialAllocation: signal.initialAllocation,
        dca1Allocation: signal.dca1Allocation,
        dca2Allocation: signal.dca2Allocation,
        maxDeployed: signal.maxDeployed,
        maxLoss: signal.maxLoss,
        riskPercent: signal.riskPercent,
        targets: {
          tp1: signal.tp1,
          tp2: signal.tp2,
          tp3: signal.tp3,
          sl: signal.stopLoss,
        },
      };
    case 'DCA1':
    case 'DCA2':
      return {
        eventType: 'DCA_FILLED',
        signalId: signal.signalId,
        symbol: signal.symbol,
        price,
        targetReached: event.eventType,
        details,
        dca1: signal.dca1,
        dca2: signal.dca2,
        initialAllocation: signal.initialAllocation,
        dca1Allocation: signal.dca1Allocation,
        dca2Allocation: signal.dca2Allocation,
        maxDeployed: signal.maxDeployed,
      };
    case 'TP1':
    case 'TP2':
    case 'TP3':
      return {
        eventType: 'TP_HIT',
        signalId: signal.signalId,
        symbol: signal.symbol,
        price,
        targetReached: event.eventType,
        realizedR,
        details,
      };
    case 'SL':
      return {
        eventType: 'SL_HIT',
        signalId: signal.signalId,
        symbol: signal.symbol,
        price,
        targetReached: 'SL',
        realizedR,
        details,
      };
    case 'TRAILING_STOP_RATCHET':
      return {
        eventType: 'TRAILING_STOP_RATCHET',
        signalId: signal.signalId,
        symbol: signal.symbol,
        price,
        targetReached: undefined,
        realizedR: typeof event.metadata?.lockedR === 'number' ? event.metadata.lockedR : undefined,
        details,
      };
    case 'EXPIRED':
      return {
        eventType: 'EXPIRED',
        signalId: signal.signalId,
        symbol: signal.symbol,
        details,
      };
    case 'INVALIDATED':
    case 'CANCELLED':
      return {
        eventType: 'CANCELLED',
        signalId: signal.signalId,
        symbol: signal.symbol,
        details,
      };
    default:
      return null;
  }
}

/**
 * Background runner that sweeps all active/pending signals against current market prices
 */
export async function processActiveSignalsLifecycle(
  mockPrices?: Record<string, { price: number; high?: number; low?: number }>
): Promise<LifecycleEvaluationSummary> {
  const timestamp = new Date().toISOString();

  // 1. Fetch non-closed signals from persistence store
  const { records: allSignals } = await getSignals({ limit: 100 });
  const nonClosedSignals = allSignals.filter(
    (s) => s.lifecycle !== 'CLOSED' && s.lifecycle !== 'EVALUATED'
  );

  // Evaluate only the newest pending/active signal per symbol; silently retire older duplicates
  const pendingSignals: typeof nonClosedSignals = [];
  const seenSymbols = new Set<string>();

  for (const s of nonClosedSignals) {
    if (!seenSymbols.has(s.symbol)) {
      seenSymbols.add(s.symbol);
      pendingSignals.push(s);
    } else {
      // Older superseded row for the same symbol: delete redundant duplicate from store
      deleteSignals([s.signalId]).catch(() => {});
    }
  }

  let priceMap: Record<string, { price: number; high?: number; low?: number }> = {};

  if (mockPrices) {
    priceMap = mockPrices;
  } else {
    try {
      const tickers = await fetchAllTickers24h();
      for (const t of tickers) {
        // Critical: highPrice and lowPrice from Binance 24h ticker are rolling 24-HOUR extremes
        // from before signal creation. For live monitoring, use current spot price t.price
        // so DCAs, TPs, and SLs only trigger when the live market price actually touches the level.
        priceMap[t.symbol] = {
          price: t.price,
          high: t.price,
          low: t.price,
        };
      }
    } catch (err) {
      console.warn('[/lib/services/lifecycle-service] Failed to fetch live tickers:', err);
    }
  }

  const allTransitions: LifecycleTransition[] = [];
  let activeCount = 0;
  let pendingCount = 0;
  let closedCount = 0;

  for (const signal of pendingSignals) {
    // Normalize symbol format (e.g. BTC/USDT -> BTCUSDT)
    const normalizedKey = signal.symbol.replace('/', '');
    let tick =
      priceMap[signal.symbol] ||
      priceMap[normalizedKey] ||
      priceMap[`${signal.symbol}USDT`];

    // Live candle-aware sweeper enhancement (Phase 26):
    // For open positions, fetch real recent 15m kline to capture true high/low wicks
    if (
      !mockPrices &&
      (signal.lifecycle === 'ACTIVE' ||
        signal.lifecycle === 'ENTRY_TRIGGERED' ||
        signal.lifecycle === 'DCA1_TRIGGERED' ||
        signal.lifecycle === 'DCA2_TRIGGERED' ||
        signal.lifecycle === 'TP1_HIT' ||
        signal.lifecycle === 'TP2_HIT')
    ) {
      try {
        const klines = await fetchKlines(signal.symbol, '15m', 2);
        if (klines && klines.length > 0) {
          const latestBar = klines[klines.length - 1];
          const currPrice = tick ? tick.price : latestBar.close;
          tick = {
            price: currPrice,
            high: Math.max(tick?.high ?? currPrice, latestBar.high),
            low: Math.min(tick?.low ?? currPrice, latestBar.low),
          };
        }
      } catch {
        // Fall back gracefully to instantaneous ticker snapshot
      }
    }

    if (!tick) {
      if (signal.lifecycle === 'ACTIVE') activeCount++;
      else pendingCount++;
      continue;
    }

    const previousTrailingStop = signal.trailingStopPrice;
    const previousMfe = signal.mfe;

    const { updatedSignal, events, transitions } = evaluateSignalLifecycleStep(
      signal,
      tick
    );

    // Detect if trailing stop ratcheted upwards by >= 0.25% or newly initialized
    const trailingStopRatcheted =
      Boolean(updatedSignal.trailingStopPrice) &&
      (!previousTrailingStop || (updatedSignal.trailingStopPrice! > previousTrailingStop * 1.0025));

    if (trailingStopRatcheted && transitions.length === 0 && updatedSignal.lifecycle !== 'CLOSED') {
      const entryRef = signal.actualEntry ?? signal.preferredEntry;
      const unitRisk = Math.max(0.000001, Math.abs(entryRef - signal.stopLoss));
      const lockedR = (((updatedSignal.trailingStopPrice ?? 0) - entryRef) / unitRisk).toFixed(2);

      const ratchetEvent: SignalLifecycleEvent = {
        eventId: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        signalId: signal.signalId,
        eventType: 'TRAILING_STOP_RATCHET',
        timestamp: new Date().toISOString(),
        price: updatedSignal.trailingStopPrice ?? null,
        metadata: {
          previousTrailingStop,
          newTrailingStop: updatedSignal.trailingStopPrice,
          lockedR: Number(lockedR),
          reason: `Trailing stop elevated to $${updatedSignal.trailingStopPrice?.toFixed(4)} (+${lockedR}R profit locked).`,
        },
      };

      events.push(ratchetEvent);
      transitions.push({
        signalId: signal.signalId,
        symbol: signal.symbol,
        previousLifecycle: signal.lifecycle,
        newLifecycle: updatedSignal.lifecycle,
        event: ratchetEvent,
        currentPrice: tick.price,
        message: `🛡️ Trailing stop elevated to $${updatedSignal.trailingStopPrice?.toFixed(4)} (+${lockedR}R profit locked).`,
      });
    }

    const stateChangedWithoutTransition =
      transitions.length === 0 &&
      (updatedSignal.trailingStopPrice !== previousTrailingStop ||
        (updatedSignal.mfe ?? 0) !== (previousMfe ?? 0));

    if (transitions.length > 0) {
      // 1. Save updated signal state
      await saveSignal(updatedSignal);

      // 2. Save each emitted discrete lifecycle event
      for (const event of events) {
        await saveSignalEvent(event);

        // Phase 15: Automatically dispatch real-time Telegram alert
        const alertPayload = mapEventToTelegramPayload(event, updatedSignal);
        if (alertPayload) {
          try {
            await dispatchTelegramAlert(alertPayload);
          } catch (alertErr) {
            console.warn('[Telegram Dispatch Warning]:', alertErr);
          }
        }
      }

      // 3. If signal transitioned to CLOSED, generate comprehensive post-trade evaluation
      if (updatedSignal.lifecycle === 'CLOSED') {
        const evaluation = evaluateSignalOutcome(updatedSignal, { events });
        updatedSignal.evaluationText = evaluation.evaluationText;
        await saveSignal(updatedSignal);
        await saveSignalEvaluation(evaluation);
      }

      allTransitions.push(...transitions);
    } else if (stateChangedWithoutTransition) {
      // Quietly persist updated trailing stop and MFE to the database
      await saveSignal(updatedSignal);
    }

    if (updatedSignal.lifecycle === 'CLOSED') {
      closedCount++;
    } else if (
      updatedSignal.lifecycle === 'ACTIVE' ||
      updatedSignal.lifecycle.includes('TRIGGERED') ||
      updatedSignal.lifecycle.includes('HIT')
    ) {
      activeCount++;
    } else {
      pendingCount++;
    }
  }

  return {
    timestamp,
    processedCount: pendingSignals.length,
    activeCount,
    pendingCount,
    closedCount,
    transitions: allTransitions,
  };
}

/**
 * Re-audits a single historical signal from scratch by replaying Binance 15m klines
 * from signal creation timestamp. Enforces strict chronological order, Breakeven stop ratchet,
 * and immutable termination upon hitting SL/BE.
 */
export async function auditSignalWithKlines(
  signal: SignalHistoryRecord
): Promise<{
  auditedSignal: SignalHistoryRecord;
  events: SignalLifecycleEvent[];
  transitions: LifecycleTransition[];
}> {
  const startMs = new Date(signal.createdAt).getTime();
  let klines = await fetchKlines(signal.symbol, '15m', 500, startMs);

  // If 15m empty (e.g. older than 500 bars or pair name formatting), try with normalized symbol
  if (klines.length === 0) {
    const normalized = signal.symbol.replace('/', '');
    klines = await fetchKlines(normalized, '15m', 500, startMs);
  }

  // Sanitize geometry if signal has corrupted entry zone high (e.g. entryZone.high >= tp1)
  const sanitizedEntryHigh = Math.min(signal.entryZone.high, Number((signal.tp1 * 0.985).toFixed(4)));
  const sanitizedEntryLow = Math.min(signal.entryZone.low, Number((sanitizedEntryHigh * 0.99).toFixed(4)));

  // Initialize a clean state clone
  let current: SignalHistoryRecord = {
    ...signal,
    entryZone: {
      low: sanitizedEntryLow,
      high: sanitizedEntryHigh,
    },
    lifecycle: 'CREATED',
    status: signal.status === 'AVOID' ? 'WAIT_FOR_CONFIRMATION' : signal.status,
    actualEntry: null,
    dca1Hit: false,
    dca2Hit: false,
    finalResult: null,
    mfe: 0,
    mae: 0,
    realizedReturn: null,
    realizedR: null,
    fees: null,
    slippage: null,
    evaluationText: null,
  };

  const discreteEvents: SignalLifecycleEvent[] = [];
  const allTransitions: LifecycleTransition[] = [];

  if (klines.length > 0) {
    for (const k of klines) {
      if (current.lifecycle === 'CLOSED') {
        break; // Position terminated, stop replaying subsequent candles
      }

      const candleTimeStr = new Date(k.timestamp).toISOString();
      const tick = {
        price: k.close,
        high: k.high,
        low: k.low,
        timestamp: candleTimeStr,
      };

      const step = evaluateSignalLifecycleStep(current, tick);
      current = step.updatedSignal;
      discreteEvents.push(...step.events);
      allTransitions.push(...step.transitions);
    }
  }

  // If signal remained in CREATED state and 4 hours expired
  if (current.lifecycle === 'CREATED') {
    const elapsedMs = Date.now() - startMs;
    if (elapsedMs >= 4 * 60 * 60 * 1000) {
      current.lifecycle = 'CLOSED';
      current.finalResult = 'EXPIRED';
      current.status = 'NO_TRADE';
      current.realizedR = 0;
      current.realizedReturn = 0;
      current.evaluationText = 'Signal expired after 4 hours without reaching entry zone.';

      const expEvent: SignalLifecycleEvent = {
        eventId: `EVT-${Date.now()}-exp`,
        signalId: current.signalId,
        eventType: 'EXPIRED',
        timestamp: new Date(startMs + 4 * 3600 * 1000).toISOString(),
        price: null,
        metadata: { reason: 'Expired without entry' },
      };
      discreteEvents.push(expEvent);
    }
  }

  // Generate comprehensive post-trade evaluation if closed
  if (current.lifecycle === 'CLOSED') {
    const evaluation = evaluateSignalOutcome(current, {
      events: discreteEvents,
      recentKlines: klines.map((k) => ({
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        openTime: k.timestamp,
        closeTime: k.timestamp + 15 * 60 * 1000,
      })),
    });
    current.evaluationText = evaluation.evaluationText;
    current.finalResult = evaluation.finalResult;
    current.realizedR = evaluation.realizedR;
    current.realizedReturn = evaluation.realizedReturnPercent;
    current.fees = evaluation.feesUsdt;
    current.slippage = evaluation.slippageUsdt;
    current.mfe = evaluation.mfe;
    current.mae = evaluation.mae;

    await deleteSignalEvents(current.signalId);
    for (const ev of discreteEvents) {
      await saveSignalEvent(ev);
    }
    await saveSignal(current);
    await saveSignalEvaluation(evaluation);
  } else {
    // If still active or pending, save updated progress
    await deleteSignalEvents(current.signalId);
    for (const ev of discreteEvents) {
      await saveSignalEvent(ev);
    }
    await saveSignal(current);
  }

  return { auditedSignal: current, events: discreteEvents, transitions: allTransitions };
}

/**
 * Sweeps and re-audits the entire history of all signals in the database.
 * Replays Binance 15M candles for each signal to strictly rectify erroneous TP/SL calculations.
 */
export async function auditAllSignalsHistory(): Promise<{
  totalAudited: number;
  updatedCount: number;
  signals: Array<{
    signalId: string;
    symbol: string;
    previousResult: string | null;
    auditedResult: string | null;
    realizedR: number | null;
    lifecycle: string;
  }>;
}> {
  const { records: allSignals } = await getSignals({ limit: 200, onlyEntryTriggered: false });
  const results: Array<{
    signalId: string;
    symbol: string;
    previousResult: string | null;
    auditedResult: string | null;
    realizedR: number | null;
    lifecycle: string;
  }> = [];

  let updatedCount = 0;

  for (const signal of allSignals) {
    const previousResult = signal.finalResult;
    try {
      const { auditedSignal } = await auditSignalWithKlines(signal);
      if (previousResult !== auditedSignal.finalResult || signal.lifecycle !== auditedSignal.lifecycle) {
        updatedCount++;
      }
      results.push({
        signalId: auditedSignal.signalId,
        symbol: auditedSignal.symbol,
        previousResult,
        auditedResult: auditedSignal.finalResult,
        realizedR: auditedSignal.realizedR,
        lifecycle: auditedSignal.lifecycle,
      });
    } catch (err) {
      console.warn(`[Audit Error] Failed to re-audit signal ${signal.signalId} (${signal.symbol}):`, err);
      results.push({
        signalId: signal.signalId,
        symbol: signal.symbol,
        previousResult,
        auditedResult: signal.finalResult,
        realizedR: signal.realizedR,
        lifecycle: signal.lifecycle,
      });
    }
  }

  return {
    totalAudited: allSignals.length,
    updatedCount,
    signals: results,
  };
}

