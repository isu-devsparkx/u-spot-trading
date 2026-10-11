// ─── U-SPOT Top-20 Scanner Unit Tests ───────────────────────────────
// Phase 4: Candidate Scoring, Factor Weights, Market Regime, & Top-20 Ranking Tests
// Spec Section 5 (Top-20 Scanner), Section 6 (Market Regime Engine), Section 51

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCANNER_WEIGHTS,
  SCANNER_PRESETS,
  normalizeWeights,
  evaluateMarketRegime,
  calculateCandidateFactors,
  computeCompositeScore,
  generateExplainableReason,
  scanMarketUniverse,
} from '../services/scanner-service.ts';
import type {
  MarketPair,
  Ticker24h,
  ScannerWeights,
} from '../../types/index.ts';

// Sample mock market pairs for unit testing
const mockPairs: MarketPair[] = [
  {
    symbol: 'SOL/USDT',
    rawSymbol: 'SOLUSDT',
    name: 'Solana',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    price: 185.5,
    change24h: 8.5,
    high24h: 188.0,
    low24h: 172.0,
    volume24h: 45_000_000,
    trades24h: 120_000,
    spreadPercent: 0.02,
    liquidityScore: 92,
    marketCapRank: 5,
    status: 'DATA_AVAILABLE',
    lastUpdated: Date.now(),
  },
  {
    symbol: 'DOGE/USDT',
    rawSymbol: 'DOGEUSDT',
    name: 'Dogecoin',
    baseAsset: 'DOGE',
    quoteAsset: 'USDT',
    price: 0.22,
    change24h: 18.2,
    high24h: 0.23,
    low24h: 0.18,
    volume24h: 80_000_000,
    trades24h: 250_000,
    spreadPercent: 0.03,
    liquidityScore: 88,
    marketCapRank: 8,
    status: 'DATA_AVAILABLE',
    lastUpdated: Date.now(),
  },
  {
    symbol: 'BTC/USDT',
    rawSymbol: 'BTCUSDT',
    name: 'Bitcoin',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price: 92000,
    change24h: 1.8,
    high24h: 92500,
    low24h: 90200,
    volume24h: 350_000_000,
    trades24h: 500_000,
    spreadPercent: 0.01,
    liquidityScore: 99,
    marketCapRank: 1,
    status: 'DATA_AVAILABLE',
    lastUpdated: Date.now(),
  },
  {
    symbol: 'LOWVOL/USDT',
    rawSymbol: 'LOWVOLUSDT',
    name: 'Low Volume Token',
    baseAsset: 'LOWVOL',
    quoteAsset: 'USDT',
    price: 1.05,
    change24h: -1.2,
    high24h: 1.06,
    low24h: 1.04,
    volume24h: 200_000, // Below standard $500k filter
    trades24h: 800,
    spreadPercent: 0.65, // Wide spread
    liquidityScore: 35,
    status: 'DATA_AVAILABLE',
    lastUpdated: Date.now(),
  },
];

const mockTickers: Ticker24h[] = [
  {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price: 92000,
    priceChange: 1600,
    priceChangePercent: 1.8,
    highPrice: 92500,
    lowPrice: 90200,
    volume: 3800,
    quoteVolume: 350_000_000,
    bidPrice: 91999,
    askPrice: 92001,
    spreadPercent: 0.002,
    count: 500000,
    timestamp: Date.now(),
  },
  {
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    price: 3450,
    priceChange: 75,
    priceChangePercent: 2.2,
    highPrice: 3480,
    lowPrice: 3360,
    volume: 50000,
    quoteVolume: 170_000_000,
    bidPrice: 3449.8,
    askPrice: 3450.2,
    spreadPercent: 0.01,
    count: 250000,
    timestamp: Date.now(),
  },
  {
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    price: 185.5,
    priceChange: 14.5,
    priceChangePercent: 8.5,
    highPrice: 188.0,
    lowPrice: 172.0,
    volume: 240000,
    quoteVolume: 45_000_000,
    bidPrice: 185.48,
    askPrice: 185.52,
    spreadPercent: 0.02,
    count: 120000,
    timestamp: Date.now(),
  },
];

describe('Scanner: Factor Weights & Presets (Spec Section 5)', () => {
  it('verifies default factor weights sum to 100%', () => {
    const { momentum, volume, liquidity, trend, structure, volatility, catalyst } =
      DEFAULT_SCANNER_WEIGHTS;

    assert.equal(momentum, 20);
    assert.equal(volume, 20);
    assert.equal(liquidity, 15);
    assert.equal(trend, 15);
    assert.equal(structure, 15);
    assert.equal(volatility, 10);
    assert.equal(catalyst, 5);

    const sum =
      momentum + volume + liquidity + trend + structure + volatility + catalyst;
    assert.equal(sum, 100);
  });

  it('verifies all strategy presets sum to exactly 100%', () => {
    for (const [name, preset] of Object.entries(SCANNER_PRESETS)) {
      const sum =
        preset.weights.momentum +
        preset.weights.volume +
        preset.weights.liquidity +
        preset.weights.trend +
        preset.weights.structure +
        preset.weights.volatility +
        preset.weights.catalyst;
      assert.equal(
        sum,
        100,
        `Preset ${name} weights sum must be 100, got ${sum}`
      );
    }
  });

  it('normalizes arbitrary custom weights to 100%', () => {
    const unnormalized: ScannerWeights = {
      momentum: 40,
      volume: 40,
      liquidity: 20,
      trend: 20,
      structure: 20,
      volatility: 20,
      catalyst: 20,
    }; // sum = 180

    const normalized = normalizeWeights(unnormalized);
    const sum =
      normalized.momentum +
      normalized.volume +
      normalized.liquidity +
      normalized.trend +
      normalized.structure +
      normalized.volatility +
      normalized.catalyst;

    assert.equal(sum, 100);
    assert.ok(normalized.momentum > normalized.liquidity);
  });

  it('handles all-zero weights by falling back to defaults', () => {
    const zeroWeights = {
      momentum: 0,
      volume: 0,
      liquidity: 0,
      trend: 0,
      structure: 0,
      volatility: 0,
      catalyst: 0,
    };
    const normalized = normalizeWeights(zeroWeights);
    assert.equal(normalized.momentum, 20);
    assert.equal(normalized.volume, 20);
  });
});

describe('Scanner: Multi-Factor Evaluation (Spec Section 5)', () => {
  it('calculates 7 scoring factors within [0, 100] bounds', () => {
    const medianVolume = 20_000_000;
    const btcChange = 2.0;

    const { factors, rawMetrics } = calculateCandidateFactors(
      mockPairs[0],
      medianVolume,
      btcChange
    );

    assert.ok(factors.momentum >= 0 && factors.momentum <= 100);
    assert.ok(factors.volume >= 0 && factors.volume <= 100);
    assert.ok(factors.liquidity >= 0 && factors.liquidity <= 100);
    assert.ok(factors.trend >= 0 && factors.trend <= 100);
    assert.ok(factors.structure >= 0 && factors.structure <= 100);
    assert.ok(factors.volatility >= 0 && factors.volatility <= 100);
    assert.ok(factors.catalyst >= 0 && factors.catalyst <= 100);

    // SOL had +8.5% gain and outperformed BTC (+2.0%), so momentum must be strong
    assert.ok(factors.momentum >= 75);
    // Volatility daily range should be healthy (172 to 188 = ~9.3% daily range)
    assert.ok(rawMetrics.dailyRangePercent >= 8.0);
    assert.ok(factors.volatility >= 80);
  });

  it('computes composite score as a weighted sum of factors', () => {
    const factors = {
      momentum: 80,
      volume: 90,
      liquidity: 70,
      trend: 75,
      structure: 85,
      volatility: 80,
      catalyst: 60,
    };

    const score = computeCompositeScore(factors, DEFAULT_SCANNER_WEIGHTS);
    // (80*0.2) + (90*0.2) + (70*0.15) + (75*0.15) + (85*0.15) + (80*0.1) + (60*0.05)
    // 16 + 18 + 10.5 + 11.25 + 12.75 + 8 + 3 = 79.5 -> 80
    assert.equal(score, 80);
  });

  it('re-ranks candidates dynamically when factor weights change', () => {
    const medianVolume = 20_000_000;
    const btcChange = 1.8;

    const solEval = calculateCandidateFactors(mockPairs[0], medianVolume, btcChange);
    const btcEval = calculateCandidateFactors(mockPairs[2], medianVolume, btcChange);

    // With Momentum Chaser preset (Momentum: 40%, Liquidity: 5%)
    const solScoreMomentum = computeCompositeScore(
      solEval.factors,
      SCANNER_PRESETS.MOMENTUM_CHASER.weights
    );
    const btcScoreMomentum = computeCompositeScore(
      btcEval.factors,
      SCANNER_PRESETS.MOMENTUM_CHASER.weights
    );
    assert.ok(
      solScoreMomentum > btcScoreMomentum,
      'SOL should outscore BTC when momentum is heavily weighted'
    );

    // Under Momentum Chaser, SOL's momentum (+8.5%) gives it a commanding lead
    const momentumLead = solScoreMomentum - btcScoreMomentum;
    assert.ok(momentumLead >= 6, 'SOL momentum lead should be at least 6 points over BTC');

    // With Liquidity-Dominant Weights (Liquidity: 70%, Volume: 30%)
    const liquidityWeights: ScannerWeights = {
      liquidity: 70,
      volume: 30,
      momentum: 0,
      trend: 0,
      structure: 0,
      volatility: 0,
      catalyst: 0,
    };
    const solScoreLiquidity = computeCompositeScore(solEval.factors, liquidityWeights);
    const btcScoreLiquidity = computeCompositeScore(btcEval.factors, liquidityWeights);

    assert.ok(
      btcScoreLiquidity > solScoreLiquidity,
      `BTC (score: ${btcScoreLiquidity}) should outscore SOL (score: ${solScoreLiquidity}) when liquidity & volume are the dominant factors`
    );
  });
});

describe('Scanner: Market Regime Engine (Spec Section 6)', () => {
  it('classifies BULL regime with permissive score threshold', () => {
    const bullTickers: Ticker24h[] = [
      { ...mockTickers[0], priceChangePercent: 3.2 },
      { ...mockTickers[1], priceChangePercent: 4.1 },
      { ...mockTickers[2], priceChangePercent: 7.5 },
    ];
    const analysis = evaluateMarketRegime(bullTickers);
    assert.equal(analysis.regime, 'BULL');
    assert.ok(analysis.scoreThresholdAdjustment <= 0); // Permissive in bull markets
    assert.ok(analysis.description.includes('BULL') || analysis.description.includes('bullish'));
  });

  it('classifies BEAR regime with stricter score threshold', () => {
    const bearTickers: Ticker24h[] = [
      { ...mockTickers[0], priceChangePercent: -3.5 },
      { ...mockTickers[1], priceChangePercent: -4.2 },
      { ...mockTickers[2], priceChangePercent: -6.0 },
    ];
    const analysis = evaluateMarketRegime(bearTickers);
    assert.equal(analysis.regime, 'BEAR');
    assert.ok(analysis.scoreThresholdAdjustment > 0); // Stricter in bear markets
  });

  it('classifies HIGH_VOLATILITY on major market swings (>7%)', () => {
    const volatileTickers: Ticker24h[] = [
      { ...mockTickers[0], priceChangePercent: 8.5 },
      { ...mockTickers[1], priceChangePercent: 2.0 },
      { ...mockTickers[2], priceChangePercent: 5.0 },
    ];
    const analysis = evaluateMarketRegime(volatileTickers);
    assert.equal(analysis.regime, 'HIGH_VOLATILITY');
    assert.ok(analysis.scoreThresholdAdjustment >= 8);
  });
});

describe('Scanner: Universe Scanning, Filtering & Ranking (Spec Section 5)', () => {
  it('filters out pairs below minimum 24h volume and wide spreads', () => {
    const result = scanMarketUniverse(mockPairs, mockTickers, {
      filters: {
        minVolumeUsdt: 500_000,
        maxSpreadPercent: 0.5,
        limit: 20,
      },
    });

    // LOWVOL pair ($200k volume, 0.65% spread) must be excluded
    const hasLowVol = result.candidates.some((c) => c.symbol === 'LOWVOL/USDT');
    assert.equal(hasLowVol, false, 'LOWVOL pair should be filtered out by volume & spread filters');

    // SOL, DOGE, BTC should be present
    assert.equal(result.candidates.length, 3);
  });

  it('produces 1-based ranks and explainable reasons for all candidates', () => {
    const result = scanMarketUniverse(mockPairs, mockTickers);

    for (let i = 0; i < result.candidates.length; i++) {
      const c = result.candidates[i];
      assert.equal(c.rank, i + 1);
      assert.ok(c.reasonSelected && c.reasonSelected.length > 10);
      assert.ok(c.candidateScore >= 1 && c.candidateScore <= 99);
      assert.ok(c.factors !== undefined);
    }
  });

  it('filters candidates by Market Regime tab', () => {
    const bullResult = scanMarketUniverse(mockPairs, mockTickers, {
      filters: {
        regimeFilter: 'BULL',
      },
    });

    // Bull setups must have positive 24h change
    for (const c of bullResult.candidates) {
      assert.ok(c.change24h > 0);
    }
  });
});
