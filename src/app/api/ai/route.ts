// ─── GET & POST /api/ai ────────────────────────────────────────────────
// AI Signal Generation & Gatekeeper API Endpoint
// Provides Gemini status, autonomous AI signal generation, and trade memory inspection.

import { NextResponse } from 'next/server';
import { getGeminiConfig, evaluateSignalWithAi, generateAiSignal } from '@/lib/services/ai-signal-service';
import { getTradeMemoryInsights } from '@/lib/services/ai-memory-service';
import { fetchMarketNews, getMacroMarketSentiment } from '@/lib/services/news-service';
import { getMarketUniverse } from '@/lib/services/market-universe';
import { fetchAllTickers24h, fetchKlines } from '@/lib/services/binance-service';
import { scanMarketUniverse } from '@/lib/services/scanner-service';
import { runTechnicalAnalysis } from '@/lib/ta';
import { generateSyntheticOHLCV } from '@/lib/services/signal-engine';

export async function GET() {
  try {
    const config = getGeminiConfig();
    const [memory, macro, news] = await Promise.all([
      getTradeMemoryInsights(),
      getMacroMarketSentiment(),
      fetchMarketNews(5),
    ]);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      aiEngine: {
        isConfigured: config.isConfigured,
        model: config.model,
        mode: config.isConfigured ? 'GEMINI_ACTIVE' : 'HEURISTIC_GATEKEEPER',
        provider: 'Google Gemini',
      },
      macroSentiment: macro,
      tradeMemory: {
        totalTradesAnalyzed: memory.totalAnalyzed,
        overallWinRate: memory.overallWinRate,
        recommendations: memory.recommendations,
        setupStats: memory.setupStats,
      },
      latestNews: news,
    });
  } catch (err) {
    console.error('Error in GET /api/ai:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'AI status inspection failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action = 'GENERATE', signal, symbol, walletBalance = 300 } = body;

    // Action 1: Strict Gatekeeper Evaluation of an existing signal
    if (action === 'EVALUATE') {
      if (!signal) {
        return NextResponse.json(
          { success: false, error: 'Missing required "signal" object for EVALUATE action' },
          { status: 400 }
        );
      }
      const aiAnalysis = await evaluateSignalWithAi(signal);
      return NextResponse.json({
        success: true,
        timestamp: Date.now(),
        aiAnalysis,
      });
    }

    // Action 2: Autonomous AI Signal Generation
    if (action === 'GENERATE') {
      const [universe, tickers] = await Promise.all([
        getMarketUniverse(),
        fetchAllTickers24h(),
      ]);

      const scanResult = scanMarketUniverse(universe.pairs, tickers, {
        filters: { limit: 10 },
      });

      let candidate = scanResult.candidates[0];

      if (symbol) {
        const found = scanResult.candidates.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
        if (found) {
          candidate = found;
        }
      }

      if (!candidate) {
        return NextResponse.json(
          { success: false, error: 'No suitable market candidates found for AI generation' },
          { status: 404 }
        );
      }

      let klines;
      try {
        klines = await fetchKlines(candidate.symbol, '15m', 80);
      } catch {
        klines = generateSyntheticOHLCV(candidate.price, candidate.change24h, 80);
      }

      const ta = runTechnicalAnalysis(candidate.symbol, klines, '15m', null);
      const generatedSignal = await generateAiSignal(candidate, ta, walletBalance);

      if (!generatedSignal) {
        return NextResponse.json(
          {
            success: false,
            message: `AI determined market conditions or risk-reward on ${candidate.symbol} did not warrant a trade.`,
            candidate: {
              symbol: candidate.symbol,
              price: candidate.price,
              score: candidate.candidateScore,
            },
          },
          { status: 200 }
        );
      }

      return NextResponse.json({
        success: true,
        timestamp: Date.now(),
        signal: generatedSignal,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action "${action}". Valid actions: EVALUATE, GENERATE.` },
      { status: 400 }
    );
  } catch (err) {
    console.error('Error in POST /api/ai:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'AI operation failed' },
      { status: 500 }
    );
  }
}
