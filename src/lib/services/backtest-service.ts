// ─── U-SPOT Historical Backtester Engine ──────────────────────────────
// Phase 13: Historical Simulation, Fees, Slippage, DCA, Multi-Target TP, SL, Expiry
// Spec Section 30: Backtesting Engine (Same core strategy logic as live engine)
// Spec Section 32: Realistic Fees, Slippage, and Spread Accounting
// Spec Section 33: Strictly No Look-Ahead Bias

import type {
  OHLCV,
  OrderBook,
  MarketCandidate,
  MarketRegime,
  Signal,
  SignalResult,
  SignalHistoryRecord,
  SignalEvaluation,
  BacktestConfig,
  BacktestTrade,
  BacktestResult,
  EquityPoint,
} from '../../types/index.ts';
import { runTechnicalAnalysis, evaluateMultiTimeframeConfluence } from '../ta/index.ts';
import { generateSignalFromCandidate, DEFAULT_SIGNAL_WEIGHTS } from './signal-engine.ts';
import { computePerformanceStats } from './performance-service.ts';

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbol: 'SOL/USDT',
  timeframe: '15m',
  barsCount: 200,
  initialWalletBalance: 300,
  makerFeeRate: 0,          // Fees excluded as exact rates vary across accounts
  takerFeeRate: 0,
  slippageRate: 0.0005,     // 0.05% execution slippage
  spreadRate: 0.0002,       // 0.02% bid-ask spread
  maxConcurrentPositions: 1,
  dcaEnabled: true,
  breakevenTrigger: true,   // Ratchet SL to entry on TP1
  strategyVersion: 'v1.0.0',
  mtfEnabled: true,         // Phase 27: Multi-timeframe confluence filter
};

/**
 * Creates an approximation of an order book for a historical candle
 * to provide liquidity scores for technical analysis
 */
function createSyntheticOrderBook(price: number, symbol: string): OrderBook {
  const spread = price * 0.0002;
  const bestBid = price - spread / 2;
  const bestAsk = price + spread / 2;
  return {
    symbol,
    bids: [[bestBid, 100]],
    asks: [[bestAsk, 100]],
    spread,
    spreadPercent: 0.02,
    bidDepthUsdt: 250000,
    askDepthUsdt: 250000,
    liquidityScore: 80,
    timestamp: Date.now(),
  };
}

/**
 * Classifies prevailing market regime from recent candle price change
 */
function detectCandleRegime(recentCandles: OHLCV[]): MarketRegime {
  if (recentCandles.length < 20) return 'BULL';
  const start = recentCandles[0].close;
  const end = recentCandles[recentCandles.length - 1].close;
  const pct = ((end - start) / start) * 100;

  if (pct > 4) return 'BULL';
  if (pct < -4) return 'BEAR';
  return 'NEUTRAL';
}

/**
 * Master backtest execution engine
 * Evaluates historical bars sequentially with zero lookahead bias
 */
export function runBacktest(
  candles: OHLCV[],
  customConfig: Partial<BacktestConfig> = {}
): BacktestResult {
  const config: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, ...customConfig };
  const minLookback = 50; // Bars required for stable 50 EMA, 14 RSI, 14 ATR

  if (!candles || candles.length < minLookback + 5) {
    return {
      config,
      stats: computePerformanceStats([]),
      trades: [],
      equityCurve: [],
      initialBalance: config.initialWalletBalance,
      finalBalance: config.initialWalletBalance,
      netProfitUsdt: 0,
      grossProfitUsdt: 0,
      grossLossUsdt: 0,
      totalFeesUsdt: 0,
      totalReturnPercent: 0,
      simulatedBarsCount: candles ? candles.length : 0,
      executedAt: new Date().toISOString(),
    };
  }

  let runningWallet = config.initialWalletBalance;
  let runningR = 0;
  let peakEquity = runningWallet;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [
    {
      index: 0,
      timestamp: candles[0].timestamp,
      equityUsdt: Number(runningWallet.toFixed(2)),
      runningR: 0,
      drawdownPercent: 0,
    },
  ];

  let nextTradeAllowedBar = minLookback;
  const expiryBars = 16; // 16 bars on 15m = 4 hours expiry (Spec Section 9)

  for (let i = minLookback; i < candles.length - 2; i++) {
    // Skip if still in a cooldown or concurrent position limit reached
    if (i < nextTradeAllowedBar) {
      continue;
    }

    // 1. Strictly No Lookahead Bias (Spec Section 33):
    // Slice only past candles up to current bar i
    const historicalSlice = candles.slice(0, i + 1);
    const currentBar = candles[i];
    const currentPrice = currentBar.close;
    const regime = detectCandleRegime(candles.slice(Math.max(0, i - 20), i + 1));

    const candidate: MarketCandidate = {
      symbol: config.symbol,
      name: config.symbol.split('/')[0] || 'ASSET',
      price: currentPrice,
      change24h: ((currentPrice - candles[Math.max(0, i - 24)].close) / candles[Math.max(0, i - 24)].close) * 100,
      volume24h: currentBar.volume * currentPrice * 24,
      volumeRatio: 1.2,
      liquidity: 80,
      candidateScore: 80,
      marketRegime: regime,
      reasonSelected: 'Backtest candidate scan',
      rank: 1,
    };

    const orderBook = createSyntheticOrderBook(currentPrice, config.symbol);
    const ta = runTechnicalAnalysis(config.symbol, historicalSlice, config.timeframe, orderBook);

    // Phase 27: Multi-Timeframe Confluence Engine in Backtest Simulation
    const mtfAnalysis = config.mtfEnabled
      ? evaluateMultiTimeframeConfluence({
          symbol: config.symbol,
          klines15m: historicalSlice,
          currentPrice: currentBar.close,
        })
      : undefined;

    // 2. Generate signal using identical live engine logic (Spec Section 30)
    const signal: Signal = generateSignalFromCandidate({
      candidate,
      ta,
      mtfAnalysis,
      walletBalance: runningWallet,
      weights: config.weights || DEFAULT_SIGNAL_WEIGHTS,
      timestamp: currentBar.timestamp,
    });

    // If MTF confluence is enabled and flagged as counter-trend, skip taking this counter-trend trap
    if (config.mtfEnabled && mtfAnalysis?.isCounterTrendWarning) {
      continue;
    }

    // Only simulate executable setups
    if (
      signal.status !== 'BUY_NOW' &&
      signal.status !== 'WAIT_FOR_CONFIRMATION'
    ) {
      continue;
    }

    if (signal.confidence === 'BELOW_THRESHOLD') {
      continue;
    }

    // ─── 3. Simulate Forward Price Action (Bars i+1 ... N) ───
    let isEntered = false;
    let entryBarIndex = -1;
    let entryTimestamp = 0;
    let actualEntryPrice = 0;

    let dca1Hit = false;
    let dca2Hit = false;
    let tp1Hit = false;
    let tp2Hit = false;

    let currentStopLoss = signal.stopLoss;
    let totalCoins = 0;
    let totalCapitalDeployed = 0;

    let totalFees = 0;
    let totalSlippage = 0;
    let totalSpread = 0;

    let mfe = 0;
    let mae = 0;

    let exitBarIndex = -1;
    let exitTimestamp = 0;
    let exitPrice = 0;
    let exitResult: SignalResult = 'EXPIRED';
    let exitSummary = '';

    const simulationEndBar = candles.length;

    for (let k = i + 1; k < simulationEndBar; k++) {
      const bar = candles[k];

      // A. If not yet entered, check entry or expiry
      if (!isEntered) {
        // Expiry check (4h timeout)
        if (k - i >= expiryBars) {
          exitResult = 'EXPIRED';
          exitBarIndex = k;
          exitTimestamp = bar.timestamp;
          exitSummary = 'Entry condition not met within 4 hours. Signal expired.';
          break;
        }

        // Entry check: Low touches preferred entry or inside entry zone
        if (bar.low <= signal.preferredEntry || bar.low <= signal.entryZone.high) {
          isEntered = true;
          entryBarIndex = k;
          entryTimestamp = bar.timestamp;
          actualEntryPrice = Math.min(signal.preferredEntry, bar.open);

          // Tranche 1 Entry
          const entryAlloc = signal.initialAllocation;
          totalCapitalDeployed += entryAlloc;
          totalCoins += entryAlloc / actualEntryPrice;

          // Fees & Slippage on entry (Maker limit entry)
          const entryFee = entryAlloc * config.makerFeeRate;
          const entrySlip = entryAlloc * config.slippageRate;
          totalFees += entryFee;
          totalSlippage += entrySlip;
        }
        continue;
      }

      // B. Position is open: check DCA, Targets, and SL
      const currentAvgEntry = totalCapitalDeployed / totalCoins;

      // Update MFE / MAE
      const barMfe = ((bar.high - currentAvgEntry) / currentAvgEntry) * 100;
      const barMae = ((bar.low - currentAvgEntry) / currentAvgEntry) * 100;
      if (barMfe > mfe) mfe = barMfe;
      if (barMae < mae) mae = barMae;

      // Check DCA 1 Limit
      if (config.dcaEnabled && !dca1Hit && signal.dca1Allocation > 0 && bar.low <= signal.dca1) {
        dca1Hit = true;
        const dca1Alloc = signal.dca1Allocation;
        totalCapitalDeployed += dca1Alloc;
        totalCoins += dca1Alloc / signal.dca1;
        totalFees += dca1Alloc * config.makerFeeRate;
      }

      // Check DCA 2 Limit
      if (config.dcaEnabled && dca1Hit && !dca2Hit && signal.dca2Allocation > 0 && bar.low <= signal.dca2) {
        dca2Hit = true;
        const dca2Alloc = signal.dca2Allocation;
        totalCapitalDeployed += dca2Alloc;
        totalCoins += dca2Alloc / signal.dca2;
        totalFees += dca2Alloc * config.makerFeeRate;
      }

      const activeAvgEntry = totalCapitalDeployed / totalCoins;

      // Check Take Profit 1 (30% tranche)
      if (!tp1Hit && bar.high >= signal.tp1) {
        tp1Hit = true;
        const tp1Coins = totalCoins * 0.30;
        const tp1Gross = tp1Coins * signal.tp1;
        totalFees += tp1Gross * config.takerFeeRate;
        totalSlippage += tp1Gross * config.slippageRate;

        // Breakeven ratchet: move stop to active average entry (Spec Section 13)
        if (config.breakevenTrigger) {
          currentStopLoss = Math.max(currentStopLoss, activeAvgEntry);
        }
      }

      // Check Take Profit 2 (30% tranche)
      if (tp1Hit && !tp2Hit && bar.high >= signal.tp2) {
        tp2Hit = true;
        const tp2Coins = totalCoins * 0.30;
        const tp2Gross = tp2Coins * signal.tp2;
        totalFees += tp2Gross * config.takerFeeRate;
        totalSlippage += tp2Gross * config.slippageRate;
      }

      // Phase 24 & Phase 26: Dynamic Trailing Stop Ratchet
      if (tp2Hit) {
        const unitRisk = Math.max(0.0001, activeAvgEntry - signal.stopLoss);
        currentStopLoss = Math.max(currentStopLoss, signal.tp1, bar.high - unitRisk * 0.75);
      } else if (tp1Hit) {
        const unitRisk = Math.max(0.0001, activeAvgEntry - signal.stopLoss);
        if (bar.high >= activeAvgEntry + unitRisk * 1.25) {
          currentStopLoss = Math.max(currentStopLoss, activeAvgEntry, bar.high - unitRisk * 0.85);
        }
      }

      // Check Take Profit 3 (40% final runner)
      if (tp1Hit && tp2Hit && bar.high >= signal.tp3) {
        exitResult = 'FULL_TP';
        exitBarIndex = k;
        exitTimestamp = bar.timestamp;
        exitPrice = signal.tp3;

        const tp3Coins = totalCoins * 0.40;
        const tp3Gross = tp3Coins * signal.tp3;
        totalFees += tp3Gross * config.takerFeeRate;
        totalSlippage += tp3Gross * config.slippageRate;
        exitSummary = 'Full TP reached (30% TP1, 30% TP2, 40% TP3)';
        break;
      }

      // Check Stop Loss
      if (bar.low <= currentStopLoss) {
        exitBarIndex = k;
        exitTimestamp = bar.timestamp;
        exitPrice = Math.min(currentStopLoss, bar.open);

        // Deduct taker fee and spread on stop out
        const remainingExitVal = totalCoins * (1 - (tp1Hit ? 0.3 : 0) - (tp2Hit ? 0.3 : 0)) * exitPrice;
        totalFees += remainingExitVal * config.takerFeeRate;
        totalSlippage += remainingExitVal * config.slippageRate;
        totalSpread += remainingExitVal * config.spreadRate;

        if (tp2Hit) {
          exitResult = 'TP2_REACHED';
          exitSummary = 'TP2 reached, remaining 40% exited at dynamic trailing stop';
        } else if (tp1Hit) {
          exitResult = 'PARTIAL_TP_THEN_SL';
          exitSummary = 'TP1 reached, remaining stopped out at trailing stop';
        } else {
          exitResult = 'SL';
          exitSummary = 'Stop loss hit. Capital protected.';
        }
        break;
      }
    }

    // If trade was entered and reached end of historical series without closing
    if (isEntered && exitBarIndex === -1) {
      exitBarIndex = simulationEndBar - 1;
      const lastBar = candles[exitBarIndex];
      exitTimestamp = lastBar.timestamp;
      exitPrice = lastBar.close;
      exitResult = tp2Hit ? 'TP2_REACHED' : tp1Hit ? 'TP1_ONLY' : 'MANUAL_EXIT';
      exitSummary = 'Historical period ended. Trade closed at market.';
    }

    // Only record trades that were actually triggered or explicitly expired
    if (isEntered) {
      const avgEntry = totalCapitalDeployed / totalCoins;
      const unitRisk = Math.max(0.0001, avgEntry - signal.stopLoss);

      // Multi-tranche weighted exit calculation
      let weightedExit = exitPrice;
      if (exitResult === 'FULL_TP') {
        weightedExit = 0.30 * signal.tp1 + 0.30 * signal.tp2 + 0.40 * signal.tp3;
      } else if (exitResult === 'TP2_REACHED') {
        weightedExit = 0.30 * signal.tp1 + 0.30 * signal.tp2 + 0.40 * exitPrice;
      } else if (exitResult === 'TP1_ONLY') {
        weightedExit = 0.30 * signal.tp1 + 0.70 * avgEntry;
      } else if (exitResult === 'PARTIAL_TP_THEN_SL') {
        weightedExit = 0.30 * signal.tp1 + 0.70 * exitPrice;
      }

      const grossPnl = Number((totalCoins * (weightedExit - avgEntry)).toFixed(2));
      const feesUsdt = Number(totalFees.toFixed(2));
      const slippageUsdt = Number(totalSlippage.toFixed(2));
      const spreadUsdt = Number(totalSpread.toFixed(2));
      const netPnl = Number((grossPnl - feesUsdt - slippageUsdt - spreadUsdt).toFixed(2));
      const realizedR = Number(((weightedExit - avgEntry) / unitRisk).toFixed(2));
      const realizedReturnPct = Number((((weightedExit - avgEntry) / avgEntry) * 100).toFixed(2));

      // Update running balance
      runningWallet += netPnl;
      runningR += realizedR;

      if (runningWallet > peakEquity) {
        peakEquity = runningWallet;
      }
      const currentDd = peakEquity > 0 ? ((peakEquity - runningWallet) / peakEquity) * 100 : 0;

      trades.push({
        id: `BT-${trades.length + 1}`,
        signalId: signal.signalId,
        symbol: config.symbol,
        setupType: signal.setupType,
        confidence: signal.confidence,
        direction: signal.direction,
        entryIndex: entryBarIndex,
        entryTime: entryTimestamp,
        entryPrice: actualEntryPrice,
        plannedEntry: signal.preferredEntry,
        dca1Hit,
        dca2Hit,
        avgEntryPrice: Number(avgEntry.toFixed(4)),
        allocatedCapital: signal.initialAllocation,
        maxDeployedCapital: Number(totalCapitalDeployed.toFixed(2)),
        exitIndex: exitBarIndex,
        exitTime: exitTimestamp,
        exitPrice: Number(weightedExit.toFixed(4)),
        exitReason: exitResult,
        holdingBars: Math.max(1, exitBarIndex - entryBarIndex),
        holdingDurationMs: Math.max(0, exitTimestamp - entryTimestamp),
        realizedR,
        realizedReturnPercent: realizedReturnPct,
        grossPnlUsdt: grossPnl,
        feesUsdt,
        slippageUsdt,
        spreadUsdt,
        netPnlUsdt: netPnl,
        mfePercent: Number(mfe.toFixed(2)),
        maePercent: Number(mae.toFixed(2)),
        exitSummary,
      });

      equityCurve.push({
        index: trades.length,
        timestamp: exitTimestamp,
        equityUsdt: Number(runningWallet.toFixed(2)),
        runningR: Number(runningR.toFixed(2)),
        drawdownPercent: Number(currentDd.toFixed(2)),
      });

      // Avoid overlapping new signals until the current trade is finalized
      nextTradeAllowedBar = exitBarIndex + 1;
    } else if (exitResult === 'EXPIRED') {
      nextTradeAllowedBar = exitBarIndex + 1;
    }
  }

  // ─── 4. Compute Comprehensive Performance Statistics ───
  // Map simulated trades into SignalHistoryRecord & SignalEvaluation format
  const mockSignals: SignalHistoryRecord[] = trades.map((t) => ({
    signalId: t.signalId,
    symbol: t.symbol,
    direction: t.direction,
    createdAt: new Date(t.entryTime).toISOString(),
    strategyVersion: config.strategyVersion || 'v1.0.0',
    marketRegime: 'BULL',
    candidateScore: 85,
    tradeScore: 82,
    setupType: t.setupType,
    entryZone: { low: t.plannedEntry * 0.99, high: t.plannedEntry * 1.01 },
    preferredEntry: t.plannedEntry,
    actualEntry: t.entryPrice,
    dca1: t.entryPrice * 0.97,
    dca2: t.entryPrice * 0.94,
    dca1Hit: t.dca1Hit,
    dca2Hit: t.dca2Hit,
    stopLoss: t.entryPrice * 0.92,
    tp1: t.entryPrice * 1.03,
    tp2: t.entryPrice * 1.06,
    tp3: t.entryPrice * 1.10,
    riskPercent: 0.75,
    maxLoss: 10,
    initialAllocation: t.allocatedCapital,
    dca1Allocation: 0,
    dca2Allocation: 0,
    maxDeployed: t.maxDeployedCapital,
    riskReward: 2.5,
    confidence: t.confidence,
    status: 'SELL_EXIT',
    lifecycle: 'CLOSED',
    expiresAt: new Date(t.entryTime + 14400000).toISOString(),
    finalResult: t.exitReason,
    realizedR: t.realizedR,
    realizedReturn: t.realizedReturnPercent,
    mfe: t.mfePercent,
    mae: t.maePercent,
    fees: t.feesUsdt,
    slippage: t.slippageUsdt,
    evaluationText: t.exitSummary,
    tradeScoreBreakdown: {
      trend: 20,
      momentum: 15,
      volume: 15,
      structure: 20,
      liquidity: 15,
      volatility: 10,
      regime: 5,
      total: 100,
    },
  }));

  const mockEvaluations: SignalEvaluation[] = trades.map((t) => ({
    signalId: t.signalId,
    evaluatedAt: new Date(t.exitTime).toISOString(),
    finalResult: t.exitReason,
    mfe: t.mfePercent,
    mae: t.maePercent,
    realizedReturnPercent: t.realizedReturnPercent,
    realizedR: t.realizedR,
    grossPnlUsdt: t.grossPnlUsdt,
    netPnlUsdt: t.netPnlUsdt,
    feesUsdt: t.feesUsdt,
    slippageUsdt: t.slippageUsdt,
    timeToEvent: {
      timeToEntryMs: 60000,
      timeToDca1Ms: null,
      timeToDca2Ms: null,
      timeToTp1Ms: null,
      timeToTp2Ms: null,
      timeToTp3Ms: null,
      timeToSlMs: null,
      timeToExpiryMs: null,
    },
    slFailurePrimaryCause: t.exitReason === 'SL' ? 'STRUCTURE_FAILURE' : null,
    slFailureSecondaryCauses: [],
    stopTightnessLabel: 'APPROPRIATE_STOP',
    counterfactualNote: null,
    evaluationText: t.exitSummary,
  }));

  const stats = computePerformanceStats(mockSignals, mockEvaluations);

  const netProfitUsdt = Number((runningWallet - config.initialWalletBalance).toFixed(2));
  const grossProfitUsdt = Number(
    trades.filter((t) => t.grossPnlUsdt > 0).reduce((acc, t) => acc + t.grossPnlUsdt, 0).toFixed(2)
  );
  const grossLossUsdt = Number(
    Math.abs(trades.filter((t) => t.grossPnlUsdt < 0).reduce((acc, t) => acc + t.grossPnlUsdt, 0)).toFixed(2)
  );
  const totalFeesUsdt = Number(trades.reduce((acc, t) => acc + t.feesUsdt, 0).toFixed(2));
  const totalReturnPercent = Number(
    (((runningWallet - config.initialWalletBalance) / config.initialWalletBalance) * 100).toFixed(2)
  );

  return {
    config,
    stats,
    trades,
    equityCurve,
    initialBalance: config.initialWalletBalance,
    finalBalance: Number(runningWallet.toFixed(2)),
    netProfitUsdt,
    grossProfitUsdt,
    grossLossUsdt,
    totalFeesUsdt,
    totalReturnPercent,
    simulatedBarsCount: candles.length,
    executedAt: new Date().toISOString(),
  };
}
