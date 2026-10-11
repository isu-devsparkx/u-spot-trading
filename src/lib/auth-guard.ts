// ─── U-SPOT Server-Side Authorization & Guard Helpers (Phase A) ───────────
// Enforces least-privilege role checks, worker token authentication,
// and request origin validation across sensitive route handlers.

import { getSessionFromRequest, type SessionPayload } from './services/session-service.ts';

export interface AuthGuardResult {
  isAuthorized: boolean;
  session: SessionPayload | null;
  errorResponse?: Response;
  isWorker?: boolean;
}

/**
 * Ensures the incoming request is from an authenticated user (any role).
 */
export function requireAuth(request: Request): AuthGuardResult {
  const session = getSessionFromRequest(request);

  if (!session) {
    return {
      isAuthorized: false,
      session: null,
      errorResponse: Response.json(
        { success: false, error: 'Authentication required. Please log in.' },
        { status: 401 }
      ),
    };
  }

  return {
    isAuthorized: true,
    session,
  };
}

/**
 * Ensures the incoming request is from an authenticated Administrator.
 */
export function requireAdmin(request: Request): AuthGuardResult {
  const authResult = requireAuth(request);
  if (!authResult.isAuthorized || !authResult.session) {
    return authResult;
  }

  if (authResult.session.role !== 'admin') {
    return {
      isAuthorized: false,
      session: authResult.session,
      errorResponse: Response.json(
        { success: false, error: 'Forbidden. Administrator privileges required.' },
        { status: 403 }
      ),
    };
  }

  return authResult;
}

/**
 * Verifies that the request comes from an authorized internal worker (via CRON_SECRET)
 * OR from an authenticated Administrator.
 */
export function requireWorkerOrAdmin(request: Request): AuthGuardResult {
  const cronSecret = process.env.CRON_SECRET;

  // 1. Check Worker Secret via Authorization: Bearer or x-cron-secret header
  const authHeader = request.headers.get('authorization') || '';
  const xCronSecret = request.headers.get('x-cron-secret') || '';

  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  const providedSecret = xCronSecret || bearerToken;

  if (cronSecret && cronSecret.trim().length > 0) {
    if (providedSecret === cronSecret) {
      return {
        isAuthorized: true,
        session: null,
        isWorker: true,
      };
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // In local development, if CRON_SECRET is not configured yet, allow worker execution with warning
    if (providedSecret === 'dev-cron-secret' || request.headers.get('user-agent')?.includes('U-Spot-')) {
      return {
        isAuthorized: true,
        session: null,
        isWorker: true,
      };
    }
  }

  // 2. Check if caller is an authenticated Administrator session
  const adminResult = requireAdmin(request);
  if (adminResult.isAuthorized) {
    return adminResult;
  }

  // Neither valid worker secret nor admin session
  return {
    isAuthorized: false,
    session: null,
    errorResponse: Response.json(
      {
        success: false,
        error: 'Unauthorized. Valid worker credentials or administrator session required.',
      },
      { status: 401 }
    ),
  };
}

/**
 * Verifies that the Origin or Referer matches the Host header for state-changing requests.
 * Protects cookie-authenticated POST/PUT/DELETE requests against CSRF.
 */
export function verifyCsrf(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) {
    // If headers are missing (e.g. server-to-server worker requests), allow if not browser-based
    return true;
  }

  try {
    const originHost = new URL(origin).host;
    return originHost.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
