// ─── U-SPOT Type Definitions ───────────────────────────────────────
// Phase 7: Signal lifecycle, history, MFE/MAE, SL analysis

/** Market regime classifications */
export type MarketRegime =
  | 'BULL'
  | 'NEUTRAL'
  | 'BEAR'
  | 'HIGH_VOLATILITY'
  | 'LOW_LIQUIDITY';

/** Signal direction */
export type SignalDirection = 'BUY' | 'SELL';

/** Signal statuses */
export type SignalStatus =
  | 'BUY_NOW'
  | 'WAIT_FOR_CONFIRMATION'
  | 'WATCH'
  | 'SELL_EXIT'
  | 'AVOID'
  | 'NO_TRADE';

/** Signal lifecycle stages */
export type SignalLifecycle =
  | 'CREATED'
  | 'ACTIVE'
  | 'ENTRY_TRIGGERED'
  | 'DCA1_TRIGGERED'
  | 'DCA2_TRIGGERED'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'TP3_HIT'
  | 'SL_HIT'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'CLOSED'
  | 'EVALUATED';

/** Signal result types */
export type SignalResult =
  | 'TP1_ONLY'
  | 'TP2_REACHED'
  | 'TP3_REACHED'
  | 'FULL_TP'
  | 'PARTIAL_TP_THEN_SL'
  | 'SL'
  | 'INVALIDATED_BEFORE_ENTRY'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'INDETERMINATE'
  | 'MANUAL_EXIT';

/** Setup confidence level */
export type ConfidenceGrade = 'A+' | 'A' | 'B' | 'BELOW_THRESHOLD';

/** Setup type classification */
export type SetupType =
  | 'BREAKOUT_RETEST'
  | 'PULLBACK_CONTINUATION'
  | 'LIQUIDITY_SWEEP'
  | 'TREND_CONTINUATION'
  | 'SUPPORT_REACTION';

/** Risk configuration per grade */
export interface RiskConfig {
  grade: ConfidenceGrade;
  maxRiskPercent: number;
}

/** Wallet settings */
export interface WalletSettings {
  balanceUsdt: number;
  riskConfigs: RiskConfig[];
  maxPositionPercent: number;
}

/** Fee and execution parameters */
export interface ExecutionCosts {
  makerFeePercent: number;
  takerFeePercent: number;
  slippagePercent: number;
}

/** Parameters passed to the position size calculator */
export interface PositionSizeParams {
  walletBalance: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  dca1Price?: number;
  dca2Price?: number;
  maxPositionPercent?: number; // Cap per trade as % of wallet (default: 30%)
  costs?: Partial<ExecutionCosts>;
  takeProfits?: {
    tp1?: number;
    tp2?: number;
    tp3?: number;
  };
}

/** Individual order tranche allocation */
export interface TrancheAllocation {
  orderName: 'Entry' | 'DCA #1' | 'DCA #2';
  price: number;
  allocationUsdt: number;
  quantityCoins: number;
  percentOfTotal: number;
  distanceToSlPercent: number;
  plannedLossUsdt: number;
}

/** Potential profit at a take profit target */
export interface TakeProfitTarget {
  target: 'TP1' | 'TP2' | 'TP3';
  price: number;
  portionPercent: number; // e.g. 30% of position
  gainPercent: number;
  grossProfitUsdt: number;
  exitFeeUsdt: number;
  netProfitUsdt: number;
  rMultiple: number;
}

/** Validation warning from the risk engine */
export interface RiskValidationWarning {
  severity: 'info' | 'warning' | 'error';
  message: string;
}

/** Full calculation result from the risk engine */
export interface PositionSizeResult {
  isValid: boolean;
  errors: string[];
  warnings: RiskValidationWarning[];

  // Risk budget
  walletBalance: number;
  riskPercent: number;
  maxRiskUsdt: number;

  // Capital deployment
  initialAllocation: number;
  dca1Allocation: number;
  dca2Allocation: number;
  maxDeployed: number;
  percentOfWallet: number;
  isCappedByWallet: boolean;

  // Coin quantities
  initialQuantity: number;
  totalQuantity: number;
  averageEntryPrice: number;

  // Distances and loss
  stopDistancePercent: number;
  rawPriceLossUsdt: number;
  estimatedFeeCostUsdt: number;
  estimatedSlippageCostUsdt: number;
  plannedLossAtSlUsdt: number;

  // Tranches breakdown
  tranches: TrancheAllocation[];

  // Take profit targets
  takeProfits: TakeProfitTarget[];
  totalPotentialNetProfitUsdt: number;
  riskRewardRatio: number;
}

// ─── Phase 3: Market Data Types ─────────────────────────────────────

/** Supported analysis timeframes (Spec Section 7) */
export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';

/** Market data quality statuses (Spec Section 42) */
export type MarketDataStatus =
  | 'DATA_AVAILABLE'
  | 'DATA_UNAVAILABLE'
  | 'DATA_STALE'
  | 'LOW_LIQUIDITY'
  | 'UNSAFE_MARKET';

/** Standard OHLCV candlestick bar */
export interface OHLCV {
  timestamp: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades?: number;
}

/** Order book level [price, quantity] */
export type OrderBookEntry = [price: number, quantity: number];

/** Order book depth and liquidity metrics */
export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  spreadPercent: number;
  bidDepthUsdt: number;
  askDepthUsdt: number;
  liquidityScore: number; // 0-100 score based on depth & spread
  timestamp: number;
}

/** Liquidity concentration wall in order book (Phase 23 & Phase 29) */
export interface OrderBookWall {
  price: number;
  volumeUsdt: number;
  percentFromPrice: number;
  type?: 'BID' | 'ASK';
  quantity?: number;
  multipleOfAverage?: number;
  distancePercent?: number;
}

/** Real-time order book depth payload streamed via WebSocket (Phase 29) */
export interface LiveDepthStreamPayload {
  symbol: string;
  lastUpdateId: number;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPercent: number;
  bidDepthUsdt: number;
  askDepthUsdt: number;
  depthImbalance: number; // -1.0 (100% Ask dominance) to +1.0 (100% Bid dominance)
  bidWalls: OrderBookWall[];
  askWalls: OrderBookWall[];
  timestamp: number;
}

/** Single row on Depth of Market (DOM) ladder with volume profiling (Phase 31) */
export interface DOMRow {
  price: number;
  side: 'BID' | 'ASK';
  quantity: number;
  volumeUsdt: number;
  cumulativeVolumeUsdt: number;
  cumulativeDepthPercent: number; // 0 to 100% of visible side depth
  heatIntensity: number; // 0 to 1.0 relative to peak level volume
  isWall: boolean;
  wallMultiple?: number;
  isBestBid: boolean;
  isBestAsk: boolean;
  distancePercentFromMid: number;
}

/** Complete Depth of Market snapshot with heatmap metrics (Phase 31) */
export interface DOMHeatmapSnapshot {
  symbol: string;
  midPrice: number;
  spread: number;
  spreadPercent: number;
  bestBid: number;
  bestAsk: number;
  totalBidDepthUsdt: number;
  totalAskDepthUsdt: number;
  bidAskRatio: number;
  depthImbalance: number;
  peakLevelVolumeUsdt: number;
  askRows: DOMRow[]; // Ordered high ask -> low ask (ascending down toward mid)
  bidRows: DOMRow[]; // Ordered high bid -> low bid (descending down away from mid)
  detectedWalls: OrderBookWall[];
  timestamp: number;
}

/** Real-time ticker price payload streamed via WebSocket (Phase 29) */
export interface LiveTickerStreamPayload {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  bestBid: number;
  bestAsk: number;
  timestamp: number;
}

/** WebSocket client connection status */
export type WebSocketConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

/** Multi-asset watchlist ticker item with live tick animation state (Phase 30) */
export interface WatchlistTickerItem {
  symbol: string;
  baseAsset: string;
  price: number;
  priceChangePercent: number;
  priceChange: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  tickDirection: 'UP' | 'DOWN' | 'EQUAL';
  lastUpdated: number;
}

/** Ticker strip display filter modes */
export type WatchlistFilterMode = 'ALL' | 'GAINERS' | 'LOSERS' | 'VOLUME';

/** 24-hour ticker statistics from exchange */
export interface Ticker24h {
  symbol: string; // e.g. "SOLUSDT"
  baseAsset: string; // "SOL"
  quoteAsset: string; // "USDT"
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number; // Base currency volume
  quoteVolume: number; // USDT volume
  bidPrice: number;
  askPrice: number;
  spreadPercent: number;
  count: number; // 24h trade count
  timestamp: number;
}

/** Verified spot trading market pair in the universe */
export interface MarketPair {
  symbol: string; // e.g. "SOL/USDT"
  rawSymbol: string; // "SOLUSDT"
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number; // In USDT
  trades24h: number;
  spreadPercent: number;
  liquidityScore: number;
  marketCapRank?: number;
  status: MarketDataStatus;
  lastUpdated: number;
}

/** Market universe overview */
export interface MarketUniverseSummary {
  totalTracked: number;
  activeSpotPairs: number;
  totalVolume24hUsdt: number;
  lastUpdated: number;
  source: 'binance' | 'coingecko' | 'hybrid' | 'fallback';
}

// ─── Phase 4: Top-20 Scanner & Regime Types ────────────────────────

/** Measurable candidate scoring factors (Spec Section 5) */
export interface ScannerFactors {
  momentum: number; // 0-100 score
  volume: number; // 0-100 score
  liquidity: number; // 0-100 score
  trend: number; // 0-100 score
  structure: number; // 0-100 score
  volatility: number; // 0-100 score
  catalyst: number; // 0-100 score
}

/** Configurable weights for each factor (must sum to 100) */
export interface ScannerWeights {
  momentum: number; // default: 20
  volume: number; // default: 20
  liquidity: number; // default: 15
  trend: number; // default: 15
  structure: number; // default: 15
  volatility: number; // default: 10
  catalyst: number; // default: 5
}

/** Preset strategy scanner profiles */
export type ScannerPresetName =
  | 'BALANCED'
  | 'MOMENTUM_CHASER'
  | 'VOLUME_BREAKOUT'
  | 'HIGH_LIQUIDITY'
  | 'MEAN_REVERSION'
  | 'CUSTOM';

export interface ScannerPreset {
  name: ScannerPresetName;
  label: string;
  description: string;
  weights: ScannerWeights;
}

/** Dynamic scanner filter criteria */
export interface ScannerFilters {
  minVolumeUsdt?: number;
  maxSpreadPercent?: number;
  minLiquidityScore?: number;
  regimeFilter?: 'ALL' | MarketRegime;
  searchQuery?: string;
  limit?: number;
}

/** Market regime evaluation details (Spec Section 6) */
export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  btcChange24h: number;
  ethChange24h: number;
  marketBreadthPositivePercent: number;
  averageUniverseGainPercent: number;
  totalTrackedVolumeUsdt: number;
  description: string;
  tradingGuidance: string;
  scoreThresholdAdjustment: number;
}

/** Market candidate from the Top-20 scanner (Spec Section 5) */
export interface MarketCandidate {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  volumeRatio: number;
  liquidity: number;
  candidateScore: number;
  marketRegime: MarketRegime;
  reasonSelected: string;
  rank?: number;
  factors?: ScannerFactors;
  rawMetrics?: {
    spreadPercent: number;
    high24h: number;
    low24h: number;
    dailyRangePercent: number;
    trades24h: number;
    relativeStrengthBtc: number;
  };
}

/** Alias for MarketCandidate */
export type CandidateCoin = MarketCandidate;

/** A trading signal (Spec Section 9) */
export interface Signal {
  signalId: string;
  symbol: string;
  direction: SignalDirection;
  createdAt: string;
  strategyVersion: string;
  marketRegime: MarketRegime;
  candidateScore: number;
  tradeScore: number;
  setupType: SetupType;
  entryZone: { low: number; high: number };
  preferredEntry: number;
  dca1: number;
  dca2: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPercent: number;
  maxLoss: number;
  initialAllocation: number;
  dca1Allocation: number;
  dca2Allocation: number;
  maxDeployed: number;
  riskReward: number;
  confidence: ConfidenceGrade;
  status: SignalStatus;
  lifecycle: SignalLifecycle;
  expiresAt: string;
  // Phase 6 enriched fields (Spec Section 9, 10, 11)
  exchange?: string;
  confirmationCondition?: string;
  rationale?: string;
  tradeScoreBreakdown?: {
    trend: number;
    momentum: number;
    volume: number;
    structure: number;
    liquidity: number;
    volatility: number;
    regime: number;
    total: number;
  };
  taSummary?: string;
  // AI-Powered Analysis & Generation Fields
  aiAnalysis?: AiSignalAnalysis;
  isAiGenerated?: boolean;
  // Phase 25: Multi-Timeframe Confluence Analysis
  mtfAnalysis?: MultiTimeframeAnalysis;
  // Phase 24 & Phase 26: Dynamic Trailing Stop
  trailingStopPrice?: number | null;
  // Phase 42: Auto-Adaptive Volatility ATR Sizing & Dynamic Targets
  adaptivePlan?: AdaptiveTargetPlan;
}

/** Phase 25: Multi-Timeframe Confluence Types */
export type MTFAlignment = 'FULL_CONFLUENCE' | 'PARTIAL_CONFLUENCE' | 'NEUTRAL' | 'COUNTER_TREND';

export interface TimeframeTrendSummary {
  timeframe: Timeframe;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ema20: number;
  ema50: number;
  ema200: number | null;
  isAboveEma200: boolean | null;
  alignment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rsi?: number;
}

export interface MultiTimeframeAnalysis {
  tf15m: TimeframeTrendSummary;
  tf1h: TimeframeTrendSummary;
  tf4h?: TimeframeTrendSummary;
  alignment: MTFAlignment;
  confluenceScore: number; // 0 - 100
  isCounterTrendWarning: boolean;
  scoreBonus: number; // e.g. +10 for full bullish alignment, -18 for counter-trend
  recommendation: 'STRONG_ALIGNMENT' | 'SUITABLE' | 'NEUTRAL' | 'AVOID_COUNTER_TREND';
  summary: string;
}

/** AI Signal Review and Gatekeeper Analysis */
export interface AiSignalAnalysis {
  verdict: 'APPROVED' | 'REJECTED' | 'CAUTION';
  confidenceScore: number; // 0 - 100
  aiRationale: string;
  keyRisks: string[];
  keyStrengths: string[];
  regimeAlignment: string;
  historicalContextLesson?: string;
  source: 'GEMINI' | 'FALLBACK_HEURISTIC';
  evaluatedAt: string;
}

/** Configurable weights for trade score calculation (Spec Section 10) */
export interface SignalWeights {
  trend: number; // default: 20
  momentum: number; // default: 15
  volume: number; // default: 15
  structure: number; // default: 20
  liquidity: number; // default: 15
  volatility: number; // default: 10
  regime: number; // default: 5
}

/** Evaluated setup details before position sizing (Spec Section 11, 12, 13) */
export interface SetupEvaluation {
  setupType: SetupType;
  entryZone: { low: number; high: number };
  preferredEntry: number;
  stopLoss: number;
  dca1: number;
  dca2: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
  confirmationCondition: string;
  rationale: string;
}

/** Signal history record */
export interface SignalHistoryRecord extends Signal {
  actualEntry: number | null;
  dca1Hit: boolean;
  dca2Hit: boolean;
  finalResult: SignalResult | null;
  mfe: number | null;
  mae: number | null;
  realizedReturn: number | null;
  realizedR: number | null;
  fees: number | null;
  slippage: number | null;
  evaluationText: string | null;
  trailingStopPrice?: number | null;
}

// ─── Phase 7: Signal Lifecycle & History Types ───────────────────────

/** A discrete event during a signal's lifecycle (Spec Section 15) */
export interface SignalLifecycleEvent {
  eventId: string;
  signalId: string;
  eventType:
    | 'CREATED'
    | 'ENTRY'
    | 'DCA1'
    | 'DCA2'
    | 'TP1'
    | 'TP2'
    | 'TP3'
    | 'SL'
    | 'TRAILING_STOP_RATCHET'
    | 'INVALIDATED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'INDETERMINATE'
    | 'MANUAL_EXIT'
    | 'EVALUATED';
  timestamp: string; // ISO 8601
  price: number | null;
  metadata?: Record<string, unknown>;
}

/** Record of a discrete lifecycle transition during evaluation */
export interface LifecycleTransition {
  signalId: string;
  symbol: string;
  previousLifecycle: SignalLifecycle;
  newLifecycle: SignalLifecycle;
  event: SignalLifecycleEvent;
  currentPrice: number;
  message: string;
}

/** Result summary of a lifecycle tracking sweep */
export interface LifecycleEvaluationSummary {
  timestamp: string;
  processedCount: number;
  activeCount: number;
  pendingCount: number;
  closedCount: number;
  transitions: LifecycleTransition[];
}

/** SL failure analysis result (Spec Section 19) */
export type SlFailureCause =
  | 'MARKET_REGIME_FAILURE'
  | 'FALSE_BREAKOUT'
  | 'LIQUIDITY_SWEEP_FAILURE'
  | 'WEAK_VOLUME'
  | 'MOMENTUM_FAILURE'
  | 'STRUCTURE_FAILURE'
  | 'EXCESSIVE_VOLATILITY'
  | 'NEWS_SHOCK'
  | 'POOR_ENTRY_LOCATION'
  | 'STRATEGY_ERROR'
  | 'DATA_ISSUE'
  | 'SLIPPAGE_SPREAD'
  | 'UNKNOWN';

/** Stop tightness classification (Spec Section 21) */
export type StopTightnessLabel =
  | 'APPROPRIATE_STOP'
  | 'POTENTIALLY_TIGHT'
  | 'POTENTIALLY_WIDE'
  | 'MARKET_SHOCK'
  | 'STRUCTURAL_INVALIDATION'
  | 'INSUFFICIENT_DATA';

/** Time-to-event tracking (Spec Section 23) */
export interface TimeToEvent {
  timeToEntryMs: number | null;
  timeToDca1Ms: number | null;
  timeToDca2Ms: number | null;
  timeToTp1Ms: number | null;
  timeToTp2Ms: number | null;
  timeToTp3Ms: number | null;
  timeToSlMs: number | null;
  timeToExpiryMs: number | null;
}

/** Post-trade evaluation (Spec Sections 19-22) */
export interface SignalEvaluation {
  signalId: string;
  evaluatedAt: string;
  finalResult: SignalResult;
  mfe: number | null;                  // Max Favorable Excursion %
  mae: number | null;                  // Max Adverse Excursion %
  realizedReturnPercent: number | null;
  realizedR: number | null;
  grossPnlUsdt: number | null;
  netPnlUsdt: number | null;
  feesUsdt: number | null;
  slippageUsdt: number | null;
  timeToEvent: TimeToEvent;
  // SL analysis
  slFailurePrimaryCause: SlFailureCause | null;
  slFailureSecondaryCauses: SlFailureCause[];
  stopTightnessLabel: StopTightnessLabel | null;
  counterfactualNote: string | null;   // "Price recovered to X after SL"
  evaluationText: string;
}

/** Performance statistics (Spec Section 27) */
export interface PerformanceStats {
  totalSignals: number;
  activeSignals: number;
  completedSignals: number;
  tp1Rate: number;
  tp2Rate: number;
  tp3Rate: number;
  slRate: number;
  expiryRate: number;
  cancelledRate: number;
  avgR: number;
  medianR: number;
  profitFactor: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  avgHoldingTime: string;
  // Phase 7 additions
  avgMfe: number | null;               // Average MFE %
  avgMae: number | null;               // Average MAE %
  expectancy: number | null;           // Edge per trade in R
  totalNetPnlUsdt: number | null;
  totalFeesUsdt: number | null;
  // Phase 12 additions (Spec Sections 19, 21, 27, 28)
  winRate?: number;                    // Win rate %
  lossRate?: number;                   // Loss rate %
  winCount?: number;
  lossCount?: number;
  byConfidence?: Record<string, { count: number; avgR: number; winRate: number }>;
  byMarketRegime?: Record<string, { count: number; avgR: number; winRate: number; profitFactor?: number }>;
  bySetupType?: Record<string, { count: number; avgR: number; winRate: number; expectancy?: number }>;
  bySlReason?: Record<string, { count: number; percentage: number }>;
  byStopTightness?: Record<string, { count: number; percentage: number }>;
  byCoin?: Record<string, { count: number; avgR: number; winRate: number; netPnlUsdt: number }>;
  attributionReport?: PerformanceAttributionReport;
}

/** Navigation item */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

// ─── Phase 8: Database & Persistence Types (Spec Section 40) ──────────

/** Market snapshot record for persistence (Spec Section 40) */
export interface MarketSnapshot {
  id?: string;
  timestamp: string; // ISO 8601
  symbol: string;
  price: number;
  volume24h: number;
  liquidity: number;
  spread: number;
  marketRegime: MarketRegime;
  indicators: Record<string, unknown>;
}

/** Strategy version record for persistence (Spec Section 40) */
export interface StrategyVersionRecord {
  id?: string;
  version: string;
  createdAt: string;
  description: string;
  parameters: Record<string, unknown>;
  weights: SignalWeights;
  isActive?: boolean;
}

/** Strategy parameter record for persistence (Spec Section 40) */
export interface StrategyParameterRecord {
  id?: string;
  strategyVersion: string;
  parameterKey: string;
  parameterValue: string | number | boolean;
  category: 'WEIGHTS' | 'INDICATOR' | 'RISK' | 'TIMEFRAME' | 'EXECUTION';
  description: string;
  minValue?: number;
  maxValue?: number;
  defaultValue: string | number | boolean;
}

/** Persistence storage source mode */
export type StorageSource = 'supabase' | 'local_memory';

/** Signal storage query filters */
export interface SignalQueryFilters {
  direction?: SignalDirection | 'ALL';
  result?: string;
  confidence?: ConfidenceGrade | 'ALL';
  status?: SignalStatus | 'ALL';
  symbol?: string;
  regime?: MarketRegime | 'ALL';
  since?: string;
  until?: string;
  minScore?: number;
  strategyVersion?: string;
  onlyEntryTriggered?: boolean;
  page?: number;
  limit?: number;
}

// ─── Phase 5: Technical Analysis Module Types (Spec Section 8) ────────

/** Trend module output (Spec Section 8.1) */
export interface TrendAnalysis {
  ema20: number;
  ema50: number;
  ema200: number | null;
  alignment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'TRANSITION';
  distanceEma20Percent: number;
  distanceEma50Percent: number;
  distanceEma200Percent: number | null;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // 0-100
  description: string;
}

/** Momentum module output (Spec Section 8.2) */
export interface MomentumAnalysis {
  rsi: number; // Wilder's 14-period RSI
  rsiState: 'OVERBOUGHT' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'OVERSOLD';
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    cross: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NONE';
  };
  roc: number; // Rate of change %
  divergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE';
  score: number; // 0-100
  description: string;
}

/** Volume module output (Spec Section 8.3) */
export interface VolumeAnalysis {
  currentVolume: number;
  averageVolume20: number;
  volumeRatio: number; // current / avg20
  isVolumeSpike: boolean; // >= 2.0x
  volumeTrend: 'EXPANDING' | 'AVERAGE' | 'CONTRACTING';
  score: number; // 0-100
  description: string;
}

/** Volatility module output (Spec Section 8.4) */
export interface VolatilityAnalysis {
  atr: number; // 14-period Average True Range
  atrPercent: number; // ATR as % of current price
  recentRange: {
    high: number;
    low: number;
    rangePercent: number;
  };
  recommendedSlDistancePercent: number; // 1.5x - 2.0x ATR distance
  recommendedDca1DistancePercent: number; // ~0.8x - 1.2x ATR
  recommendedDca2DistancePercent: number; // ~1.5x - 2.2x ATR
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  score: number; // 0-100
  description: string;
}

/** Market structure swing pivot level */
export interface SwingPivot {
  price: number;
  timestamp: number;
  index: number;
  type: 'HIGH' | 'LOW';
}

/** Market structure module output (Spec Section 8.5) */
export interface StructureAnalysis {
  swingHighs: SwingPivot[];
  swingLows: SwingPivot[];
  latestHighType: 'HH' | 'LH' | null;
  latestLowType: 'HL' | 'LL' | null;
  structureTrend: 'UPTREND' | 'DOWNTREND' | 'RANGING';
  breakOfStructure: {
    detected: boolean;
    type: 'BULLISH_BOS' | 'BEARISH_BOS' | null;
    level: number | null;
  };
  changeOfCharacter: {
    detected: boolean;
    type: 'BULLISH_CHOCH' | 'BEARISH_CHOCH' | null;
    level: number | null;
  };
  liquiditySweep: {
    detected: boolean;
    type: 'SWEEP_HIGH' | 'SWEEP_LOW' | null;
    level: number | null;
  };
  nearestSupport: number | null;
  nearestResistance: number | null;
  score: number; // 0-100
  description: string;
}


/** Liquidity & order flow module output (Spec Section 8.6) */
export interface LiquidityFlowAnalysis {
  orderBookImbalance: number; // -1 (sell heavy) to +1 (buy heavy)
  spreadPercent: number;
  bidDepthUsdt: number;
  askDepthUsdt: number;
  volumeDeltaProxy: number; // Estimated buyer dominance -100 to +100
  isLiquid: boolean;
  score: number; // 0-100
  description: string;
  nearestBidWall?: OrderBookWall | null;
  nearestAskWall?: OrderBookWall | null;
  bidAskRatio?: number;
}

/** Unified Technical Analysis Output combining all 6 modules */
export interface TechnicalAnalysisResult {
  symbol: string;
  timeframe: Timeframe;
  timestamp: number;
  currentPrice: number;
  trend: TrendAnalysis;
  momentum: MomentumAnalysis;
  volume: VolumeAnalysis;
  volatility: VolatilityAnalysis;
  structure: StructureAnalysis;
  liquidity: LiquidityFlowAnalysis;
  compositeTechnicalScore: number; // 0-100
  overallBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  summary: string;
}

// ─── Phase 13: Backtest Engine Types (Spec Section 30, 32, 33) ────────

/** Configuration parameters for historical simulation */
export interface BacktestConfig {
  symbol: string;
  timeframe: Timeframe;
  barsCount: number;
  initialWalletBalance: number;
  makerFeeRate: number;      // e.g. 0.001 (0.10%)
  takerFeeRate: number;      // e.g. 0.001 (0.10%)
  slippageRate: number;      // e.g. 0.0005 (0.05%)
  spreadRate: number;        // e.g. 0.0002 (0.02%)
  maxConcurrentPositions: number;
  dcaEnabled: boolean;
  breakevenTrigger: boolean; // Move SL to entry after TP1
  strategyVersion?: string;
  weights?: SignalWeights;
  mtfEnabled?: boolean;      // Phase 27: Multi-timeframe confluence filter
}

/** Individual simulated trade execution record */
export interface BacktestTrade {
  id: string;
  signalId: string;
  symbol: string;
  setupType: SetupType;
  confidence: ConfidenceGrade;
  direction: SignalDirection;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  plannedEntry: number;
  dca1Hit: boolean;
  dca2Hit: boolean;
  avgEntryPrice: number;
  allocatedCapital: number;
  maxDeployedCapital: number;
  exitIndex: number;
  exitTime: number;
  exitPrice: number;
  exitReason: SignalResult;
  holdingBars: number;
  holdingDurationMs: number;
  realizedR: number;
  realizedReturnPercent: number;
  grossPnlUsdt: number;
  feesUsdt: number;
  slippageUsdt: number;
  spreadUsdt: number;
  netPnlUsdt: number;
  mfePercent: number;
  maePercent: number;
  exitSummary: string;
}

/** Individual point along the backtest equity curve */
export interface EquityPoint {
  index: number;
  timestamp: number;
  equityUsdt: number;
  runningR: number;
  drawdownPercent: number;
}

/** Comprehensive backtest report */
export interface BacktestResult {
  config: BacktestConfig;
  stats: PerformanceStats;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  initialBalance: number;
  finalBalance: number;
  netProfitUsdt: number;
  grossProfitUsdt: number;
  grossLossUsdt: number;
  totalFeesUsdt: number;
  totalReturnPercent: number;
  simulatedBarsCount: number;
  executedAt: string;
}

// ─── Phase 14: Walk-Forward Validation Types ─────────────────────────

/** Candidate parameter set tested during In-Sample training */
export interface StrategyParamCandidate {
  name: string;
  description?: string;
  weights: SignalWeights;
  mtf?: {
    enabled: boolean;
    blockCounterTrend: boolean;
    bonusPoints: number;
  };
}

/** Walk-Forward Validation Configuration */
export interface WalkForwardConfig {
  symbol: string;
  timeframe: Timeframe;
  totalBars: number;
  initialBalance: number;
  windowCount: number; // e.g. 3 to 5 rolling windows
  trainRatio: number; // e.g. 0.70 for 70% In-Sample, 30% Out-Of-Sample
  candidates?: StrategyParamCandidate[];
  includeFees?: boolean;
  slippagePercent?: number;
  mtfOptimization?: boolean; // When true, evaluates MTF parameter grid search
}

/** Results for a single rolling Walk-Forward window */
export interface WalkForwardWindowResult {
  windowIndex: number;
  trainRange: {
    startBar: number;
    endBar: number;
    startTime: number;
    endTime: number;
    barsCount: number;
  };
  testRange: {
    startBar: number;
    endBar: number;
    startTime: number;
    endTime: number;
    barsCount: number;
  };
  selectedCandidate: StrategyParamCandidate;
  inSampleResult: BacktestResult;
  outOfSampleResult: BacktestResult;
  windowEfficiency: number; // WFE % (OOS return / IS return * 100)
  degradationPercent: number; // Performance drop from IS to OOS
  isRobust: boolean;
}

/** Overfitting and robustness classification */
export type RobustnessGrade = 'HIGHLY_ROBUST' | 'ROBUST' | 'FRAGILE' | 'OVERFIT';

/** Out-of-Sample MTF Confluence Alpha Evaluation Metric */
export interface WalkForwardMtfAlphaMetric {
  isMtfSuperior: boolean;
  avgMtfWfe: number;
  avgRawWfe: number;
  wfeDelta: number;
  counterTrendDrawdownSavedUsdt: number;
  summary: string;
}

/** Complete Walk-Forward Validation Report */
export interface WalkForwardResult {
  config: WalkForwardConfig;
  windows: WalkForwardWindowResult[];
  overallWFE: number; // Average Walk-Forward Efficiency (%)
  robustnessGrade: RobustnessGrade;
  avgInSampleReturn: number;
  avgOutOfSampleReturn: number;
  avgInSampleWinRate: number;
  avgOutOfSampleWinRate: number;
  avgInSampleProfitFactor: number;
  avgOutOfSampleProfitFactor: number;
  inSampleTotalPnl: number;
  outOfSampleTotalPnl: number;
  combinedOutOfSampleCurve: EquityPoint[];
  mtfAlphaMetric?: WalkForwardMtfAlphaMetric;
  recommendations: string[];
  executedAt: string;
}

// ─── Phase 15: Telegram Alerts & Notifications Types ─────────────────

/** Supported Telegram notification event types */
export type TelegramAlertEventType =
  | 'SIGNAL_CREATED'
  | 'ENTRY_FILLED'
  | 'DCA_FILLED'
  | 'TP_HIT'
  | 'SL_HIT'
  | 'TRAILING_STOP_RATCHET'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'INSTITUTIONAL_WALL_DETECTED'
  | 'WEBSOCKET_HEALTH_ALERT'
  | 'DIVERGENCE_ALERT'
  | 'TEST';

/** User alert preferences and Telegram Bot configuration */
export interface TelegramAlertConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  events: {
    onSignalCreated: boolean;
    onEntryFilled: boolean;
    onDcaFilled: boolean;
    onTpHit: boolean;
    onSlHit: boolean;
    onExpiredOrCancelled: boolean;
    onTrailingStopRatchet?: boolean;
    onInstitutionalWall?: boolean;
    onWebSocketHealth?: boolean;
    onDivergence?: boolean;
  };
  deduplicationWindowMs?: number; // Default 5 minutes
}

/** Payload sent to Telegram dispatcher */
export interface TelegramAlertPayload {
  eventType: TelegramAlertEventType;
  signalId?: string;
  symbol: string;
  direction?: 'BUY' | 'SELL';
  price?: number;
  targetReached?: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'DCA1' | 'DCA2' | 'ENTRY';
  realizedR?: number;
  pnlUsdt?: number;
  details?: string;
  confidence?: ConfidenceGrade;
  setupType?: SetupType;
  entryZone?: { low: number; high: number };
  targets?: { tp1: number; tp2: number; tp3: number; sl: number };
  dca1?: number;
  dca2?: number;
  initialAllocation?: number;
  dca1Allocation?: number;
  dca2Allocation?: number;
  maxDeployed?: number;
  maxLoss?: number;
  riskPercent?: number;
  tradeScore?: number;
  timestamp?: number;
  // Phase 32: Institutional Liquidity Wall & WebSocket Health Alert Fields
  wallType?: 'BID' | 'ASK';
  wallPrice?: number;
  wallVolumeUsdt?: number;
  wallMultiple?: number;
  distancePercent?: number;
  wsState?: WebSocketConnectionState;
  wsReason?: string;
  // Phase 37: Multi-Timeframe Divergence Scanner Fields
  divergenceType?: DivergenceType;
  divergenceIndicator?: DivergenceIndicatorType;
  divergenceTimeframe?: DivergenceTimeframe;
  divergenceStrength?: DivergenceStrength;
  divergenceStrengthScore?: number;
  confluenceScore?: number;
}

/** Result returned after dispatching alert */
export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
  deduplicated?: boolean;
  mocked?: boolean;
  timestamp: number;
}

// ─── Phase 16: Strategy Research Lab Types (Spec Sections 29, 36, 40) ─

/** Detailed parameters for custom strategy authoring and research */
export interface StrategyResearchParameters {
  name: string;
  version: string;
  description: string;
  weights: SignalWeights;
  ema: {
    fastPeriod: number;
    slowPeriod: number;
    trendPeriod: number;
  };
  rsi: {
    period: number;
    overbought: number;
    oversold: number;
  };
  volume: {
    surgeMultiplier: number;
  };
  volatility: {
    atrPeriod: number;
    slMultiplier: number;
  };
  risk: {
    gradeAPlusRisk: number;
    gradeARisk: number;
    gradeBRisk: number;
    maxLossCap: number;
  };
  takeProfit: {
    tp1Alloc: number;
    tp2Alloc: number;
    tp3Alloc: number;
    tp1RMultiple: number;
    tp2RMultiple: number;
    tp3RMultiple: number;
  };
  dca: {
    enabled: boolean;
    dca1DropPercent: number;
    dca2DropPercent: number;
    entryAlloc: number;
    dca1Alloc: number;
    dca2Alloc: number;
  };
  regimeFilters: {
    allowedRegimes: MarketRegime[];
  };
  mtf: {
    enabled: boolean;
    blockCounterTrend: boolean;
    bonusPoints: number;
  };
}

/** Comparative metric delta between two strategy versions */
export interface StrategyComparisonMetricDelta {
  metric: string;
  label: string;
  versionAValue: number;
  versionBValue: number;
  delta: number;
  deltaPercent: number;
  better: 'A' | 'B' | 'EQUAL';
  format: 'currency' | 'percent' | 'number' | 'ratio';
}

/** Complete result of side-by-side strategy comparison */
export interface StrategyComparisonResult {
  versionA: {
    config: StrategyResearchParameters;
    result: BacktestResult;
  };
  versionB: {
    config: StrategyResearchParameters;
    result: BacktestResult;
  };
  metrics: StrategyComparisonMetricDelta[];
  winner: 'A' | 'B' | 'TIE';
  scoreA: number;
  scoreB: number;
  summary: string;
  recommendations: string[];
  comparedAt: string;
}

// ─── User Profile & Multi-User Authentication Types ─────────────────

export type UserRole = 'admin' | 'user';

export interface UserAlertPreferences {
  onSignalCreated: boolean;
  onEntryFilled: boolean;
  onDcaFilled: boolean;
  onTpHit: boolean;
  onSlHit: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  telegramChatId?: string | null;
  telegramEnabled: boolean;
  alertPreferences?: UserAlertPreferences;
  watchlistSymbols?: string[]; // Phase 33: Custom ordered pairs for ticker strip & scanner
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: UserProfile;
  token?: string;
  expiresAt?: string;
}

// ─── Phase 34: Time & Sales (Live Trades Stream @trade) Types ───────

export type TradeSizeCategory = 'SMALL' | 'MEDIUM' | 'LARGE' | 'WHALE';

export interface LiveTradeTick {
  id: number | string;
  symbol: string;
  price: number;
  quantity: number;
  volumeUsdt: number;
  side: 'BUY' | 'SELL';
  isBuyerMaker: boolean;
  timestamp: number;
  sizeCategory: TradeSizeCategory;
  isWhale: boolean;
}

export interface TradeFlowStats {
  symbol: string;
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  buyVolumeUsdt: number;
  sellVolumeUsdt: number;
  totalVolumeUsdt: number;
  netCvdUsdt: number;
  takerBuyRatio: number;
  largestTradeUsdt: number;
  whaleTradeCount: number;
  lastUpdated: number;
}

// ─── Phase 35: Order Flow Imbalance Sound & Visual Toast Notifications ──────

export type OrderFlowAlertEventType =
  | 'WHALE_BUY_SWEEP'
  | 'WHALE_SELL_SWEEP'
  | 'INSTITUTIONAL_BID_WALL'
  | 'INSTITUTIONAL_ASK_WALL'
  | 'CVD_EXTREME_BUY'
  | 'CVD_EXTREME_SELL';

export interface OrderFlowToastAlert {
  id: string;
  type: OrderFlowAlertEventType;
  symbol: string;
  title: string;
  message: string;
  price?: number;
  volumeUsdt?: number;
  timestamp: number;
  severity: 'bullish' | 'bearish' | 'whale' | 'info';
  durationMs?: number;
}

export interface OrderFlowAudioConfig {
  soundEnabled: boolean;
  volume: number; // 0.0 to 1.0
  toastsEnabled: boolean;
  whaleThresholdUsdt: number;
  soundTypes: {
    buySweep: boolean;
    sellSweep: boolean;
    wallDetected: boolean;
    cvdSurge: boolean;
  };
}

// ─── Phase 36: WebSocket Reconnect Heartbeat Telemetry Types ────────

export type ConnectionQuality = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'OFFLINE';

export interface WebSocketTelemetry {
  connectionState: WebSocketConnectionState;
  latencyMs: number;
  packetCount: number;
  messagesPerSecond: number;
  connectedAt: number | null;
  uptimeSeconds: number;
  reconnectCount: number;
  lastPingTimestamp: number | null;
  lastPongTimestamp: number | null;
  quality: ConnectionQuality;
  activeStreamCount: number;
}

// ─── Phase 37: Multi-Timeframe Divergence Scanner Types ─────────────

export type DivergenceIndicatorType = 'RSI' | 'MACD_HISTOGRAM' | 'MACD_LINE' | 'OBV';

export type DivergenceType =
  | 'REGULAR_BULLISH'
  | 'REGULAR_BEARISH'
  | 'HIDDEN_BULLISH'
  | 'HIDDEN_BEARISH'
  | 'NONE';

export type DivergenceStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export type DivergenceTimeframe = '15m' | '1h' | '4h' | '1d';

export interface DivergencePivot {
  barIndex: number;
  timestamp: number;
  price: number;
  indicatorValue: number;
}

export interface DivergenceResult {
  symbol: string;
  timeframe: DivergenceTimeframe;
  indicator: DivergenceIndicatorType;
  type: DivergenceType;
  strength: DivergenceStrength;
  strengthScore: number; // 0 to 100
  pricePivots: [DivergencePivot, DivergencePivot]; // [priorPivot, recentPivot]
  currentPrice: number;
  currentIndicatorValue: number;
  barDistance: number;
  detectedAt: number;
  confirmationStatus: 'CONFIRMED' | 'UNCONFIRMED';
  spotAction: 'BUY_ACCUMULATE' | 'CAUTION_TRIM' | 'WATCH';
  description: string;
}

export interface MultiTimeframeDivergenceConfluence {
  symbol: string;
  divergenceType: 'BULLISH' | 'BEARISH';
  alignments: {
    timeframe: DivergenceTimeframe;
    indicator: DivergenceIndicatorType;
    type: DivergenceType;
    strengthScore: number;
  }[];
  confluenceScore: number; // 0 to 100
  timeframesInvolved: DivergenceTimeframe[];
  dominantSentiment: 'STRONG_BUY_REVERSAL' | 'BULLISH_CONTINUATION' | 'BEARISH_EXHAUSTION' | 'BEARISH_CONTINUATION';
  description: string;
}

export interface DivergenceMatrixRow {
  symbol: string;
  currentPrice: number;
  timeframes: {
    [tf in DivergenceTimeframe]?: {
      divergences: DivergenceResult[];
      dominantType: DivergenceType;
      maxStrengthScore: number;
    };
  };
  confluence?: MultiTimeframeDivergenceConfluence;
}

export interface DivergenceMatrixScanReport {
  timestamp: number;
  scannedSymbols: number;
  matrix: DivergenceMatrixRow[];
  confluences: MultiTimeframeDivergenceConfluence[];
  summary: {
    totalBullishRegular: number;
    totalBearishRegular: number;
    totalBullishHidden: number;
    totalBearishHidden: number;
    totalConfluences: number;
  };
}

// ─── Phase 38: Time & Sales Tape / Order Flow Data Exporter Types ────

export type OrderFlowExportFormat = 'CSV' | 'JSON';

export type OrderFlowExportType = 'TRADES' | 'DOM_SNAPSHOT' | 'CVD_HISTORY' | 'ALL_ORDER_FLOW';

export interface OrderFlowExportFilter {
  symbol: string;
  format: OrderFlowExportFormat;
  exportType: OrderFlowExportType;
  startTime?: number;
  endTime?: number;
  minVolumeUsdt?: number;
  takerSide?: 'BUY' | 'SELL' | 'ALL';
  limit?: number;
}

export interface OrderFlowExportMetadata {
  symbol: string;
  timestamp: number;
  recordCount: number;
  totalVolumeUsdt: number;
  netCvdUsdt: number;
  takerBuyVolumeUsdt: number;
  takerSellVolumeUsdt: number;
  format: OrderFlowExportFormat;
  exportType: OrderFlowExportType;
  platform: string;
}

export interface OrderFlowExportJSONPayload {
  metadata: OrderFlowExportMetadata;
  flowStats: TradeFlowStats;
  trades?: LiveTradeTick[];
  domSnapshot?: DOMHeatmapSnapshot;
}

// ─── Phase 39: PnL Performance Attribution by Setup Type & Macro Regime Types ────

export type AttributionEdgeStatus =
  | 'STRONG_EDGE'       // E(R) >= 0.5, Win Rate >= 55%, sample size >= 2
  | 'MODERATE_EDGE'     // E(R) > 0.05, Win Rate >= 45%
  | 'NEUTRAL_EDGE'      // -0.1 <= E(R) <= 0.05
  | 'NEGATIVE_EDGE'     // E(R) < -0.1 (Strategy bleeds under this regime)
  | 'INSUFFICIENT_DATA'; // < 2 completed trades

export type TacticalRecommendation =
  | 'AGGRESSIVE_SCALE'    // Safe to scale risk up to 1.0% (A+ tier)
  | 'STANDARD_ALLOCATION' // Standard trading allocation
  | 'REDUCE_SIZE_50'      // Reduce position size by 50%
  | 'AVOID_REGIME'        // Blacklist/pause this setup under this regime
  | 'COLLECT_MORE_DATA';  // Insufficient sample to make recommendation

export interface AttributionCell {
  setupType: SetupType;
  marketRegime: MarketRegime;
  totalSignals: number;
  completedSignals: number;
  activeSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number;              // 0 - 100%
  lossRate: number;             // 0 - 100%
  avgRealizedR: number;         // Average R-multiple
  medianRealizedR: number;      // Median R-multiple
  expectancy: number;           // Mathematical Expectancy E(R) in R-multiples
  profitFactor: number;         // Gross Profit / Gross Loss
  netPnlUsdt: number;           // Net dollar PnL
  grossProfitsUsdt: number;     // Gross profit in USDT
  grossLossesUsdt: number;      // Gross losses in USDT
  pnlAttributionPct: number;    // % share of total positive portfolio PnL
  avgMfe: number | null;        // Max Favorable Excursion average %
  avgMae: number | null;        // Max Adverse Excursion average %
  edgeStatus: AttributionEdgeStatus;
  tacticalRecommendation: TacticalRecommendation;
}

export interface SetupMarginalAttribution {
  setupType: SetupType;
  totalSignals: number;
  completedSignals: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  netPnlUsdt: number;
  pnlSharePct: number;
  bestRegime: MarketRegime | null;
  worstRegime: MarketRegime | null;
}

export interface RegimeMarginalAttribution {
  marketRegime: MarketRegime;
  totalSignals: number;
  completedSignals: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  netPnlUsdt: number;
  pnlSharePct: number;
  bestSetup: SetupType | null;
  worstSetup: SetupType | null;
}

export interface PerformanceAttributionReport {
  totalTradesAnalyzed: number;
  completedTradesAnalyzed: number;
  totalNetPnlUsdt: number;
  totalGrossProfitUsdt: number;
  totalGrossLossUsdt: number;
  overallExpectancy: number;
  overallWinRate: number;
  setups: SetupType[];
  regimes: MarketRegime[];
  matrix: Record<SetupType, Record<MarketRegime, AttributionCell>>;
  cells: AttributionCell[];
  setupMarginals: SetupMarginalAttribution[];
  regimeMarginals: RegimeMarginalAttribution[];
  topAlphaGenerator: AttributionCell | null;
  topRiskDrag: AttributionCell | null;
  calculatedAt: string;
}

// ─── Phase 40: AI Strategy Synthesis & Automated Factor Weight Optimization Types ────

export type OptimizationObjective =
  | 'MAX_EXPECTANCY'      // Maximize Mathematical Expectancy E(R)
  | 'MAX_PROFIT_FACTOR'   // Maximize Gross Profit / Gross Loss ratio
  | 'MAX_WIN_RATE'        // Minimize loss frequency and maximize target hits
  | 'MIN_DRAWDOWN'        // Capital preservation, lower volatility & risk exposure
  | 'BALANCED_ALPHA';     // Balanced multi-factor equilibrium

export interface FactorWeightAdjustment {
  factor: keyof SignalWeights;
  originalWeight: number;
  optimizedWeight: number;
  delta: number;
  factorCorrelationWithWin: number; // -1.0 to +1.0 correlation with positive R
  winAvgScore: number;              // Average score of this factor on winning trades
  lossAvgScore: number;             // Average score of this factor on losing trades
  rationale: string;
}

export interface OptimizationSimulationResult {
  baselineExpectancy: number;
  optimizedExpectancy: number;
  expectancyDelta: number;
  baselineWinRate: number;
  optimizedWinRate: number;
  winRateDelta: number;
  baselineProfitFactor: number;
  optimizedProfitFactor: number;
  profitFactorDelta: number;
  baselineNetPnlUsdt: number;
  optimizedNetPnlUsdt: number;
  netPnlDelta: number;
}

export interface AiStrategySynthesisInsights {
  summary: string;
  factorRationales: string[];
  keyStrengths: string[];
  regimeSpecificAdvice: string[];
  warnings: string[];
  recommendedSetupBias: SetupType[];
}

export interface AiStrategyOptimizationReport {
  id: string;
  timestamp: number;
  objective: OptimizationObjective;
  sampleTradesCount: number;
  originalWeights: SignalWeights;
  optimizedWeights: SignalWeights;
  adjustments: FactorWeightAdjustment[];
  simulation: OptimizationSimulationResult;
  aiSynthesis: AiStrategySynthesisInsights;
  model: string;
  status: 'OPTIMIZED' | 'APPLIED' | 'DISCARDED';
}

// ─── Phase 41: Order Flow Heatmap 2.0 with Depth Delta Bars Types ────

export interface HeatmapPriceBucket {
  price: number;
  volumeUsdt: number;
  side: 'BID' | 'ASK';
  intensity: number;      // 0.0 to 1.0 color heat intensity
  isWall: boolean;        // Institutional wall flag (>= 2.5x avg)
}

export interface OrderFlowHeatmapSlice {
  timestamp: number;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadUsdt: number;
  buckets: HeatmapPriceBucket[];
  totalBidLiquidityUsdt: number;
  totalAskLiquidityUsdt: number;
  depthDeltaUsdt: number;       // totalBidLiquidityUsdt - totalAskLiquidityUsdt
  cumulativeDeltaUsdt: number;  // rolling cumulative delta
  whaleWallsCount: number;
}

export type HeatmapResolution = '30s' | '1m' | '5m' | '15m';
export type HeatmapColorTheme = 'CYAN_EMERALD' | 'NEON_FIRE' | 'CLASSIC_DEPTH';

export interface HeatmapRenderConfig {
  resolution: HeatmapResolution;
  theme: HeatmapColorTheme;
  contrastMultiplier: number;   // 0.5 to 3.0
  maxHistorySlices: number;     // 40 to 120
  showDeltaBars: boolean;
  showWallOverlays: boolean;
  showMidPriceLine: boolean;
  paused: boolean;
}

// ─── Phase 42: Auto-Adaptive Volatility ATR Sizing & Dynamic Target Scaling Types ────

export type AdaptiveVolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

export interface AdaptiveVolatilityMultipliers {
  dcaStepMultiplier: number;      // e.g. 0.75x in LOW, 1.0x in NORMAL, 1.35x in HIGH, 1.75x in EXTREME
  slBufferMultiplier: number;     // e.g. 1.20x in LOW, 1.50x in NORMAL, 1.85x in HIGH, 2.40x in EXTREME
  tpExpansionMultiplier: number;  // e.g. 0.85x in LOW, 1.00x in NORMAL, 1.25x in HIGH, 1.50x in EXTREME
  trailingStepRatio: number;      // ATR fraction for post-TP trailing stop ratchets
}

export interface AdaptiveTargetPlan {
  symbol: string;
  currentPrice: number;
  entryPrice: number;
  regime: AdaptiveVolatilityRegime;
  atrValue: number;
  atrPercent: number;
  multipliers: AdaptiveVolatilityMultipliers;
  // Dynamic Targets
  adaptiveSlPrice: number;
  adaptiveDca1Price: number;
  adaptiveDca2Price: number;
  adaptiveTp1Price: number;
  adaptiveTp2Price: number;
  adaptiveTp3Price: number;
  // Percentage Distances
  slDistancePercent: number;
  dca1DistancePercent: number;
  dca2DistancePercent: number;
  tp1DistancePercent: number;
  tp2DistancePercent: number;
  tp3DistancePercent: number;
  // Metrics & Explanations
  riskRewardRatio: number;
  maxDrawdownRiskUsdt?: number;
  rationale: string;
  warnings: string[];
}

export interface AdaptiveVolatilityReport {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  plan: AdaptiveTargetPlan;
  baselinePlan: {
    slPrice: number;
    dca1Price: number;
    dca2Price: number;
    tp1Price: number;
    tp2Price: number;
    tp3Price: number;
    riskRewardRatio: number;
  };
  comparison: {
    slExpansionDeltaPercent: number;
    dcaDepthDeltaPercent: number;
    tp1FrontrunDeltaPercent: number;
    tp3ExpansionDeltaPercent: number;
    rrImprovement: number;
  };
}

// ─── Phase 43: Multi-Exchange Spread Arbitrage & Cross-Pair Liquidity Monitor Types ────

export type ExchangeVenue = 'BINANCE' | 'COINBASE' | 'KRAKEN';

export interface ExchangeTickerQuote {
  venue: ExchangeVenue;
  symbol: string;
  price: number;
  bidPrice: number;
  askPrice: number;
  spreadPercent: number;
  timestamp: number;
}

export type InstitutionalFlowBias =
  | 'STRONG_INSTITUTIONAL_BUY'
  | 'MODERATE_BUY'
  | 'NEUTRAL'
  | 'INSTITUTIONAL_SELL_PRESSURE';

export interface CrossExchangeSpreadSnapshot {
  symbol: string;
  timestamp: number;
  binance: ExchangeTickerQuote;
  coinbase?: ExchangeTickerQuote | null;
  kraken?: ExchangeTickerQuote | null;
  coinbasePremiumPercent: number;
  krakenPremiumPercent: number;
  maxSpreadPercent: number;
  highestVenue: ExchangeVenue;
  lowestVenue: ExchangeVenue;
  flowBias: InstitutionalFlowBias;
  isArbitrageViable: boolean;
  estimatedNetProfitPercent: number;
  summary: string;
}

export interface CrossExchangeArbitrageScanReport {
  timestamp: number;
  pairsCount: number;
  pairs: CrossExchangeSpreadSnapshot[];
  highestPremiumPair: CrossExchangeSpreadSnapshot | null;
  highestSpreadPair: CrossExchangeSpreadSnapshot | null;
  viableArbitrageCount: number;
  macroInstitutionalSentiment: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
}

// ─── Phase 44: Real-Time Liquidity Heatmap Snapshot Recording & Replay Engine Types ────

export type HeatmapRecorderState = 'IDLE' | 'RECORDING' | 'PAUSED' | 'REPLAYING';

export type HeatmapRecordingTag =
  | 'ENTRY_FILL'
  | 'TP_HIT'
  | 'SL_HIT'
  | 'WHALE_SWEEP'
  | 'MANUAL';

export type HeatmapPlaybackSpeed = 0.5 | 1 | 2 | 5;

export interface HeatmapRecordingSession {
  id: string;
  symbol: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  frameCount: number;
  slices: OrderFlowHeatmapSlice[];
  initialMidPrice: number;
  finalMidPrice: number;
  priceChangePercent: number;
  maxDepthDeltaUsdt: number;
  totalWhaleWallsObserved: number;
  associatedSignalId?: string;
  tag: HeatmapRecordingTag;
  note?: string;
}

// ─── Phase 45: Institutional Whale Iceberg Order Detector & Hidden Liquidity Types ─

export type IcebergSide = 'BID_ACCUMULATION' | 'ASK_DISTRIBUTION';
export type IcebergConfidence = 'HIGH' | 'MEDIUM' | 'SUSPECTED';

export interface DetectedIcebergOrder {
  id: string;
  symbol: string;
  price: number;
  side: IcebergSide;
  visibleVolumeUsdt: number;
  executedVolumeUsdt: number;
  estimatedHiddenVolumeUsdt: number;
  reloadMultiplier: number;
  fillCount: number;
  firstSeenTimestamp: number;
  lastReloadTimestamp: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'PULLED';
  confidence: IcebergConfidence;
  institutionalImpact: 'MAJOR_ACCUMULATION' | 'MODERATE_ACCUMULATION' | 'ABSORPTION_WALL';
}

export interface IcebergTrackerSummary {
  symbol: string;
  activeIcebergsCount: number;
  totalHiddenBidVolumeUsdt: number;
  totalHiddenAskVolumeUsdt: number;
  netHiddenFlowDeltaUsdt: number;
  dominantInstitutionalBias: 'STRONG_ACCUMULATION' | 'DISTRIBUTION_CEILING' | 'NEUTRAL';
  recentIcebergs: DetectedIcebergOrder[];
  analyzedTradesCount: number;
  timestamp: number;
}

// ─── Phase 46: Algorithmic TWAP/VWAP Smart Order Execution Types ─────────────

export type SmartExecutionAlgorithm = 'TWAP' | 'VWAP' | 'ADAPTIVE_LIQUIDITY';
export type SmartExecutionStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'PAUSED_SLIPPAGE'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ChildOrderTranche {
  trancheIndex: number;
  targetReleaseTime: number;
  allocatedUsdt: number;
  executedUsdt: number;
  executedQuantity: number;
  executedPrice: number;
  status: 'PENDING' | 'FILLED' | 'SKIPPED_SLIPPAGE';
  slippageBps: number;
  filledAt?: number;
}

export interface SmartOrderPlan {
  planId: string;
  symbol: string;
  side: 'BUY'; // Strict 1x spot accumulation
  totalSizeUsdt: number;
  durationMinutes: number;
  tranchesCount: number;
  algorithm: SmartExecutionAlgorithm;
  maxSlippageBps: number;
  arrivalBenchmarkPrice: number;
  status: SmartExecutionStatus;
  tranches: ChildOrderTranche[];
  executedTotalUsdt: number;
  executedTotalQuantity: number;
  averageExecutedPrice: number;
  realizedSlippageBps: number;
  estimatedFeeSavingsUsdt: number;
  createdAt: number;
  completedAt?: number;
}







