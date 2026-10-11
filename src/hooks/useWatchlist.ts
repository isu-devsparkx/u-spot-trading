'use client';

// ─── U-SPOT Watchlist Customization & Persistence Hook (Phase 33) ───────
// Real-time synchronization of customized ticker strip symbols across user profile
// and local browser storage with instant reactive updates across all components.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_WATCHLIST_SYMBOLS,
  POPULAR_UNIVERSE_SYMBOLS,
} from '@/lib/services/binance-websocket';
import { normalizeWatchlistSymbols } from '@/lib/services/user-service';

export const WATCHLIST_STORAGE_KEY = 'uspot_custom_watchlist';
export const WATCHLIST_UPDATED_EVENT = 'uspot_watchlist_updated';

export { POPULAR_UNIVERSE_SYMBOLS };

export function useWatchlist() {
  const { user, updateWatchlistSymbols } = useAuth();

  // Helper to determine starting symbols
  const getInitialSymbols = useCallback((): string[] => {
    // 1. Authenticated user profile preference has highest priority
    if (user?.watchlistSymbols && user.watchlistSymbols.length > 0) {
      return normalizeWatchlistSymbols(user.watchlistSymbols);
    }

    // 2. Local storage preference for guest / offline mode
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return normalizeWatchlistSymbols(parsed);
          }
        }
      } catch {
        // Fallback to default
      }
    }

    // 3. Fallback to default liquid universe
    return [...DEFAULT_WATCHLIST_SYMBOLS];
  }, [user?.watchlistSymbols]);

  const [symbols, setSymbols] = useState<string[]>(getInitialSymbols);

  // Sync state whenever user profile or localStorage changes
  useEffect(() => {
    setSymbols(getInitialSymbols());
  }, [getInitialSymbols]);

  // Listen to cross-component or cross-tab synchronization events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<string[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setSymbols(normalizeWatchlistSymbols(customEvent.detail));
      } else {
        setSymbols(getInitialSymbols());
      }
    };

    window.addEventListener(WATCHLIST_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(WATCHLIST_UPDATED_EVENT, handleUpdate);
  }, [getInitialSymbols]);

  const isCustomized = useMemo(() => {
    if (symbols.length !== DEFAULT_WATCHLIST_SYMBOLS.length) return true;
    return symbols.some((sym, idx) => sym !== DEFAULT_WATCHLIST_SYMBOLS[idx]);
  }, [symbols]);

  // Save symbols via AuthContext
  const persistSymbols = useCallback(
    async (nextSymbols: string[]) => {
      const normalized = normalizeWatchlistSymbols(nextSymbols);
      setSymbols(normalized);
      return updateWatchlistSymbols(normalized);
    },
    [updateWatchlistSymbols]
  );

  /**
   * Adds a new trading pair to the end of the watchlist
   */
  const addSymbol = useCallback(
    async (newSymbol: string) => {
      if (!newSymbol || typeof newSymbol !== 'string') {
        return { success: false, error: 'Invalid symbol format.' };
      }

      let sym = newSymbol.trim().toUpperCase();
      if (!sym) {
        return { success: false, error: 'Symbol cannot be empty.' };
      }

      if (!sym.includes('/')) {
        if (sym.endsWith('USDT')) {
          sym = `${sym.slice(0, -4)}/USDT`;
        } else {
          sym = `${sym}/USDT`;
        }
      }

      if (symbols.includes(sym)) {
        return { success: false, error: `${sym} is already in your watchlist.` };
      }

      const next = [...symbols, sym];
      return persistSymbols(next);
    },
    [symbols, persistSymbols]
  );

  /**
   * Removes a trading pair from the watchlist (ensures at least 1 pair remains)
   */
  const removeSymbol = useCallback(
    async (targetSymbol: string) => {
      if (symbols.length <= 1) {
        return {
          success: false,
          error: 'Watchlist must contain at least 1 symbol.',
        };
      }

      const next = symbols.filter((s) => s !== targetSymbol);
      return persistSymbols(next);
    },
    [symbols, persistSymbols]
  );

  /**
   * Moves a symbol up or down in the ordered list
   */
  const moveSymbol = useCallback(
    async (targetSymbol: string, direction: 'UP' | 'DOWN') => {
      const index = symbols.indexOf(targetSymbol);
      if (index === -1) return { success: false, error: 'Symbol not in watchlist.' };

      const targetIndex = direction === 'UP' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= symbols.length) {
        return { success: true }; // Already at boundary
      }

      const next = [...symbols];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);

      return persistSymbols(next);
    },
    [symbols, persistSymbols]
  );

  /**
   * Replaces current list with a completely reordered array
   */
  const reorderSymbols = useCallback(
    async (newOrder: string[]) => {
      return persistSymbols(newOrder);
    },
    [persistSymbols]
  );

  /**
   * Resets watchlist back to DEFAULT_WATCHLIST_SYMBOLS
   */
  const resetToDefaults = useCallback(async () => {
    return persistSymbols([...DEFAULT_WATCHLIST_SYMBOLS]);
  }, [persistSymbols]);

  return {
    symbols,
    addSymbol,
    removeSymbol,
    moveSymbol,
    reorderSymbols,
    resetToDefaults,
    isCustomized,
  };
}
