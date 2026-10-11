'use client';

// ─── U-SPOT useDivergenceMatrix React Hook — Phase 37 ─────────────────
// Reactive hook for fetching, caching, filtering, and live-polling
// cross-timeframe divergence matrix scans and confluences.

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  DivergenceMatrixScanReport,
  DivergenceMatrixRow,
  MultiTimeframeDivergenceConfluence,
} from '@/types';

export type DivergenceFilterMode = 'ALL' | 'BULLISH' | 'BEARISH' | 'CONFLUENCE';

export function useDivergenceMatrix(pollingIntervalMs: number = 30000) {
  const [report, setReport] = useState<DivergenceMatrixScanReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<DivergenceFilterMode>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const fetchMatrix = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/divergence?timeframes=15m,1h,4h');
      const json = await res.json();
      if (json.success && json.data) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to fetch divergence matrix');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching divergence data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix(false);

    if (pollingIntervalMs > 0) {
      const timer = setInterval(() => {
        fetchMatrix(true);
      }, pollingIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchMatrix, pollingIntervalMs]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!report || !report.matrix) return [];

    return report.matrix.filter((row) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        if (!row.symbol.toUpperCase().includes(q)) return false;
      }

      // Mode filter
      if (filterMode === 'CONFLUENCE') {
        return Boolean(row.confluence);
      }

      if (filterMode === 'BULLISH') {
        const hasBullishTf = Object.values(row.timeframes).some(
          (tf) =>
            tf?.dominantType === 'REGULAR_BULLISH' || tf?.dominantType === 'HIDDEN_BULLISH'
        );
        const isBullishConfluence = row.confluence?.divergenceType === 'BULLISH';
        return hasBullishTf || isBullishConfluence;
      }

      if (filterMode === 'BEARISH') {
        const hasBearishTf = Object.values(row.timeframes).some(
          (tf) =>
            tf?.dominantType === 'REGULAR_BEARISH' || tf?.dominantType === 'HIDDEN_BEARISH'
        );
        const isBearishConfluence = row.confluence?.divergenceType === 'BEARISH';
        return hasBearishTf || isBearishConfluence;
      }

      return true;
    });
  }, [report, filterMode, searchQuery]);

  const toggleExpand = useCallback((symbol: string) => {
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  }, []);

  return {
    report,
    matrix: filteredRows,
    confluences: report?.confluences || [],
    summary: report?.summary,
    isLoading,
    isRefreshing,
    error,
    filterMode,
    setFilterMode,
    searchQuery,
    setSearchQuery,
    expandedSymbol,
    toggleExpand,
    refresh: () => fetchMatrix(true),
  };
}
