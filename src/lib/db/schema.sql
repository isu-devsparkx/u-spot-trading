-- ============================================================================
-- U-SPOT Trading Platform — Database Schema (Phase 8: Signal Persistence)
-- Spec Sections: Phase 8, Section 40 (Database Schema), Section 35 (Free-first)
-- Compatible with Supabase Free Tier (PostgreSQL)
-- ============================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- TABLE 1: strategy_versions (Spec Section 40)
-- Tracks strategy iterations, parameter sets, and weight configurations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    weights JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- ----------------------------------------------------------------------------
-- TABLE 2: strategy_parameters (Spec Section 40, Phase 16)
-- Granular parameters, thresholds, and weights per strategy version
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_version VARCHAR(32) NOT NULL REFERENCES strategy_versions(version) ON UPDATE CASCADE ON DELETE CASCADE,
    parameter_key VARCHAR(64) NOT NULL,
    parameter_value TEXT NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'WEIGHTS',
    description TEXT,
    min_value NUMERIC,
    max_value NUMERIC,
    default_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_strategy_param UNIQUE (strategy_version, parameter_key)
);

-- ----------------------------------------------------------------------------
-- TABLE 3: market_snapshots (Spec Section 40)
-- 24h market state, orderbook liquidity, and regime indicators at evaluation time
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    price NUMERIC(18, 8) NOT NULL,
    volume_24h NUMERIC(24, 4) NOT NULL DEFAULT 0,
    liquidity NUMERIC(24, 4) NOT NULL DEFAULT 0,
    spread NUMERIC(10, 6) NOT NULL DEFAULT 0,
    market_regime VARCHAR(32) NOT NULL DEFAULT 'NEUTRAL',
    indicators JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_ts ON market_snapshots(symbol, timestamp DESC);

-- ----------------------------------------------------------------------------
-- TABLE 4: signals (Spec Section 9, 14, 40)
-- Core signal repository storing every generated trading signal & sizing plan
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id VARCHAR(64) NOT NULL UNIQUE,
    symbol VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'BUY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    strategy_version VARCHAR(32) NOT NULL REFERENCES strategy_versions(version) ON UPDATE CASCADE,
    market_regime VARCHAR(32) NOT NULL DEFAULT 'NEUTRAL',
    candidate_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    trade_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    setup_type VARCHAR(64) NOT NULL,
    
    -- Entry & Protection Zone
    entry_low NUMERIC(18, 8) NOT NULL,
    entry_high NUMERIC(18, 8) NOT NULL,
    preferred_entry NUMERIC(18, 8) NOT NULL,
    dca1 NUMERIC(18, 8) NOT NULL,
    dca2 NUMERIC(18, 8) NOT NULL,
    stop_loss NUMERIC(18, 8) NOT NULL,
    
    -- Targets
    tp1 NUMERIC(18, 8) NOT NULL,
    tp2 NUMERIC(18, 8) NOT NULL,
    tp3 NUMERIC(18, 8) NOT NULL,
    
    -- Risk & Allocation (Spec Section 14)
    risk_pct NUMERIC(6, 4) NOT NULL DEFAULT 1.0,
    max_loss NUMERIC(14, 4) NOT NULL DEFAULT 0,
    initial_allocation NUMERIC(14, 4) NOT NULL DEFAULT 0,
    dca1_allocation NUMERIC(14, 4) NOT NULL DEFAULT 0,
    dca2_allocation NUMERIC(14, 4) NOT NULL DEFAULT 0,
    max_deployed NUMERIC(14, 4) NOT NULL DEFAULT 0,
    risk_reward NUMERIC(6, 2) NOT NULL DEFAULT 0,
    
    -- Status & Lifecycle
    confidence VARCHAR(20) NOT NULL DEFAULT 'B',
    status VARCHAR(32) NOT NULL DEFAULT 'WATCH',
    lifecycle VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Context & Enriched Metadata
    exchange VARCHAR(32) DEFAULT 'BINANCE_SPOT',
    confirmation_condition TEXT,
    rationale TEXT,
    trade_score_breakdown JSONB DEFAULT '{}'::jsonb,
    ta_summary TEXT,
    
    -- Lifecycle Tracking & Historical Execution (Updated across Phases 7-10)
    actual_entry NUMERIC(18, 8),
    dca1_hit BOOLEAN NOT NULL DEFAULT false,
    dca2_hit BOOLEAN NOT NULL DEFAULT false,
    final_result VARCHAR(32),
    mfe NUMERIC(8, 4),
    mae NUMERIC(8, 4),
    realized_return NUMERIC(8, 4),
    realized_r NUMERIC(8, 4),
    fees NUMERIC(14, 4),
    slippage NUMERIC(14, 4),
    evaluation_text TEXT
);

-- Indices for rapid querying and filtering
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_confidence ON signals(confidence);
CREATE INDEX IF NOT EXISTS idx_signals_final_result ON signals(final_result);
CREATE INDEX IF NOT EXISTS idx_signals_strategy_version ON signals(strategy_version);

-- ----------------------------------------------------------------------------
-- TABLE 5: signal_events (Spec Section 15, 40)
-- Immutable audit log of every discrete lifecycle transition of a signal
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signal_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(64) NOT NULL UNIQUE,
    signal_id VARCHAR(64) NOT NULL REFERENCES signals(signal_id) ON UPDATE CASCADE ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    price NUMERIC(18, 8),
    quantity NUMERIC(18, 8),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_events_signal_id ON signal_events(signal_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_signal_events_type ON signal_events(event_type);

-- ----------------------------------------------------------------------------
-- TABLE 6: signal_evaluations (Spec Section 19-22, 40)
-- Comprehensive post-trade evaluation, MFE/MAE, SL causality & counterfactuals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signal_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signal_id VARCHAR(64) NOT NULL UNIQUE REFERENCES signals(signal_id) ON UPDATE CASCADE ON DELETE CASCADE,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    final_result VARCHAR(32) NOT NULL,
    realized_pnl NUMERIC(14, 4),
    realized_r NUMERIC(8, 4),
    mfe NUMERIC(8, 4),
    mae NUMERIC(8, 4),
    realized_return_pct NUMERIC(8, 4),
    gross_pnl_usdt NUMERIC(14, 4),
    net_pnl_usdt NUMERIC(14, 4),
    fees_usdt NUMERIC(14, 4),
    slippage_usdt NUMERIC(14, 4),
    
    -- Time to event in milliseconds
    time_to_entry_ms BIGINT,
    time_to_dca1_ms BIGINT,
    time_to_dca2_ms BIGINT,
    time_to_tp1_ms BIGINT,
    time_to_tp2_ms BIGINT,
    time_to_tp3_ms BIGINT,
    time_to_sl_ms BIGINT,
    time_to_expiry_ms BIGINT,
    
    -- Stop Loss & Cause Analysis
    sl_failure_primary_cause VARCHAR(64),
    sl_failure_secondary_causes JSONB DEFAULT '[]'::jsonb,
    stop_tightness_label VARCHAR(64),
    counterfactual_note TEXT,
    evaluation_text TEXT,
    
    -- Market changes between entry and exit
    market_regime_change VARCHAR(32),
    structure_change VARCHAR(32),
    momentum_change VARCHAR(32),
    volume_change VARCHAR(32),
    liquidity_change VARCHAR(32),
    news_factor VARCHAR(32),
    stop_quality VARCHAR(32),
    entry_quality VARCHAR(32),
    counterfactual_result VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS idx_signal_evaluations_final_result ON signal_evaluations(final_result);
CREATE INDEX IF NOT EXISTS idx_signal_evaluations_evaluated_at ON signal_evaluations(evaluated_at DESC);

-- ----------------------------------------------------------------------------
-- INITIAL SEED: Default Strategy Version v1.0.0
-- ----------------------------------------------------------------------------
INSERT INTO strategy_versions (version, description, parameters, weights, is_active)
VALUES (
    'v1.0.0',
    'U-SPOT Core Strategy: Multi-factor scoring with 6 technical modules and volatility-adjusted risk',
    '{
        "emaFast": 20,
        "emaMid": 50,
        "emaSlow": 200,
        "rsiPeriod": 14,
        "atrPeriod": 14,
        "slAtrMultiplier": 1.75,
        "dca1AtrMultiplier": 1.0,
        "dca2AtrMultiplier": 1.8,
        "tp1Ratio": 0.3,
        "tp2Ratio": 0.3,
        "tp3Ratio": 0.4
    }'::jsonb,
    '{
        "trend": 20,
        "momentum": 15,
        "volume": 15,
        "structure": 20,
        "liquidity": 15,
        "volatility": 10,
        "regime": 5
    }'::jsonb,
    true
)
ON CONFLICT (version) DO NOTHING;

-- Seed default strategy parameters
INSERT INTO strategy_parameters (strategy_version, parameter_key, parameter_value, category, description, min_value, max_value, default_value)
VALUES
    ('v1.0.0', 'weight_trend', '20', 'WEIGHTS', 'Weight for trend alignment score', 0, 100, '20'),
    ('v1.0.0', 'weight_momentum', '15', 'WEIGHTS', 'Weight for momentum & RSI score', 0, 100, '15'),
    ('v1.0.0', 'weight_volume', '15', 'WEIGHTS', 'Weight for volume surge score', 0, 100, '15'),
    ('v1.0.0', 'weight_structure', '20', 'WEIGHTS', 'Weight for market structure / BOS / CHOCH', 0, 100, '20'),
    ('v1.0.0', 'weight_liquidity', '15', 'WEIGHTS', 'Weight for order book liquidity score', 0, 100, '15'),
    ('v1.0.0', 'weight_volatility', '10', 'WEIGHTS', 'Weight for volatility regime score', 0, 100, '10'),
    ('v1.0.0', 'weight_regime', '5', 'WEIGHTS', 'Weight for macro market regime alignment', 0, 100, '5'),
    ('v1.0.0', 'risk_pct_grade_a_plus', '1.0', 'RISK', 'Max risk % for A+ grade setups', 0.1, 5.0, '1.0'),
    ('v1.0.0', 'risk_pct_grade_a', '0.75', 'RISK', 'Max risk % for A grade setups', 0.1, 5.0, '0.75'),
    ('v1.0.0', 'risk_pct_grade_b', '0.5', 'RISK', 'Max risk % for B grade setups', 0.1, 5.0, '0.5')
ON CONFLICT (strategy_version, parameter_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Allows read and write for both anonymous and authenticated API operations
-- ----------------------------------------------------------------------------
ALTER TABLE strategy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_evaluations ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all tables
DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON strategy_versions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON strategy_parameters FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON market_snapshots FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON signals FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON signal_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public read access" ON signal_evaluations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow public insert/update access for backend operations
DO $$ BEGIN
    CREATE POLICY "Allow insert access" ON strategy_versions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow insert access" ON strategy_parameters FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow insert access" ON market_snapshots FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow insert access" ON signals FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow update access" ON signals FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow insert access" ON signal_events FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow insert access" ON signal_evaluations FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow update access" ON signal_evaluations FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
