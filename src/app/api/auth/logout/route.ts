import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/services/session-service';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully.',
  });

  clearSessionCookie(response);
  return response;
}
