// ─── U-SPOT Auth Register API ────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { userService } from '@/lib/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, telegramChatId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const user = await userService.createUser({
      email,
      password,
      name: name || 'Trader',
      telegramChatId: telegramChatId || null,
    });

    const response = NextResponse.json({
      success: true,
      user,
      message: `Account created successfully. Welcome to U-SPOT, ${user.name}!`,
    });

    response.cookies.set('uspot_user_id', user.id, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
