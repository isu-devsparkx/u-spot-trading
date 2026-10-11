#!/usr/bin/env node

/**
 * U-SPOT Autonomous 24/7 Signal Engine & Lifecycle Sweeper Runner
 *
 * This script runs the automated signal cycle:
 * 1. POST /api/signals/lifecycle  -> Sweeps all active/pending trades against live Binance prices (TP1/TP2/TP3/SL/DCA)
 * 2. GET /api/signals?refresh=true -> Scans market universe, evaluates top pairs, applies AI gatekeeper, and saves confirmed signals
 *
 * Usage:
 *   node scripts/run-engine-cron.mjs --once              (single execution for GitHub Actions / Cron)
 *   node scripts/run-engine-cron.mjs --daemon            (continuous background loop with INTERVAL_MS)
 *   BASE_URL=https://my-app.vercel.app node scripts/run-engine-cron.mjs --once
 */

const args = process.argv.slice(2);
const isOnce = args.includes('--once') || process.env.CRON_ONCE === 'true';
const customBaseUrlArg = args.find((a) => a.startsWith('--base-url='));
const customBaseUrl = customBaseUrlArg ? customBaseUrlArg.split('=')[1] : null;

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const BASE_URL = (
  customBaseUrl ||
  process.env.BASE_URL ||
  process.env.VERCEL_APP_URL ||
  `http://${HOST}:${PORT}`
).replace(/\/$/, '');

const CRON_SECRET = process.env.CRON_SECRET || '';
const INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS || '60000', 10);

console.log('═══════════════════════════════════════════════════════════════');
console.log('      U-SPOT AUTONOMOUS 24/7 SIGNAL ENGINE & SWEEPER CRON       ');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`[Config] Target Base URL : ${BASE_URL}`);
console.log(`[Config] Mode            : ${isOnce ? 'ONE-SHOT CRON (--once)' : 'CONTINUOUS DAEMON'}`);
console.log(`[Config] Interval        : ${INTERVAL_MS / 1000}s (daemon mode)`);
console.log(`[Config] Cron Secret     : ${CRON_SECRET ? 'CONFIGURED (Secured)' : 'NONE (Public/Local)'}`);
console.log('───────────────────────────────────────────────────────────────');

let isCycleRunning = false;
let cycleCounter = 0;

function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'U-Spot-Cron-Engine/1.0',
  };
  if (CRON_SECRET) {
    headers['Authorization'] = `Bearer ${CRON_SECRET}`;
    headers['x-cron-secret'] = CRON_SECRET;
  }
  return headers;
}

async function runAutonomousCycle() {
  if (isCycleRunning) {
    console.log('[Engine] Previous cycle still running, skipping overlap.');
    return;
  }

  isCycleRunning = true;
  cycleCounter++;
  const cycleStart = Date.now();
  console.log(`\n[Engine] Starting Cycle #${cycleCounter} at ${new Date().toISOString()}`);

  try {
    // ── STEP 1: Lifecycle Sweeper Evaluation ─────────────────────────
    console.log('[Step 1/2] Invoking Lifecycle Sweeper (POST /api/signals/lifecycle)...');
    const sweepStart = Date.now();
    const sweepRes = await fetch(`${BASE_URL}/api/signals/lifecycle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });

    const sweepElapsed = Date.now() - sweepStart;
    if (!sweepRes.ok) {
      console.warn(`[Step 1/2] Lifecycle sweep HTTP ${sweepRes.status} (${sweepElapsed}ms)`);
    } else {
      const sweepData = await sweepRes.json();
      const summary = sweepData.summary || {};
      const transitions = summary.transitions || [];
      const transitionSummary = transitions.length > 0
        ? transitions.map((t) => `${t.symbol}: ${t.oldLifecycle} -> ${t.newLifecycle}`).join(', ')
        : 'No state changes';
      console.log(`[Step 1/2] ✓ Lifecycle sweep complete (${sweepElapsed}ms)`);
      console.log(`           Active evaluated: ${summary.processedCount || 0} | Transitions: ${transitionSummary}`);
    }

    // ── STEP 2: Market Universe Scanner & Signal Generation ──────────
    console.log('[Step 2/2] Invoking Market Scanner & Signal Engine (GET /api/signals?refresh=true)...');
    const scanStart = Date.now();
    const scanRes = await fetch(`${BASE_URL}/api/signals?refresh=true&limit=20`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const scanElapsed = Date.now() - scanStart;
    if (!scanRes.ok) {
      console.warn(`[Step 2/2] Market scan HTTP ${scanRes.status} (${scanElapsed}ms)`);
    } else {
      const scanData = await scanRes.json();
      const signals = scanData.signals || [];
      const buyNowCount = signals.filter((s) => s.status === 'BUY_NOW').length;
      const watchCount = signals.filter((s) => s.status === 'WATCH').length;
      console.log(`[Step 2/2] ✓ Signal engine complete (${scanElapsed}ms)`);
      console.log(`           Evaluated: ${signals.length} pairs | BUY_NOW: ${buyNowCount} | WATCH: ${watchCount}`);
      if (buyNowCount > 0) {
        const topSymbols = signals
          .filter((s) => s.status === 'BUY_NOW')
          .slice(0, 3)
          .map((s) => `${s.symbol} (${s.confidence}, Score: ${s.tradeScore})`)
          .join(', ');
        console.log(`           Top Signals: ${topSymbols}`);
      }
    }

    const totalElapsed = Date.now() - cycleStart;
    console.log(`[Engine] Cycle #${cycleCounter} completed successfully in ${totalElapsed}ms.`);
  } catch (err) {
    const totalElapsed = Date.now() - cycleStart;
    console.error(`[Engine] Cycle #${cycleCounter} encountered an error (${totalElapsed}ms):`, err.message);
    if (isOnce) {
      // In one-shot mode (GitHub Actions), exit with code 1 if total failure
      process.exit(1);
    }
  } finally {
    isCycleRunning = false;
  }
}

if (isOnce) {
  runAutonomousCycle().then(() => {
    console.log('[Engine] One-shot cycle finished.');
    process.exitCode = 0;
  }).catch((err) => {
    console.error('[Engine] Fatal error:', err);
    process.exitCode = 1;
  });
} else {
  // Initial run after 2 seconds
  setTimeout(() => {
    runAutonomousCycle();
    setInterval(runAutonomousCycle, INTERVAL_MS);
  }, 2000);

  process.on('SIGINT', () => {
    console.log('\n[Engine] Received SIGINT. Shutting down gracefully.');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('\n[Engine] Received SIGTERM. Shutting down gracefully.');
    process.exit(0);
  });
}
