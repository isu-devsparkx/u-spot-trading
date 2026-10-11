'use client';

// ─── U-SPOT Live Market Data & Scanner Hook ──────────────────────────
// Phase 4: Dynamic Top 20 Scanner, Configurable Weights & Regime Integration
// Spec Section 5 (Top-20 Scanner) & Section 6 (Market Regime Engine)

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MarketPair,
  MarketCandidate,
  MarketUniverseSummary,
  OHLCV,
  OrderBook,
  Timeframe,
  ScannerWeights,
  ScannerFilters,
  ScannerPresetName,
  MarketRegimeAnalysis,
} from '@/types';
import {
  DEFAULT_SCANNER_WEIGHTS,
  SCANNER_PRESETS,
} from '@/lib/services/scanner-service';

export interface MarketHealthStatus {
  binance: { connected: boolean; latencyMs: number };
  coingecko: { connected: boolean; latencyMs: number };
}

export function useMarketData(autoRefreshIntervalMs: number = 30000) {
  const [pairs, setPairs] = useState<MarketPair[]>([]);
  const [candidates, setCandidates] = useState<MarketCandidate[]>([]);
  const [summary, setSummary] = useState<MarketUniverseSummary | null>(null);
  const [health, setHealth] = useState<MarketHealthStatus | null>(null);
  const [regimeAnalysis, setRegimeAnalysis] = useState<MarketRegimeAnalysis | null>(null);
  const [appliedWeights, setAppliedWeights] = useState<ScannerWeights>(DEFAULT_SCANNER_WEIGHTS);
  const [activePreset, setActivePreset] = useState<ScannerPresetName>('BALANCED');
  const [activeFilters, setActiveFilters] = useState<ScannerFilters>({
    regimeFilter: 'ALL',
    limit: 20,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isMounted = useRef<boolean>(true);

  // Default fetch for markets + initial scan
  const fetchMarkets = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);

    try {
      const [marketRes, scanRes] = await Promise.all([
        fetch(`/api/markets${isManual ? '?refresh=true' : ''}`),
        fetch(`/api/scan${isManual ? '?refresh=true' : ''}`),
      ]);

      if (!isMounted.current) return;

      if (marketRes.ok) {
        const data = await marketRes.json();
        if (data.success) {
          if (Array.isArray(data.pairs)) setPairs(data.pairs);
          if (data.summary) setSummary(data.summary);
          if (data.health) setHealth(data.health);
        }
      }

      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData.success) {
          if (Array.isArray(scanData.candidates)) {
            setCandidates(scanData.candidates);
          }
          if (scanData.regimeAnalysis) {
            setRegimeAnalysis(scanData.regimeAnalysis);
          }
          if (scanData.appliedWeights) {
            setAppliedWeights(scanData.appliedWeights);
          }
          if (scanData.activeFilters) {
            setActiveFilters(scanData.activeFilters);
          }
        }
      }

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (!isMounted.current) return;
      console.warn('Market data fetch warning (using fallback):', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Custom scan trigger with custom weights and/or filters
  const runCustomScan = useCallback(
    async (
      customWeights?: Partial<ScannerWeights>,
      customFilters?: ScannerFilters,
      presetName?: ScannerPresetName
    ) => {
      setIsScanning(true);
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weights: customWeights || appliedWeights,
            filters: customFilters || activeFilters,
          }),
        });

        if (!res.ok) throw new Error(`Custom scan returned ${res.status}`);
        const data = await res.json();

        if (data.success && isMounted.current) {
          if (Array.isArray(data.candidates)) {
            setCandidates(data.candidates);
          }
          if (data.regimeAnalysis) {
            setRegimeAnalysis(data.regimeAnalysis);
          }
          if (data.appliedWeights) {
            setAppliedWeights(data.appliedWeights);
          }
          if (data.activeFilters) {
            setActiveFilters(data.activeFilters);
          }
          if (presetName) {
            setActivePreset(presetName);
          } else if (customWeights) {
            setActivePreset('CUSTOM');
          }
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Custom scan failed:', err);
      } finally {
        if (isMounted.current) {
          setIsScanning(false);
        }
      }
    },
    [appliedWeights, activeFilters]
  );

  // Apply predefined preset
  const applyPreset = useCallback(
    (presetName: ScannerPresetName) => {
      const preset = SCANNER_PRESETS[presetName];
      if (!preset) return;
      runCustomScan(preset.weights, activeFilters, presetName);
    },
    [activeFilters, runCustomScan]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchMarkets(false);

    if (autoRefreshIntervalMs > 0) {
      const timer = setInterval(() => {
        fetchMarkets(false);
      }, autoRefreshIntervalMs);

      return () => {
        isMounted.current = false;
        clearInterval(timer);
      };
    }

    return () => {
      isMounted.current = false;
    };
  }, [fetchMarkets, autoRefreshIntervalMs]);

  const refresh = useCallback(() => fetchMarkets(true), [fetchMarkets]);

  const fetchKlines = useCallback(
    async (
      symbol: string,
      interval: Timeframe = '15m',
      limit: number = 100
    ): Promise<OHLCV[]> => {
      const cleanSymbol = symbol.replace('/', '').toUpperCase();
      const res = await fetch(
        `/api/markets/${cleanSymbol}/klines?interval=${interval}&limit=${limit}`
      );
      if (!res.ok) throw new Error(`Klines API failed: ${res.status}`);
      const data = await res.json();
      return data.klines ?? [];
    },
    []
  );

  const fetchDepth = useCallback(
    async (symbol: string, limit: number = 20): Promise<OrderBook> => {
      const cleanSymbol = symbol.replace('/', '').toUpperCase();
      const res = await fetch(`/api/markets/${cleanSymbol}/depth?limit=${limit}`);
      if (!res.ok) throw new Error(`Depth API failed: ${res.status}`);
      const data = await res.json();
      return data.orderBook;
    },
    []
  );

  return {
    pairs,
    candidates,
    summary,
    health,
    regimeAnalysis,
    appliedWeights,
    activePreset,
    activeFilters,
    isLoading,
    isRefreshing,
    isScanning,
    error,
    lastUpdated,
    refresh,
    runCustomScan,
    applyPreset,
    fetchKlines,
    fetchDepth,
  };
}
