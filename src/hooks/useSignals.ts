'use client';

// ─── U-SPOT Live Signals Hook ───────────────────────────────────────
// Phase 6: Signal Engine Integration Hook
// Fetches, filters, and manages live evaluated signals with dynamic wallet sizing

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Signal, SignalStatus, ConfidenceGrade } from '@/types';
import { useWallet } from '@/context/WalletContext';

export interface SignalSummary {
  totalEvaluated: number;
  buyNowCount: number;
  waitForConfirmationCount: number;
  watchCount: number;
  noTradeCount: number;
  averageTradeScore: number;
  topGrade: ConfidenceGrade;
}

export function useSignals(autoRefreshIntervalMs: number = 30000) {
  const { walletBalance } = useWallet();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [summary, setSummary] = useState<SignalSummary | null>(null);
  const [marketRegime, setMarketRegime] = useState<string>('NEUTRAL');
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'ALL'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<ConfidenceGrade | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isMounted = useRef<boolean>(true);

  const fetchSignals = useCallback(
    async (isManual: boolean = false) => {
      if (isManual) setIsRefreshing(true);

      try {
        const params = new URLSearchParams();
        params.set('wallet', String(walletBalance || 300));
        if (isManual) params.set('refresh', 'true');
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (gradeFilter !== 'ALL') params.set('grade', gradeFilter);
        if (searchQuery.trim()) params.set('symbol', searchQuery.trim());

        const res = await fetch(`/api/signals?${params.toString()}`);
        if (!isMounted.current) return;

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.signals)) {
            setSignals(data.signals);
            if (data.summary) setSummary(data.summary);
            if (data.marketRegime) setMarketRegime(data.marketRegime);
          }
        }
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (!isMounted.current) return;
        console.warn('Live signals fetch warning (using cached/fallback):', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [walletBalance, statusFilter, gradeFilter, searchQuery]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchSignals(false);

    if (autoRefreshIntervalMs > 0) {
      const interval = setInterval(() => {
        fetchSignals(false);
      }, autoRefreshIntervalMs);

      return () => {
        isMounted.current = false;
        clearInterval(interval);
      };
    }

    return () => {
      isMounted.current = false;
    };
  }, [fetchSignals, autoRefreshIntervalMs]);

  const refresh = useCallback(() => {
    return fetchSignals(true);
  }, [fetchSignals]);

  return {
    signals,
    summary,
    marketRegime,
    statusFilter,
    setStatusFilter,
    gradeFilter,
    setGradeFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  };
}
