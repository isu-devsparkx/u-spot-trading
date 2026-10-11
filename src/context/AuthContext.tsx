'use client';

// ─── U-SPOT Authentication Context ─────────────────────────────────────
// Manages active user session, role privileges (admin vs trader),
// and personal Telegram signal subscription preferences.

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserProfile } from '@/types';

interface AuthContextType {
  user: UserProfile | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    name: string,
    telegramChatId?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateTelegramSettings: (
    chatId: string | null,
    enabled: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  updateWatchlistSymbols: (
    symbols: string[]
  ) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Try localStorage cache first for instant render
        const cached = localStorage.getItem('uspot_user_session');
        if (cached) {
          try {
            setUser(JSON.parse(cached));
          } catch {
            // Ignore parse error
          }
        }

        // Verify with server session
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            setUser(data.user);
            localStorage.setItem('uspot_user_session', JSON.stringify(data.user));
          } else if (!data.user) {
            // Session expired
            if (!cached) setUser(null);
          }
        }
      } catch {
        // Keep cached user if offline
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('uspot_user_session', JSON.stringify(data.user));
        return { success: true };
      }

      return { success: false, error: data.error || 'Login failed' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during login';
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    telegramChatId?: string
  ) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, telegramChatId }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('uspot_user_session', JSON.stringify(data.user));
        return { success: true };
      }

      return { success: false, error: data.error || 'Registration failed' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during registration';
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
    localStorage.removeItem('uspot_user_session');
  };

  const updateTelegramSettings = async (chatId: string | null, enabled: boolean) => {
    if (!user) {
      return { success: false, error: 'You must be logged in to update Telegram settings.' };
    }

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramChatId: chatId,
          telegramEnabled: enabled,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('uspot_user_session', JSON.stringify(data.user));
        return { success: true };
      }

      return { success: false, error: data.error || 'Failed to update Telegram settings' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error updating settings';
      return { success: false, error: msg };
    }
  };

  const updateWatchlistSymbols = async (symbols: string[]) => {
    // 1. Always update localStorage cache so guest or offline sessions persist
    try {
      localStorage.setItem('uspot_custom_watchlist', JSON.stringify(symbols));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('uspot_watchlist_updated', { detail: symbols })
        );
      }
    } catch {
      // Ignore storage errors
    }

    // 2. If logged in, update remote profile
    if (user) {
      try {
        const res = await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchlistSymbols: symbols }),
        });

        const data = await res.json();
        if (res.ok && data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('uspot_user_session', JSON.stringify(data.user));
          return { success: true };
        }
        return { success: false, error: data.error || 'Failed to update watchlist profile' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error updating watchlist';
        return { success: false, error: msg };
      }
    }

    return { success: true };
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        isLoading,
        login,
        register,
        logout,
        updateTelegramSettings,
        updateWatchlistSymbols,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
