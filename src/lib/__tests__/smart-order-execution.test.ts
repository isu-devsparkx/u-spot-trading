// ─── Phase 46: Algorithmic TWAP/VWAP Smart Order Execution Unit Tests ────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createSmartOrderPlan,
  executeTrancheStep,
  simulateFullSmartExecution,
  getSmartOrderPlanById,
  getAllSmartOrderPlans,
} from '../services/smart-order-execution.ts';

describe('Algorithmic TWAP/VWAP Smart Order Execution Engine (Phase 46)', () => {
  describe('1. Plan Creation & Allocation Geometry', () => {
    it('divides total size into N tranches summing exactly to totalSizeUsdt', () => {
      const plan = createSmartOrderPlan({
        symbol: 'BTC/USDT',
        totalSizeUsdt: 10000,
        durationMinutes: 5,
        tranchesCount: 8,
        algorithm: 'TWAP',
        arrivalBenchmarkPrice: 68000,
      });

      assert.strictEqual(plan.symbol, 'BTC/USDT');
      assert.strictEqual(plan.totalSizeUsdt, 10000);
      assert.strictEqual(plan.tranches.length, 8);
      assert.strictEqual(plan.status, 'PENDING');

      const sumAllocated = plan.tranches.reduce((sum, t) => sum + t.allocatedUsdt, 0);
      assert.strictEqual(Math.round(sumAllocated * 100) / 100, 10000);

      // Verify progressive timestamps
      for (let i = 1; i < plan.tranches.length; i++) {
        assert(plan.tranches[i].targetReleaseTime > plan.tranches[i - 1].targetReleaseTime);
      }
    });

    it('creates VWAP plan with U-shaped tranche allocations', () => {
      const plan = createSmartOrderPlan({
        symbol: 'ETH/USDT',
        totalSizeUsdt: 5000,
        durationMinutes: 10,
        tranchesCount: 6,
        algorithm: 'VWAP',
        arrivalBenchmarkPrice: 2650,
      });

      assert.strictEqual(plan.algorithm, 'VWAP');
      const firstAlloc = plan.tranches[0].allocatedUsdt;
      const midAlloc = plan.tranches[2].allocatedUsdt;
      // In a U-shaped VWAP profile, outer tranches have higher weight than the trough
      assert(firstAlloc > midAlloc);
    });

    it('throws error when total size or arrival price is invalid', () => {
      assert.throws(() => {
        createSmartOrderPlan({
          symbol: 'BTC/USDT',
          totalSizeUsdt: 0,
          arrivalBenchmarkPrice: 68000,
        });
      });

      assert.throws(() => {
        createSmartOrderPlan({
          symbol: 'BTC/USDT',
          totalSizeUsdt: 1000,
          arrivalBenchmarkPrice: -5,
        });
      });
    });
  });

  describe('2. Tranche Execution & Slippage Ceiling Protection', () => {
    it('fills a tranche within slippage ceiling and updates cumulative metrics', () => {
      let plan = createSmartOrderPlan({
        symbol: 'BTC/USDT',
        totalSizeUsdt: 10000,
        tranchesCount: 4,
        algorithm: 'TWAP',
        arrivalBenchmarkPrice: 68000,
        maxSlippageBps: 20, // 0.20%
      });

      // Execute tranche 1 at exact arrival price (0 slippage)
      plan = executeTrancheStep(plan, 1, 68000);
      assert.strictEqual(plan.tranches[0].status, 'FILLED');
      assert.strictEqual(plan.tranches[0].executedPrice, 68000);
      assert.strictEqual(plan.status, 'EXECUTING');
      assert.strictEqual(plan.averageExecutedPrice, 68000);
      assert.strictEqual(plan.realizedSlippageBps, 0);

      // Execute tranche 2 with slight favorable drift (lower price)
      plan = executeTrancheStep(plan, 2, 67980);
      assert.strictEqual(plan.tranches[1].status, 'FILLED');
      assert(plan.averageExecutedPrice < 68000);
      assert(plan.realizedSlippageBps < 0);
    });

    it('skips tranche and sets PAUSED_SLIPPAGE when market price violates slippage ceiling', () => {
      let plan = createSmartOrderPlan({
        symbol: 'BTC/USDT',
        totalSizeUsdt: 10000,
        tranchesCount: 4,
        arrivalBenchmarkPrice: 68000,
        maxSlippageBps: 15, // 0.15% maximum slippage (15 bps = +$102 USDT price drift)
      });

      // Price surges to 68250 (+36 bps > 15 bps limit)
      plan = executeTrancheStep(plan, 1, 68250);
      assert.strictEqual(plan.tranches[0].status, 'SKIPPED_SLIPPAGE');
      assert(plan.tranches[0].slippageBps > 15);
      assert.strictEqual(plan.status, 'PAUSED_SLIPPAGE');
      assert.strictEqual(plan.executedTotalUsdt, 0);
    });
  });

  describe('3. Full Simulation & Fee/Slippage Improvement', () => {
    it('simulates full execution and marks status COMPLETED', () => {
      const plan = simulateFullSmartExecution({
        symbol: 'SOL/USDT',
        totalSizeUsdt: 3000,
        tranchesCount: 5,
        durationMinutes: 5,
        arrivalBenchmarkPrice: 150,
      });

      assert.strictEqual(plan.status, 'COMPLETED');
      assert(plan.executedTotalUsdt > 0);
      assert(plan.executedTotalQuantity > 0);
      assert(plan.averageExecutedPrice > 0);
      assert(plan.estimatedFeeSavingsUsdt >= 0);
      assert(plan.completedAt !== undefined);
    });
  });

  describe('4. Plan Registry & Lookup', () => {
    it('retrieves plan by ID and lists stored plans', () => {
      const created = createSmartOrderPlan({
        symbol: 'BNB/USDT',
        totalSizeUsdt: 2500,
        arrivalBenchmarkPrice: 590,
      });

      const found = getSmartOrderPlanById(created.planId);
      assert(found !== null);
      assert.strictEqual(found?.planId, created.planId);

      const all = getAllSmartOrderPlans();
      assert(all.length > 0);
      assert(all.some((p) => p.planId === created.planId));
    });
  });
});
