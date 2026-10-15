# U-SPOT — Autonomous Crypto Spot Trading & Market Intelligence Platform

[![Build & Test](https://img.shields.io/badge/tests-392%20passed%20(100%25)-emerald?style=for-the-badge&logo=node.js)](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/__tests__)
[![Next.js](https://img.shields.io/badge/Next.js-16.3%20Turbopack-blue?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-cyan?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Database](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![AI Engine](https://img.shields.io/badge/Google%20Gemini-2.5--Flash-orange?style=for-the-badge&logo=google)](https://aistudio.google.com/)
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](LICENSE)

> **U-SPOT** is an enterprise-grade, rule-based cryptocurrency spot trading platform and quantitative research engine. Designed around strict capital preservation, multi-factor technical confluence, multi-timeframe confirmation, order-book liquidity cluster detection, and autonomous trade lifecycle state tracking from initial signal trigger to scaling take-profits and breakeven trailing stops.

---

## Table of Contents

1. [Project Overview & Philosophy](#project-overview--philosophy)
2. [Key System Features](#key-system-features)
3. [Trading Strategies & Quantitative Architecture](#trading-strategies--quantitative-architecture)
   - [Multi-Factor Trade Scoring Engine](#1-multi-factor-trade-scoring-engine-0100)
   - [5 Core Algorithmic Setups](#2-5-core-algorithmic-setups)
   - [Bitcoin Macro Circuit Breaker](#3-bitcoin-macro-regime-circuit-breaker)
   - [Multi-Timeframe Confluence (15M + 1H + 4H)](#4-multi-timeframe-confluence-engine-15m--1h--4h)
   - [Order Book Depth & Liquidity Wall Shielding](#5-order-book-depth--liquidity-wall-shielding)
   - [Dynamic Risk & Position Sizing Engine](#6-dynamic-risk--position-sizing-engine)
   - [Dynamic Take-Profit Scaling & ATR Trailing Stop](#7-dynamic-take-profit-scaling--atr-trailing-stops)
4. [Autonomous Trade Lifecycle State Machine](#autonomous-trade-lifecycle-state-machine)
5. [AI Officer & Continuous Memory Loop](#ai-officer--continuous-memory-loop)
6. [Technology Stack](#technology-stack)
7. [Repository Structure](#repository-structure)
8. [Installation & Getting Started](#installation--getting-started)
   - [Prerequisites](#prerequisites)
   - [Local Setup](#local-setup)
   - [Environment Configuration](#environment-configuration)
   - [Development & Verification](#development--verification)
9. [Platform Walkthrough & Usage](#platform-walkthrough--usage)
10. [24/7 Autonomous Deployment Architecture](#247-autonomous-deployment-architecture)
11. [REST API Reference](#rest-api-reference)
12. [Security, Auth & Fail-Closed Safety (Phase A)](#security-auth--fail-closed-safety-phase-a)
13. [Testing & Quality Assurance](#testing--quality-assurance)
14. [Disclaimer](#disclaimer)

---

## Project Overview & Philosophy

Most retail trading bots rely on simplistic single-indicator triggers (e.g., standard RSI dips or moving average crossovers) that inevitably fail when macroeconomic regimes shift or market makers engineer liquidity stop-runs.

**U-SPOT** was built on professional quantitative fund principles:
- **Strict Spot Trading Only**: Zero leverage, zero margin, zero liquidation risk. Capital is deployed exclusively into physical crypto assets.
- **Capital Preservation Over Trade Frequency**: Signals are ruthlessly filtered. If market conditions, Bitcoin velocity, order book imbalance, or higher-timeframe trends show risk, the engine halts trades (`AVOID` / `NO_TRADE`).
- **Mathematical Risk Definition**: Sizing is determined backwards from market structure and volatility: $\text{Position Size} = \frac{\text{Risk Budget (\USD)}}{\text{Distance to Structural Stop Loss (\%)}}$.
- **Multi-Tranche Execution**: Orders use a dollar-cost averaging (DCA) entry ladder (Initial Entry ~50%, DCA 1 ~30%, DCA 2 ~20%) rather than all-in market chasing.
- **Profit-Protecting Ratchets**: Reaching Take Profit 1 (30% scale-out) instantly ratchets the stop loss to **Breakeven**. Trades that return to Breakeven are **never** counted as losses. Subsequent highs trigger dynamic ATR trailing stops that lock in gains on runners.
- **Zero Lookahead Bias Backtesting & Walk-Forward Optimization**: Historical simulations evaluate only past bars with realistic slippage, exchange fees, and walk-forward efficiency (WFE) analysis.

---

## Key System Features

- ⚡ **Real-Time Market Scanner**: Scans top volume Binance spot pairs concurrently, evaluating trend, momentum, volatility, volume surge, order book depth, and market regime in milliseconds.
- 🛡️ **Institutional Structural Stops**: Stop losses are anchored behind valid swing lows and order book bid walls, adjusted for ATR volatility with psychological round-number (`.00` / `.50`) avoidance.
- 🎯 **3-Target Take Profit Ladder**: Dynamically front-runs overhead resistance and ask walls at 99.8% to secure quick profits, scaling out 30% at TP1, 30% at TP2, and 40% on runner TP3.
- 🤖 **Google Gemini AI Gatekeeper**: Audits every prospective setup against macro sentiment, order book dynamics, and historical failure patterns before publication.
- 🔁 **Continuous In-Context Learning**: Evaluates historical winning and losing trades from Supabase to feed lessons directly into the AI gatekeeper prompt.
- 📈 **Lookahead-Free Backtester & Strategy Lab**: Simulates sequential bar-by-bar executions with realistic taker/maker fees, slippage, and walk-forward rolling window validation.
- 📱 **Real-Time Telegram Broadcast**: Instantly dispatches clean, emoji-formatted trade plans, tranche fills, target hits, and trailing stop elevation alerts to private channels and individual subscribers.
- 🔒 **Phase A Security Hardened**: Cryptographically signed HMAC-SHA256 session cookies, bcrypt password migration, server-side role-based API guards, and strict fail-closed market data isolation (zero synthetic data in live signal generation).
- ☁️ **100% Free 24/7 Cloud Architecture**: Runs serverless on Vercel (Frankfurt `fra1` geoblock-free) + Supabase PostgreSQL + GitHub Actions 5-minute autonomous engine cron.

---

## Trading Strategies & Quantitative Architecture

```
                    ┌────────────────────────────────────────┐
                    │      Binance Public Spot Feeds         │
                    │   (15m Klines, 1h Klines, Depth L20)   │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │       BTC Macro Circuit Breaker        │
                    │ (Checks 15m/1h Momentum & Flash Dumps) │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │    7-Factor Candidate Scoring Engine   │
                    │ (Trend, Momentum, Volume, Volatility,  │
                    │  Structure, Order Book Walls, Regime)  │
                    └───────────────────┬────────────────────┘
                                        │ Score ≥ 60
                                        ▼
                    ┌────────────────────────────────────────┐
                    │   Multi-Timeframe Confluence Engine    │
                    │      (15M + 1H + 4H Trend Alignment)   │
                    │  [+10 Bonus or -18 Counter-Trend Halt] │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │         5-Setup Pattern Engine         │
                    │ (Breakout Retest, Pullback, Sweep, etc)│
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │   Order Book Liquidity Wall Shield     │
                    │  (Bid Wall SL Anchor / Ask Wall TP1)   │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │        Google Gemini AI Officer        │
                    │    (Gatekeeper Audit & Memory Loop)    │
                    └───────────────────┬────────────────────┘
                                        │ Verdict: APPROVED
                                        ▼
                    ┌────────────────────────────────────────┐
                    │     Active Trade Lifecycle Sweeper     │
                    │ (Entry → DCA1/2 → TP1/2/3 → Trailing)  │
                    └────────────────────────────────────────┘
```

---

### 1. Multi-Factor Trade Scoring Engine (0–100)

Every candidate symbol is scored across 7 quantitative dimensions:

| Factor | Weight | Evaluation Method & Indicators |
|---|:---:|---|
| **Trend Alignment** | **20%** | EMA 20, 50, 200 stacking, price above moving averages, slope direction |
| **Market Structure** | **20%** | Swing pivot highs/lows, Break of Structure (BOS), Change of Character (CHOCH) |
| **Momentum** | **15%** | Wilder's 14-period RSI (bullish 45–65 range), MACD histogram expansion, bullish divergence |
| **Volume Confirmation** | **15%** | 20-period volume moving average, volume surge ratio ($\ge 1.5\times$), volume delta proxy |
| **Liquidity & Order Flow** | **15%** | 20-level order book bid/ask depth ratio, bid/ask walls, spread tightness |
| **Volatility Context** | **10%** | 14-period Average True Range (ATR), volatility expansion vs compression |
| **Market Macro Regime** | **5%** | Overall market environment (`BULL`, `NEUTRAL`, `BEAR`, `HIGH_VOLATILITY`, `LOW_LIQUIDITY`) |

#### Confidence Grades:
- **Grade `A+` ($\ge 85$)**: Institutional setup. Maximum wallet risk budget up to 1.0%.
- **Grade `A` (75–84)**: High-probability setup. Risk budget up to 0.75%.
- **Grade `B` (60–74)**: Standard setup. Risk budget up to 0.50%.
- **`BELOW_THRESHOLD` ($< 60$)**: Ineligible for publication or execution.

---

### 2. 5 Core Algorithmic Setups

1. **`BREAKOUT_RETEST`**: Price breaks cleanly through structural resistance on high volume, then pulls back to test the broken level as new support. Entry is placed at the retest level with Stop Loss anchored below the breakout base.
2. **`PULLBACK_CONTINUATION`**: Strong trending asset in an established bull channel pulls back to discount zones (EMA 20 or EMA 50 support) with declining sell volume and an oversold RSI bounce.
3. **`LIQUIDITY_SWEEP`**: Smart-money stop-run below a known swing low that immediately reverses, printing a long lower wick and absorbing sell-side liquidity before surging higher.
4. **`TREND_CONTINUATION`**: Triple moving average alignment (EMA 20 > 50 > 200) with bullish MACD momentum and increasing volume delta.
5. **`SUPPORT_REACTION`**: Asset touches a major horizontal support shelf backed by dense order book bid clusters, rejecting lower prices with bullish pin-bar confirmation.

---

### 3. Bitcoin Macro Regime Circuit Breaker

Because altcoins have a >85% correlation to Bitcoin during market selloffs, U-SPOT features an autonomous **BTC Macro Gatekeeper**:
- Analyzes Bitcoin (`BTCUSDT`) 15m and 1h candlesticks, 1h RSI, EMA 20/50 alignment, and 45-minute price velocity.
- If Bitcoin experiences rapid downward velocity (`FLUSH_RISK`) or trades in a steep downtrend (`BEARISH_TREND`), all altcoin BUY signals are automatically suppressed (`AVOID` or `WAIT_FOR_CONFIRMATION`), eliminating the #1 cause of sudden stop-outs.

---

### 4. Multi-Timeframe Confluence Engine (15M + 1H + 4H)

Before a trade is confirmed on the 15-minute execution timeframe, U-SPOT analyzes the higher-timeframe trend:
- **`FULL_CONFLUENCE`**: 15M + 1H + 4H all bullish with price > EMA 50 on higher timeframes. Awards a **+10 point bonus** to the trade score.
- **`PARTIAL_CONFLUENCE`**: 15M and 1H trends bullish. Awards a **+5 point bonus**.
- **`COUNTER_TREND` Trap**: 1H in a bearish stack (EMA 20 < 50 < 200) or price trapped below 1H EMA 200. Incurs a **-18 point penalty** and triggers an immediate circuit breaker that blocks `BUY_NOW` status to prevent buying dead-cat bounces into major resistance.

---

### 5. Order Book Depth & Liquidity Wall Shielding

U-SPOT reads real-time 20-level order books from Binance:
- **Bid Wall Shield**: Detects limit order bid clusters ($\ge 2.0\times$ average level depth or $\ge 12\%$ of book depth) within 4% of spot price and anchors the Stop Loss behind the wall, using institutional limit volume as a barrier against stop runs.
- **Ask Wall Front-Running**: Detects overhead sell walls between $1.15\text{R}$ and $1.55\text{R}$. TP1 is placed at 99.8% of the wall price, guaranteeing execution and triggering the Breakeven Stop Ratchet before the wall can reject price.
- **Sell Imbalance Protection**: If order book imbalance is severely negative ($\le -0.30$) with heavy overhead resistance, signals are automatically downgraded to `WAIT_FOR_CONFIRMATION`.

---

### 6. Dynamic Risk & Position Sizing Engine

U-SPOT enforces disciplined volatility-adjusted sizing:
$$\text{Position Size} = \frac{\text{Wallet Balance} \times \text{Risk \%}}{\text{Entry Price} - \text{Stop Loss Price}} \times \text{Entry Price}$$

Every trade features a planned **3-tranche order ladder**:
- **Initial Entry (~50% of trade allocation)**: Fills upon confirmation or pullback touch.
- **DCA #1 (~30% of trade allocation)**: Fills at a structural pullback discount (~1.0% to 1.5% below entry).
- **DCA #2 (~20% of trade allocation)**: Fills at a deeper support level (~2.5% below entry).
- **Anti-Round-Number Buffer**: Stop losses that land on psychological levels (`.00` or `.50`) are offset downwards by 0.06% to prevent market-maker liquidity grabs.

---

### 7. Dynamic Take-Profit Scaling & ATR Trailing Stops

| Milestone | Action | Sizing | Stop Loss Adjustment |
|---|---|:---:|---|
| **TP1 Hit** | First Scale-Out | **Sell 30%** | Stop Loss ratchets to **Breakeven** (`averageEntryPrice`). Zero risk remains. |
| **Post-TP1 Rally** | Dynamic ATR Trail | Active on 70% | Highs push trailing stop higher: $\max(\text{Trail}, \text{High} - 0.85 \times \text{RiskUnit})$. |
| **TP2 Hit** | Second Scale-Out | **Sell 30%** | Stop Loss ratchets to at least **TP1 level**. Guaranteed profit locked. |
| **Post-TP2 Rally** | Tight ATR Trail | Active on 40% | Highs push trailing stop higher: $\max(\text{Trail}, \text{High} - 0.75 \times \text{RiskUnit})$. |
| **TP3 Hit** | Final Runner Exit | **Sell 40%** | Full position closed at maximum target. |

> **Critical Rule**: Any trade that hits TP1 and subsequently exits at Breakeven or a Trailing Stop with positive $R$ is classified as a **Winning TP Hit** (`PARTIAL_TP_THEN_SL` or `TP2_REACHED`). It is **never** counted as a loss.

---

## Autonomous Trade Lifecycle State Machine

```
   [CREATED] (Signal generated, 4h pre-entry window)
       │
       ├─────────────────────────────────┐
       │ (Price touches Entry Zone)      │ (4h timeout / structural invalidation)
       ▼                                 ▼
   [ACTIVE / ENTRY_FILLED]           [EXPIRED / INVALIDATED]
       │
       ├───► [DCA 1 FILLED] (Weighted entry price recalculated)
       │         │
       │         └───► [DCA 2 FILLED] (Weighted entry price recalculated)
       │                   │
       ├───────────────────┴─────────────────────────────┐
       │ (Price reaches TP1)                             │ (Price touches Stop Loss)
       ▼                                                 ▼
   [TP1_HIT]                                         [CLOSED: SL]
   • Sell 30% position                               • Max loss capped at risk budget
   • Ratchet Stop Loss to BREAKEVEN                  • Root cause failure classified
       │
       ├─────────────────────────────────┐
       │ (Price advances towards TP2)    │ (Price pulls back to Breakeven)
       ▼                                 ▼
   [DYNAMIC ATR TRAILING STOP]       [CLOSED: PARTIAL_TP_THEN_SL]
   • Ratchets with new highs         • Trade classified as WINNING TP1
       │
       ├─────────────────────────────────┐
       │ (Price reaches TP2)             │ (Trailing stop triggered)
       ▼                                 ▼
   [TP2_HIT]                         [CLOSED: TP1_TRAILING_WIN]
   • Sell 30% position               • Locks +0.8R to +1.5R profit
   • Ratchet Stop Loss to ≥ TP1
       │
       ├─────────────────────────────────┐
       │ (Price reaches TP3)             │ (Post-TP2 trailing stop triggered)
       ▼                                 ▼
   [CLOSED: FULL_TP]                 [CLOSED: TP2_REACHED]
   • Sell remaining 40% runner       • Locks +1.5R to +2.5R profit
```

---

## AI Officer & Continuous Memory Loop

U-SPOT integrates **Google Gemini 2.5** (`gemini-2.5-flash`) as an intelligent quantitative gatekeeper:

1. **Pre-Publish Gatekeeper**: Evaluates real-time technical indicators, multi-timeframe alignment, order book wall proximity, and macro crypto sentiment. If Gemini issues a `REJECTED` verdict, the signal is downgraded to `AVOID` and completely suppressed from the UI and Telegram alerts.
2. **Continuous Memory Loop**: Ingests recent trade results and post-trade failure evaluations from Supabase (e.g., "signals entering during low volume sessions failed 70% of the time"). Gemini uses this historical context to avoid repeating past failure modes.
3. **Resilient Heuristic Fallback**: If offline or if the Gemini API key is omitted, an intelligent quantitative heuristic evaluator immediately takes over with zero downtime.

---

## Technology Stack

| Domain | Technologies & Libraries |
|---|---|
| **Framework** | Next.js 16.3 (Turbopack, App Router), React 19, TypeScript (Strict Mode) |
| **Styling** | Tailwind CSS v4, Vanilla CSS Custom Properties (Dark glassmorphism system) |
| **Market Data** | Binance Public Spot REST API & WebSocket Streams (Free tier, zero API keys required) |
| **Persistence** | Supabase (PostgreSQL free tier) with zero-config in-memory fallback store |
| **AI Integration** | Google Gemini API (`@google/genai` & REST) with continuous memory feedback |
| **Alerts** | Telegram Bot API with deduplication cache and multi-user broadcast |
| **Testing** | Node.js Native Test Runner (`node --test`), 392 tests, 156 test suites |
| **Deployment** | Vercel Serverless (Frankfurt `fra1` region) + GitHub Actions scheduled cron |

---

## Repository Structure

```
u-spot/
├── .github/workflows/
│   └── signal-engine.yml        # 24/7 autonomous 5-minute engine cron
├── scripts/
│   ├── run-engine-cron.mjs      # Unified engine runner (one-shot & daemon)
│   └── lifecycle-sweeper.mjs    # Standalone 60s lifecycle sweeper daemon
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # Serverless REST API endpoints
│   │   │   ├── ai/              # Google Gemini AI evaluation & generation
│   │   │   ├── auth/            # Bcrypt login, registration, signed sessions
│   │   │   ├── backtest/        # Historical bar-by-bar simulation
│   │   │   ├── health/          # Database & environment health checks
│   │   │   ├── performance/     # Mathematical expectancy & performance stats
│   │   │   ├── signals/         # Live signal scan, history, lifecycle sweeps
│   │   │   ├── strategy/        # Parameter authoring & strategy comparison
│   │   │   ├── telegram/        # Bot configuration & alert testing
│   │   │   └── walk-forward/    # Rolling window walk-forward validation
│   │   ├── history/             # Signal history & trade replay pages
│   │   ├── performance/         # Performance analytics dashboard
│   │   ├── settings/            # Settings, Telegram alerts & risk preferences
│   │   ├── signals/             # Live signals feed & detail views
│   │   ├── strategy-lab/        # Parameter authoring & backtest workbench
│   │   ├── layout.tsx           # Global root layout & navigation
│   │   └── page.tsx             # Main dashboard
│   ├── components/
│   │   ├── backtest/            # SVG equity curves & walk-forward workbench
│   │   ├── dashboard/           # Candidate table, signal cards, lifecycle tracker
│   │   ├── history/             # Interactive candlestick replay & history table
│   │   ├── layout/              # Sidebar & Header components
│   │   ├── risk/                # Position size & DCA calculators
│   │   ├── settings/            # Telegram configuration & credentials UI
│   │   ├── strategy/            # Parameter editor & comparison workbench
│   │   └── ui/                  # Reusable stat cards, modals, toast providers
│   ├── lib/
│   │   ├── __tests__/           # 392 automated unit & integration tests
│   │   ├── db/schema.sql        # Supabase PostgreSQL database schema
│   │   ├── services/            # Core business logic services
│   │   │   ├── ai-signal-service.ts    # Gemini gatekeeper & generator
│   │   │   ├── backtest-service.ts     # Lookahead-free backtester
│   │   │   ├── binance-service.ts      # Binance spot API & candle validation
│   │   │   ├── btc-gatekeeper.ts       # Bitcoin macro circuit breaker
│   │   │   ├── evaluation-service.ts   # Post-trade MFE/MAE & root-cause classifier
│   │   │   ├── lifecycle-service.ts    # Trade lifecycle state machine & sweeper
│   │   │   ├── performance-service.ts  # Expectancy E(R) & drawdown analytics
│   │   │   ├── session-service.ts      # HMAC-SHA256 signed session tokens
│   │   │   ├── signal-engine.ts        # Setup detection & trade scoring
│   │   │   ├── signal-store.ts         # Dual Supabase / in-memory persistence
│   │   │   ├── strategy-service.ts     # Parameter authoring & comparator
│   │   │   ├── telegram-service.ts     # Mobile alerts & deduplication
│   │   │   └── walk-forward-service.ts # Out-of-sample walk-forward engine
│   │   ├── ta/                  # Technical Analysis modules
│   │   │   ├── trend.ts, momentum.ts, volume.ts, volatility.ts
│   │   │   ├── market-structure.ts, liquidity-flow.ts, multi-timeframe.ts
│   │   └── auth-guard.ts        # Server-side authentication & role guards
│   └── types/index.ts           # Central TypeScript type definitions
├── vercel.json                  # Serverless deployment configuration (Frankfurt fra1)
├── package.json
└── tsconfig.json
```

---

## Installation & Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm**: v9.0.0 or later
- **Git**

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/isu-devsparkx/u-spot-trading.git
cd u-spot-trading/u-spot

# 2. Install dependencies
npm install

# 3. Create your local environment file
cp .env.example .env.local
```

### Environment Configuration

Open `.env.local` and populate your configuration:

```env
# ── Application Configuration ──────────────────────────────────────────
NEXT_PUBLIC_APP_NAME=U-SPOT
NEXT_PUBLIC_APP_VERSION=0.1.0

# ── Binance Spot API (Free Public Tier - Zero Keys Needed) ─────────────
NEXT_PUBLIC_BINANCE_API_URL=https://api.binance.com/api/v3
NEXT_PUBLIC_BINANCE_WS_URL=wss://stream.binance.com:9443/ws

# ── Supabase PostgreSQL Database (Free Tier) ───────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── Telegram Bot Notifications (100% Free) ────────────────────────────
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=123456789

# ── Google Gemini AI (100% Free Tier API Key) ─────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# ── 24/7 Autonomous Cron Engine & Deployment URL ──────────────────────
BASE_URL=http://localhost:3000
CRON_SECRET=your_random_secret_string_here

# ── Session & Cryptographic Authentication Secret ─────────────────────
AUTH_SECRET=your_32_character_random_auth_secret_here
```

> **Note on Free Operation**: If you do not provide Supabase, Telegram, or Gemini keys, U-SPOT automatically falls back to its built-in in-memory storage, mock alert dispatcher, and quantitative heuristic AI evaluator. **Zero paid subscriptions are required.**

### Database Setup (Supabase)

If connecting a Supabase database:
1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste and execute the contents of [`src/lib/db/schema.sql`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/db/schema.sql).
4. Verify table creation at `GET http://localhost:3000/api/health/database`.

### Development & Verification

```bash
# Start local development server with Turbopack
npm run dev

# Run all 392 automated tests
npm test

# Build production bundle with zero TypeScript errors
npm run build

# Run standalone lifecycle sweeper daemon
npm run sweep
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Platform Walkthrough & Usage

### 1. Dashboard (`/`)
- **Macro Market Ribbon**: Live Bitcoin price, 24h market regime badge, active volatility index, and system clock.
- **Top 20 Opportunity Scanner**: Real-time table ranking top volume pairs by technical score, momentum, volume surge, and 24h spread.
- **Active Signals Stream**: High-probability signals with confidence badges (`A+`, `A`, `B`), setup type, entry zone, and 1-click execution drawers.
- **Scan Now**: Triggers an instantaneous live scan across Binance pairs while simultaneously sweeping all active trades against current ticks.

### 2. Live Signals (`/signals`)
- **Strict 100% AI Confirmation**: Filter between all evaluated signals and strictly AI-approved setups.
- **Multi-Timeframe Badges**: View `15M•1H•4H 🟢` confluence or `1H DOWNTREND ⚠️` warnings at a glance.
- **Expandable Trade Plan Drawer**: Full breakdown of initial entry, DCA order ladder, projected dollar profit per TP tier, max loss budget, and net fee projections.

### 3. Trade Inspection & Replay (`/signals/[id]` & `/history/[id]`)
- **Interactive SVG Candlestick Replay**: Inspect historical 15m/1h candlesticks with planned price rungs (Entry, DCA1, DCA2, Stop Loss, TP1, TP2, TP3) and event marker pins.
- **Interactive Position Sizing Calculator**: Dynamically adjust wallet size ($100 to $5,000+) to calculate exact token quantities, DCA allocations, and potential profits.
- **AI Officer Audit Card**: Read Gemini's strategic reasoning, confidence score, and identified risk factors.

### 4. Performance Analytics (`/performance`)
- **Mathematical Expectancy $E(R)$**: Evaluates true statistical edge per trade.
- **Target Retention Ladder**: Measures progression rates from Entry $\rightarrow$ TP1 $\rightarrow$ TP2 $\rightarrow$ TP3 vs Stop Loss.
- **SL Failure Root Cause Breakdown**: Charts the exact reasons behind losing trades (`MARKET_REGIME_FAILURE`, `FALSE_BREAKOUT`, `WEAK_VOLUME`, etc.).
- **Multi-Dimensional Matrices**: Slice win rates, profit factor, and average $R$ by setup type, market regime, confidence grade, and asset.

### 5. Strategy Lab & Walk-Forward Workbench (`/strategy-lab`)
- **9-Factor Parameter Editor**: Customize EMA periods, RSI thresholds, ATR multipliers, score weights, and DCA percentages.
- **Lookahead-Free Backtester**: Run historical simulations over 100–1,000 bars with realistic fees and slippage.
- **Side-by-Side Strategy Comparator**: Backtest two strategy versions concurrently on identical candles with dual overlaid SVG equity curves.
- **Walk-Forward Workbench**: Partition historical data into sequential rolling train/test windows to verify Walk-Forward Efficiency (WFE) and eliminate curve-fitting.

### 6. Settings & Telegram (`/settings`)
- **Personal Telegram Alerts**: Connect your personal Chat ID to receive instant alerts when trades enter, scale out, or ratchet trailing stops.
- **Event Filter Toggles**: Choose which notifications to receive (`SIGNAL_CREATED`, `ENTRY_FILLED`, `DCA_FILLED`, `TP_HIT`, `TRAILING_STOP_ELEVATED`, `SL_HIT`).

---

## 24/7 Autonomous Deployment Architecture

U-SPOT is engineered to run 24/7 in cloud environments **completely free of charge**:

```
                       ┌────────────────────────────────────────┐
                       │     GitHub Actions Scheduled Cron      │
                       │     (Runs every 5 minutes 24/7)        │
                       └───────────────────┬────────────────────┘
                                           │
                                           ▼ (POST with CRON_SECRET)
                       ┌────────────────────────────────────────┐
                       │        Vercel Serverless API           │
                       │   (Frankfurt "fra1" geoblock-free)     │
                       │        POST /api/signals/lifecycle     │
                       └───────────────────┬────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │                                             │
                    ▼                                             ▼
       ┌─────────────────────────┐                   ┌─────────────────────────┐
       │   Supabase PostgreSQL   │                   │   Telegram Bot API      │
       │ (State & Events Synced) │                   │ (Push Alerts Broadcast) │
       └─────────────────────────┘                   └─────────────────────────┘
```

1. **Deploy to Vercel**:
   - Push your code to GitHub and import the repository into [Vercel](https://vercel.com).
   - Set the root directory to `u-spot`.
   - Add your environment variables in Vercel Project Settings.
   - The included [`vercel.json`](file:///d:/Development/U-spot%20Trading/u-spot/vercel.json) routes execution to Frankfurt (`fra1`) to prevent US-based Binance geoblocking.

2. **Configure GitHub Actions Autonomous Cron**:
   - In your GitHub repository, navigate to **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**.
   - Add two repository secrets:
     - `BASE_URL`: Your deployed Vercel URL (e.g. `https://your-u-spot.vercel.app`).
     - `CRON_SECRET`: The identical secret string set in your Vercel environment variables.
   - The workflow [`.github/workflows/signal-engine.yml`](file:///d:/Development/U-spot%20Trading/u-spot/.github/workflows/signal-engine.yml) will trigger every 5 minutes around the clock.

---

## REST API Reference

| Endpoint | Method | Access | Description |
|---|:---:|:---:|---|
| `/api/signals` | `GET` | Public | Scans top pairs, runs BTC macro check, sweeps active signals, returns opportunities |
| `/api/signals/lifecycle` | `GET` | Public | Returns status summary of active, pending, and recently closed trades |
| `/api/signals/lifecycle` | `POST` | Worker/Admin | Sweeps active trades against live prices, ratchets trailing stops, records events |
| `/api/signals/history` | `GET` | Public | Retrieves closed trade history with optional `onlyEntryTriggered` and `reAudit` flags |
| `/api/signals/[id]` | `GET` | Public | Retrieves single signal record with full parameters and event log |
| `/api/performance` | `GET` | Public | Computes mathematical expectancy $E(R)$, profit factor, drawdown, and win rates |
| `/api/ai` | `GET` | Public | Returns AI engine status, macro sentiment index, and crypto news feed |
| `/api/ai` | `POST` | Authenticated | Executes on-demand Gemini AI signal evaluation or setup generation |
| `/api/backtest` | `POST` | Public | Runs sequential bar-by-bar backtest simulation and returns equity trajectory |
| `/api/walk-forward` | `POST` | Public | Executes rolling train/test walk-forward validation and computes WFE |
| `/api/strategy` | `GET` / `POST` | Admin | Retrieves or updates strategy parameters and activates versions |
| `/api/strategy/compare` | `POST` | Public | Runs side-by-side comparative backtest on identical candles |
| `/api/telegram` | `GET` / `POST` | Admin | Reads or updates global Telegram bot credentials |
| `/api/telegram/test` | `POST` | Admin | Dispatches live test message to verify Telegram bot connectivity |
| `/api/auth/login` | `POST` | Public | Authenticates user with bcrypt and sets signed `uspot_session` cookie |
| `/api/auth/register` | `POST` | Public | Registers standard user account with salted password hash |
| `/api/health/database` | `GET` | Public | Reports Supabase PostgreSQL connection status and table readiness |

---

## Security, Auth & Fail-Closed Safety (Phase A)

U-SPOT complies with institutional safety and security standards:

- **Strict Synthetic Data Isolation**: Live signal generation strictly requires verified `REAL_PROVIDER` Binance candles. Synthetic offline fixtures are tagged `SYNTHETIC_OFFLINE` and strictly fail closed in production, making it impossible for network dropouts to publish fabricated signals.
- **Candle Geometry & Freshness Validation**: Klines undergo automated validation ($H \ge L$, $H \ge \max(O,C)$, $L \le \min(O,C)$, strictly chronological timestamps, positive volume). Stale or corrupted data fails closed immediately.
- **HMAC-SHA256 Signed Session Tokens**: Session management uses signed compact tokens stored in `HttpOnly`, `SameSite: Lax`, and `Secure` (production) cookies, preventing client-side spoofing or script tampering.
- **Bcrypt Password Security**: Passwords use `bcryptjs` with salt cost 10. Legacy SHA-256 hashes are automatically and transparently upgraded to bcrypt upon successful user login.
- **Server-Side Role-Based Guards**: Administrative mutations (`/api/strategy`, `/api/telegram`) require `requireAdmin` server-side verification and CSRF token matching. Lifecycle sweeps require `CRON_SECRET` bearer authentication.

---

## Testing & Quality Assurance

U-SPOT maintains an extensive test suite verifying mathematical calculations, risk formulas, lifecycle state transitions, indicator outputs, and security guardrails:

```bash
# Run the complete test suite
npm test
```

```text
▶ Multi-Factor Technical Analysis Modules
  ✔ Trend Analysis (EMA 20/50/200 Stacking & Alignment)
  ✔ Momentum Analysis (Wilder's RSI & MACD Divergence)
  ✔ Market Structure (Fractal Swing Pivots, BOS & CHOCH)
  ✔ Volatility Engine (ATR & Dynamic Multipliers)
  ✔ Order Book Liquidity Flow (Imbalance, Bid/Ask Wall Clusters)
  ✔ Multi-Timeframe Confluence (15M + 1H + 4H Rollup & Bonus/Penalties)
▶ Risk & Position Sizing Engine
  ✔ Volatility-Adjusted Sizing Formula & Cap Enforcement
  ✔ 3-Tranche DCA Allocation & Net Fee Deductions
  ✔ Anti-Round-Number Psychological SL Offsets
▶ Signal Engine & Setup Detection
  ✔ 5 Setup Classifications & Trade Scoring (0–100)
  ✔ BTC Macro Circuit Breaker Downgrades
▶ Lifecycle State Machine & Autonomous Sweeper
  ✔ Pre-Entry Expiry & Invalidation
  ✔ DCA 1 & DCA 2 Weighted Average Entry Recalculation
  ✔ TP1 Scale-Out & Immediate Breakeven Stop Ratchet
  ✔ Dynamic ATR Trailing Stop Ratchet on New Highs
  ✔ Protected Profit Exits & Breakeven Classification
▶ Backtest Engine & Walk-Forward Validation
  ✔ Lookahead-Free Sequential Bar Iteration
  ✔ Realistic Slippage, Spread & Fee Modeling
  ✔ Out-of-Sample Rolling Window Efficiency (WFE)
▶ Security & Fail-Closed Safety Guardrails
  ✔ Candle Geometry & Freshness Validation
  ✔ Synthetic Market Data Fail-Closed Rejection
  ✔ Bcrypt Authentication & HMAC-SHA256 Signed Sessions
  ✔ Server-Side Role-Based API Guards & CSRF Protection

✔ 392 tests passed across 156 test suites (100% pass rate)
```

---

## Disclaimer

> **Educational & Research Notice**: U-SPOT is an open-source research and algorithmic signal platform. Cryptocurrency spot trading involves substantial risk of capital loss. Past backtested performance or walk-forward efficiency does not guarantee future results. This software does not provide financial or investment advice. Always test strategies thoroughly in simulation before deploying capital.
