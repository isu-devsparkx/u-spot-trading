// ─── U-SPOT Auth Logout API ──────────────────────────────────────────

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully.',
  });

  response.cookies.delete('uspot_user_id');
  return response;
}
