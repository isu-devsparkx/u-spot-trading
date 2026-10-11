import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { OHLCV } from '../../types/index.ts';
import {
  generateWalkForwardWindows,
  calculateWindowEfficiency,
  determineRobustnessGrade,
  runWalkForwardValidation,
  DEFAULT_WALK_FORWARD_CANDIDATES,
  DEFAULT_MTF_GRID_CANDIDATES,
  generateMtfGridCandidates,
} from '../services/walk-forward-service.ts';

/** Helper to generate synthetic test candles */
function generateTestCandles(count: number, basePrice = 100): OHLCV[] {
  const candles: OHLCV[] = [];
  let price = basePrice;
  const now = 1700000000000;
  const interval = 15 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    // Generate realistic fluctuating trend
    const cycle = Math.sin(i / 15);
    const noise = ((i % 5) - 2) * 0.4;
    const change = cycle * 1.2 + noise;
    const open = price;
    price = Math.max(10, price + change);
    const close = price;
    const high = Math.max(open, close) + 0.8;
    const low = Math.min(open, close) - 0.8;
    const volume = 1000 + Math.abs(change) * 500;

    candles.push({
      timestamp: now + i * interval,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(2)),
      quoteVolume: Number((volume * close).toFixed(2)),
    });
  }

  return candles;
}

describe('Phase 14: Walk-Forward Validation', () => {
  describe('Window Generation & Slicing', () => {
    it('throws error when candle count is insufficient (< 60 bars)', () => {
      const shortCandles = generateTestCandles(40);
      assert.throws(
        () => generateWalkForwardWindows(shortCandles, 3, 0.7),
        /Insufficient candles for walk-forward validation/
      );
    });

    it('generates non-overlapping train and test partitions strictly ordered in time', () => {
      const candles = generateTestCandles(150);
      const windows = generateWalkForwardWindows(candles, 3, 0.70);

      assert.strictEqual(windows.length, 3);

      for (const w of windows) {
        // Train must come strictly before test
        assert.ok(w.trainRange.endBar < w.testRange.startBar);
        assert.ok(w.trainRange.endTime <= w.testRange.startTime);
        assert.ok(w.trainCandles.length > 0);
        assert.ok(w.testCandles.length > 0);

        // Check ratio approximately 70/30
        const totalInWindow = w.trainCandles.length + w.testCandles.length;
        const actualTrainRatio = w.trainCandles.length / totalInWindow;
        assert.ok(actualTrainRatio >= 0.65 && actualTrainRatio <= 0.75);
      }
    });
  });

  describe('Walk-Forward Efficiency (WFE) & Robustness Grading', () => {
    it('computes WFE correctly for positive returns', () => {
      // 10% OOS / 20% IS = 50% WFE
      const wfe = calculateWindowEfficiency(20, 10);
      assert.strictEqual(wfe, 50);

      // 15% OOS / 10% IS = 150% WFE
      const wfeHigh = calculateWindowEfficiency(10, 15);
      assert.strictEqual(wfeHigh, 150);
    });

    it('returns 0% WFE when In-Sample is profitable but Out-Of-Sample loses money (Curve-Fitting)', () => {
      const wfe = calculateWindowEfficiency(15, -5);
      assert.strictEqual(wfe, 0);
    });

    it('determines appropriate robustness grade based on efficiency and profitability', () => {
      assert.strictEqual(
        determineRobustnessGrade(75, 10, 3, 3),
        'HIGHLY_ROBUST'
      );
      assert.strictEqual(
        determineRobustnessGrade(55, 5, 2, 3),
        'ROBUST'
      );
      assert.strictEqual(
        determineRobustnessGrade(35, -2, 1, 3),
        'FRAGILE'
      );
      assert.strictEqual(
        determineRobustnessGrade(15, -10, 0, 3),
        'OVERFIT'
      );
    });
  });

  describe('Full Walk-Forward Simulation Execution', () => {
    it('runs multi-window walk-forward validation and outputs complete scorecard', () => {
      const candles = generateTestCandles(200);

      const result = runWalkForwardValidation(candles, {
        symbol: 'SOL/USDT',
        timeframe: '15m',
        windowCount: 3,
        trainRatio: 0.70,
        initialBalance: 300,
        candidates: DEFAULT_WALK_FORWARD_CANDIDATES.slice(0, 2), // test with 2 candidates
      });

      assert.ok(result);
      assert.strictEqual(result.windows.length, 3);
      assert.ok(typeof result.overallWFE === 'number');
      assert.ok(['HIGHLY_ROBUST', 'ROBUST', 'FRAGILE', 'OVERFIT'].includes(result.robustnessGrade));
      assert.ok(result.combinedOutOfSampleCurve.length >= 1);
      assert.ok(result.recommendations.length > 0);

      // Verify each window produced both IS and OOS backtests
      for (const w of result.windows) {
        assert.ok(w.inSampleResult);
        assert.ok(w.outOfSampleResult);
        assert.ok(w.selectedCandidate);
        assert.ok(typeof w.windowEfficiency === 'number');
      }
    });
  });

  describe('Phase 28: Walk-Forward Validation with MTF Parameter Grid Search', () => {
    it('generates paired MTF and Raw candidates with generateMtfGridCandidates', () => {
      const base = DEFAULT_WALK_FORWARD_CANDIDATES.slice(0, 2);
      const grid = generateMtfGridCandidates(base);

      assert.strictEqual(grid.length, 4); // 2 base * 2 variants = 4 candidates
      assert.strictEqual(grid[0].name.includes('(MTF)'), true);
      assert.strictEqual(grid[0].mtf?.enabled, true);
      assert.strictEqual(grid[0].mtf?.blockCounterTrend, true);

      assert.strictEqual(grid[1].name.includes('(Raw)'), true);
      assert.strictEqual(grid[1].mtf?.enabled, false);
      assert.strictEqual(grid[1].mtf?.bonusPoints, 0);
    });

    it('all built-in DEFAULT_MTF_GRID_CANDIDATES are properly structured with MTF parameters', () => {
      assert.ok(DEFAULT_MTF_GRID_CANDIDATES.length >= 6);
      for (const candidate of DEFAULT_MTF_GRID_CANDIDATES) {
        assert.ok(candidate.name);
        assert.ok(candidate.weights);
        assert.ok(candidate.mtf);
        assert.strictEqual(typeof candidate.mtf.enabled, 'boolean');
        assert.strictEqual(typeof candidate.mtf.blockCounterTrend, 'boolean');
        assert.strictEqual(typeof candidate.mtf.bonusPoints, 'number');
      }
    });

    it('executes Walk-Forward Validation with mtfOptimization: true and calculates mtfAlphaMetric', () => {
      const candles = generateTestCandles(200);

      const result = runWalkForwardValidation(candles, {
        symbol: 'SOL/USDT',
        timeframe: '15m',
        windowCount: 2,
        trainRatio: 0.70,
        initialBalance: 300,
        mtfOptimization: true,
      });

      assert.ok(result);
      assert.strictEqual(result.windows.length, 2);
      assert.strictEqual(result.config.mtfOptimization, true);
      assert.ok(result.mtfAlphaMetric);
      assert.strictEqual(typeof result.mtfAlphaMetric.isMtfSuperior, 'boolean');
      assert.strictEqual(typeof result.mtfAlphaMetric.avgMtfWfe, 'number');
      assert.strictEqual(typeof result.mtfAlphaMetric.avgRawWfe, 'number');
      assert.strictEqual(typeof result.mtfAlphaMetric.wfeDelta, 'number');
      assert.strictEqual(typeof result.mtfAlphaMetric.counterTrendDrawdownSavedUsdt, 'number');
      assert.ok(result.mtfAlphaMetric.summary.length > 0);

      // Verify that candidate selection includes MTF parameter awareness
      for (const w of result.windows) {
        assert.ok(w.selectedCandidate);
        assert.ok(w.selectedCandidate.mtf !== undefined);
        assert.ok(w.inSampleResult.config.mtfEnabled !== undefined);
        assert.ok(w.outOfSampleResult.config.mtfEnabled !== undefined);
      }
    });
  });
});
