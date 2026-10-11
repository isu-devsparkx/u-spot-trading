'use client';

// ─── U-SPOT Global Wallet & Risk State Context ────────────────────────
// Phase 2: Reactive wallet balance, risk configuration, and persistence

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  RiskConfig,
  ConfidenceGrade,
  ExecutionCosts,
} from '@/types';
import { config } from '@/config';
import { DEFAULT_EXECUTION_COSTS } from '@/lib/risk-engine';

const STORAGE_KEY = 'uspot_wallet_settings_v1';

export interface WalletContextValue {
  walletBalance: number;
  setWalletBalance: (amount: number) => void;
  riskConfigs: RiskConfig[];
  updateRiskPercent: (grade: ConfidenceGrade, percent: number) => void;
  maxPositionPercent: number;
  setMaxPositionPercent: (percent: number) => void;
  costs: ExecutionCosts;
  updateCosts: (costs: Partial<ExecutionCosts>) => void;
  resetToDefaults: () => void;
  isHydrated: boolean;
}

const DEFAULT_RISK_CONFIGS: RiskConfig[] = [
  { grade: 'A+', maxRiskPercent: 1.0 },
  { grade: 'A', maxRiskPercent: 0.75 },
  { grade: 'B', maxRiskPercent: 0.5 },
];

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletBalance, setWalletBalanceState] = useState<number>(
    config.defaults.walletBalance
  );
  const [riskConfigs, setRiskConfigs] = useState<RiskConfig[]>(DEFAULT_RISK_CONFIGS);
  const [maxPositionPercent, setMaxPositionPercentState] = useState<number>(30);
  const [costs, setCostsState] = useState<ExecutionCosts>({
    makerFeePercent: DEFAULT_EXECUTION_COSTS.makerFeePercent,
    takerFeePercent: DEFAULT_EXECUTION_COSTS.takerFeePercent,
    slippagePercent: DEFAULT_EXECUTION_COSTS.slippagePercent,
  });
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.walletBalance === 'number' && !isNaN(parsed.walletBalance)) {
          setWalletBalanceState(Math.max(0, parsed.walletBalance));
        }
        if (Array.isArray(parsed.riskConfigs) && parsed.riskConfigs.length > 0) {
          setRiskConfigs(parsed.riskConfigs);
        }
        if (typeof parsed.maxPositionPercent === 'number') {
          setMaxPositionPercentState(Math.min(100, Math.max(1, parsed.maxPositionPercent)));
        }
        if (parsed.costs && typeof parsed.costs.makerFeePercent === 'number') {
          setCostsState(parsed.costs);
        }
      }
    } catch {
      // Ignore localStorage read errors (e.g. private browsing)
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          walletBalance,
          riskConfigs,
          maxPositionPercent,
          costs,
        })
      );
    } catch {
      // Ignore localStorage write errors
    }
  }, [walletBalance, riskConfigs, maxPositionPercent, costs, isHydrated]);

  const setWalletBalance = useCallback((amount: number) => {
    setWalletBalanceState(Math.max(0, amount));
  }, []);

  const updateRiskPercent = useCallback((grade: ConfidenceGrade, percent: number) => {
    const safePercent = Math.max(0, Math.min(10, percent));
    setRiskConfigs((prev) =>
      prev.map((rc) =>
        rc.grade === grade ? { ...rc, maxRiskPercent: safePercent } : rc
      )
    );
  }, []);

  const setMaxPositionPercent = useCallback((percent: number) => {
    setMaxPositionPercentState(Math.min(100, Math.max(1, percent)));
  }, []);

  const updateCosts = useCallback((newCosts: Partial<ExecutionCosts>) => {
    setCostsState((prev) => ({
      ...prev,
      ...newCosts,
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setWalletBalanceState(config.defaults.walletBalance);
    setRiskConfigs(DEFAULT_RISK_CONFIGS);
    setMaxPositionPercentState(30);
    setCostsState({
      makerFeePercent: DEFAULT_EXECUTION_COSTS.makerFeePercent,
      takerFeePercent: DEFAULT_EXECUTION_COSTS.takerFeePercent,
      slippagePercent: DEFAULT_EXECUTION_COSTS.slippagePercent,
    });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      walletBalance,
      setWalletBalance,
      riskConfigs,
      updateRiskPercent,
      maxPositionPercent,
      setMaxPositionPercent,
      costs,
      updateCosts,
      resetToDefaults,
      isHydrated,
    }),
    [
      walletBalance,
      setWalletBalance,
      riskConfigs,
      updateRiskPercent,
      maxPositionPercent,
      setMaxPositionPercent,
      costs,
      updateCosts,
      resetToDefaults,
      isHydrated,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}
