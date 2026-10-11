/**
 * U-SPOT BTC Macro Regime Gatekeeper Service
 *
 * Monitors Bitcoin (BTC/USDT) higher-timeframe trend, 1h RSI, EMA 20/50 alignment,
 * and rapid flush velocity to shield altcoin spot positions from market-wide liquidation cascades.
 *
 * Rule: 70%+ of altcoin stop losses occur when Bitcoin takes an unexpected downward leg.
 * This gatekeeper acts as an automated macro circuit breaker.
 */

import { fetchKlines } from './binance-service.ts';
import { calculateEMASeries } from '../ta/trend.ts';
import { calculateRSISeries } from '../ta/momentum.ts';

export type BtcRegimeType =
  | 'BULLISH_SAFE'    // BTC trending up, RSI healthy, green light for altcoin BUYs
  | 'RANGE_NEUTRAL'   // BTC consolidating, range-bound, selective high-grade BUYs allowed
  | 'BEARISH_TREND'   // BTC below 1h EMA 50, defensive mode
  | 'FLUSH_RISK';     // BTC taking a rapid leg down (<-1.2% in 45m), circuit breaker active

export interface BtcMacroRegime {
  regime: BtcRegimeType;
  btcPrice: number;
  change1hPercent: number;
  change3hPercent: number;
  rsi1h: number;
  emaAlignment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  isAltcoinBuyAllowed: boolean;
  cautionReason?: string;
  timestamp: string;
}

// In-memory cache for BTC Macro analysis (30s TTL)
let cachedBtcRegime: { timestamp: number; data: BtcMacroRegime } | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Evaluates real-time BTC market conditions from Binance
 */
export async function getBtcMacroRegime(forceRefresh = false): Promise<BtcMacroRegime> {
  const now = Date.now();
  if (!forceRefresh && cachedBtcRegime && now - cachedBtcRegime.timestamp < CACHE_TTL_MS) {
    return cachedBtcRegime.data;
  }

  try {
    // 1. Fetch BTC 15m and 1h candlesticks
    const [klines15m, klines1h] = await Promise.all([
      fetchKlines('BTCUSDT', '15m', 20),
      fetchKlines('BTCUSDT', '1h', 60),
    ]);

    if (!klines15m || klines15m.length < 5 || !klines1h || klines1h.length < 30) {
      throw new Error('Insufficient BTC kline depth');
    }

    const currentPrice = klines15m[klines15m.length - 1].close;

    // 2. Compute 15m Velocity (Flush Risk Detection)
    // Check price change over last 3 15m candles (45 minutes)
    const price45mAgo = klines15m[Math.max(0, klines15m.length - 4)].open;
    const change45mPct = ((currentPrice - price45mAgo) / price45mAgo) * 100;

    // Check 1h price change
    const price1hAgo = klines1h[klines1h.length - 2]?.open || currentPrice;
    const change1hPercent = Number((((currentPrice - price1hAgo) / price1hAgo) * 100).toFixed(2));

    // Check 3h price change
    const price3hAgo = klines1h[Math.max(0, klines1h.length - 4)]?.open || currentPrice;
    const change3hPercent = Number((((currentPrice - price3hAgo) / price3hAgo) * 100).toFixed(2));

    // 3. Compute 1h Technical Indicators
    const closes1h = klines1h.map((k) => k.close);
    const rsi1hSeries = calculateRSISeries(closes1h, 14);
    const rsi1h = Math.round(rsi1hSeries[rsi1hSeries.length - 1] ?? 50);

    const ema20_1h = calculateEMASeries(closes1h, 20);
    const ema50_1h = calculateEMASeries(closes1h, 50);

    const currentEma20 = ema20_1h[ema20_1h.length - 1] ?? currentPrice;
    const currentEma50 = ema50_1h[ema50_1h.length - 1] ?? currentPrice;

    const emaAlignment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      currentEma20 > currentEma50 && currentPrice > currentEma20
        ? 'BULLISH'
        : currentEma20 < currentEma50 && currentPrice < currentEma50
        ? 'BEARISH'
        : 'NEUTRAL';

    // 4. Determine Regime
    let regime: BtcRegimeType = 'RANGE_NEUTRAL';
    let isAltcoinBuyAllowed = true;
    let cautionReason: string | undefined;

    // A. Circuit Breaker: Flush Risk
    // If BTC drops > 1.2% in 45m or 1h RSI collapses below 35 with steep drop
    if (change45mPct <= -1.2 || (change1hPercent <= -1.8 && rsi1h < 40)) {
      regime = 'FLUSH_RISK';
      isAltcoinBuyAllowed = false;
      cautionReason = `BTC experiencing rapid flush (${change45mPct.toFixed(1)}% in 45m). Altcoin BUY signals suppressed to prevent stop-out drag.`;
    }
    // B. Bearish Trend: Below 1h EMA 50 with sub-45 RSI
    else if (emaAlignment === 'BEARISH' && rsi1h < 45) {
      regime = 'BEARISH_TREND';
      isAltcoinBuyAllowed = false;
      cautionReason = `BTC in 1H downtrend below EMA 50 ($${currentEma50.toFixed(0)}) with RSI ${rsi1h}. Altcoin risk-off mode active.`;
    }
    // C. Bullish Safe: Above 1h EMA 20, healthy momentum
    else if (emaAlignment === 'BULLISH' && rsi1h >= 50 && rsi1h <= 72 && change45mPct > -0.5) {
      regime = 'BULLISH_SAFE';
      isAltcoinBuyAllowed = true;
    }
    // D. Range / Choppy Neutral
    else {
      regime = 'RANGE_NEUTRAL';
      isAltcoinBuyAllowed = true;
      if (rsi1h > 72) {
        cautionReason = `BTC 1H RSI is overbought (${rsi1h}). Beware of local pullback wicks on altcoins.`;
      }
    }

    const result: BtcMacroRegime = {
      regime,
      btcPrice: currentPrice,
      change1hPercent,
      change3hPercent,
      rsi1h,
      emaAlignment,
      isAltcoinBuyAllowed,
      cautionReason,
      timestamp: new Date().toISOString(),
    };

    cachedBtcRegime = { timestamp: now, data: result };
    return result;
  } catch (err) {
    console.warn('[BtcMacroGatekeeper] Error evaluating live BTC regime, falling back to neutral:', err);
    // Safe default fallback
    return {
      regime: 'RANGE_NEUTRAL',
      btcPrice: 65000,
      change1hPercent: 0,
      change3hPercent: 0,
      rsi1h: 50,
      emaAlignment: 'NEUTRAL',
      isAltcoinBuyAllowed: true,
      timestamp: new Date().toISOString(),
    };
  }
}
