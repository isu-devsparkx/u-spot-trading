import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fetchMarketNews, getMacroMarketSentiment } from '../services/news-service.ts';
import { getTradeMemoryInsights } from '../services/ai-memory-service.ts';
import { evaluateSignalWithAi, generateAiSignal } from '../services/ai-signal-service.ts';
import { formatSignalCreatedMessage, broadcastNewSignal } from '../services/telegram-service.ts';
import { runTechnicalAnalysis } from '../ta/index.ts';
import { generateSyntheticOHLCV } from '../services/signal-engine.ts';
import type { Signal, CandidateCoin, TechnicalAnalysisResult } from '../../types/index.ts';

function createMockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: `TEST-AI-${Date.now()}`,
    symbol: 'ETH/USDT',
    direction: 'BUY',
    createdAt: new Date().toISOString(),
    strategyVersion: 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 88,
    tradeScore: 85,
    setupType: 'PULLBACK_CONTINUATION',
    entryZone: { low: 2600.0, high: 2650.0 },
    preferredEntry: 2620.0,
    dca1: 2540.0,
    dca2: 2470.0,
    stopLoss: 2420.0,
    tp1: 2750.0,
    tp2: 2880.0,
    tp3: 3050.0,
    riskPercent: 1.0,
    maxLoss: 12.0,
    initialAllocation: 150.0,
    dca1Allocation: 90.0,
    dca2Allocation: 60.0,
    maxDeployed: 300.0,
    riskReward: 2.6,
    confidence: 'A',
    status: 'BUY_NOW',
    lifecycle: 'CREATED',
    expiresAt: new Date(Date.now() + 14400000).toISOString(),
    ...overrides,
  };
}

describe('Phase 17: AI Signal Generation & Pre-Publish Gatekeeper', () => {

  describe('Market News & Macro Sentiment Service', () => {
    test('fetchMarketNews returns array of formatted news items with sentiment tags', async () => {
      const news = await fetchMarketNews(3);
      assert.ok(Array.isArray(news));
      assert.ok(news.length > 0);
      assert.ok(news[0].title);
      assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(news[0].sentiment));
    });

    test('getMacroMarketSentiment returns bounded score and descriptive summary', async () => {
      const macro = await getMacroMarketSentiment();
      assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(macro.sentiment));
      assert.ok(macro.score >= -100 && macro.score <= 100);
      assert.ok(typeof macro.summary === 'string');
      assert.ok(macro.summary.length > 10);
    });
  });

  describe('AI Continuous Learning & Trade Memory Service', () => {
    test('getTradeMemoryInsights extracts win rate, setup performance, and compiled context', async () => {
      const insight = await getTradeMemoryInsights(true);
      assert.ok(insight);
      assert.strictEqual(typeof insight.overallWinRate, 'number');
      assert.ok(insight.overallWinRate >= 0 && insight.overallWinRate <= 100);
      assert.ok(typeof insight.compiledPromptContext === 'string');
      assert.ok(insight.compiledPromptContext.length > 0);
    });
  });

  describe('AI Signal Gatekeeper Engine', () => {
    test('approves a high-scoring setup with favorable risk-reward', async () => {
      const goodSignal = createMockSignal({
        tradeScore: 86,
        riskReward: 2.6,
      });

      const analysis = await evaluateSignalWithAi(goodSignal);
      assert.ok(analysis);
      assert.ok(['APPROVED', 'CAUTION'].includes(analysis.verdict));
      assert.ok(analysis.confidenceScore >= 60);
      assert.ok(analysis.aiRationale.length > 15);
      assert.ok(Array.isArray(analysis.keyRisks));
      assert.ok(Array.isArray(analysis.keyStrengths));
    });

    test('strictly rejects a setup with substandard risk-reward (< 1.8R)', async () => {
      const badSignal = createMockSignal({
        tradeScore: 55,
        riskReward: 1.4,
        stopLoss: 2500, // Very tight SL relative to tiny TP
        tp2: 2650,
      });

      const analysis = await evaluateSignalWithAi(badSignal);
      assert.ok(analysis);
      assert.strictEqual(analysis.verdict, 'REJECTED');
      assert.ok(analysis.confidenceScore < 70);
      assert.ok(analysis.keyRisks.some((r) => r.includes('Risk-Reward') || r.includes('score')));
    });
  });

  describe('Autonomous AI Signal Generator', () => {
    test('generates valid spot long signal with strictly ordered levels', async () => {
      const mockCandidate: CandidateCoin = {
        symbol: 'SOL/USDT',
        name: 'Solana',
        price: 150.0,
        volume24h: 85000000,
        volumeRatio: 1.4,
        liquidity: 90,
        change24h: 4.5,
        candidateScore: 84,
        marketRegime: 'BULL',
        reasonSelected: 'Strong volume breakout',
      };

      const klines = generateSyntheticOHLCV(150.0, 4.5, 80);
      const mockTa = runTechnicalAnalysis('SOL/USDT', klines, '15m', null);

      const signal = await generateAiSignal(mockCandidate, mockTa, 300);
      assert.ok(signal);
      assert.strictEqual(signal.symbol, 'SOL/USDT');
      assert.strictEqual(signal.isAiGenerated, true);
      assert.ok(signal.aiAnalysis);
      assert.strictEqual(signal.aiAnalysis.verdict, 'APPROVED');

      // Verify level hierarchy: SL < DCA2 < DCA1 < Entry <= TP1 < TP2 < TP3
      assert.ok(signal.stopLoss < signal.dca2);
      assert.ok(signal.dca2 < signal.dca1);
      assert.ok(signal.dca1 < signal.preferredEntry);
      assert.ok(signal.preferredEntry < signal.tp1);
      assert.ok(signal.tp1 < signal.tp2);
      assert.ok(signal.tp2 < signal.tp3);
      assert.ok(signal.riskReward >= 2.0);
    });
  });

  describe('Telegram AI Gatekeeper & Review Integration', () => {
    test('formatSignalCreatedMessage appends AI Review block when aiAnalysis is present', () => {
      const signalWithAi = createMockSignal({
        aiAnalysis: {
          verdict: 'APPROVED',
          confidenceScore: 89,
          aiRationale: 'Strong RSI bounce with 2.6R target.',
          keyRisks: ['Approaching 4h resistance cluster'],
          keyStrengths: ['Positive volume delta proxy'],
          regimeAlignment: 'BULLISH',
          source: 'GEMINI',
          evaluatedAt: new Date().toISOString(),
        },
      });

      const message = formatSignalCreatedMessage(signalWithAi);
      assert.ok(message.includes('AI Review:'));
      assert.ok(message.includes('APPROVED'));
      assert.ok(message.includes('89% Confidence'));
      assert.ok(message.includes('Strong RSI bounce'));
      assert.ok(message.includes('Approaching 4h resistance'));
    });

    test('broadcastNewSignal blocks broadcast when signal was rejected by AI', async () => {
      const rejectedSignal = createMockSignal({
        aiAnalysis: {
          verdict: 'REJECTED',
          confidenceScore: 45,
          aiRationale: 'Weak volume in high volatility zone.',
          keyRisks: ['Fakeout probability high'],
          keyStrengths: [],
          regimeAlignment: 'BEARISH',
          source: 'GEMINI',
          evaluatedAt: new Date().toISOString(),
        },
      });

      const result = await broadcastNewSignal(rejectedSignal);
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('REJECTED by AI Gatekeeper'));
    });
  });
});
