// ─── GET & POST /api/signals ─────────────────────────────────────────
// Phase 6: Live Signal Engine Evaluation API Endpoint
// Spec Sections: 9 (Signal Engine), 10 (Trade Scoring), 11 (Entry), 14 (Position Sizing)

import { NextResponse } from 'next/server';
import { getMarketUniverse } from '@/lib/services/market-universe';
import { fetchAllTickers24h, fetchKlines, fetchOrderBook } from '@/lib/services/binance-service';
import { scanMarketUniverse } from '@/lib/services/scanner-service';
import {
  generateSignalFromCandidate,
  generateSyntheticOHLCV,
  DEFAULT_SIGNAL_WEIGHTS,
} from '@/lib/services/signal-engine';
import { runTechnicalAnalysis, evaluateMultiTimeframeConfluence } from '@/lib/ta';
import { saveSignal, saveSignals, saveMarketSnapshot, hasActiveSignal } from '@/lib/services/signal-store';
import { broadcastNewSignal } from '@/lib/services/telegram-service';
import { evaluateSignalWithAi } from '@/lib/services/ai-signal-service';
import { getBtcMacroRegime, type BtcMacroRegime } from '@/lib/services/btc-gatekeeper';
import type {
  Signal,
  SignalStatus,
  ConfidenceGrade,
  SignalWeights,
  MarketRegime,
  OHLCV,
} from '@/types';

// In-memory cache for evaluated signals (15s TTL)
interface CachedSignals {
  timestamp: number;
  signals: Signal[];
  summary: {
    totalEvaluated: number;
    buyNowCount: number;
    waitForConfirmationCount: number;
    watchCount: number;
    noTradeCount: number;
    averageTradeScore: number;
    topGrade: ConfidenceGrade;
  };
  marketRegime: string;
  btcMacro?: BtcMacroRegime;
}

let signalCache: CachedSignals | null = null;
const CACHE_TTL_MS = 15_000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const walletBalance = searchParams.get('wallet')
      ? Math.max(10, Number(searchParams.get('wallet')))
      : 300;
    const statusParam = searchParams.get('status')?.toUpperCase() || 'ALL';
    const gradeParam = searchParams.get('grade')?.toUpperCase() || 'ALL';
    const symbolParam = searchParams.get('symbol')?.toUpperCase() || '';
    const limit = searchParams.get('limit')
      ? Math.min(50, Math.max(1, Number(searchParams.get('limit'))))
      : 20;

    const now = Date.now();
    let evaluatedSignals: Signal[] = [];
    let summary: CachedSignals['summary'];
    let marketRegime = 'NEUTRAL';

    let btcMacroState: BtcMacroRegime | undefined;

    // Check cache
    if (!forceRefresh && signalCache && now - signalCache.timestamp < CACHE_TTL_MS) {
      evaluatedSignals = signalCache.signals;
      summary = signalCache.summary;
      marketRegime = signalCache.marketRegime;
      btcMacroState = signalCache.btcMacro;
    } else {
      // 1. Get market universe, tickers, and BTC Macro Regime
      const [universe, tickers, btcMacro] = await Promise.all([
        getMarketUniverse(forceRefresh),
        fetchAllTickers24h(),
        getBtcMacroRegime(forceRefresh),
      ]);
      btcMacroState = btcMacro;

      // 2. Scan universe for Top 20 Candidates
      const scanResult = scanMarketUniverse(universe.pairs, tickers, {
        filters: { limit: 20 },
      });

      marketRegime = scanResult.regimeAnalysis.regime;
      const candidates = scanResult.candidates;

      // 3. For each candidate, evaluate technical analysis & generate signal
      const generatedList: Signal[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        let klines;
        let klines1h: OHLCV[] | null = null;
        let orderBook = null;

        // Fetch real Binance klines (15m + 1h) and order book for top candidates; fall back to synthetic
        try {
          if (i < 8) {
            const [fetchedKlines, fetchedDepth, fetched1h] = await Promise.all([
              fetchKlines(candidate.symbol, '15m', 80),
              fetchOrderBook(candidate.symbol, 20).catch(() => null),
              fetchKlines(candidate.symbol, '1h', 50).catch(() => null),
            ]);
            klines = fetchedKlines;
            orderBook = fetchedDepth;
            klines1h = fetched1h;
          } else {
            klines = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
          }
        } catch {
          klines = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
        }

        const ta = runTechnicalAnalysis(candidate.symbol, klines, '15m', orderBook);
        const mtf = evaluateMultiTimeframeConfluence({
          symbol: candidate.symbol,
          klines15m: klines,
          klines1h: klines1h || undefined,
          currentPrice: candidate.price,
        });

        const signal = generateSignalFromCandidate({
          candidate,
          ta,
          mtfAnalysis: mtf,
          walletBalance,
          weights: DEFAULT_SIGNAL_WEIGHTS,
        });

        // BTC Circuit Breaker Check: protect altcoin BUY setups if Bitcoin is flushing or in steep downtrend
        if (btcMacro && !btcMacro.isAltcoinBuyAllowed && candidate.symbol !== 'BTCUSDT') {
          if (btcMacro.regime === 'FLUSH_RISK') {
            signal.status = 'AVOID';
            signal.tradeScore = Math.max(20, signal.tradeScore - 25);
            signal.rationale = `[BTC Macro Circuit Breaker: ${btcMacro.cautionReason}] ${signal.rationale || ''}`;
          } else if (btcMacro.regime === 'BEARISH_TREND' && signal.status === 'BUY_NOW') {
            signal.status = 'WAIT_FOR_CONFIRMATION';
            signal.tradeScore = Math.max(30, signal.tradeScore - 15);
            signal.rationale = `[BTC Macro Drag: ${btcMacro.cautionReason}] ${signal.rationale || ''}`;
          }
        }

        // Strict AI Gatekeeper: audit BUY_NOW and WAIT_FOR_CONFIRMATION signals before publishing
        if (signal.status === 'BUY_NOW' || signal.status === 'WAIT_FOR_CONFIRMATION') {
          try {
            const aiAnalysis = await evaluateSignalWithAi(signal);
            signal.aiAnalysis = aiAnalysis;
            if (aiAnalysis.verdict === 'REJECTED') {
              signal.status = 'AVOID';
              signal.rationale = `[AI Gatekeeper Rejected: ${aiAnalysis.aiRationale}] ${signal.rationale || ''}`;
            } else if (aiAnalysis.verdict === 'CAUTION') {
              signal.status = 'WAIT_FOR_CONFIRMATION';
            }
          } catch (aiErr) {
            console.warn(`[AI Gatekeeper Warning] Could not audit ${signal.symbol}:`, aiErr);
          }
        }

        generatedList.push(signal);
      }

      // Sort signals by status priority and trade score
      const statusPriority: Record<SignalStatus, number> = {
        BUY_NOW: 5,
        WAIT_FOR_CONFIRMATION: 4,
        WATCH: 3,
        SELL_EXIT: 2,
        AVOID: 1,
        NO_TRADE: 0,
      };

      generatedList.sort((a, b) => {
        const pDiff =
          (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
        if (pDiff !== 0) return pDiff;
        return b.tradeScore - a.tradeScore;
      });

      const buyNowCount = generatedList.filter((s) => s.status === 'BUY_NOW').length;
      const waitForConfirmationCount = generatedList.filter(
        (s) => s.status === 'WAIT_FOR_CONFIRMATION'
      ).length;
      const watchCount = generatedList.filter((s) => s.status === 'WATCH').length;
      const noTradeCount = generatedList.filter(
        (s) => s.status === 'NO_TRADE' || s.status === 'AVOID'
      ).length;

      const totalScore = generatedList.reduce((acc, s) => acc + s.tradeScore, 0);
      const averageTradeScore =
        generatedList.length > 0
          ? Math.round(totalScore / generatedList.length)
          : 0;

      const topGrade =
        generatedList.length > 0 ? generatedList[0].confidence : 'BELOW_THRESHOLD';

      summary = {
        totalEvaluated: generatedList.length,
        buyNowCount,
        waitForConfirmationCount,
        watchCount,
        noTradeCount,
        averageTradeScore,
        topGrade,
      };

      evaluatedSignals = generatedList;

      // Persist only AI-APPROVED confirmed BUY_NOW signals that do not already have an active trade open
      const confirmedToPersist = evaluatedSignals.filter(
        (s) =>
          s.status === 'BUY_NOW' &&
          s.confidence !== 'BELOW_THRESHOLD' &&
          (!s.aiAnalysis || s.aiAnalysis.verdict === 'APPROVED')
      );
      if (confirmedToPersist.length > 0) {
        (async () => {
          for (const sig of confirmedToPersist) {
            const active = await hasActiveSignal(sig.symbol);
            if (!active) {
              await saveSignal(sig);
            }
          }
        })().catch((err) => {
          console.warn('[/api/signals] Background confirmed signal persistence failed:', err);
        });
      }

      for (const cand of candidates.slice(0, 5)) {
        saveMarketSnapshot({
          timestamp: new Date().toISOString(),
          symbol: cand.symbol,
          price: cand.price,
          volume24h: cand.volume24h,
          liquidity: cand.liquidity,
          spread: cand.rawMetrics?.spreadPercent ?? 0,
          marketRegime: marketRegime as MarketRegime,
          indicators: {
            change24h: cand.change24h,
            dailyRangePercent: cand.rawMetrics?.dailyRangePercent ?? 0,
            candidateScore: cand.candidateScore,
          },
        }).catch(() => { });
      }

      // Update cache
      signalCache = {
        timestamp: now,
        signals: evaluatedSignals,
        summary,
        marketRegime,
        btcMacro: btcMacroState,
      };
    }

    // Apply filtering
    let filtered = evaluatedSignals;

    // Strict Directive: Never show any signal rejected by AI
    filtered = filtered.filter((s) => s.aiAnalysis?.verdict !== 'REJECTED');

    // If aiConfirmedOnly is requested, retain strictly approved ones
    const aiConfirmedOnly = searchParams.get('aiConfirmedOnly') === 'true';
    if (aiConfirmedOnly) {
      filtered = filtered.filter((s) => s.aiAnalysis?.verdict === 'APPROVED');
    }

    if (symbolParam) {
      filtered = filtered.filter((s) =>
        s.symbol.toUpperCase().includes(symbolParam)
      );
    }

    if (statusParam !== 'ALL') {
      filtered = filtered.filter((s) => s.status === statusParam);
    }

    if (gradeParam !== 'ALL') {
      filtered = filtered.filter((s) => s.confidence === gradeParam);
    }

    const returnedSignals = filtered.slice(0, limit);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      marketRegime,
      btcMacro: btcMacroState,
      walletBalance,
      summary,
      totalAvailable: filtered.length,
      signals: returnedSignals,
    });
  } catch (error) {
    console.error('Error in GET /api/signals:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Signal evaluation failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      walletBalance = 300,
      weights = DEFAULT_SIGNAL_WEIGHTS,
      refresh = false,
      limit = 20,
    } = body;

    // Fetch and scan
    const [universe, tickers] = await Promise.all([
      getMarketUniverse(Boolean(refresh)),
      fetchAllTickers24h(),
    ]);

    const scanResult = scanMarketUniverse(universe.pairs, tickers, {
      filters: { limit },
    });

    const signals: Signal[] = [];

    for (let i = 0; i < scanResult.candidates.length; i++) {
      const candidate = scanResult.candidates[i];
      let klines;
      try {
        if (i < 8) {
          klines = await fetchKlines(candidate.symbol, '15m', 80);
        } else {
          klines = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
        }
      } catch {
        klines = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
      }

      const ta = runTechnicalAnalysis(candidate.symbol, klines, '15m', null);
      const mtf = evaluateMultiTimeframeConfluence({
        symbol: candidate.symbol,
        klines15m: klines,
        currentPrice: candidate.price,
      });

      const signal = generateSignalFromCandidate({
        candidate,
        ta,
        mtfAnalysis: mtf,
        walletBalance,
        weights: weights as SignalWeights,
      });

      // Strict AI Gatekeeper: audit BUY_NOW signals before publishing
      if (signal.status === 'BUY_NOW') {
        try {
          const aiAnalysis = await evaluateSignalWithAi(signal);
          signal.aiAnalysis = aiAnalysis;
          if (aiAnalysis.verdict === 'REJECTED') {
            signal.status = 'AVOID';
            signal.rationale = `[AI Gatekeeper Rejected: ${aiAnalysis.aiRationale}] ${signal.rationale || ''}`;
          } else if (aiAnalysis.verdict === 'CAUTION') {
            signal.status = 'WAIT_FOR_CONFIRMATION';
          }
        } catch (aiErr) {
          console.warn(`[AI Gatekeeper Warning] Could not audit ${signal.symbol}:`, aiErr);
        }
      }

      signals.push(signal);
    }

    // Persist and broadcast only AI-APPROVED confirmed BUY_NOW signals that do not already have an active trade open
    const confirmedCustomSignals = signals.filter(
      (s) =>
        s.status === 'BUY_NOW' &&
        s.confidence !== 'BELOW_THRESHOLD' &&
        (!s.aiAnalysis || s.aiAnalysis.verdict === 'APPROVED')
    );
    if (confirmedCustomSignals.length > 0) {
      (async () => {
        for (const sig of confirmedCustomSignals) {
          const active = await hasActiveSignal(sig.symbol);
          if (!active) {
            await saveSignal(sig);
            broadcastNewSignal(sig).catch((err) => {
              console.warn(`[/api/signals] Failed to broadcast custom confirmed signal ${sig.symbol}:`, err);
            });
          }
        }
      })().catch((err) => {
        console.warn('[/api/signals] Background custom signal persistence failed:', err);
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      marketRegime: scanResult.regimeAnalysis.regime,
      walletBalance,
      signals,
    });
  } catch (error) {
    console.error('Error in POST /api/signals:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Custom signal evaluation failed',
      },
      { status: 500 }
    );
  }
}
