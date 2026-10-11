-- ─── U-SPOT Master Supabase / PostgreSQL Database Schema ─────────────
-- Spec Section 35 (Free-first tier) & Section 40 (Database Schema)
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Enable UUID Extension
create extension if not exists "pgcrypto";

-- ─── 2. Signals Table ──────────────────────────────────────────────────
create table if not exists public.signals (
    id uuid primary key default gen_random_uuid(),
    signal_id text unique not null,
    symbol text not null,
    direction text not null default 'BUY',
    created_at timestamptz not null default now(),
    strategy_version text not null default 'v1.0.0',
    market_regime text not null,
    candidate_score numeric not null,
    trade_score numeric not null,
    setup_type text not null,
    entry_low numeric not null,
    entry_high numeric not null,
    preferred_entry numeric not null,
    dca1 numeric not null,
    dca2 numeric not null,
    stop_loss numeric not null,
    tp1 numeric not null,
    tp2 numeric not null,
    tp3 numeric not null,
    risk_pct numeric not null default 1.0,
    max_loss numeric not null default 0,
    initial_allocation numeric not null default 0,
    dca1_allocation numeric not null default 0,
    dca2_allocation numeric not null default 0,
    max_deployed numeric not null default 0,
    risk_reward numeric not null default 2.0,
    confidence text not null default 'B',
    status text not null default 'WATCH',
    lifecycle text not null default 'CREATED',
    expires_at timestamptz not null,
    exchange text default 'BINANCE_SPOT',
    confirmation_condition text,
    rationale text,
    trade_score_breakdown jsonb default '{}'::jsonb,
    ta_summary text,
    actual_entry numeric,
    dca1_hit boolean default false,
    dca2_hit boolean default false,
    final_result text,
    mfe numeric,
    mae numeric,
    realized_return numeric,
    realized_r numeric,
    fees numeric,
    slippage numeric,
    evaluation_text text,
    updated_at timestamptz default now()
);

-- Indexes for rapid signal querying
create index if not exists idx_signals_symbol on public.signals(symbol);
create index if not exists idx_signals_created_at on public.signals(created_at desc);
create index if not exists idx_signals_status on public.signals(status);
create index if not exists idx_signals_lifecycle on public.signals(lifecycle);
create index if not exists idx_signals_strategy on public.signals(strategy_version);

-- ─── 3. Signal Events Table ────────────────────────────────────────────
create table if not exists public.signal_events (
    id uuid primary key default gen_random_uuid(),
    event_id text unique not null,
    signal_id text not null references public.signals(signal_id) on delete cascade,
    event_type text not null,
    timestamp timestamptz not null default now(),
    price numeric,
    quantity numeric,
    metadata jsonb default '{}'::jsonb
);

create index if not exists idx_signal_events_signal_id on public.signal_events(signal_id);
create index if not exists idx_signal_events_timestamp on public.signal_events(timestamp desc);

-- ─── 4. Signal Evaluations Table ───────────────────────────────────────
create table if not exists public.signal_evaluations (
    id uuid primary key default gen_random_uuid(),
    signal_id text unique not null references public.signals(signal_id) on delete cascade,
    evaluated_at timestamptz not null default now(),
    final_result text not null,
    realized_pnl numeric,
    realized_r numeric,
    mfe numeric,
    mae numeric,
    realized_return_pct numeric,
    gross_pnl_usdt numeric,
    net_pnl_usdt numeric,
    fees_usdt numeric,
    slippage_usdt numeric,
    time_to_entry_ms bigint,
    time_to_dca1_ms bigint,
    time_to_dca2_ms bigint,
    time_to_tp1_ms bigint,
    time_to_tp2_ms bigint,
    time_to_tp3_ms bigint,
    time_to_sl_ms bigint,
    time_to_expiry_ms bigint,
    sl_failure_primary_cause text,
    sl_failure_secondary_causes jsonb default '[]'::jsonb,
    stop_tightness_label text,
    counterfactual_note text,
    evaluation_text text
);

create index if not exists idx_evaluations_signal_id on public.signal_evaluations(signal_id);
create index if not exists idx_evaluations_evaluated_at on public.signal_evaluations(evaluated_at desc);

-- ─── 5. Market Snapshots Table ─────────────────────────────────────────
create table if not exists public.market_snapshots (
    id uuid primary key default gen_random_uuid(),
    symbol text not null,
    price numeric not null,
    volume_24h numeric not null,
    liquidity numeric not null,
    spread numeric not null,
    market_regime text not null,
    indicators jsonb default '{}'::jsonb,
    timestamp timestamptz not null default now()
);

create index if not exists idx_snapshots_symbol on public.market_snapshots(symbol);
create index if not exists idx_snapshots_timestamp on public.market_snapshots(timestamp desc);

-- ─── 6. Strategy Versions Table ────────────────────────────────────────
create table if not exists public.strategy_versions (
    id uuid primary key default gen_random_uuid(),
    version text unique not null,
    created_at timestamptz not null default now(),
    description text not null,
    parameters jsonb default '{}'::jsonb,
    weights jsonb default '{}'::jsonb,
    is_active boolean default true
);

-- Seed default strategy version v1.0.0
insert into public.strategy_versions (version, description, parameters, weights, is_active)
values (
    'v1.0.0',
    'U-SPOT Core Strategy: Multi-factor scoring with 6 technical modules and volatility-adjusted risk',
    '{"name": "U-SPOT Balanced Multi-Factor", "ema": {"fastPeriod": 20, "slowPeriod": 50, "trendPeriod": 200}, "rsi": {"period": 14, "oversold": 30, "overbought": 70}, "dca": {"enabled": true, "dca1Alloc": 30, "dca2Alloc": 20, "entryAlloc": 50, "dca1DropPercent": 1.0, "dca2DropPercent": 2.5}, "risk": {"gradeARisk": 0.75, "gradeBRisk": 0.5, "maxLossCap": 2.0, "gradeAPlusRisk": 1.0}, "volume": {"surgeMultiplier": 1.5}, "volatility": {"atrPeriod": 14, "slMultiplier": 1.6}, "takeProfit": {"tp1Alloc": 30, "tp2Alloc": 30, "tp3Alloc": 40, "tp1RMultiple": 1.5, "tp2RMultiple": 2.5, "tp3RMultiple": 3.8}, "regimeFilters": {"allowedRegimes": ["BULL", "NEUTRAL", "HIGH_VOLATILITY"]}}'::jsonb,
    '{"trend": 20, "regime": 5, "volume": 15, "momentum": 15, "liquidity": 15, "structure": 20, "volatility": 10}'::jsonb,
    true
)
on conflict (version) do nothing;

-- ─── 7. Strategy Parameters Table ──────────────────────────────────────
create table if not exists public.strategy_parameters (
    id uuid primary key default gen_random_uuid(),
    strategy_version text not null,
    parameter_key text not null,
    parameter_value text not null,
    category text not null,
    description text,
    min_value numeric,
    max_value numeric,
    default_value text not null,
    unique (strategy_version, parameter_key)
);

-- ─── 8. User Profiles & Multi-User Telegram Subscriptions ─────────────
create table if not exists public.user_profiles (
    id text primary key,
    email text unique not null,
    password_hash text not null,
    name text not null,
    role text not null default 'user',
    telegram_chat_id text,
    telegram_enabled boolean default false,
    alert_preferences jsonb default '{"onSignalCreated": true, "onEntryFilled": true, "onDcaFilled": true, "onTpHit": true, "onSlHit": true}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_email on public.user_profiles(email);
create index if not exists idx_user_profiles_telegram on public.user_profiles(telegram_enabled) where telegram_enabled = true;

-- ─── 9. Row-Level Security (RLS) Policies ──────────────────────────────
-- Enable RLS across all tables
alter table public.signals enable row level security;
alter table public.signal_events enable row level security;
alter table public.signal_evaluations enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.strategy_versions enable row level security;
alter table public.strategy_parameters enable row level security;
alter table public.user_profiles enable row level security;

-- Public / Anonymous Read Access (Dashboard, signals, performance queries)
create policy "Allow public read access to signals" on public.signals for select using (true);
create policy "Allow public read access to signal_events" on public.signal_events for select using (true);
create policy "Allow public read access to signal_evaluations" on public.signal_evaluations for select using (true);
create policy "Allow public read access to market_snapshots" on public.market_snapshots for select using (true);
create policy "Allow public read access to strategy_versions" on public.strategy_versions for select using (true);
create policy "Allow public read access to strategy_parameters" on public.strategy_parameters for select using (true);

-- Service Role / Authenticated Write Access
create policy "Allow service role full access to signals" on public.signals for all using (true) with check (true);
create policy "Allow service role full access to signal_events" on public.signal_events for all using (true) with check (true);
create policy "Allow service role full access to signal_evaluations" on public.signal_evaluations for all using (true) with check (true);
create policy "Allow service role full access to market_snapshots" on public.market_snapshots for all using (true) with check (true);
create policy "Allow service role full access to strategy_versions" on public.strategy_versions for all using (true) with check (true);
create policy "Allow service role full access to strategy_parameters" on public.strategy_parameters for all using (true) with check (true);
create policy "Allow service role full access to user_profiles" on public.user_profiles for all using (true) with check (true);
