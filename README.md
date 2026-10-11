# U-SPOT — Crypto Spot Signal & Strategy Research Platform

A disciplined spot-trading research and signal platform that scans crypto markets, generates explainable BUY/SELL signals, manages risk and position sizing, tracks every signal to completion, and evaluates why each signal succeeded or failed.

---

## Current Phase: 6 — Signal Engine

✅ **Phase 1: Foundation Completed**
✅ **Phase 2: Wallet & Risk Engine Completed**
✅ **Phase 3: Live Market Data Completed**
✅ **Phase 4: Top 20 Scanner Completed**
✅ **Phase 5: Technical Analysis Modules Completed**
✅ **Phase 6: Signal Engine Completed**

| Deliverable | Spec Section | Status |
|---|---|---|
| Multi-Factor Trade Scoring Engine (Trend 20, Momentum 15, Volume 15, Structure 20, Liquidity 15, Volatility 10, Regime 5 = 100) | Section 10 | ✅ |
| Setup Detection Engine: 5 setup types (Breakout Retest, Liquidity Sweep, Pullback Continuation, Trend Continuation, Support Reaction) | Section 11 | ✅ |
| Entry, Stop Loss & Take Profit Engine: Structure & ATR buffers, 3 TP ladder (30%, 30%, 40%) | Section 11, 12, 13 | ✅ |
| Risk & Position Sizing Integration: `calculatePositionSize` with dynamic wallet allocation & DCA tranches | Section 1, 14 | ✅ |
| Signal Status & Confidence Grades: `A+` (≥85), `A` (75-84), `B` (60-74), `BELOW_THRESHOLD` (<60) | Section 1, 9 | ✅ |
| Dedicated Signal API Routes: `GET /api/signals` and `GET /api/signals/[id]` | Section 9, 41 | ✅ |
| Live Signal Engine UI: `/signals` page with filtering, metrics ribbon, and wallet sizing context | Section 9, 43 | ✅ |
| Dashboard Integration: Active signals dynamically evaluated with live pricing | Section 9 | ✅ |
| Comprehensive Unit Tests: 58/58 passed across all suites | Section 51 | ✅ |
| Production Turbopack Build: 0 errors | Section 35 | ✅ |


---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
cd u-spot
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
```

---

## Project Architecture

```
u-spot/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout (sidebar + metadata)
│   │   ├── page.tsx            # Dashboard
│   │   ├── globals.css         # Design system (CSS custom properties, glassmorphism, animations)
│   │   ├── global-error.tsx    # Error boundary
│   │   ├── not-found.tsx       # 404 page
│   │   ├── signals/page.tsx    # Signals page
│   │   ├── history/page.tsx    # Signal history page
│   │   ├── strategy-lab/page.tsx # Strategy Lab page
│   │   └── settings/page.tsx   # Settings page
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx     # Responsive sidebar navigation
│   │   │   └── Header.tsx      # Top header bar
│   │   ├── dashboard/
│   │   │   ├── CandidateTable.tsx    # Top-20 scanner results table
│   │   │   ├── SignalCard.tsx        # Active signal card
│   │   │   ├── PerformanceOverview.tsx # Performance metrics panel
│   │   │   └── RecentSignals.tsx     # Recent signal history table
│   │   └── ui/
│   │       └── StatCard.tsx          # Reusable metric card
│   ├── config/
│   │   └── index.ts            # Centralized app configuration
│   ├── lib/
│   │   ├── mock-data.ts        # Phase 1 mock data
│   │   └── utils.ts            # Formatting & utility helpers
│   └── types/
│       └── index.ts            # TypeScript type definitions
├── .env.local                  # Environment variables (git-ignored)
├── .env.example                # Environment template
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Design System

- **Dark mode only** with CSS custom properties
- **Glassmorphism cards** with backdrop blur
- **Gradient accent** (cyan → blue → purple)
- **JetBrains Mono** for numbers/prices
- **Inter** for UI text
- **Micro-animations**: fade-in, pulse, shimmer, score bars
- **Responsive**: sidebar collapses to hamburger on mobile

---

## Mock Data

All data in Phase 1 is fake placeholder data to demonstrate the UI. No API calls are made. Real market data integration begins in **Phase 3**.

---

## Next Phase: 4 — Top 20 Scanner

Implement:
- Configurable candidate scoring factors (Momentum, Volume, Liquidity, Trend, Structure, Volatility)
- Dynamic Top 20 opportunity ranking
- Market regime engine refinements (Bull, Bear, Neutral, High Volatility)

---

## Phase Roadmap

| Phase | Name | Description |
|---|---|---|
| **1** | **Foundation** | ✅ Project setup, UI shell, navigation |
| **2** | **Wallet & Risk Engine** | ✅ Wallet input, risk calculator, position sizing |
| **3** | **Market Data** | ✅ Binance + CoinGecko live market data & order book |
| 4 | Top 20 Scanner | Candidate scoring, market regime engine |
| 5 | TA Modules | Trend, momentum, volume, volatility, structure |
| 6 | Signal Engine | Signal generation, scoring, setup detection |
| 7 | Trade/Risk Engine | Entry, DCA, SL, TP, position sizing |
| 8 | Signal Persistence | Supabase database, signal storage |
| 9 | Signal Lifecycle | Automated lifecycle tracking |
| 10 | History Evaluation | MFE/MAE, R multiples, SL analysis |
| 11 | History UI | Full history table, detail pages |
| 12 | Performance Dashboard | Aggregate statistics, segmented analysis |
| 13 | Backtester | Historical simulation engine |
| 14 | Walk-Forward Validation | Out-of-sample testing |
| 15 | Telegram | Bot notifications |
| 16 | Strategy Lab | Parameter tuning, backtest comparison |

---

## Philosophy

U-SPOT prioritizes **capital preservation** and **statistical validation** over signal frequency. The system never claims guaranteed profitability. Every signal is tracked, evaluated, and the evaluation data feeds back into strategy improvement through versioned, testable changes.
