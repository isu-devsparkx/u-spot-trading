'use client';

// ─── U-SPOT Order Flow Toast & Audio Context (Phase 35) ───────────────
// Manages real-time visual toast notifications and audio alert preferences
// Supports auto-dismiss, hover pause, dismiss on click, and global state sync

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { OrderFlowToastAlert, OrderFlowAudioConfig } from '@/types';
import {
  getOrderFlowAudioConfig,
  saveOrderFlowAudioConfig,
  toggleSoundEnabled,
  DEFAULT_ORDER_FLOW_AUDIO_CONFIG,
  AUDIO_CONFIG_CHANGED_EVENT,
} from '@/lib/services/sound-synthesizer';
import { ORDER_FLOW_TOAST_EVENT } from '@/lib/services/order-flow-imbalance';

interface OrderFlowToastContextValue {
  alerts: OrderFlowToastAlert[];
  addToast: (alert: OrderFlowToastAlert) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  audioConfig: OrderFlowAudioConfig;
  updateAudioConfig: (updates: Partial<OrderFlowAudioConfig>) => void;
  toggleSound: () => boolean;
}

const OrderFlowToastContext = createContext<OrderFlowToastContextValue | undefined>(undefined);

export function OrderFlowToastProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<OrderFlowToastAlert[]>([]);
  const [audioConfig, setAudioConfig] = useState<OrderFlowAudioConfig>(DEFAULT_ORDER_FLOW_AUDIO_CONFIG);

  // Initialize and synchronize audio config
  useEffect(() => {
    setAudioConfig(getOrderFlowAudioConfig());

    const handleConfigChange = (event: Event) => {
      const custom = event as CustomEvent<OrderFlowAudioConfig>;
      if (custom.detail) {
        setAudioConfig(custom.detail);
      }
    };

    window.addEventListener(AUDIO_CONFIG_CHANGED_EVENT, handleConfigChange);
    return () => window.removeEventListener(AUDIO_CONFIG_CHANGED_EVENT, handleConfigChange);
  }, []);

  const removeToast = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addToast = useCallback((alert: OrderFlowToastAlert) => {
    setAlerts((prev) => {
      // Max 4 visible toasts to avoid viewport clutter
      const filtered = prev.filter((item) => item.id !== alert.id);
      return [alert, ...filtered].slice(0, 4);
    });
  }, []);

  const clearToasts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Listen for dispatched order flow toast events
  useEffect(() => {
    const handleToastEvent = (event: Event) => {
      const custom = event as CustomEvent<OrderFlowToastAlert>;
      if (custom.detail) {
        addToast(custom.detail);
      }
    };

    window.addEventListener(ORDER_FLOW_TOAST_EVENT, handleToastEvent);
    return () => window.removeEventListener(ORDER_FLOW_TOAST_EVENT, handleToastEvent);
  }, [addToast]);

  const updateAudioConfig = useCallback((updates: Partial<OrderFlowAudioConfig>) => {
    const updated = saveOrderFlowAudioConfig(updates);
    setAudioConfig(updated);
  }, []);

  const toggleSound = useCallback(() => {
    const isNowEnabled = toggleSoundEnabled();
    setAudioConfig((prev) => ({ ...prev, soundEnabled: isNowEnabled }));
    return isNowEnabled;
  }, []);

  return (
    <OrderFlowToastContext.Provider
      value={{
        alerts,
        addToast,
        removeToast,
        clearToasts,
        audioConfig,
        updateAudioConfig,
        toggleSound,
      }}
    >
      {children}
    </OrderFlowToastContext.Provider>
  );
}

export function useOrderFlowToasts(): OrderFlowToastContextValue {
  const context = useContext(OrderFlowToastContext);
  if (!context) {
    throw new Error('useOrderFlowToasts must be used within an OrderFlowToastProvider');
  }
  return context;
}
