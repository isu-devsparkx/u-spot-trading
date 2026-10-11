// ─── U-SPOT Auth Login API ───────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { userService } from '@/lib/services/user-service';
import { createSessionToken, attachSessionCookie } from '@/lib/services/session-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const user = await userService.verifyCredentials(email, password);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address or password.' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user,
      message: `Welcome back, ${user.name}!`,
    });

    // Generate cryptographically signed session token and attach HttpOnly cookie
    const token = createSessionToken(user);
    attachSessionCookie(response, token);

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
