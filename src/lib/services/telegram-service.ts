// ─── U-SPOT Telegram Alerts & Notification Engine — Phase 15 ────────────
// Real-time mobile alerts, duplicate alert protection, high-contrast formatting,
// and event dispatchers for live signal lifecycle events.
// Spec Ref: Phase 15 & Spec Section 34 (Telegram Bot & Event Alerts)

import type {
  OrderBookWall,
  Signal,
  TelegramAlertConfig,
  TelegramAlertPayload,
  TelegramSendResult,
  WebSocketConnectionState,
} from '../../types/index.ts';
import { userService } from './user-service.ts';

/**
 * Dispatches an alert message to all registered users who have personal Telegram Chat IDs configured
 */
async function fanoutToSubscribers(text: string, botToken: string, primaryChatId: string): Promise<void> {
  if (!botToken) return;
  try {
    const subscribers = await userService.getAllUsersWithTelegram();
    for (const sub of subscribers) {
      if (sub.telegramChatId && sub.telegramChatId !== primaryChatId) {
        sendTelegramRaw(text, botToken, sub.telegramChatId).catch(() => {});
      }
    }
  } catch {
    // Non-blocking fanout
  }
}

// ─── Default Configuration & Preferences ──────────────────────────────

export const DEFAULT_TELEGRAM_CONFIG: TelegramAlertConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  events: {
    onSignalCreated: true,
    onEntryFilled: true,
    onDcaFilled: true,
    onTpHit: true,
    onSlHit: true,
    onExpiredOrCancelled: false,
    onTrailingStopRatchet: true,
    onInstitutionalWall: true,
    onWebSocketHealth: true,
    onDivergence: true,
  },
  deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes duplicate protection
};

// In-memory runtime configuration store
let runtimeConfig: TelegramAlertConfig = { ...DEFAULT_TELEGRAM_CONFIG };

export function getTelegramConfig(): TelegramAlertConfig {
  return { ...runtimeConfig };
}

export function updateTelegramConfig(newConfig: Partial<TelegramAlertConfig>): TelegramAlertConfig {
  runtimeConfig = {
    ...runtimeConfig,
    ...newConfig,
    events: {
      ...runtimeConfig.events,
      ...(newConfig.events || {}),
    },
  };
  return { ...runtimeConfig };
}

// ─── Duplicate Alert Protection Engine (Spec §34) ─────────────────────

// Cache of `${signalId}_${eventType}_${target}` -> timestamp
const sentAlertsCache = new Map<string, number>();

export function generateAlertKey(payload: TelegramAlertPayload): string {
  // For CANCELLED, EXPIRED, and SIGNAL_CREATED, key strictly by symbol to prevent spam across varying signalIds
  if (
    payload.eventType === 'CANCELLED' ||
    payload.eventType === 'EXPIRED' ||
    payload.eventType === 'SIGNAL_CREATED'
  ) {
    return `${payload.symbol}_${payload.eventType}`;
  }
  // Phase 32: Institutional Wall deduplication by symbol, side, and rounded price tier
  if (payload.eventType === 'INSTITUTIONAL_WALL_DETECTED') {
    const wallType = payload.wallType || 'WALL';
    const priceTier = Math.round(payload.wallPrice || payload.price || 0);
    return `WALL_${payload.symbol}_${wallType}_${priceTier}`;
  }
  // Phase 32: WebSocket Health deduplication by connection state
  if (payload.eventType === 'WEBSOCKET_HEALTH_ALERT') {
    return `WS_HEALTH_${payload.wsState || payload.details || 'STATE'}`;
  }
  // Phase 37: Divergence Alert deduplication by symbol, timeframe, indicator, and divergence type
  if (payload.eventType === 'DIVERGENCE_ALERT') {
    const tf = payload.divergenceTimeframe || '15m';
    const ind = payload.divergenceIndicator || 'RSI';
    const divType = payload.divergenceType || 'REGULAR_BULLISH';
    return `DIV_${payload.symbol}_${tf}_${ind}_${divType}`;
  }
  const id = payload.signalId || payload.symbol;
  const event = payload.eventType;
  const target = payload.targetReached || '';
  return `${id}_${event}_${target}`;
}

/**
 * Checks whether an identical alert was dispatched within the deduplication window.
 */
export function isDuplicateAlert(
  payload: TelegramAlertPayload,
  windowMs: number = runtimeConfig.deduplicationWindowMs || 300000
): boolean {
  const key = generateAlertKey(payload);
  const lastSent = sentAlertsCache.get(key);

  if (!lastSent) {
    return false;
  }

  // Enforce specific deduplication windows:
  // - at least 2 hours for new signals on same symbol
  // - 1 hour for cancellations/expirations
  // - 15 minutes for WebSocket health alerts to prevent loops on intermittent drops
  // - 10 minutes for Institutional Wall alerts on same symbol and price tier
  const effectiveWindow =
    payload.eventType === 'SIGNAL_CREATED'
      ? Math.max(windowMs, 2 * 3600 * 1000)
      : payload.eventType === 'CANCELLED' || payload.eventType === 'EXPIRED'
      ? Math.max(windowMs, 3600000)
      : payload.eventType === 'WEBSOCKET_HEALTH_ALERT'
      ? Math.max(windowMs, 15 * 60 * 1000)
      : payload.eventType === 'INSTITUTIONAL_WALL_DETECTED'
      ? Math.max(windowMs, 10 * 60 * 1000)
      : payload.eventType === 'DIVERGENCE_ALERT'
      ? Math.max(windowMs, 15 * 60 * 1000)
      : windowMs;

  const elapsed = Date.now() - lastSent;
  return elapsed < effectiveWindow;
}

export function recordAlertSent(payload: TelegramAlertPayload): void {
  const key = generateAlertKey(payload);
  sentAlertsCache.set(key, Date.now());
}

export function clearDeduplicationCache(): void {
  sentAlertsCache.clear();
}

// ─── High-Contrast Markdown Formatters ────────────────────────────────

export function formatPrice(price: number): string {
  if (price === undefined || price === null || isNaN(price)) return '0.00';
  if (price === 0) return '0.00';
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}

export function formatQty(qty: number): string {
  if (qty === undefined || qty === null || isNaN(qty)) return '0';
  if (qty === 0) return '0';
  if (qty >= 1000) return qty.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (qty >= 1) return qty.toFixed(2);
  if (qty >= 0.01) return qty.toFixed(4);
  return qty.toFixed(6);
}

function escapeMarkdown(text: string): string {
  // Escapes characters that break standard Telegram Markdown
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Formats a high-contrast Telegram alert for a newly generated signal
 * Includes all trade details: entry price, entry zone, DCA 1, DCA 2,
 * TP1, TP2, TP3, SL, and exact position sizes at each level.
 */
export function formatSignalCreatedMessage(signal: Signal): string {
  const symbol = signal.symbol;
  const baseAsset = symbol.includes('/') ? symbol.split('/')[0] : symbol.replace(/USDT$/, '');
  const grade = signal.confidence;
  const score = Math.round(signal.tradeScore || signal.candidateScore || 80);
  const setup = signal.setupType || 'BREAKOUT_RETEST';
  const regime = signal.marketRegime || 'BULL';

  // Entry pricing
  const entryLow = formatPrice(signal.entryZone?.low ?? signal.preferredEntry);
  const entryHigh = formatPrice(signal.entryZone?.high ?? signal.preferredEntry);
  const prefEntry = formatPrice(signal.preferredEntry);

  // Position sizing allocations
  const initAlloc = signal.initialAllocation || 150.0;
  const dca1Alloc = signal.dca1Allocation || (signal.dca1 ? 90.0 : 0);
  const dca2Alloc = signal.dca2Allocation || (signal.dca2 ? 60.0 : 0);
  const totalMaxDeployed = signal.maxDeployed || (initAlloc + dca1Alloc + dca2Alloc);

  // Coin quantities
  const entryQty = signal.preferredEntry > 0 ? initAlloc / signal.preferredEntry : 0;
  const dca1Qty = signal.dca1 && signal.dca1 > 0 ? dca1Alloc / signal.dca1 : 0;
  const dca2Qty = signal.dca2 && signal.dca2 > 0 ? dca2Alloc / signal.dca2 : 0;
  const totalQty = entryQty + dca1Qty + dca2Qty;

  // Percentage shares
  const entryPctShare = totalMaxDeployed > 0 ? ((initAlloc / totalMaxDeployed) * 100).toFixed(1) : '50.0';
  const dca1PctShare = totalMaxDeployed > 0 ? ((dca1Alloc / totalMaxDeployed) * 100).toFixed(1) : '30.0';
  const dca2PctShare = totalMaxDeployed > 0 ? ((dca2Alloc / totalMaxDeployed) * 100).toFixed(1) : '20.0';

  // DCA details
  const dca1Str = signal.dca1 ? `$${formatPrice(signal.dca1)}` : 'N/A';
  const dca1Discount = signal.dca1
    ? (((signal.dca1 - signal.preferredEntry) / signal.preferredEntry) * 100).toFixed(2)
    : '0.00';

  const dca2Str = signal.dca2 ? `$${formatPrice(signal.dca2)}` : 'N/A';
  const dca2Discount = signal.dca2
    ? (((signal.dca2 - signal.preferredEntry) / signal.preferredEntry) * 100).toFixed(2)
    : '0.00';

  const blendedAvgEntry = totalQty > 0 ? formatPrice(totalMaxDeployed / totalQty) : prefEntry;

  // Targets & Invalidation
  const tp1 = formatPrice(signal.tp1);
  const tp2 = formatPrice(signal.tp2);
  const tp3 = formatPrice(signal.tp3);
  const sl = formatPrice(signal.stopLoss);

  const tp1Pct = (((signal.tp1 - signal.preferredEntry) / signal.preferredEntry) * 100).toFixed(2);
  const tp2Pct = (((signal.tp2 - signal.preferredEntry) / signal.preferredEntry) * 100).toFixed(2);
  const tp3Pct = (((signal.tp3 - signal.preferredEntry) / signal.preferredEntry) * 100).toFixed(2);
  const slPct = (((signal.stopLoss - signal.preferredEntry) / signal.preferredEntry) * 100).toFixed(2);

  // Position sizes at TP levels (30% / 30% / 40%)
  const tp1Coins = totalQty * 0.30;
  const tp2Coins = totalQty * 0.30;
  const tp3Coins = totalQty * 0.40;

  const tp1ProfitUsdt = ((signal.tp1 - signal.preferredEntry) * (entryQty * 0.30) * 0.998).toFixed(2);
  const tp2ProfitUsdt = ((signal.tp2 - signal.preferredEntry) * (entryQty * 0.30) * 0.998).toFixed(2);
  const tp3ProfitUsdt = ((signal.tp3 - signal.preferredEntry) * (entryQty * 0.40) * 0.998).toFixed(2);
  const totalPotentialProfit = (
    parseFloat(tp1ProfitUsdt) +
    parseFloat(tp2ProfitUsdt) +
    parseFloat(tp3ProfitUsdt)
  ).toFixed(2);

  const allocUsdt = initAlloc.toFixed(2);
  const maxLossUsdt = signal.maxLoss ? signal.maxLoss.toFixed(2) : '2.25';
  const riskPct = signal.riskPercent ? signal.riskPercent.toFixed(2) : '0.75';

  let aiSection = '';
  if (signal.aiAnalysis) {
    const verdictEmoji =
      signal.aiAnalysis.verdict === 'APPROVED' ? '✅' : signal.aiAnalysis.verdict === 'CAUTION' ? '⚠️' : '❌';
    const sourceTag = signal.aiAnalysis.source === 'GEMINI' ? 'Gemini 2.5 Flash' : 'AI Quantitative Gatekeeper';
    const risks = signal.aiAnalysis.keyRisks?.slice(0, 2).join(' • ') || 'Standard market volatility';
    aiSection = `\n─────────────────────
🤖 *AI Review:* ${verdictEmoji} *${signal.aiAnalysis.verdict}* (${signal.aiAnalysis.confidenceScore}% Confidence via ${sourceTag})
🧠 *Rationale:* ${signal.aiAnalysis.aiRationale}
⚠️ *Key Risks:* ${risks}`;
  }

  return `🟢 *BUY: ${symbol}* (Spot 1x)
─────────────────────
Status: CONFIRMED (BUY NOW)
Grade: [${grade}]  •  Score: ${score}/100 
Setup: ${setup}

📥 Entry   → $${prefEntry}  | ${entryPctShare}% | $${allocUsdt}
📥 DCA 1   → ${dca1Str}  | ${dca1PctShare}% | $${dca1Alloc.toFixed(2)}
📥 DCA 2   → ${dca2Str}  | ${dca2PctShare}% | $${dca2Alloc.toFixed(2)}
Avg Entry: → $${blendedAvgEntry}  | Total: $${totalMaxDeployed.toFixed(2)}

🎯 TP 1    → $${tp1} (+${tp1Pct}%)  | 30% | +$${tp1ProfitUsdt} (Ratchet SL to Breakeven)
🎯 TP 2    → $${tp2} (+${tp2Pct}%)  | 30% | +$${tp2ProfitUsdt}
🎯 TP 3    → $${tp3} (+${tp3Pct}%)  | 40% | +$${tp3ProfitUsdt} (Runner)

🛑 SL      → $${sl} (${slPct}%)  | Max Loss: -$${maxLossUsdt} (${riskPct}%)${aiSection}
─────────────────────
⏱ Auto-cancels in 4h if unfilled`;
}

/**
 * Formats Telegram alert for active signal lifecycle transitions
 */
export function formatLifecycleEventMessage(payload: TelegramAlertPayload): string {
  const symbol = payload.symbol;
  const price = payload.price ? `$${formatPrice(payload.price)}` : '';

  switch (payload.eventType) {
    case 'ENTRY_FILLED': {
      const initAlloc = payload.initialAllocation ? `$${payload.initialAllocation.toFixed(2)} USDT` : 'Initial Tranche';
      const dca1Text = payload.dca1 ? `$${formatPrice(payload.dca1)}` : 'Active';
      const dca2Text = payload.dca2 ? `$${formatPrice(payload.dca2)}` : 'Active';
      const tp1Text = payload.targets?.tp1 ? `$${formatPrice(payload.targets.tp1)}` : 'Target 1';
      const tp2Text = payload.targets?.tp2 ? `$${formatPrice(payload.targets.tp2)}` : 'Target 2';
      const tp3Text = payload.targets?.tp3 ? `$${formatPrice(payload.targets.tp3)}` : 'Target 3';
      const slText = payload.targets?.sl ? `$${formatPrice(payload.targets.sl)}` : 'Active';

      return `🎯 *ENTRY TRIGGERED: ${symbol}*
─────────────────────
*Execution:* ${price} • *Status:* IN POSITION

📍 *PLAN & SIZING*
• *Size:* ${initAlloc}
• *DCA 1:* ${dca1Text} ${payload.dca1Allocation ? `($${payload.dca1Allocation.toFixed(2)} USDT)` : ''}
• *DCA 2:* ${dca2Text} ${payload.dca2Allocation ? `($${payload.dca2Allocation.toFixed(2)} USDT)` : ''}
• *TP1:* ${tp1Text} (Ratchet SL to Breakeven)
• *TP2:* ${tp2Text} | *TP3:* ${tp3Text} (Runner)
• *SL:* ${slText} ${payload.maxLoss ? `(Max Loss: -$${payload.maxLoss.toFixed(2)} USDT)` : ''}
─────────────────────
Monitoring DCA safety levels and TP1...`;
    }

    case 'DCA_FILLED':
      return `🛡️ *SAFETY TRANCHE FILLED: ${symbol}*
─────────────────────────
*Tranche:* ${payload.targetReached || 'DCA 1'} filled @ ${price}
${payload.details ? `*Update:* ${payload.details}` : ''}
Volume-weighted average entry recalculated. Cost basis improved.`;

    case 'TP_HIT': {
      const r = payload.realizedR !== undefined ? `+${payload.realizedR.toFixed(2)}R` : '+1.0R';
      const target = payload.targetReached || 'TP1';
      const ratchetNotice = target === 'TP1'
        ? '\n🛡️ *STOP LOSS RATCHETED TO BREAKEVEN*\nRemaining tranches are now risk-free.'
        : '';

      return `🚀 *TARGET REACHED: ${symbol}*
─────────────────────────
*Level:* ${target} hit @ ${price}
*Realized Return:* ${r}${ratchetNotice}
${payload.pnlUsdt ? `*Net Profit:* +$${payload.pnlUsdt.toFixed(2)} USDT` : ''}`;
    }

    case 'SL_HIT': {
      const realizedRVal = payload.realizedR;
      const isProfitLock = realizedRVal !== undefined && realizedRVal >= 0;
      if (isProfitLock && realizedRVal !== undefined) {
        const r = `+${realizedRVal.toFixed(2)}R`;
        return `🛡️ *PROFIT STOP / BREAKEVEN HIT: ${symbol}*
─────────────────────────
*Exit Price:* ${price}
*Status:* POSITION CLOSED IN PROFIT
*Realized Return:* ${r}
${payload.details ? `*Details:* ${payload.details}\n` : ''}Capital and accumulated profits secured.`;
      }
      const r = realizedRVal !== undefined ? `${realizedRVal.toFixed(2)}R` : '-1.0R';
      return `🛑 *STOP LOSS TRIGGERED: ${symbol}*
─────────────────────────
*Exit Price:* ${price}
*Status:* POSITION CLOSED
*Realized Loss:* ${r}
${payload.pnlUsdt ? `*Net Impact:* -$${Math.abs(payload.pnlUsdt).toFixed(2)} USDT` : ''}
Capital protected according to strict risk parameters.`;
    }

    case 'TRAILING_STOP_RATCHET': {
      const r = payload.realizedR !== undefined ? `+${payload.realizedR.toFixed(2)}R` : '';
      return `🛡️ *TRAILING STOP ELEVATED: ${symbol}*
─────────────────────────
*New Trailing Stop:* ${price}
*Status:* PROTECTED PROFIT LOCKED ${r ? `(${r})` : ''}
${payload.details ? `*Details:* ${payload.details}\n` : ''}Stop loss ratcheted higher to safeguard accumulated gains.`;
    }

    case 'EXPIRED':
      return `⏱ *SIGNAL EXPIRED: ${symbol}*
─────────────────────────
Signal timed out after 4 hours without reaching entry zone.
Order plan invalidated with ZERO capital deployed.`;

    case 'CANCELLED':
      return `⚠️ *SIGNAL CANCELLED: ${symbol}*
─────────────────────────
Market structure or regime shifted before entry trigger.
${payload.details ? `Reason: ${payload.details}` : ''}`;

    case 'INSTITUTIONAL_WALL_DETECTED':
      return formatInstitutionalWallMessage(payload);

    case 'WEBSOCKET_HEALTH_ALERT':
      return formatWebSocketHealthMessage(payload);

    case 'DIVERGENCE_ALERT':
      return formatDivergenceMessage(payload);

    case 'TEST':
    default:
      return `🔔 *U-SPOT TELEGRAM BOT CONNECTED*
─────────────────────────
Real-time trading alerts are operational!
Bot: @U_Spot_Bot
Timestamp: ${new Date().toUTCString()}
Ready to broadcast live signals, DCA triggers, and TP targets.`;
  }
}

/**
 * Formats a high-contrast Telegram alert for detected institutional liquidity walls (Phase 32)
 */
export function formatInstitutionalWallMessage(payload: TelegramAlertPayload): string {
  const symbol = payload.symbol;
  const isBid = payload.wallType === 'BID';
  const icon = isBid ? '🛡️' : '🧱';
  const typeLabel = isBid ? 'SUPPORT BID WALL' : 'RESISTANCE ASK WALL';
  const roleDesc = isBid
    ? 'Defending entry/DCA support floor against downside cascades'
    : 'Immediate resistance ceiling / front-run take profit target';

  const price = payload.wallPrice !== undefined ? payload.wallPrice : (payload.price ?? 0);
  const volUsdt = payload.wallVolumeUsdt ?? 0;
  const multiple = payload.wallMultiple ? `${payload.wallMultiple.toFixed(1)}x avg depth` : 'Significant liquidity cluster';
  const dist = payload.distancePercent !== undefined ? `${payload.distancePercent.toFixed(2)}% away` : 'Near market price';

  return `${icon} *INSTITUTIONAL ${typeLabel}: ${symbol}*
─────────────────────
*Price Level:* $${formatPrice(price)}
*Liquidity Volume:* $${volUsdt.toLocaleString('en-US')} USDT (${multiple})
*Market Distance:* ${dist}
*Tactical Role:* ${roleDesc}
${payload.details ? `*Analysis:* ${payload.details}\n` : ''}─────────────────────
Live Order Book Depth Monitoring Active`;
}

/**
 * Formats a high-contrast Telegram alert for Binance WebSocket connectivity transitions (Phase 32)
 */
export function formatWebSocketHealthMessage(payload: TelegramAlertPayload): string {
  const state = payload.wsState || 'DISCONNECTED';
  const isOk = state === 'CONNECTED';
  const icon = isOk ? '✅' : state === 'RECONNECTING' ? '🔄' : '⚠️';
  const title = isOk
    ? 'BINANCE WEBSOCKET FEED RESTORED'
    : state === 'RECONNECTING'
    ? 'BINANCE WEBSOCKET RECONNECTING'
    : `BINANCE WEBSOCKET ALERT: ${state}`;

  const statusDesc = isOk
    ? 'Real-time order book depth and live ticker streaming operational.'
    : state === 'RECONNECTING'
    ? 'Attempting socket reconnection with exponential backoff...'
    : 'Connection interrupted. Fallback REST polling active for critical risk checks.';

  const symbolContext = payload.symbol && payload.symbol !== 'GLOBAL' ? `\n*Stream Context:* ${payload.symbol}` : '';
  const reasonText = payload.wsReason || payload.details;

  return `${icon} *${title}*
─────────────────────
*Connection State:* ${state}${symbolContext}
*Status:* ${statusDesc}
${reasonText ? `*Details:* ${reasonText}\n` : ''}─────────────────────
U-SPOT High-Availability Stream Guard`;
}

/**
 * Formats a high-contrast Telegram alert for detected technical divergences (Phase 37)
 */
export function formatDivergenceMessage(payload: TelegramAlertPayload): string {
  const symbol = payload.symbol;
  const tf = payload.divergenceTimeframe || '15m';
  const ind = payload.divergenceIndicator || 'RSI';
  const divType = payload.divergenceType || 'REGULAR_BULLISH';
  const score = payload.divergenceStrengthScore ?? 75;
  const strength =
    payload.divergenceStrength || (score >= 75 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK');

  const isBullish = divType === 'REGULAR_BULLISH' || divType === 'HIDDEN_BULLISH';
  const isRegular = divType.startsWith('REGULAR');
  const icon = isBullish ? (isRegular ? '🟢' : '🔹') : isRegular ? '🔴' : '🔸';

  const title = isBullish
    ? isRegular
      ? 'REGULAR BULLISH DIVERGENCE'
      : 'HIDDEN BULLISH CONTINUATION'
    : isRegular
    ? 'REGULAR BEARISH EXHAUSTION'
    : 'HIDDEN BEARISH CONTINUATION';

  const tacticalNote = isBullish
    ? 'Potential spot accumulation zone near structural support / reversal.'
    : 'Caution advised for long positions. Consider trimming or ratcheting stops.';

  const confluenceNote = payload.confluenceScore
    ? `\n*Multi-Timeframe Confluence Score:* ${payload.confluenceScore}/100`
    : '';

  return `${icon} *${title}: ${symbol}*
─────────────────────
*Timeframe:* ${tf}  •  *Indicator:* ${ind}
*Strength:* ${strength} (${score}/100)${confluenceNote}
${payload.price ? `*Current Price:* $${formatPrice(payload.price)}\n` : ''}${payload.details ? `*Details:* ${payload.details}\n` : ''}*Tactical Role:* ${tacticalNote}
─────────────────────
U-SPOT Quantitative Divergence Radar`;
}

// ─── Dispatcher Engine ────────────────────────────────────────────────

/**
 * Checks whether an event type is enabled in the configuration
 */
export function isEventEnabled(eventType: TelegramAlertPayload['eventType'], config: TelegramAlertConfig): boolean {
  if (!config.enabled) return false;

  switch (eventType) {
    case 'SIGNAL_CREATED':
      return config.events.onSignalCreated;
    case 'ENTRY_FILLED':
      return config.events.onEntryFilled;
    case 'DCA_FILLED':
      return config.events.onDcaFilled;
    case 'TP_HIT':
      return config.events.onTpHit;
    case 'SL_HIT':
      return config.events.onSlHit;
    case 'TRAILING_STOP_RATCHET':
      return config.events.onTrailingStopRatchet ?? true;
    case 'EXPIRED':
    case 'CANCELLED':
      return config.events.onExpiredOrCancelled;
    case 'INSTITUTIONAL_WALL_DETECTED':
      return config.events.onInstitutionalWall ?? true;
    case 'WEBSOCKET_HEALTH_ALERT':
      return config.events.onWebSocketHealth ?? true;
    case 'DIVERGENCE_ALERT':
      return config.events.onDivergence ?? true;
    case 'TEST':
      return true;
    default:
      return true;
  }
}

/**
 * Direct Telegram HTTP API caller
 */
export async function sendTelegramRaw(
  text: string,
  botToken: string,
  chatId: string
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      // If Telegram markdown entity parsing fails (e.g. unescaped tokens), gracefully retry as plain text
      if (data.description && data.description.includes("can't parse entities")) {
        const fallbackRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
          }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackData.ok) {
          return { ok: true, messageId: fallbackData.result?.message_id };
        }
      }
      return { ok: false, error: data.description || 'Telegram API returned not ok' };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error reaching Telegram API' };
  }
}

/**
 * Main dispatcher: formats message, applies duplicate protection, and sends alert
 */
export async function dispatchTelegramAlert(
  payload: TelegramAlertPayload,
  configOverride?: Partial<TelegramAlertConfig>
): Promise<TelegramSendResult> {
  const activeConfig = {
    ...runtimeConfig,
    ...configOverride,
  };

  // 1. Check if event is enabled
  if (!isEventEnabled(payload.eventType, activeConfig)) {
    return {
      success: false,
      error: `Event type ${payload.eventType} is disabled in Telegram settings`,
      timestamp: Date.now(),
    };
  }

  // 2. Check duplicate protection (except for TEST messages)
  if (payload.eventType !== 'TEST' && isDuplicateAlert(payload, activeConfig.deduplicationWindowMs)) {
    return {
      success: true,
      deduplicated: true,
      timestamp: Date.now(),
    };
  }

  // 3. Format message content
  const messageText = formatLifecycleEventMessage(payload);

  // 4. If no bot credentials or running in test/mock mode, simulate send cleanly
  const hasCredentials = Boolean(activeConfig.botToken && activeConfig.chatId);

  if (!hasCredentials) {
    // Record sent to prevent repeat spam even in mock mode
    recordAlertSent(payload);
    return {
      success: true,
      mocked: true,
      messageId: Math.floor(Math.random() * 1000000),
      timestamp: Date.now(),
    };
  }

  // 5. Dispatch real HTTP call to Telegram Bot API
  const apiRes = await sendTelegramRaw(messageText, activeConfig.botToken, activeConfig.chatId);

  if (apiRes.ok) {
    recordAlertSent(payload);
    // Fan out alert to all registered subscribers with personal Telegram configured
    fanoutToSubscribers(messageText, activeConfig.botToken, activeConfig.chatId);
    return {
      success: true,
      messageId: apiRes.messageId,
      timestamp: Date.now(),
    };
  }

  return {
    success: false,
    error: apiRes.error,
    timestamp: Date.now(),
  };
}

/**
 * Helper to broadcast a newly generated signal to Telegram
 */
export async function broadcastNewSignal(
  signal: Signal,
  configOverride?: Partial<TelegramAlertConfig>
): Promise<TelegramSendResult> {
  const activeConfig = {
    ...runtimeConfig,
    ...configOverride,
  };

  // Strict AI Gatekeeper enforcement: Never broadcast signals rejected by AI
  if (signal.aiAnalysis && signal.aiAnalysis.verdict === 'REJECTED') {
    console.warn(`[Telegram Gatekeeper] Broadcast blocked for ${signal.symbol}: Signal REJECTED by AI.`);
    return {
      success: false,
      error: `Broadcast blocked: Signal was REJECTED by AI Gatekeeper (${signal.aiAnalysis.aiRationale})`,
      timestamp: Date.now(),
    };
  }

  if (!activeConfig.enabled || !activeConfig.events.onSignalCreated) {
    return {
      success: false,
      error: 'Signal creation alerts are disabled',
      timestamp: Date.now(),
    };
  }

  // User & Spec Requirement: ONLY confirmed signals must be dispatched to Telegram.
  // Signals in 'WAIT_FOR_CONFIRMATION', 'WATCH', 'AVOID', 'NO_TRADE', or 'BELOW_THRESHOLD' are strictly rejected.
  const isConfirmed =
    (signal.status === 'BUY_NOW' || signal.lifecycle === 'ENTRY_TRIGGERED' || signal.lifecycle === 'ACTIVE') &&
    signal.confidence !== 'BELOW_THRESHOLD';

  if (!isConfirmed) {
    return {
      success: false,
      error: `Signal for ${signal.symbol} is unconfirmed (status: ${signal.status}, confidence: ${signal.confidence}). Only confirmed signals are dispatched to Telegram.`,
      timestamp: Date.now(),
    };
  }

  const payload: TelegramAlertPayload = {
    eventType: 'SIGNAL_CREATED',
    signalId: signal.signalId,
    symbol: signal.symbol,
    direction: signal.direction,
    price: signal.preferredEntry,
    confidence: signal.confidence,
    setupType: signal.setupType,
    entryZone: signal.entryZone,
    targets: {
      tp1: signal.tp1,
      tp2: signal.tp2,
      tp3: signal.tp3,
      sl: signal.stopLoss,
    },
    dca1: signal.dca1,
    dca2: signal.dca2,
    initialAllocation: signal.initialAllocation,
    dca1Allocation: signal.dca1Allocation,
    dca2Allocation: signal.dca2Allocation,
    maxDeployed: signal.maxDeployed,
    maxLoss: signal.maxLoss,
    riskPercent: signal.riskPercent,
    timestamp: Date.now(),
  };

  if (isDuplicateAlert(payload, activeConfig.deduplicationWindowMs)) {
    return {
      success: true,
      deduplicated: true,
      timestamp: Date.now(),
    };
  }

  const formattedMessage = formatSignalCreatedMessage(signal);
  const hasCredentials = Boolean(activeConfig.botToken && activeConfig.chatId);

  if (!hasCredentials) {
    recordAlertSent(payload);
    return {
      success: true,
      mocked: true,
      messageId: Math.floor(Math.random() * 1000000),
      timestamp: Date.now(),
    };
  }

  const apiRes = await sendTelegramRaw(formattedMessage, activeConfig.botToken, activeConfig.chatId);

  if (apiRes.ok) {
    recordAlertSent(payload);
    // Fan out new signal to all registered subscribers
    fanoutToSubscribers(formattedMessage, activeConfig.botToken, activeConfig.chatId);
    return {
      success: true,
      messageId: apiRes.messageId,
      timestamp: Date.now(),
    };
  }

  return {
    success: false,
    error: apiRes.error,
    timestamp: Date.now(),
  };
}

// ─── Phase 32: Institutional Wall & WebSocket Health Broadcast Helpers ──

/**
 * Broadcasts a high-priority Telegram alert when an institutional liquidity wall is detected
 */
export async function broadcastInstitutionalWall(
  symbol: string,
  wall: OrderBookWall,
  currentPrice?: number,
  configOverride?: Partial<TelegramAlertConfig>
): Promise<TelegramSendResult> {
  const dist =
    wall.distancePercent !== undefined
      ? wall.distancePercent
      : wall.percentFromPrice !== undefined
      ? wall.percentFromPrice
      : currentPrice && currentPrice > 0
      ? Math.abs(((wall.price - currentPrice) / currentPrice) * 100)
      : 0;

  const payload: TelegramAlertPayload = {
    eventType: 'INSTITUTIONAL_WALL_DETECTED',
    symbol,
    price: wall.price,
    wallType: wall.type,
    wallPrice: wall.price,
    wallVolumeUsdt: wall.volumeUsdt,
    wallMultiple: wall.multipleOfAverage,
    distancePercent: Number(dist.toFixed(2)),
    timestamp: Date.now(),
  };

  return dispatchTelegramAlert(payload, configOverride);
}

/**
 * Broadcasts a Telegram alert for WebSocket connectivity transitions
 */
export async function broadcastWebSocketHealth(
  wsState: WebSocketConnectionState,
  details?: string,
  symbol: string = 'GLOBAL',
  configOverride?: Partial<TelegramAlertConfig>
): Promise<TelegramSendResult> {
  const payload: TelegramAlertPayload = {
    eventType: 'WEBSOCKET_HEALTH_ALERT',
    symbol,
    wsState,
    details,
    wsReason: details,
    timestamp: Date.now(),
  };

  return dispatchTelegramAlert(payload, configOverride);
}

/**
 * Inspects parsed depth payload walls and broadcasts alerts for any massive institutional clusters
 */
export async function checkAndBroadcastWalls(
  depthPayload: {
    symbol: string;
    bidWalls?: OrderBookWall[];
    askWalls?: OrderBookWall[];
    bestBid?: number;
    bestAsk?: number;
  },
  options: {
    minVolumeUsdt?: number;
    minMultiple?: number;
    configOverride?: Partial<TelegramAlertConfig>;
  } = {}
): Promise<TelegramSendResult[]> {
  const minVol = options.minVolumeUsdt ?? 50_000;
  const minMult = options.minMultiple ?? 3.0;
  const results: TelegramSendResult[] = [];
  const currentPrice = depthPayload.bestBid || depthPayload.bestAsk;

  const checkWallList = async (walls?: OrderBookWall[]) => {
    if (!walls || walls.length === 0) return;
    for (const wall of walls) {
      const vol = wall.volumeUsdt || 0;
      const mult = wall.multipleOfAverage || 0;
      if (vol >= minVol || mult >= minMult) {
        const res = await broadcastInstitutionalWall(
          depthPayload.symbol,
          wall,
          currentPrice,
          options.configOverride
        );
        results.push(res);
      }
    }
  };

  await checkWallList(depthPayload.bidWalls);
  await checkWallList(depthPayload.askWalls);

  return results;
}

/**
 * High-level broadcast helper for technical divergence alerts (Phase 37)
 */
export async function broadcastDivergenceAlert(
  payload: Partial<TelegramAlertPayload> & { symbol: string },
  configOverride?: Partial<TelegramAlertConfig>
): Promise<TelegramSendResult> {
  return dispatchTelegramAlert(
    {
      eventType: 'DIVERGENCE_ALERT',
      timestamp: Date.now(),
      ...payload,
    },
    configOverride
  );
}

