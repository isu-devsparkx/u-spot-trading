// ─── U-SPOT Utility Helpers ────────────────────────────────────────

/** Format a number as USD currency */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a number with commas */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format large volumes (e.g., 2.84B, 890M) */
export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

/** Format percentage with sign */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Get color class based on positive/negative value */
export function getChangeColor(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-rose-400';
  return 'text-slate-400';
}

/** Get background color class for market regime badges */
export function getRegimeBadgeClass(regime: string): string {
  switch (regime) {
    case 'BULL':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'BEAR':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'NEUTRAL':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'HIGH_VOLATILITY':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'LOW_LIQUIDITY':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    default:
      return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  }
}

/** Get status badge color */
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'BUY_NOW':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'WAIT_FOR_CONFIRMATION':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'WATCH':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'SELL_EXIT':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'AVOID':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'NO_TRADE':
      return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    default:
      return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  }
}

/** Format status for display */
export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

/** Get score color */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  if (score >= 55) return 'text-orange-400';
  return 'text-rose-400';
}

/** Get result badge class */
export function getResultBadgeClass(result: string | null): string {
  if (!result) return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  if (
    result.startsWith('TP') ||
    result === 'FULL_TP' ||
    result === 'PARTIAL_TP_THEN_SL' ||
    result === 'TP_HIT'
  ) {
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  }
  if (result === 'SL' || result === 'SL_HIT') {
    return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  }
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
}

/** Format trade outcome into TP1, TP2, TP3, SL HIT labels */
export function formatResultLabel(result: string | null): string {
  if (!result) return '—';
  if (result === 'TP1_ONLY' || result === 'PARTIAL_TP_THEN_SL' || result === 'TP1') {
    return 'TP1';
  }
  if (result === 'TP2_REACHED' || result === 'TP2') {
    return 'TP2';
  }
  if (result === 'TP3_REACHED' || result === 'FULL_TP' || result === 'TP3') {
    return 'TP3';
  }
  if (result.startsWith('TP')) {
    return result.split('_')[0];
  }
  if (result === 'SL' || result === 'SL_HIT') {
    return 'SL HIT';
  }
  const map: Record<string, string> = {
    INVALIDATED_BEFORE_ENTRY: 'INV',
    EXPIRED: 'EXP',
    CANCELLED: 'CANCEL',
    INDETERMINATE: '?',
    MANUAL_EXIT: 'MANUAL',
  };
  return map[result] ?? formatStatus(result);
}

/** Truncate string */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/** Format ISO date string to readable time */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Format ISO date string to readable date */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Checks whether a signal record actually triggered an entry into the market.
 * Excludes pre-entry cancellations, pre-entry expiries, or pending signals where price never filled.
 */
export function isEntryTriggered(signal: {
  actualEntry?: number | null;
  lifecycle?: string;
  finalResult?: string | null;
  realizedR?: number | null;
  realizedReturn?: number | null;
}): boolean {
  if (!signal) return false;

  // 1. Explicit filled actualEntry price
  if (typeof signal.actualEntry === 'number' && signal.actualEntry > 0) {
    return true;
  }

  // 2. Active in-trade lifecycle stages (strictly post-entry)
  const postEntryLifecycles = [
    'ENTRY_TRIGGERED',
    'ACTIVE',
    'DCA1_TRIGGERED',
    'DCA2_TRIGGERED',
    'TP1_HIT',
    'TP2_HIT',
    'TP3_HIT',
    'SL_HIT',
  ];
  if (signal.lifecycle && postEntryLifecycles.includes(signal.lifecycle)) {
    return true;
  }

  // 3. Post-entry trade outcome results (TP hit, SL hit, or partial exit)
  const postEntryResults = [
    'TP1_ONLY',
    'TP2_REACHED',
    'TP3_REACHED',
    'FULL_TP',
    'PARTIAL_TP_THEN_SL',
    'SL',
    'MANUAL_EXIT',
  ];
  if (signal.finalResult && postEntryResults.includes(signal.finalResult)) {
    return true;
  }

  // 4. Any signal with recorded non-zero realized R multiple or return
  if (typeof signal.realizedR === 'number' && signal.realizedR !== 0) {
    return true;
  }
  if (typeof signal.realizedReturn === 'number' && signal.realizedReturn !== 0) {
    return true;
  }

  return false;
}
