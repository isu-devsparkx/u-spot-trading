// ─── U-SPOT User Profile & Telegram Settings Update API ─────────────

import { NextRequest, NextResponse } from 'next/server';
import { userService } from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  try {
    const userId = request.cookies.get('uspot_user_id')?.value;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, telegramChatId, telegramEnabled, alertPreferences, watchlistSymbols } = body;

    const updatedUser = await userService.updateUserProfile(userId, {
      name,
      telegramChatId,
      telegramEnabled: telegramEnabled ?? Boolean(telegramChatId?.trim()),
      alertPreferences,
      watchlistSymbols,
    });

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: 'User profile not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'Profile and Telegram alert settings updated successfully.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
