#!/usr/bin/env node

/**
 * U-SPOT Automated Lifecycle Sweeper Worker
 * 
 * Periodically invokes POST /api/signals/lifecycle to:
 * 1. Fetch live Binance spot ticker prices for all active & pending signals
 * 2. Advance signal lifecycles (ENTRY_TRIGGERED, DCA, TP1, TP2, TP3, SL, EXPIRED, INVALIDATED)
 * 3. Persist lifecycle events and performance evaluations to Supabase PostgreSQL
 * 4. Dispatch Telegram alerts for newly triggered milestones
 */

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const BASE_URL = process.env.BASE_URL || `http://${HOST}:${PORT}`;
const INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS || '60000', 10); // default 60s

console.log(`[Lifecycle Sweeper] Initializing autonomous background worker...`);
console.log(`[Lifecycle Sweeper] Target URL: ${BASE_URL}/api/signals/lifecycle`);
console.log(`[Lifecycle Sweeper] Sweep interval: ${INTERVAL_MS / 1000}s`);

let isRunning = false;
let sweepCount = 0;

async function runSweep() {
  if (isRunning) {
    console.log(`[Lifecycle Sweeper] Previous sweep still in progress, skipping tick.`);
    return;
  }

  isRunning = true;
  sweepCount++;
  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/signals/lifecycle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'U-Spot-Lifecycle-Sweeper/1.0',
      },
      body: JSON.stringify({}),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      console.warn(`[Lifecycle Sweeper] Sweep #${sweepCount} HTTP ${response.status} (${elapsed}ms)`);
      return;
    }

    const data = await response.json();
    const summary = data.summary || {};
    const transitions = summary.transitions || [];

    const transitionCounts = {};
    for (const t of transitions) {
      transitionCounts[t.newLifecycle] = (transitionCounts[t.newLifecycle] || 0) + 1;
    }

    const transitionStr = Object.keys(transitionCounts).length > 0
      ? ` | Transitions: ${JSON.stringify(transitionCounts)}`
      : ' | No transitions';

    console.log(
      `[Lifecycle Sweeper] Sweep #${sweepCount} complete (${elapsed}ms) | Processed: ${summary.processedCount || 0}${transitionStr}`
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Lifecycle Sweeper] Sweep #${sweepCount} error (${elapsed}ms):`, err.message);
  } finally {
    isRunning = false;
  }
}

// Initial sweep after 3 seconds
setTimeout(() => {
  runSweep();
  // Schedule recurring sweep
  setInterval(runSweep, INTERVAL_MS);
}, 3000);

process.on('SIGINT', () => {
  console.log(`\n[Lifecycle Sweeper] Received SIGINT. Shutting down gracefully...`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[Lifecycle Sweeper] Received SIGTERM. Shutting down gracefully...`);
  process.exit(0);
});
