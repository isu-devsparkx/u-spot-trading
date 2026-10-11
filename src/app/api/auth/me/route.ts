// ─── U-SPOT Auth Session Check (Me) API ──────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { userService } from '@/lib/services/user-service';
import { getSessionFromRequest } from '@/lib/services/session-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ success: false, user: null });
    }

    const user = await userService.getUserById(session.userId);

    if (!user) {
      return NextResponse.json({ success: false, user: null });
    }

    const { passwordHash: _, ...publicProfile } = user;
    return NextResponse.json({ success: true, user: publicProfile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Session verification failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
