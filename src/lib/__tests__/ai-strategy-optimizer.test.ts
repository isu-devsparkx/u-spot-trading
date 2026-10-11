// ─── U-SPOT Phase 40: AI Strategy Factor Optimizer Unit Tests ────────────
// Tests for 7-factor weight constraint normalization, correlation analysis,
// multi-objective optimization, performance simulation, and AI synthesis generation.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ALL_FACTORS,
  OBJECTIVE_DESCRIPTIONS,
  normalizeWeightsStrict,
  analyzeFactorPerformance,
  calculateOptimizedWeights,
  simulateOptimizationPerformanceDelta,
  generateAiStrategySynthesis,
  optimizeFactorWeights,
} from '../services/ai-strategy-optimizer.ts';
import { DEFAULT_SIGNAL_WEIGHTS } from '../services/signal-engine.ts';
import type { SignalHistoryRecord, SignalEvaluation, SignalWeights } from '../../types/index.ts';

describe('Phase 40: AI Strategy Synthesis & Factor Weight Optimizer', () => {
  describe('1. Strict Weight Normalization Invariants', () => {
    it('normalizes distorted weights so every factor is between 5% and 45% and sum equals exactly 100%', () => {
      const extremeWeights: Record<keyof SignalWeights, number> = {
        trend: 80,
        momentum: 2,
        volume: 0,
        structure: 50,
        liquidity: 1,
        volatility: 90,
        regime: 0,
      };

      const normalized = normalizeWeightsStrict(extremeWeights);
      const sum = ALL_FACTORS.reduce((acc, f) => acc + normalized[f], 0);

      assert.strictEqual(sum, 100, 'Sum of normalized weights must equal exactly 100');

      for (const factor of ALL_FACTORS) {
        assert.ok(
          normalized[factor] >= 5,
          `Factor ${factor} (${normalized[factor]}%) must be >= 5% floor`
        );
        assert.ok(
          normalized[factor] <= 45,
          `Factor ${factor} (${normalized[factor]}%) must be <= 45% ceiling`
        );
      }
    });

    it('preserves balanced weights that already sum to 100%', () => {
      const normalized = normalizeWeightsStrict(DEFAULT_SIGNAL_WEIGHTS);
      const sum = ALL_FACTORS.reduce((acc, f) => acc + normalized[f], 0);

      assert.strictEqual(sum, 100);
      assert.strictEqual(normalized.trend, 20);
      assert.strictEqual(normalized.structure, 20);
    });
  });

  describe('2. Factor Performance & Win Correlation Analysis', () => {
    const createSignal = (
      id: string,
      isWin: boolean,
      trendScore: number,
      momentumScore: number
    ): SignalHistoryRecord => ({
      signalId: id,
      symbol: 'SOL/USDT',
      direction: 'BUY',
      status: 'BUY_NOW',
      lifecycle: 'CLOSED',
      setupType: 'BREAKOUT_RETEST',
      marketRegime: 'BULL',
      confidence: 'A',
      entryZone: { low: 140, high: 145 },
      preferredEntry: 142,
      actualEntry: 142,
      dca1: 138,
      dca2: 135,
      dca1Hit: false,
      dca2Hit: false,
      stopLoss: 132,
      tp1: 148,
      tp2: 154,
      tp3: 162,
      riskPercent: 0.75,
      maxLoss: 100,
      initialAllocation: 100,
      dca1Allocation: 150,
      dca2Allocation: 200,
      maxDeployed: 1000,
      riskReward: 2.4,
      candidateScore: 82,
      tradeScore: 80,
      tradeScoreBreakdown: {
        trend: trendScore,
        momentum: momentumScore,
        volume: 12,
        structure: 16,
        liquidity: 10,
        volatility: 8,
        regime: 4,
        total: 80,
      },
      strategyVersion: 'v1.0.0',
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
      finalResult: isWin ? 'FULL_TP' : 'SL',
      realizedR: isWin ? 2.5 : -1.0,
      realizedReturn: isWin ? 15.0 : -6.0,
      fees: 2,
      mfe: isWin ? 18.0 : 2.0,
      mae: isWin ? -1.5 : -7.0,
      slippage: 0.05,
      evaluationText: 'review',
      createdAt: new Date().toISOString(),
    });

    const createEvaluation = (signalId: string, isWin: boolean): SignalEvaluation => ({
      signalId,
      evaluatedAt: new Date().toISOString(),
      finalResult: isWin ? 'FULL_TP' : 'SL',
      realizedR: isWin ? 2.5 : -1.0,
      realizedReturnPercent: isWin ? 15.0 : -6.0,
      netPnlUsdt: isWin ? 150 : -60,
      grossPnlUsdt: isWin ? 152 : -58,
      feesUsdt: 2,
      slippageUsdt: 0,
      mfe: isWin ? 18.0 : 2.0,
      mae: isWin ? -1.5 : -7.0,
      timeToEvent: {} as any,
      slFailurePrimaryCause: isWin ? null : 'FALSE_BREAKOUT',
      slFailureSecondaryCauses: [],
      stopTightnessLabel: 'APPROPRIATE_STOP',
      counterfactualNote: null,
      evaluationText: 'review',
    });

    it('extracts positive correlation for factors with higher scores on winning trades', () => {
      const signals: SignalHistoryRecord[] = [
        // Wins have high trend scores (18/20 = 90%)
        createSignal('sig-1', true, 18, 10),
        createSignal('sig-2', true, 19, 11),
        createSignal('sig-3', true, 17, 10),
        // Losses have low trend scores (8/20 = 40%) but high momentum (14/15 = 93%)
        createSignal('sig-4', false, 8, 14),
        createSignal('sig-5', false, 9, 15),
      ];

      const evaluations: SignalEvaluation[] = [
        createEvaluation('sig-1', true),
        createEvaluation('sig-2', true),
        createEvaluation('sig-3', true),
        createEvaluation('sig-4', false),
        createEvaluation('sig-5', false),
      ];

      const metrics = analyzeFactorPerformance(signals, evaluations);

      assert.ok(metrics.trend.winAvg > metrics.trend.lossAvg, 'Trend win average must exceed loss average');
      assert.ok(metrics.trend.correlation > 0, 'Trend factor must have positive correlation with wins');
      assert.ok(metrics.momentum.correlation < 0, 'Deceptive momentum factor must have negative correlation');
    });
  });

  describe('3. Multi-Objective Weight Optimization', () => {
    it('optimizes weights across all 5 objectives and strictly maintains the 100% sum constraint', () => {
      const mockMetrics = {
        trend: { winScores: [85], lossScores: [60], winAvg: 85, lossAvg: 60, correlation: 0.62 },
        momentum: { winScores: [65], lossScores: [75], winAvg: 65, lossAvg: 75, correlation: -0.25 },
        volume: { winScores: [80], lossScores: [65], winAvg: 80, lossAvg: 65, correlation: 0.38 },
        structure: { winScores: [90], lossScores: [60], winAvg: 90, lossAvg: 60, correlation: 0.75 },
        liquidity: { winScores: [70], lossScores: [70], winAvg: 70, lossAvg: 70, correlation: 0.0 },
        volatility: { winScores: [75], lossScores: [65], winAvg: 75, lossAvg: 65, correlation: 0.25 },
        regime: { winScores: [80], lossScores: [60], winAvg: 80, lossAvg: 60, correlation: 0.5 },
      };

      const objectives = [
        'MAX_EXPECTANCY',
        'MAX_PROFIT_FACTOR',
        'MAX_WIN_RATE',
        'MIN_DRAWDOWN',
        'BALANCED_ALPHA',
      ] as const;

      for (const obj of objectives) {
        const { optimizedWeights, adjustments } = calculateOptimizedWeights(
          DEFAULT_SIGNAL_WEIGHTS,
          mockMetrics as any,
          obj
        );

        const sum = ALL_FACTORS.reduce((acc, f) => acc + optimizedWeights[f], 0);
        assert.strictEqual(sum, 100, `Sum of weights for ${obj} must equal 100`);
        assert.strictEqual(adjustments.length, 7, 'Must produce 7 factor adjustments');

        if (obj === 'MIN_DRAWDOWN') {
          // Defensive profile must heavily boost volatility & regime
          assert.ok(
            optimizedWeights.volatility >= DEFAULT_SIGNAL_WEIGHTS.volatility,
            'MIN_DRAWDOWN must boost volatility buffer'
          );
        } else if (obj === 'MAX_EXPECTANCY') {
          // Expectancy optimizer must boost top correlated factors (structure & trend)
          assert.ok(
            optimizedWeights.structure > DEFAULT_SIGNAL_WEIGHTS.structure,
            'MAX_EXPECTANCY must boost high-alpha structure'
          );
        }
      }
    });
  });

  describe('4. Simulation Delta & AI Synthesis Commentary', () => {
    it('computes positive expectancy and win rate delta simulation', () => {
      const mockAdjustments = [
        {
          factor: 'trend' as const,
          originalWeight: 20,
          optimizedWeight: 26,
          delta: 6,
          factorCorrelationWithWin: 0.5,
          winAvgScore: 85,
          lossAvgScore: 65,
          rationale: 'Increased +6%',
        },
      ];

      const sim = simulateOptimizationPerformanceDelta(mockAdjustments as any, 25, 'MAX_EXPECTANCY');

      assert.ok(sim.expectancyDelta > 0, 'Expectancy delta must be positive');
      assert.ok(sim.winRateDelta > 0, 'Win rate delta must be positive');
      assert.ok(sim.profitFactorDelta > 0, 'Profit factor delta must be positive');
      assert.ok(sim.netPnlDelta > 0, 'Net PnL delta must be positive');
      assert.strictEqual(sim.optimizedExpectancy, sim.baselineExpectancy + sim.expectancyDelta);
    });

    it('generates structured AI synthesis commentary and tactical advice', () => {
      const mockAdjustments = [
        {
          factor: 'trend' as const,
          originalWeight: 20,
          optimizedWeight: 25,
          delta: 5,
          factorCorrelationWithWin: 0.6,
          winAvgScore: 85,
          lossAvgScore: 60,
          rationale: 'Trend expanded',
        },
        {
          factor: 'momentum' as const,
          originalWeight: 15,
          optimizedWeight: 10,
          delta: -5,
          factorCorrelationWithWin: -0.2,
          winAvgScore: 60,
          lossAvgScore: 70,
          rationale: 'Momentum trimmed',
        },
      ];

      const sim = simulateOptimizationPerformanceDelta(mockAdjustments as any, 30, 'MAX_EXPECTANCY');
      const synthesis = generateAiStrategySynthesis(mockAdjustments as any, sim, 'MAX_EXPECTANCY');

      assert.ok(synthesis.summary.length > 20, 'Summary must be descriptive');
      assert.ok(synthesis.keyStrengths.length > 0, 'Must provide key strengths');
      assert.ok(synthesis.regimeSpecificAdvice.length > 0, 'Must provide regime advice');
      assert.ok(synthesis.warnings.length > 0, 'Must include risk management warnings');
      assert.ok(synthesis.recommendedSetupBias.length > 0, 'Must recommend setup biases');
    });
  });

  describe('5. End-to-End Optimizer Execution', () => {
    it('executes optimizeFactorWeights and returns full report with valid schema', async () => {
      const report = await optimizeFactorWeights({
        objective: 'MAX_EXPECTANCY',
      });

      assert.ok(report.id.startsWith('OPT_'));
      assert.strictEqual(report.objective, 'MAX_EXPECTANCY');
      assert.strictEqual(report.status, 'OPTIMIZED');

      const sum = ALL_FACTORS.reduce((acc, f) => acc + report.optimizedWeights[f], 0);
      assert.strictEqual(sum, 100, 'End-to-end optimized weights must sum to 100');

      assert.strictEqual(report.adjustments.length, 7);
      assert.ok(report.simulation.optimizedExpectancy > report.simulation.baselineExpectancy);
      assert.ok(report.aiSynthesis.summary.length > 0);
    });
  });
});
