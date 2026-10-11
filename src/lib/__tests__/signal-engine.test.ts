import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  computeTradeScore,
  determineConfidenceGrade,
  detectSetup,
  enforceSetupGeometry,
  calculateStructuralStopLoss,
  calculateDynamicTakeProfits,
  assignSignalStatus,
  generateSignalFromCandidate,
  evaluateSignalsForCandidates,
  DEFAULT_SIGNAL_WEIGHTS,
} from '../services/signal-engine.ts';
import type {
  TechnicalAnalysisResult,
  MarketCandidate,
  MarketRegime,
} from '../../types/index.ts';

// Helper to construct a mock TechnicalAnalysisResult
function createMockTA(overrides: Partial<TechnicalAnalysisResult> = {}): TechnicalAnalysisResult {
  return {
    symbol: 'SOL/USDT',
    timeframe: '15m',
    timestamp: Date.now(),
    currentPrice: 150.0,
    trend: {
      ema20: 148.0,
      ema50: 145.0,
      ema200: 140.0,
      alignment: 'BULLISH',
      distanceEma20Percent: 1.35,
      distanceEma50Percent: 3.45,
      distanceEma200Percent: 7.14,
      direction: 'BULLISH',
      score: 85,
      description: 'Bullish alignment',
    },
    momentum: {
      rsi: 62,
      rsiState: 'BULLISH',
      macd: {
        macd: 1.5,
        signal: 1.1,
        histogram: 0.4,
        cross: 'BULLISH_CROSS',
      },
      roc: 3.2,
      divergence: 'NONE',
      score: 80,
      description: 'Bullish momentum',
    },
    volume: {
      currentVolume: 120000,
      averageVolume20: 80000,
      volumeRatio: 1.5,
      isVolumeSpike: false,
      volumeTrend: 'EXPANDING',
      score: 75,
      description: 'Volume expanding',
    },
    volatility: {
      atr: 3.5,
      atrPercent: 2.33,
      recentRange: { high: 152.0, low: 144.0, rangePercent: 5.5 },
      recommendedSlDistancePercent: 4.66,
      recommendedDca1DistancePercent: 2.33,
      recommendedDca2DistancePercent: 4.0,
      volatilityRegime: 'NORMAL',
      score: 70,
      description: 'Normal volatility',
    },
    structure: {
      swingHighs: [{ price: 152.0, timestamp: Date.now() - 3600000, index: 10, type: 'HIGH' }],
      swingLows: [{ price: 144.0, timestamp: Date.now() - 7200000, index: 5, type: 'LOW' }],
      latestHighType: 'HH',
      latestLowType: 'HL',
      structureTrend: 'UPTREND',
      breakOfStructure: { detected: false, type: null, level: null },
      changeOfCharacter: { detected: false, type: null, level: null },
      liquiditySweep: { detected: false, type: null, level: null },
      nearestSupport: 145.0,
      nearestResistance: 155.0,
      score: 80,
      description: 'Higher highs and higher lows',
    },
    liquidity: {
      orderBookImbalance: 0.25,
      spreadPercent: 0.02,
      bidDepthUsdt: 500000,
      askDepthUsdt: 400000,
      volumeDeltaProxy: 30,
      isLiquid: true,
      score: 85,
      description: 'Deep liquidity',
    },
    compositeTechnicalScore: 80,
    overallBias: 'BULLISH',
    summary: 'Strong bullish setup',
    ...overrides,
  };
}

// Helper to construct a mock MarketCandidate
function createMockCandidate(overrides: Partial<MarketCandidate> = {}): MarketCandidate {
  return {
    symbol: 'SOL/USDT',
    name: 'Solana',
    price: 150.0,
    change24h: 4.5,
    volume24h: 50000000,
    volumeRatio: 1.8,
    liquidity: 85,
    candidateScore: 82,
    marketRegime: 'BULL',
    reasonSelected: 'Volume surge + UPTREND',
    ...overrides,
  };
}

describe('Signal Engine: Multi-Factor Trade Scoring (Spec Section 10)', () => {
  test('computes trade score using 7 factor weights summing to 100', () => {
    const ta = createMockTA();
    const { tradeScore, breakdown } = computeTradeScore(ta, 'BULL', DEFAULT_SIGNAL_WEIGHTS);

    // Weights: Trend 20, Momentum 15, Volume 15, Structure 20, Liquidity 15, Volatility 10, Regime 5 = 100
    // Expected:
    // Trend (85 * 0.20 = 17)
    // Momentum (80 * 0.15 = 12)
    // Volume (75 * 0.15 = 11.25)
    // Structure (80 * 0.20 = 16)
    // Liquidity (85 * 0.15 = 12.75)
    // Volatility (70 * 0.10 = 7)
    // Regime BULL (100 * 0.05 = 5)
    // Total raw = 17 + 12 + 11.25 + 16 + 12.75 + 7 + 5 = 81
    assert.strictEqual(tradeScore, 81);
    assert.strictEqual(breakdown.total, 81);
    assert.strictEqual(breakdown.trend, 17);
    assert.strictEqual(breakdown.momentum, 12);
    assert.strictEqual(breakdown.regime, 5);
  });

  test('penalizes trade score during BEAR or LOW_LIQUIDITY regime', () => {
    const ta = createMockTA();
    const bullResult = computeTradeScore(ta, 'BULL');
    const bearResult = computeTradeScore(ta, 'BEAR');

    assert.ok(
      bullResult.tradeScore > bearResult.tradeScore,
      `BULL score (${bullResult.tradeScore}) should exceed BEAR score (${bearResult.tradeScore})`
    );
    assert.strictEqual(bearResult.breakdown.regime < bullResult.breakdown.regime, true);
  });
});

describe('Signal Engine: Confidence Grades & Status Assignment (Spec Sections 1 & 9)', () => {
  test('maps trade score ranges to correct confidence grades', () => {
    assert.strictEqual(determineConfidenceGrade(92), 'A+');
    assert.strictEqual(determineConfidenceGrade(85), 'A+');
    assert.strictEqual(determineConfidenceGrade(84), 'A');
    assert.strictEqual(determineConfidenceGrade(75), 'A');
    assert.strictEqual(determineConfidenceGrade(74), 'B');
    assert.strictEqual(determineConfidenceGrade(60), 'B');
    assert.strictEqual(determineConfidenceGrade(59), 'BELOW_THRESHOLD');
    assert.strictEqual(determineConfidenceGrade(30), 'BELOW_THRESHOLD');
  });

  test('assigns BUY_NOW when price is inside entry zone and score is high', () => {
    const setup = detectSetup(createMockTA(), 150.0);
    assert.ok(setup !== null);

    const status = assignSignalStatus(82, 'A', 150.0, setup, 'BULL');
    assert.strictEqual(status, 'BUY_NOW');
  });

  test('assigns WAIT_FOR_CONFIRMATION when price is above entry zone waiting for retest', () => {
    const setup = detectSetup(createMockTA(), 150.0);
    assert.ok(setup !== null);

    // Current price is stretched higher than entry zone high
    const status = assignSignalStatus(78, 'A', setup.entryZone.high + 5.0, setup, 'BULL');
    assert.strictEqual(status, 'WAIT_FOR_CONFIRMATION');
  });

  test('assigns NO_TRADE when trade score is below threshold or setup is null', () => {
    const statusNull = assignSignalStatus(45, 'BELOW_THRESHOLD', 150.0, null, 'NEUTRAL');
    assert.strictEqual(statusNull, 'NO_TRADE');

    const setup = detectSetup(createMockTA(), 150.0);
    const statusLow = assignSignalStatus(50, 'BELOW_THRESHOLD', 150.0, setup, 'BULL');
    assert.strictEqual(statusLow, 'NO_TRADE');
  });
});

describe('Signal Engine: Setup Detection Engine (Spec Section 11)', () => {
  test('detects BREAKOUT_RETEST when Bullish BOS is present', () => {
    const ta = createMockTA({
      structure: {
        ...createMockTA().structure,
        breakOfStructure: {
          detected: true,
          type: 'BULLISH_BOS',
          level: 148.5,
        },
      },
    });

    const setup = detectSetup(ta, 150.0);
    assert.ok(setup !== null);
    assert.strictEqual(setup.setupType, 'BREAKOUT_RETEST');
    assert.ok(setup.preferredEntry > 0);
    assert.ok(setup.stopLoss < setup.preferredEntry);
    assert.ok(setup.tp1 > setup.preferredEntry);
    assert.ok(setup.confirmationCondition.includes('broken resistance'));
  });

  test('detects LIQUIDITY_SWEEP when low sweep is detected', () => {
    const ta = createMockTA({
      structure: {
        ...createMockTA().structure,
        liquiditySweep: {
          detected: true,
          type: 'SWEEP_LOW',
          level: 143.0,
        },
      },
    });

    const setup = detectSetup(ta, 145.0);
    assert.ok(setup !== null);
    assert.strictEqual(setup.setupType, 'LIQUIDITY_SWEEP');
    assert.strictEqual(setup.entryZone.low, 143.0);
    assert.ok(setup.stopLoss < 143.0);
  });

  test('detects PULLBACK_CONTINUATION when price retraces toward EMA 20/50', () => {
    const ta = createMockTA({
      trend: {
        ...createMockTA().trend,
        direction: 'BULLISH',
        alignment: 'BULLISH',
        distanceEma20Percent: 0.8,
        ema20: 149.0,
        ema50: 146.0,
      },
      momentum: {
        ...createMockTA().momentum,
        rsi: 50,
      },
    });

    const setup = detectSetup(ta, 149.5);
    assert.ok(setup !== null);
    assert.strictEqual(setup.setupType, 'PULLBACK_CONTINUATION');
    assert.ok(setup.stopLoss < setup.dca2);
    assert.ok(setup.dca2 < setup.dca1);
    assert.ok(setup.dca1 < setup.preferredEntry);
  });

  test('detects TREND_CONTINUATION when EMA aligned and structure in uptrend', () => {
    const ta = createMockTA({
      trend: {
        ...createMockTA().trend,
        direction: 'BULLISH',
        distanceEma20Percent: 4.5, // Not immediately in pullback
      },
      momentum: {
        ...createMockTA().momentum,
        rsi: 65,
      },
      structure: {
        ...createMockTA().structure,
        structureTrend: 'UPTREND',
        latestHighType: 'HH',
        latestLowType: 'HL',
      },
    });

    const setup = detectSetup(ta, 150.0);
    assert.ok(setup !== null);
    assert.strictEqual(setup.setupType, 'TREND_CONTINUATION');
  });
});

describe('Signal Engine: Stop Loss, DCA & Take Profit Validation (Spec Sections 3, 12, 13)', () => {
  test('strictly enforces order: Stop Loss < DCA 2 < DCA 1 < Entry < TP1 < TP2 < TP3', () => {
    const candidate = createMockCandidate({ price: 200.0 });
    const ta = createMockTA({ currentPrice: 200.0 });
    const signal = generateSignalFromCandidate({
      candidate,
      ta,
      walletBalance: 500,
    });

    assert.ok(signal.stopLoss < signal.dca2, `SL (${signal.stopLoss}) must be < DCA2 (${signal.dca2})`);
    assert.ok(signal.dca2 < signal.dca1, `DCA2 (${signal.dca2}) must be < DCA1 (${signal.dca1})`);
    assert.ok(signal.dca1 < signal.preferredEntry, `DCA1 (${signal.dca1}) must be < Entry (${signal.preferredEntry})`);
    assert.ok(signal.preferredEntry < signal.tp1, `Entry (${signal.preferredEntry}) must be < TP1 (${signal.tp1})`);
    assert.ok(signal.tp1 < signal.tp2, `TP1 (${signal.tp1}) must be < TP2 (${signal.tp2})`);
    assert.ok(signal.tp2 < signal.tp3, `TP2 (${signal.tp2}) must be < TP3 (${signal.tp3})`);
  });

  test('integrates with Phase 2 Risk Engine for wallet allocation', () => {
    const candidate = createMockCandidate({ price: 100.0 });
    const ta = createMockTA({ currentPrice: 100.0 });
    const walletBalance = 300; // Spec Section 1 example
    const signal = generateSignalFromCandidate({
      candidate,
      ta,
      walletBalance,
    });

    // Check position sizing properties
    assert.ok(signal.initialAllocation > 0, 'Initial allocation must be positive');
    assert.ok(signal.dca1Allocation > 0, 'DCA1 allocation must be positive');
    assert.ok(signal.dca2Allocation > 0, 'DCA2 allocation must be positive');
    assert.ok(signal.maxDeployed <= walletBalance * 0.35, 'Max deployed should respect wallet limits');
    assert.ok(signal.maxLoss <= walletBalance * (signal.riskPercent / 100) * 1.05, 'Max loss must respect risk budget');
    assert.strictEqual(signal.direction, 'BUY');
  });
});

describe('Signal Engine: Batch Evaluation (evaluateSignalsForCandidates)', () => {
  test('evaluates multiple candidates and returns prioritized signals with summary', () => {
    const candidates = [
      createMockCandidate({ symbol: 'SOL/USDT', price: 150.0, candidateScore: 88 }),
      createMockCandidate({ symbol: 'ETH/USDT', price: 3500.0, candidateScore: 82 }),
      createMockCandidate({ symbol: 'DOGE/USDT', price: 0.15, candidateScore: 65 }),
    ];

    const result = evaluateSignalsForCandidates(candidates, { walletBalance: 400 });

    assert.strictEqual(result.signals.length, 3);
    assert.strictEqual(result.summary.totalEvaluated, 3);
    assert.ok(result.summary.averageTradeScore > 0);
    assert.ok(result.signals[0].tradeScore >= result.signals[1].tradeScore || result.signals[0].status === 'BUY_NOW');
  });
});

describe('Signal Engine: Phase 22 Pullback Retest Entries & Structural SL Optimization', () => {
  test('anchors structural stop loss below nearest support / swing low with ATR volatility buffer', () => {
    const sl = calculateStructuralStopLoss({
      preferredEntry: 150.0,
      atr: 4.0,
      structuralAnchor: 145.0,
      swingLows: [{ price: 144.5 }],
      bufferMultiplier: 0.55,
    });

    // Anchor is 144.5 (lowest valid structure below entry), buffer is 4.0 * 0.55 = 2.2 => 142.3
    assert.ok(sl < 144.5, `SL (${sl}) must be below lowest structure (144.5)`);
    assert.ok(sl >= 150 * (1 - 0.055), `SL (${sl}) must respect max risk percentage 5.5%`);
    assert.ok(sl <= 150 * (1 - 0.012), `SL (${sl}) must respect min risk percentage 1.2%`);
  });

  test('offsets stop loss to prevent execution at clean round numbers (.00 / .50)', () => {
    // If anchor - buffer lands exactly on 100.00
    const sl = calculateStructuralStopLoss({
      preferredEntry: 105.0,
      atr: 2.0,
      structuralAnchor: 101.1,
      bufferMultiplier: 0.55, // 101.1 - 1.1 = 100.00
    });

    // Should be offset below 100.00
    assert.ok(sl < 100.0, `SL (${sl}) must be offset below psychological round number 100.00`);
    assert.ok(sl >= 99.8, `Offset must be subtle, not distorting the trade plan`);
  });

  test('dynamically adjusts TP1 to frontrun overhead resistance between 1.15R and 1.55R', () => {
    const preferredEntry = 100.0;
    const stopLoss = 95.0; // risk = 5.0
    // Resistance at 106.5 (1.3R away from entry)
    const result = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: 106.5,
      defaultRMultipliers: { tp1: 1.5, tp2: 2.6, tp3: 4.0 },
    });

    // Front-run target: 106.5 * 0.998 = 106.287
    assert.strictEqual(result.tp1, 106.287);
    assert.ok(result.tp1 < 106.5, 'TP1 must frontrun resistance level');
    assert.ok(result.tp1 > preferredEntry, 'TP1 must be above entry');
    assert.ok(result.tp1 < result.tp2, 'TP1 must be below TP2');
    assert.ok(result.tp2 < result.tp3, 'TP2 must be below TP3');
  });

  test('uses standard R-multipliers when overhead resistance is far away or above 1.55R', () => {
    const preferredEntry = 100.0;
    const stopLoss = 95.0; // risk = 5.0
    // Resistance at 115.0 (3.0R away from entry)
    const result = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: 115.0,
      defaultRMultipliers: { tp1: 1.5, tp2: 2.6, tp3: 4.0 },
    });

    // Default 1.5R = 100 + 5 * 1.5 = 107.5
    assert.strictEqual(result.tp1, 107.5);
    assert.strictEqual(result.tp2, 113.0);
    assert.strictEqual(result.tp3, 120.0);
  });

  test('anchors TREND_CONTINUATION entry to discount pullback rather than market top', () => {
    const ta = createMockTA({
      currentPrice: 150.0,
      trend: {
        ...createMockTA().trend,
        direction: 'BULLISH',
        ema20: 147.5,
        distanceEma20Percent: 4.5,
      },
      momentum: {
        ...createMockTA().momentum,
        rsi: 65,
      },
      structure: {
        ...createMockTA().structure,
        structureTrend: 'UPTREND',
      },
    });

    const setup = detectSetup(ta, 150.0);
    assert.ok(setup !== null);
    assert.strictEqual(setup.setupType, 'TREND_CONTINUATION');
    // Preferred entry should be at discount retest level (<= 149.25), not market top 150.0
    assert.ok(
      setup.preferredEntry <= 149.25,
      `Preferred entry (${setup.preferredEntry}) should be at pullback discount`
    );
  });
});

describe('Signal Engine: Phase 23 Order Book Imbalance & Bid/Ask Wall Integration', () => {
  test('anchors structural stop loss below high-volume bid wall for institutional shield', () => {
    const sl = calculateStructuralStopLoss({
      preferredEntry: 150.0,
      atr: 2.0,
      structuralAnchor: 147.0,
      bidWallPrice: 145.5, // Significant bid wall below support
      bufferMultiplier: 0.55,
    });

    // Anchor is 145.5 (bid wall), minus buffer (2.0 * 0.55 = 1.1) => 144.4
    assert.ok(sl < 145.5, `SL (${sl}) must sit safely below the bid wall at 145.5`);
    assert.ok(sl >= 150 * (1 - 0.055), 'Must satisfy maximum risk bound');
  });

  test('dynamically front-runs nearest ask wall when closer than structural resistance', () => {
    const preferredEntry = 100.0;
    const stopLoss = 95.0; // risk = 5.0
    const result = calculateDynamicTakeProfits({
      preferredEntry,
      stopLoss,
      nearestResistance: 110.0, // 2.0R away
      nearestAskWall: 106.5,    // 1.3R away (immediate supply ceiling)
      defaultRMultipliers: { tp1: 1.5, tp2: 2.6, tp3: 4.0 },
    });

    // Front-run target based on closest barrier (106.5): 106.5 * 0.998 = 106.287
    assert.strictEqual(result.tp1, 106.287);
    assert.ok(result.tp1 < 106.5, 'TP1 must front-run the ask wall');
    assert.ok(result.tp1 < result.tp2, 'TP1 must remain below TP2');
  });

  test('downgrades BUY_NOW to WAIT_FOR_CONFIRMATION under severe sell imbalance and immediate ask wall', () => {
    const setup = detectSetup(createMockTA(), 150.0);
    assert.ok(setup !== null);

    // Severe sell imbalance (-0.40) with immediate ask wall 0.8% overhead
    const heavySellLiquidity = {
      orderBookImbalance: -0.40,
      spreadPercent: 0.04,
      bidDepthUsdt: 100_000,
      askDepthUsdt: 350_000,
      volumeDeltaProxy: -15,
      isLiquid: true,
      score: 45,
      description: 'Severe sell imbalance',
      nearestBidWall: null,
      nearestAskWall: { price: 151.2, volumeUsdt: 250_000, percentFromPrice: 0.8 },
      bidAskRatio: 0.28,
    };

    const status = assignSignalStatus(
      85,
      'A+',
      150.0,
      setup,
      'BULL',
      heavySellLiquidity
    );

    assert.strictEqual(
      status,
      'WAIT_FOR_CONFIRMATION',
      'Should downgrade BUY_NOW to WAIT_FOR_CONFIRMATION when facing immediate ask wall with -40% imbalance'
    );
  });

  test('strictly enforces spot long trade geometry invariants (entryZone.high < TP1)', () => {
    const rawSetup = {
      setupType: 'BREAKOUT_RETEST' as const,
      entryZone: { low: 0.8127, high: 0.8578 },
      preferredEntry: 0.8184,
      stopLoss: 0.8086,
      dca1: 0.8147,
      dca2: 0.8113,
      tp1: 0.8331,
      tp2: 0.8439,
      tp3: 0.8576,
      riskReward: 2.6,
      confirmationCondition: 'test',
      rationale: 'test',
    };

    const enforced = enforceSetupGeometry(rawSetup, 0.8517);

    assert.ok(enforced.entryZone.high < enforced.tp1, 'entryZone.high must be strictly below TP1');
    assert.ok(enforced.entryZone.low < enforced.entryZone.high, 'entryZone.low must be strictly below entryZone.high');
    assert.ok(enforced.stopLoss < enforced.dca2, 'stopLoss must be below DCA2');
    assert.ok(enforced.dca2 < enforced.dca1, 'dca2 must be below DCA1');
    assert.ok(enforced.dca1 < enforced.entryZone.low, 'dca1 must be below entryZone.low');
    assert.ok(enforced.tp1 < enforced.tp2, 'tp1 must be below tp2');
    assert.ok(enforced.tp2 < enforced.tp3, 'tp2 must be below tp3');
  });

  test('blocks BUY_NOW when currentPrice is at or above TP1', () => {
    const setup = detectSetup(createMockTA(), 150.0);
    assert.ok(setup !== null);

    const statusAtTp1 = assignSignalStatus(
      90,
      'A+',
      setup.tp1 + 1.0,
      setup,
      'BULL'
    );

    assert.notStrictEqual(
      statusAtTp1,
      'BUY_NOW',
      'Should strictly never return BUY_NOW when price has already reached or exceeded TP1'
    );
  });
});


