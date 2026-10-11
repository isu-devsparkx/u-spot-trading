// ─── U-SPOT Telegram Configuration API — Phase 15 ──────────────────────
// Spec Ref: Phase 15 & Spec Section 34 (Telegram Bot & Preferences)

import { NextRequest, NextResponse } from 'next/server';
import {
  getTelegramConfig,
  updateTelegramConfig,
} from '@/lib/services/telegram-service';
import type { TelegramAlertConfig } from '@/types';

import { requireAdmin, verifyCsrf } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const currentConfig = getTelegramConfig();

  // Return masked token for security
  const maskedToken = currentConfig.botToken
    ? `${currentConfig.botToken.slice(0, 4)}...${currentConfig.botToken.slice(-4)}`
    : '';

  return NextResponse.json({
    success: true,
    config: {
      ...currentConfig,
      botToken: maskedToken,
      hasRealToken: Boolean(currentConfig.botToken),
      hasRealChatId: Boolean(currentConfig.chatId),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrf(request)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. CSRF origin mismatch.' },
        { status: 403 }
      );
    }

    const auth = requireAdmin(request);
    if (!auth.isAuthorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: 'Administrator role required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: Partial<TelegramAlertConfig> = {};

    if (typeof body.enabled === 'boolean') {
      updates.enabled = body.enabled;
    }

    if (typeof body.botToken === 'string' && !body.botToken.includes('...')) {
      updates.botToken = body.botToken.trim();
    }

    if (typeof body.chatId === 'string') {
      updates.chatId = body.chatId.trim();
    }

    if (body.events && typeof body.events === 'object') {
      updates.events = {
        ...getTelegramConfig().events,
        ...body.events,
      };
    }

    const updated = updateTelegramConfig(updates);

    // Persist to .env.local for permanent retention across restarts
    try {
      const fs = await import('fs');
      const path = await import('path');
      const envPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (updated.botToken) {
          envContent = envContent.replace(/^TELEGRAM_BOT_TOKEN=.*$/m, `TELEGRAM_BOT_TOKEN=${updated.botToken}`);
        }
        if (updated.chatId) {
          envContent = envContent.replace(/^TELEGRAM_CHAT_ID=.*$/m, `TELEGRAM_CHAT_ID=${updated.chatId}`);
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
    } catch {
      // Non-fatal fallback
    }

    const maskedToken = updated.botToken
      ? `${updated.botToken.slice(0, 4)}...${updated.botToken.slice(-4)}`
      : '';

    return NextResponse.json({
      success: true,
      message: 'Telegram notification preferences updated successfully',
      config: {
        ...updated,
        botToken: maskedToken,
        hasRealToken: Boolean(updated.botToken),
        hasRealChatId: Boolean(updated.chatId),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update Telegram settings' },
      { status: 500 }
    );
  }
}
