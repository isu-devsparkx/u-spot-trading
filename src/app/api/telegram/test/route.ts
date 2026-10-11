// ─── U-SPOT Telegram Test Dispatcher API — Phase 15 ───────────────────
// Dispatches a live or mock test alert through Telegram Bot

import { NextRequest, NextResponse } from 'next/server';
import {
  dispatchTelegramAlert,
  broadcastNewSignal,
  getTelegramConfig,
} from '@/lib/services/telegram-service';
import type { TelegramAlertPayload, Signal } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const currentConfig = getTelegramConfig();
    const effectiveBotToken =
      body.botToken && !body.botToken.includes('...') ? body.botToken : currentConfig.botToken;
    const effectiveChatId = body.chatId ? body.chatId : currentConfig.chatId;

    // Check if caller requested a sample confirmed trade signal preview
    if (body.sendConfirmedSignal) {
      const sampleSignal: Signal = {
        signalId: `sample-confirmed-${Date.now()}`,
        symbol: body.symbol || 'SOL/USDT',
        direction: 'BUY',
        createdAt: new Date().toISOString(),
        strategyVersion: 'v1.0.0',
        marketRegime: 'BULL',
        candidateScore: 92,
        tradeScore: 94,
        setupType: 'BREAKOUT_RETEST',
        entryZone: { low: 147.5, high: 149.0 },
        preferredEntry: 148.2,
        dca1: 144.0,
        dca2: 140.0,
        stopLoss: 137.5,
        tp1: 154.0,
        tp2: 160.0,
        tp3: 168.0,
        riskPercent: 0.75,
        maxLoss: 2.25,
        initialAllocation: 174.42,
        dca1Allocation: 69.77,
        dca2Allocation: 55.81,
        maxDeployed: 300.0,
        riskReward: 2.7,
        confidence: 'A+',
        status: 'BUY_NOW',
        lifecycle: 'ACTIVE',
        expiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      };

      const result = await broadcastNewSignal(sampleSignal, {
        enabled: true,
        botToken: effectiveBotToken,
        chatId: effectiveChatId,
      });

      return NextResponse.json({
        success: result.success,
        result,
        isMocked: result.mocked ?? false,
        message: result.mocked
          ? 'Confirmed signal alert simulated cleanly (Mock Mode)'
          : 'Confirmed signal with full trade details & position sizes sent to Telegram!',
      });
    }

    const payload: TelegramAlertPayload = {
      eventType: 'TEST',
      symbol: body.symbol || 'SOL/USDT',
      details: body.customMessage || 'U-SPOT Test Alert: Bot is connected and operational.',
      timestamp: Date.now(),
    };

    const result = await dispatchTelegramAlert(payload, {
      enabled: true, // Force send for explicit test action
      botToken: effectiveBotToken,
      chatId: effectiveChatId,
    });

    return NextResponse.json({
      success: result.success,
      result,
      isMocked: result.mocked ?? false,
      message: result.mocked
        ? 'Test alert simulated cleanly (Mock Mode: configure Bot Token & Chat ID for real Telegram delivery)'
        : 'Test alert sent successfully to Telegram!',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to dispatch test Telegram message' },
      { status: 500 }
    );
  }
}
