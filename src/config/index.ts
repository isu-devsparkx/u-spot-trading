// ─── U-SPOT App Configuration ──────────────────────────────────────
// Centralized config using environment variables with sensible defaults

export const config = {
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME ?? 'U-SPOT',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
    phase: 46,
    phaseLabel: 'Algorithmic TWAP/VWAP Smart Order Execution Engine',
  },
  database: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    tables: {
      signals: 'signals',
      signalEvents: 'signal_events',
      signalEvaluations: 'signal_evaluations',
      marketSnapshots: 'market_snapshots',
      strategyVersions: 'strategy_versions',
      strategyParameters: 'strategy_parameters',
    },
  },
  defaults: {
    walletBalance: 300,
    scanInterval: 5 * 60 * 1000, // 5 minutes in ms
    signalExpiryMs: 4 * 60 * 60 * 1000, // 4 hours default expiry
    riskConfigs: [
      { grade: 'A+' as const, maxRiskPercent: 1.0 },
      { grade: 'A' as const, maxRiskPercent: 0.75 },
      { grade: 'B' as const, maxRiskPercent: 0.5 },
    ],
    tpAllocation: { tp1: 0.3, tp2: 0.3, tp3: 0.4 },
    fees: { maker: 0.001, taker: 0.001 },
    slippage: 0.001,
    // Phase 7: Signal history pagination
    historyPageSize: 50,
    // Phase 7: MFE/MAE tracking intervals
    excursionPollIntervalMs: 60 * 1000, // Check every 1 min
  },
} as const;

