// ─── U-SPOT Risk Engine Unit Tests ─────────────────────────────────
// Spec Section 51: Testing Requirements
// - zero wallet
// - tiny wallet
// - wide SL
// - narrow SL
// - DCA limits
// - max risk

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePositionSize,
  getDefaultRiskForGrade,
} from '../risk-engine.ts';

describe('Risk Engine: Confidence Grade Defaults', () => {
  it('returns correct default risk % per grade (spec Section 1)', () => {
    assert.equal(getDefaultRiskForGrade('A+'), 1.0);
    assert.equal(getDefaultRiskForGrade('A'), 0.75);
    assert.equal(getDefaultRiskForGrade('B'), 0.5);
    assert.equal(getDefaultRiskForGrade('BELOW_THRESHOLD'), 0.0);
  });
});

describe('Risk Engine: Section 51 Edge Cases', () => {
  it('Zero Wallet: returns invalid result with 0 allocation and error message', () => {
    const result = calculatePositionSize({
      walletBalance: 0,
      riskPercent: 0.75,
      entryPrice: 200,
      stopLossPrice: 190,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Wallet balance')));
    assert.equal(result.maxDeployed, 0);
    assert.equal(result.initialAllocation, 0);
  });

  it('Tiny Wallet ($5 USDT): calculates correctly and warns about exchange minimums', () => {
    const result = calculatePositionSize({
      walletBalance: 5,
      riskPercent: 1.0, // $0.05 max risk
      entryPrice: 100,
      stopLossPrice: 95,
      maxPositionPercent: 100,
    });

    assert.equal(result.isValid, true);
    assert.ok(result.maxDeployed <= 5, 'Position must not exceed wallet balance');
    assert.ok(
      result.warnings.some((w) => w.message.includes('below typical exchange minimum')),
      'Should flag exchange minimum order size warning'
    );
  });

  it('Wide SL (50% drop): scales down position size to strictly honor max risk', () => {
    const walletBalance = 1000;
    const riskPercent = 1.0; // $10 max risk
    const result = calculatePositionSize({
      walletBalance,
      riskPercent,
      entryPrice: 100,
      stopLossPrice: 50, // 50% stop loss
      maxPositionPercent: 50,
    });

    assert.equal(result.isValid, true);
    assert.ok(result.stopDistancePercent === 50);
    assert.ok(
      result.plannedLossAtSlUsdt <= result.maxRiskUsdt + 0.1,
      `Planned loss (${result.plannedLossAtSlUsdt}) must not exceed max risk (${result.maxRiskUsdt})`
    );
    assert.ok(result.maxDeployed < 25, 'Position size must be small for 50% drop');
    assert.ok(
      result.warnings.some((w) => w.message.includes('Wide stop loss')),
      'Should warn about wide SL'
    );
  });

  it('Narrow SL (0.25% stop): caps position size at max wallet percentage cap', () => {
    const walletBalance = 300;
    const maxPositionPercent = 30; // 30% cap = 90 USDT
    const result = calculatePositionSize({
      walletBalance,
      riskPercent: 1.0, // $3 max risk
      entryPrice: 200,
      stopLossPrice: 199.5, // 0.25% stop
      maxPositionPercent,
    });

    assert.equal(result.isValid, true);
    assert.equal(result.isCappedByWallet, true);
    assert.ok(
      result.maxDeployed <= 90.05,
      `Max deployed (${result.maxDeployed}) must be capped at 30% of wallet (90 USDT)`
    );
    // When capped, actual loss is even smaller than max risk
    assert.ok(result.plannedLossAtSlUsdt <= result.maxRiskUsdt);
    assert.ok(
      result.warnings.some((w) => w.message.includes('Very tight stop loss')),
      'Should warn about very tight SL'
    );
  });

  it('Max Risk Enforcement: planned loss at SL never exceeds max risk budget', () => {
    const walletBalance = 500;
    const riskPercent = 0.75; // $3.75 max risk
    const result = calculatePositionSize({
      walletBalance,
      riskPercent,
      entryPrice: 50,
      stopLossPrice: 46, // 8% drop
      dca1Price: 48,
      dca2Price: 47,
      maxPositionPercent: 40,
    });

    assert.equal(result.isValid, true);
    assert.equal(result.maxRiskUsdt, 3.75);
    assert.ok(
      result.plannedLossAtSlUsdt <= result.maxRiskUsdt + 0.05,
      `Planned loss (${result.plannedLossAtSlUsdt}) should not exceed budget (${result.maxRiskUsdt})`
    );
  });

  it('DCA Limits: supports 0 DCA, 1 DCA, and 2 DCAs correctly', () => {
    // 0 DCA
    const res0 = calculatePositionSize({
      walletBalance: 300,
      riskPercent: 1.0,
      entryPrice: 100,
      stopLossPrice: 90,
    });
    assert.equal(res0.tranches.length, 1);
    assert.equal(res0.dca1Allocation, 0);
    assert.equal(res0.dca2Allocation, 0);

    // 1 DCA
    const res1 = calculatePositionSize({
      walletBalance: 300,
      riskPercent: 1.0,
      entryPrice: 100,
      dca1Price: 95,
      stopLossPrice: 90,
    });
    assert.equal(res1.tranches.length, 2);
    assert.ok(res1.dca1Allocation > 0);
    assert.equal(res1.dca2Allocation, 0);

    // 2 DCAs
    const res2 = calculatePositionSize({
      walletBalance: 300,
      riskPercent: 1.0,
      entryPrice: 100,
      dca1Price: 96,
      dca2Price: 93,
      stopLossPrice: 90,
    });
    assert.equal(res2.tranches.length, 3);
    assert.ok(res2.initialAllocation > res2.dca1Allocation);
    assert.ok(res2.dca1Allocation >= res2.dca2Allocation);
  });

  it('Invalid Prices: flags errors when SL >= Entry or DCA levels out of order', () => {
    // SL >= Entry
    const res1 = calculatePositionSize({
      walletBalance: 300,
      riskPercent: 1.0,
      entryPrice: 100,
      stopLossPrice: 105,
    });
    assert.equal(res1.isValid, false);
    assert.ok(res1.errors.some((e) => e.includes('Stop Loss must be below Entry')));

    // DCA1 above entry
    const res2 = calculatePositionSize({
      walletBalance: 300,
      riskPercent: 1.0,
      entryPrice: 100,
      dca1Price: 102,
      stopLossPrice: 90,
    });
    assert.equal(res2.isValid, false);
    assert.ok(res2.errors.some((e) => e.includes('DCA #1 price must be below Entry')));
  });

  it('Realistic Spec Example (Section 14): 300 USDT wallet, 0.75% risk, SOL setup', () => {
    const result = calculatePositionSize({
      walletBalance: 300,
      riskPercent: 0.75,
      entryPrice: 214,
      dca1Price: 209,
      dca2Price: 203,
      stopLossPrice: 198,
      takeProfits: { tp1: 220, tp2: 227, tp3: 236 },
      maxPositionPercent: 30, // 30% of 300 = 90 max
    });

    assert.equal(result.isValid, true);
    assert.equal(result.walletBalance, 300);
    assert.equal(result.riskPercent, 0.75);
    assert.equal(result.maxRiskUsdt, 2.25);

    // Planned loss should be within risk budget (~2.25 USDT)
    assert.ok(
      result.plannedLossAtSlUsdt <= 2.30,
      `Planned loss (${result.plannedLossAtSlUsdt}) matches spec example (~2.25 USDT)`
    );

    // Tranches exist and are ordered
    assert.equal(result.tranches.length, 3);
    assert.ok(result.initialAllocation > 0);
    assert.ok(result.dca1Allocation > 0);
    assert.ok(result.dca2Allocation > 0);
    assert.ok(result.maxDeployed <= 90);

    // Take profits generated
    assert.equal(result.takeProfits.length, 3);
    assert.ok(result.totalPotentialNetProfitUsdt > 0);
    assert.ok(result.riskRewardRatio > 1.0);
  });
});
