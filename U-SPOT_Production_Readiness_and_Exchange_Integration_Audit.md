# U-SPOT: Production Readiness & Open-Source Exchange Integration Audit

**Document Version:** 1.0.0  
**Date:** October 11, 2026  
**Target Repository:** `d:/Development/U-spot Trading/u-spot`  
**Status:** Audit Completed — Awaiting Implementation Approval  

---

## 1. Executive Summary

U-SPOT possesses an exceptionally well-engineered mathematical foundation, technical analysis library, and visual analytics dashboard (363 passing unit tests across 148 test suites, clean Next.js 16 / Turbopack production builds). However, **U-SPOT is currently a simulation-and-monitoring platform, not an automated execution system**.

Before connecting real capital or live exchange APIs, several critical financial, architectural, and security vulnerabilities must be resolved:
1. **Synthetic Data Contamination**: Synthetic random/sine-wave candles are actively generated when Binance limits or candidate ranks $\ge 8$ are encountered, and can be saved as live `BUY_NOW` signals and broadcast to Telegram.
2. **Zero Exchange Integration**: There is currently no exchange order client, no HMAC authentication, no CCXT adapter, and no lot-size/tick-size/min-notional precision handling.
3. **Severe Authentication Weakness**: User sessions rely on an unencrypted, unsigned `uspot_user_id` cookie without `httpOnly`/`secure` flags; passwords use unsalted plain SHA-256; API endpoints have zero authorization or role enforcement.
4. **State Volatility in Serverless Environment**: Settings, alerts deduplication, and execution plans exist in ephemeral Node.js memory (`Map`), causing silent resets across serverless lambda cold starts.
5. **Simulated Fills & DCA Risk**: Fills in the sweeper assume 100% instantaneous execution with zero queue priority, zero partial-fill handling, and no cancellation of resting DCA/TP limit orders upon stop-loss invalidation.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 U-SPOT ARCHITECTURE OVERVIEW                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                   ┌──────────────────────┐
                                   │  Binance Public REST │
                                   │     & WebSocket      │
                                   └──────────┬───────────┘
                                              │ (Unauthenticated Market Data)
                                              ▼
┌──────────────────────┐           ┌──────────────────────┐           ┌───────────────────┐
│   Google Gemini AI   │ ◄───────► │ Market Scanner &     │ ◄───────► │   Supabase Cloud  │
│   (Gatekeeper / Lab) │           │ Signal Engine        │           │     PostgreSQL    │
└──────────────────────┘           └──────────┬───────────┘           └─────────▲─────────┘
                                              │                                 │
                                              ▼                                 │
                                   ┌──────────────────────┐                     │
                                   │ Signal Lifecycle &   │ ────────────────────┘
                                   │ Sweeper Daemon       │ (Simulated Fills / States)
                                   └──────────┬───────────┘
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
              ┌──────────────────────┐                  ┌──────────────────────┐
              │  Telegram Alert Bot  │                  │ Next.js 16 Web UI    │
              │  (Broadcast Fanout)  │                  │ (Dashboard / Lab)    │
              └──────────────────────┘                  └──────────────────────┘
                         │                                         │
                         ▼                                         ▼
              [NO LIVE EXCHANGE CLIENT]                  [NO AUTH/SESSION GUARD]
```

---

## 3. Subsystem Audit & Gap Analysis

### 3.1. Market-Data Services & Synthetic-Data Fallback

* **Existing Files**:
  - [`src/lib/services/binance-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/binance-service.ts)
  - [`src/lib/services/binance-websocket.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/binance-websocket.ts)
  - [`src/lib/services/signal-engine.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/signal-engine.ts)
* **What is Actually Implemented**:
  - Resilient multi-endpoint fallback across `api.binance.com`, `api1.binance.com`, and `data-api.binance.vision`.
  - In-memory TTL caching (5s ticker, 15s klines, 1h exchangeInfo).
  - Client-side WebSockets with heartbeat telemetry and exponential reconnect.
* **Missing Functionality**:
  - Strict data-freshness heartbeat with fail-closed circuit breaker.
  - Exchange clock skew synchronization (`/api/v3/time`).
  - Separation between production live data and offline testing mock data.
* **Potential Bugs & Financial Risks**:
  - **CRITICAL RISK (Synthetic Data Leak)**: In [`src/app/api/signals/route.ts#L103-L117`](file:///d:/Development/U-spot%20Trading/u-spot/src/app/api/signals/route.ts#L103-L117), candidates ranked $8$ through $20$ **deliberately bypass Binance REST and generate signals on synthetic sine-wave candles**. Furthermore, any network error on ranks $0$–$7$ falls back to `generateSyntheticOHLCV`. If confirmed, these signals are saved to Supabase as real `BUY_NOW` signals and broadcast to Telegram. If an automated trader executes them, **real capital would be committed based on fake mathematical noise**.
  - **24h Rolling Extremes vs Spot Price**: High/Low from `/ticker/24hr` are 24-hour extremes, not candle wicks from signal creation.
* **Security Weaknesses**: Public endpoint exposure; unvalidated query parameter limits.
* **Tests**: `market-data.test.ts`, `binance-websocket.test.ts`, `websocket-telemetry.test.ts`. Missing tests for stale data cutoff and synthetic-to-live isolation.
* **Recommendations**:
  - Strictly prohibit `generateSyntheticOHLCV` in all production signal paths. If real klines cannot be fetched, throw `MarketDataUnavailableError` and abort signal generation.
  - Restrict synthetic generation exclusively to offline test suites.

---

### 3.2. Signal Generation & Lifecycle Tracking

* **Existing Files**:
  - [`src/lib/services/signal-engine.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/signal-engine.ts)
  - [`src/lib/services/lifecycle-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/lifecycle-service.ts)
  - [`src/lib/services/evaluation-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/evaluation-service.ts)
* **What is Actually Implemented**:
  - Strict long geometry invariants: $\text{SL} < \text{DCA2} < \text{DCA1} < \text{Entry} < \text{TP1} < \text{TP2} < \text{TP3}$.
  - Target runaway invalidation before entry fill (`candleHigh >= tp1`).
  - Dynamic ATR trailing stop ratchet post-TP1 and post-TP2.
* **Missing Functionality**:
  - No exchange order ID linking (`clientOrderId`, `exchangeOrderId`).
  - No tracking of real partial fills or unfilled order cancels.
  - No handling of orders filled during application downtime.
* **Potential Bugs & Financial Risks**:
  - **False Order Fills (Queue Priority Assumption)**: The lifecycle sweeper assumes an order fills if `candleLow <= price`. On a real order book, price touching your limit price does NOT guarantee a fill if your order is at the back of the queue or liquidity is thin.
  - **Orphaned DCA / TP Limit Orders**: If a trade hits Stop Loss, the sweeper marks the signal `CLOSED`. In live trading, if resting DCA limit buy orders or TP limit sell orders on the exchange are not explicitly canceled, a subsequent price movement will trigger an **accidental unmanaged position**.
* **Security Weaknesses**: Anyone can POST `/api/signals/lifecycle` with forged `mockPrices` to manipulate signal outcomes in the database.
* **Tests**: `signal-engine.test.ts`, `lifecycle.test.ts`, `evaluation.test.ts`, `trailing-stop-sweeper.test.ts`. Missing tests for partial fills and order cancellation cascades.
* **Recommendations**: Link every lifecycle state transition directly to immutable exchange order status events (`FILLED`, `PARTIALLY_FILLED`, `CANCELED`).

---

### 3.3. Risk & Position-Sizing Calculations

* **Existing Files**:
  - [`src/lib/risk-engine.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/risk-engine.ts)
* **What is Actually Implemented**:
  - Strict invalidation-based position sizing derived from distance to stop loss.
  - Blended unit loss calculation across 3 tranches (58.1% Entry, 23.3% DCA1, 18.6% DCA2).
  - Maximum position cap (30% of wallet) and confidence grade tiering (A+: 1.0%, A: 0.75%, B: 0.5%).
* **Missing Functionality**:
  - **Zero Exchange Precision Awareness**: No integration with exchange `LOT_SIZE` (`minQty`, `stepSize`), `PRICE_FILTER` (`tickSize`), or `MIN_NOTIONAL` filters.
  - No portfolio-wide aggregate exposure tracking across multiple concurrent coins.
  - No daily max drawdown or cumulative loss kill-switch.
* **Potential Bugs & Financial Risks**:
  - **Exchange Filter Rejection**: Computing `quantity = round(allocation / price, 6)` will cause immediate order rejection by Binance (`FILTER_FAILURE: LOT_SIZE`) on pairs with smaller decimal steps (e.g., 0.1, 1, or 0.001) or high minimum quantities.
  - **Sub-Notional DCA Orders**: In small accounts ($300), a DCA2 allocation may equal $8 USDT. If an asset has a 10 USDT minimum notional requirement, the DCA order will be rejected by the exchange, breaking the planned risk geometry.
* **Security Weaknesses**: Client-side wallet balance overrides (`?wallet=100000`) accepted without server validation.
* **Tests**: `risk-engine.test.ts`. Missing tests for exchange filter compliance and rounding down to `stepSize`.
* **Recommendations**: Implement a dedicated `ExchangePrecisionService` that queries exchange rules and snaps all quantities down to `stepSize` and `tickSize`, validating that every tranche exceeds `minNotional`.

---

### 3.4. Backtesting & Walk-Forward Validation

* **Existing Files**:
  - [`src/lib/services/backtest-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/backtest-service.ts)
  - [`src/lib/services/walk-forward-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/walk-forward-service.ts)
* **What is Actually Implemented**:
  - Zero look-ahead bias (slices `candles.slice(0, i + 1)`).
  - Maker/taker fee modeling (0.10%) and slippage modeling (0.05%).
  - Walk-Forward Efficiency (WFE) grading (Robust, Moderate, Overfit).
* **Missing Functionality**:
  - Does not account for historical funding rates (spot margin) or historical order book depth variations.
  - Historical data limited to small sample sizes (100–200 bars) in default configuration.
* **Potential Bugs & Financial Risks**: Low sample size ($< 100$ trades) can yield statistical insignificance and curve-fitting optimism.
* **Security Weaknesses**: CPU-intensive backtests can be triggered without authentication, opening a Denial-of-Service vector.
* **Tests**: `backtest.test.ts`, `walk-forward.test.ts`.
* **Recommendations**: Add rate-limiting and job-queue throttling to backtesting endpoints.

---

### 3.5. Strategy Optimization & Version Promotion

* **Existing Files**:
  - [`src/lib/services/strategy-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/strategy-service.ts)
  - [`src/lib/services/ai-strategy-optimizer.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/ai-strategy-optimizer.ts)
* **What is Actually Implemented**:
  - Side-by-side strategy comparison with edge score metrics.
  - Conversion helpers for database persistence (`strategyParamsToVersionRecord`).
* **Missing Functionality**:
  - **NO LIVE STRATEGY PROMOTION**: In [`src/app/api/signals/route.ts#L132`](file:///d:/Development/U-spot%20Trading/u-spot/src/app/api/signals/route.ts#L132), the signal engine always hardcodes `DEFAULT_SIGNAL_WEIGHTS` and `strategyVersion: 'v1.0.0'`. Promoted strategy versions in Supabase are never loaded by the live scanner.
* **Potential Bugs & Financial Risks**: False sense of optimization—users optimize strategies in Strategy Lab, but live signals continue using the hardcoded default model.
* **Security Weaknesses**: No permission controls over strategy modification.
* **Tests**: `strategy-lab.test.ts`, `strategy-mtf.test.ts`, `ai-strategy-optimizer.test.ts`.
* **Recommendations**: Update the live signal engine to dynamically query the active promoted strategy version from Supabase with an in-memory fallback.

---

### 3.6. Authentication, Authorization, Database Access, & Secrets

* **Existing Files**:
  - [`src/lib/services/supabase.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/supabase.ts)
  - [`src/lib/services/user-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/user-service.ts)
  - [`src/app/api/auth/*`](file:///d:/Development/U-spot%20Trading/u-spot/src/app/api/auth)
* **CRITICAL SECURITY VULNERABILITIES**:
  1. **Unsigned Plain Cookie Impersonation**: In [`src/app/api/auth/login/route.ts#L36-L40`](file:///d:/Development/U-spot%20Trading/u-spot/src/app/api/auth/login/route.ts#L36-L40), the session cookie is written as `uspot_user_id = user.id` without encryption, signature, `httpOnly: true`, or `secure: true`. Any user can set `document.cookie = "uspot_user_id=usr_admin_001"` in their browser console and immediately attain full administrator privileges.
  2. **Unsalted Plain SHA-256 Passwords**: In [`src/lib/services/user-service.ts#L50`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/user-service.ts#L50), passwords use `createHash('sha256').update(password.trim()).digest('hex')` without salt or bcrypt/Argon2.
  3. **Unprotected API Endpoints**: `/api/signals`, `/api/scan`, `/api/signals/lifecycle`, and `/api/strategy/optimize` have no authentication or CSRF protection. Anyone can trigger scans or state modifications.
  4. **No Server-Side Exchange Key Storage**: There is currently no encrypted vault or schema table for storing exchange API keys.
* **Recommendations**:
  - Implement secure session handling (JWT with HMAC-SHA256 signature or Supabase Auth with `httpOnly` secure cookies).
  - Migrate passwords to bcrypt/Argon2 or delegate fully to Supabase Auth.
  - Protect all trading and execution endpoints behind strict authentication guards.

---

### 3.7. Background Workers & Scheduler Reliability

* **Existing Files**:
  - [`scripts/lifecycle-sweeper.mjs`](file:///d:/Development/U-spot%20Trading/u-spot/scripts/lifecycle-sweeper.mjs)
  - [`scripts/run-engine-cron.mjs`](file:///d:/Development/U-spot%20Trading/u-spot/scripts/run-engine-cron.mjs)
  - [`.github/workflows/signal-engine.yml`](file:///d:/Development/U-spot%20Trading/u-spot/.github/workflows/signal-engine.yml)
* **What is Actually Implemented**:
  - Autonomous 24/7 background execution pinging `/api/signals/lifecycle` and `/api/signals?refresh=true`.
  - Graceful process termination handling (`SIGINT`/`SIGTERM`).
* **Missing Functionality**:
  - No heartbeat telemetry or worker liveness monitoring.
  - No distributed lock (concurrency race conditions if two crons overlap).
  - Dependency on GitHub Actions shared runners which experience 15–20 minute queue delays during peak hours.
* **Potential Bugs & Financial Risks**: If the background worker stalls or network fails, open trades remain un-monitored without active trailing stop adjustments.
* **Recommendations**: Add a database-backed distributed lease lock (`pg_advisory_lock` or Redis lock) and a dead-man's-snitch heartbeat alerting Telegram if a sweep is missed by $> 10$ minutes.

---

### 3.8. Telegram Notifications

* **Existing Files**:
  - [`src/lib/services/telegram-service.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/telegram-service.ts)
* **What is Actually Implemented**:
  - High-contrast markdown formatting with emojis for signals, TPs, SLs, and ratchets.
  - Subscriber fan-out across multiple registered user chat IDs.
  - In-memory duplicate alert key caching (5-minute window).
* **Missing Functionality & Serverless Bug**:
  - **Ephemeral In-Memory Deduplication**: In serverless environments (Vercel) or GitHub Actions runners, the `sentAlertsCache = new Map()` resets on every cold start. The 5-minute deduplication window is lost across separate lambda invocations, risking duplicate Telegram notifications.
* **Recommendations**: Persist dispatched alert deduplication keys to a database table or Redis cache with automatic TTL expiry.

---

### 3.9. Existing Exchange Integrations & Order Execution

* **Existing Files**:
  - [`src/lib/services/smart-order-execution.ts`](file:///d:/Development/U-spot%20Trading/u-spot/src/lib/services/smart-order-execution.ts)
* **What is Actually Implemented**:
  - Purely in-memory algorithmic simulation of micro-tranche division against market price.
* **Missing Functionality**:
  - **Zero Real Exchange Connection**: No CCXT client, no Binance API key signer, no balance checking, no order placement, no order cancellation, no fill websocket.
* **Status**: Complete greenfield implementation required for live trading.

---

## 4. Exchange Integration Design (CCXT Architecture)

### 4.1. Technology Selection: CCXT in TypeScript
We select **CCXT** (`ccxt` npm package) as the unified exchange abstraction layer:
- **TypeScript Support**: Native TypeScript definitions with typed order params and exchange structures.
- **Universal API Surface**: Identical API signatures across Binance, Bybit, OKX, Kraken, and Coinbase.
- **Precision & Filter Helpers**: CCXT natively implements `exchange.amountToPrecision(symbol, amount)`, `exchange.priceToPrecision(symbol, price)`, and automatically fetches `limits.amount.min`, `limits.cost.min`, and `precision`.
- **Maintenance**: Actively maintained open-source standard for algorithmic trading.

---

### 4.2. Exchange Abstraction Interface

```typescript
export interface IExchangeAdapter {
  readonly exchangeId: string;
  readonly isTestnet: boolean;

  // 1. Connection & Account Verification
  testConnection(): Promise<{ success: boolean; latencyMs: number; permissions: string[] }>;
  fetchBalances(): Promise<AccountBalance[]>;
  fetchFreeBalance(asset: string): Promise<number>;

  // 2. Market Metadata & Precision
  fetchMarketRules(symbol: string): Promise<MarketPrecisionRules>;
  formatOrderQuantities(symbol: string, rawQuantity: number, rawPrice: number): FormattedOrderParams;

  // 3. Order Management (Idempotent)
  submitOrder(request: SpotOrderRequest): Promise<ExchangeOrder>;
  cancelOrder(symbol: string, orderId: string): Promise<boolean>;
  cancelAllOpenOrders(symbol: string): Promise<number>;
  fetchOrderStatus(symbol: string, orderId: string): Promise<ExchangeOrder>;
  fetchOpenOrders(symbol?: string): Promise<ExchangeOrder[]>;

  // 4. Reconciliation
  reconcilePositions(activeSignals: SignalHistoryRecord[]): Promise<ReconciliationReport>;
}
```

---

### 4.3. Execution Pipeline & State Machine

```
  [Signal Confirmed]
          │
          ▼
  ┌──────────────────────────────┐
  │   Pre-Flight Safety Checks   │ ◄─── (Max Exposure, Daily Loss, Circuit Breaker)
  └──────────────┬───────────────┘
                 │ Passes
                 ▼
  ┌──────────────────────────────┐
  │  Execution Mode Gatekeeper   │
  └──────┬───────────────┬───────┘
         │               │
  [PAPER TRADING]   [LIVE TRADING]
         │               │
         │         ┌─────▼────────────────────────┐
         │         │ Manual Approval Required?    │
         │         └─────┬────────────────────────┘
         │               │ YES: Wait for User Click in UI
         │               │ NO: Autonomous Trade Execution
         ▼               ▼
  ┌──────────────────────────────┐
  │   Exchange Precision Engine  │ ◄─── (Snap to tickSize, stepSize, minNotional)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │  Idempotent Order Dispatch   │ ◄─── (Assign clientOrderId: USPOT_{signalId}_{tranche})
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │  Partial Fill & Status Sync  │ ◄─── (Poll exchange + update Supabase executed values)
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │   Reconciliation on Startup  │ ◄─── (Audit actual coin balances against database records)
  └──────────────────────────────┘
```

---

### 4.4. Precision & Filter Formatting Rules

Before any order is dispatched to CCXT, `ExchangePrecisionService` enforces exchange constraints:
1. **Quantity Truncation**:
   $$\text{orderQty} = \lfloor \frac{\text{targetQty} - \text{minQty}}{\text{stepSize}} \rfloor \times \text{stepSize} + \text{minQty}$$
   *Must round DOWN (floor) to avoid attempting to spend more balance than available.*
2. **Price Tick Snapping**:
   $$\text{orderPrice} = \text{round}\left(\frac{\text{targetPrice}}{\text{tickSize}}\right) \times \text{tickSize}$$
3. **Minimum Notional Gate**:
   $$\text{notional} = \text{orderQty} \times \text{orderPrice} \ge \text{limits.cost.min} \quad (\text{typically } 5.00 \text{ or } 10.00 \text{ USDT})$$

---

## 5. Execution Safety & Risk Control Specification

### 5.1. Server-Side Encrypted Credential Storage
- **Algorithm**: **AES-256-GCM** with authenticated data (AEAD).
- **Master Encryption Key**: Injected via environment variable `EXCHANGE_VAULT_KEY` (32-byte hexadecimal string). Never committed to Git or stored in database tables.
- **Envelope Storage in PostgreSQL**:
  ```sql
  CREATE TABLE exchange_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(64) NOT NULL,
      exchange_id VARCHAR(32) NOT NULL DEFAULT 'binance',
      is_testnet BOOLEAN NOT NULL DEFAULT true,
      api_key_encrypted TEXT NOT NULL,
      api_secret_encrypted TEXT NOT NULL,
      iv_hex VARCHAR(32) NOT NULL,
      auth_tag_hex VARCHAR(32) NOT NULL,
      permissions JSONB NOT NULL DEFAULT '["SPOT_READ"]',
      is_active BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```

---

### 5.2. Trade-Only API Permissions & Withdrawal Invalidation
- On credential connection, U-SPOT calls Binance `GET /sapi/v1/account/apiRestrictions`.
- **Strict Verification Rules**:
  - `enableSpotAndMarginTrading`: **Must be `true`** for live trading.
  - `enableWithdrawals`: **Must be `false`**. If withdrawal permissions are enabled, **U-SPOT immediately rejects the key and disables the connection**, alerting the user to generate trade-only keys without withdrawal rights.
  - `ipRestrict`: Strongly recommended in UI setup.

---

### 5.3. Idempotent Order Submission
- Every order dispatched to the exchange must include a deterministic `clientOrderId`:
  $$\text{clientOrderId} = \text{USPOT}\_\text{SIG}\_\{\text{timestamp}\}\_\{\text{trancheIndex}\}$$
- If a network timeout occurs during order transmission, retrying with the same `clientOrderId` guarantees that the exchange will reject duplicate executions with code `-2010 (Order duplicate)`.

---

### 5.4. Maximum Exposure & Daily Loss Kill-Switch

```typescript
export interface RiskGovernorConfig {
  maxPositionAllocationUsdt: number;     // e.g. 100 USDT max per coin
  maxPortfolioExposurePercent: number;    // e.g. 70% total capital max
  maxConcurrentOpenTrades: number;       // e.g. 3 active trades max
  dailyMaxLossUsdt: number;              // e.g. 30 USDT max daily loss
  dailyMaxLossPercent: number;           // e.g. 5% max daily drawdown
  killSwitchTriggered: boolean;
}
```

- **Fail-Closed Circuit Breaker**:
  If:
  1. Market data is older than 60 seconds, OR
  2. Cumulative realized daily losses reach `dailyMaxLossUsdt`, OR
  3. The user activates the **Emergency Stop** button in the UI,
  
  $\implies$ The engine **immediately pauses all new entries**, cancels all resting open limit orders, and transitions to safe monitoring mode.

---

## 6. Prioritized Implementation Roadmap

```
  PHASE A: Core Safety & Synthetic Isolation          (Block synthetic leaks, secure auth)
     │
     ▼
  PHASE B: Database Schema & Encrypted Credential Vault (PostgreSQL tables for orders & keys)
     │
     ▼
  PHASE C: CCXT Exchange Adapter Engine               (Binance Spot, precision filters, balances)
     │
     ▼
  PHASE D: Paper Trading Execution Engine              (Simulated order books, fill testing)
     │
     ▼
  PHASE E: Live Spot Order Execution & Reconciliation  (Manual approval, fail-closed safeguards)
```

### Phase A: Core Safety & Synthetic Data Isolation (Priority 1)
- Remove `generateSyntheticOHLCV` from live signal candidate evaluation in `/api/signals`. Require live klines or skip pair.
- Flag signals with `isSyntheticData: boolean`.
- Implement secure session cookies (`httpOnly`, `secure`, signed JWT).
- **Target Files**: `src/app/api/signals/route.ts`, `src/lib/services/signal-engine.ts`, `src/app/api/auth/*`.

### Phase B: Database Schema & Encrypted Credential Vault (Priority 2)
- Deploy PostgreSQL tables `exchange_credentials` and `exchange_orders`.
- Build AES-256-GCM envelope encryption service with `EXCHANGE_VAULT_KEY`.
- **Target Files**: `supabase/schema.sql`, `src/lib/services/crypto-vault.ts`, `src/lib/services/exchange-credentials.ts`.

### Phase C: CCXT Exchange Adapter & Precision Engine (Priority 3)
- Install `ccxt` package.
- Implement `CCXTExchangeAdapter` for Binance Spot.
- Build `ExchangePrecisionService` for `stepSize`, `tickSize`, and `minNotional` snapping.
- Provide read-only balance verification endpoint `/api/exchange/balance`.
- **Target Files**: `src/lib/exchange/ccxt-adapter.ts`, `src/lib/exchange/precision-service.ts`, `src/app/api/exchange/*`.

### Phase D: Paper Trading Engine (Priority 4)
- Implement queue-realistic paper trading engine (limit order book simulation).
- Add UI mode switch: **Paper Trading** vs **Live Trading**.
- **Target Files**: `src/lib/exchange/paper-trader.ts`, `src/components/dashboard/ExecutionModeToggle.tsx`.

### Phase E: Live Spot Order Execution & Risk Governor (Priority 5)
- Implement `RiskGovernor` with daily loss limit and emergency kill-switch.
- Implement `OrderManager` for manual trade approvals, partial fill tracking, and startup reconciliation.
- Add UI components: `TradeApprovalModal`, `KillSwitchButton`.
- **Target Files**: `src/lib/exchange/risk-governor.ts`, `src/lib/exchange/order-manager.ts`, `src/components/dashboard/*`.

---

## 7. Approval Request

The audit is complete. **No application code, indicators, strategy parameters, or live trade paths have been modified.**

Please review this audit. Once approved, implementation will commence starting with **Phase A (Core Safety & Synthetic Data Isolation)**.
