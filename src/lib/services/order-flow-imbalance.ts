// ─── U-SPOT Order Flow Imbalance Detector & Dispatcher (Phase 35) ──────
// Analyzes live trades, order book depth walls, and CVD divergence in real time
// Dispatches visual toast alerts and triggers synthesized audio chimes with rate-limiting

import type {
  LiveTradeTick,
  OrderBookWall,
  TradeFlowStats,
  OrderFlowToastAlert,
  OrderFlowAlertEventType,
} from '../../types/index.ts';
import {
  getOrderFlowAudioConfig,
  playBuyChime,
  playSellChime,
  playWallChime,
  playCvdSurgeChime,
} from './sound-synthesizer.ts';

export const ORDER_FLOW_TOAST_EVENT = 'uspot_orderflow_toast_alert';

/** Internal alert deduplication cache */
const alertCooldowns = new Map<string, number>();

/** Configurable cooldown windows (in milliseconds) */
export const COOLDOWN_WINDOWS_MS: Record<OrderFlowAlertEventType, number> = {
  WHALE_BUY_SWEEP: 8000,
  WHALE_SELL_SWEEP: 8000,
  INSTITUTIONAL_BID_WALL: 45000,
  INSTITUTIONAL_ASK_WALL: 45000,
  CVD_EXTREME_BUY: 30000,
  CVD_EXTREME_SELL: 30000,
};

/** Clear deduplication cooldowns (useful for tests) */
export function resetAlertCooldowns(): void {
  alertCooldowns.clear();
}

/** Check if alert is currently suppressed by cooldown window */
export function isAlertSuppressed(key: string, cooldownMs: number, now = Date.now()): boolean {
  const lastTime = alertCooldowns.get(key);
  if (!lastTime) return false;
  return now - lastTime < cooldownMs;
}

/**
 * Evaluates an executed live trade tick against whale thresholds.
 * Returns an alert payload if an aggressive sweep occurred, or null.
 */
export function evaluateTradeImbalance(
  trade: LiveTradeTick,
  thresholdOverride?: number
): OrderFlowToastAlert | null {
  const config = getOrderFlowAudioConfig();
  const threshold = thresholdOverride ?? config.whaleThresholdUsdt;

  if (trade.volumeUsdt < threshold) {
    return null;
  }

  const isBuy = trade.side === 'BUY';
  const type: OrderFlowAlertEventType = isBuy ? 'WHALE_BUY_SWEEP' : 'WHALE_SELL_SWEEP';
  const formattedUsdt = `$${Math.round(trade.volumeUsdt).toLocaleString()}`;
  const formattedPrice = `$${trade.price.toLocaleString(undefined, {
    minimumFractionDigits: trade.price < 1 ? 4 : 2,
    maximumFractionDigits: trade.price < 1 ? 4 : 2,
  })}`;

  const title = isBuy
    ? `🐳 Whale Buy Sweep: ${trade.symbol}`
    : `🚨 Whale Sell Dump: ${trade.symbol}`;

  const message = isBuy
    ? `Aggressive taker buy lifted ${formattedUsdt} at ${formattedPrice}`
    : `Aggressive taker sell dumped ${formattedUsdt} at ${formattedPrice}`;

  return {
    id: `trade_${trade.id}_${Date.now()}`,
    type,
    symbol: trade.symbol,
    title,
    message,
    price: trade.price,
    volumeUsdt: trade.volumeUsdt,
    timestamp: trade.timestamp || Date.now(),
    severity: isBuy ? 'whale' : 'bearish',
    durationMs: 5000,
  };
}

/**
 * Evaluates order book walls for institutional support or resistance alerts.
 */
export function evaluateWallImbalance(
  symbol: string,
  wall: OrderBookWall,
  type: 'BID' | 'ASK'
): OrderFlowToastAlert | null {
  // Flag walls exceeding $40k and at least 2.5x depth average
  const multiple = wall.multipleOfAverage ?? 1;
  if (wall.volumeUsdt < 40000 || multiple < 2.5) {
    return null;
  }

  const isBid = type === 'BID';
  const eventType: OrderFlowAlertEventType = isBid
    ? 'INSTITUTIONAL_BID_WALL'
    : 'INSTITUTIONAL_ASK_WALL';

  const formattedPrice = `$${wall.price.toLocaleString()}`;
  const formattedVol = `$${Math.round(wall.volumeUsdt).toLocaleString()}`;

  const title = isBid
    ? `🛡️ Institutional Bid Floor: ${symbol}`
    : `🧱 Institutional Ask Ceiling: ${symbol}`;

  const message = isBid
    ? `Support wall of ${formattedVol} (${wall.multipleOfAverage}x avg) active at ${formattedPrice}`
    : `Resistance wall of ${formattedVol} (${wall.multipleOfAverage}x avg) active at ${formattedPrice}`;

  return {
    id: `wall_${symbol}_${type}_${Math.round(wall.price)}_${Date.now()}`,
    type: eventType,
    symbol,
    title,
    message,
    price: wall.price,
    volumeUsdt: wall.volumeUsdt,
    timestamp: Date.now(),
    severity: isBid ? 'bullish' : 'bearish',
    durationMs: 6000,
  };
}

/**
 * Evaluates Cumulative Volume Delta (CVD) stats for extreme flow imbalance.
 */
export function evaluateCvdImbalance(stats: TradeFlowStats): OrderFlowToastAlert | null {
  const absNet = Math.abs(stats.netCvdUsdt);
  if (absNet < 50000 || stats.totalTrades < 10) {
    return null;
  }

  if (stats.takerBuyRatio >= 0.75) {
    return {
      id: `cvd_${stats.symbol}_buy_${Date.now()}`,
      type: 'CVD_EXTREME_BUY',
      symbol: stats.symbol,
      title: `⚡ Extreme Buy CVD Pressure: ${stats.symbol}`,
      message: `Takers lifting ${Math.round(stats.takerBuyRatio * 100)}% of volume (Net CVD: +$${Math.round(stats.netCvdUsdt).toLocaleString()})`,
      volumeUsdt: stats.netCvdUsdt,
      timestamp: Date.now(),
      severity: 'bullish',
      durationMs: 5000,
    };
  }

  if (stats.takerBuyRatio <= 0.25) {
    return {
      id: `cvd_${stats.symbol}_sell_${Date.now()}`,
      type: 'CVD_EXTREME_SELL',
      symbol: stats.symbol,
      title: `⚡ Extreme Sell CVD Pressure: ${stats.symbol}`,
      message: `Takers dumping ${Math.round((1 - stats.takerBuyRatio) * 100)}% of volume (Net CVD: -$${Math.round(Math.abs(stats.netCvdUsdt)).toLocaleString()})`,
      volumeUsdt: stats.netCvdUsdt,
      timestamp: Date.now(),
      severity: 'bearish',
      durationMs: 5000,
    };
  }

  return null;
}

/**
 * Dispatches an order flow alert:
 * 1. Checks rate-limiting cooldown.
 * 2. Emits synthesized audio chime if enabled in config.
 * 3. Dispatches visual toast event to the application window.
 */
export function dispatchOrderFlowAlert(
  alert: OrderFlowToastAlert,
  now = Date.now()
): boolean {
  const cooldownKey = `${alert.type}_${alert.symbol}_${Math.round(alert.price ?? 0)}`;
  const cooldownMs = COOLDOWN_WINDOWS_MS[alert.type] || 8000;

  if (isAlertSuppressed(cooldownKey, cooldownMs, now)) {
    return false; // Suppressed by deduplication window
  }

  alertCooldowns.set(cooldownKey, now);

  const config = getOrderFlowAudioConfig();

  // 1. Play synthesized audio chime based on alert type
  if (config.soundEnabled) {
    switch (alert.type) {
      case 'WHALE_BUY_SWEEP':
        if (config.soundTypes.buySweep) playBuyChime(config.volume);
        break;
      case 'WHALE_SELL_SWEEP':
        if (config.soundTypes.sellSweep) playSellChime(config.volume);
        break;
      case 'INSTITUTIONAL_BID_WALL':
      case 'INSTITUTIONAL_ASK_WALL':
        if (config.soundTypes.wallDetected) playWallChime(config.volume);
        break;
      case 'CVD_EXTREME_BUY':
      case 'CVD_EXTREME_SELL':
        if (config.soundTypes.cvdSurge) playCvdSurgeChime(config.volume);
        break;
    }
  }

  // 2. Dispatch visual toast if enabled
  if (config.toastsEnabled && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(ORDER_FLOW_TOAST_EVENT, { detail: alert })
    );
  }

  return true;
}
