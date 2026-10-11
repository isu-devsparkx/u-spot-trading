// ─── U-SPOT Cryptographic Session Service (Phase A Security) ────────────
// Provides server-side signed session tokens, HttpOnly cookie lifecycle,
// and tamper-resistant user context without trusting client-side values.

import { createHmac, timingSafeEqual } from 'crypto';
import type { UserProfile, UserRole } from '../../types/index.ts';

export interface CookieJarHolder {
  cookies: {
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
    delete: (name: string) => void;
  };
}

export const SESSION_COOKIE_NAME = 'uspot_session';
export const LEGACY_COOKIE_NAME = 'uspot_user_id';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  issuedAt: number;
  expiresAt: number;
}

/** Default session lifetime: 7 days in milliseconds */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }
  // Safe runtime fallback for development / offline tests
  return 'uspot-phase-a-secure-development-session-signing-secret-key-32b';
}

/**
 * Base64 URL encode a string or Buffer
 */
function base64UrlEncode(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64url');
}

/**
 * Base64 URL decode to string
 */
function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/**
 * Signs a payload string with HMAC-SHA256
 */
function signPayload(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Creates a signed compact session token
 */
export function createSessionToken(
  user: UserProfile,
  ttlMs: number = SESSION_TTL_MS
): string {
  const now = Date.now();
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email.toLowerCase().trim(),
    name: user.name,
    role: user.role,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadB64, getAuthSecret());

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a signed session token. Returns the validated SessionPayload or null if invalid/expired/tampered.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  try {
    const expectedSig = signPayload(payloadB64, getAuthSecret());

    // Constant-time signature comparison to prevent timing attacks
    const providedBuf = Buffer.from(providedSig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');

    if (providedBuf.length !== expectedBuf.length) {
      return null;
    }

    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      return null;
    }

    const payloadJson = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadJson) as SessionPayload;

    if (!payload.userId || !payload.email || !payload.role || !payload.expiresAt) {
      return null;
    }

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the active session from an incoming HTTP request.
 * Reads the signed HttpOnly cookie or Authorization Bearer header.
 */
export function getSessionFromRequest(
  request: Request | { cookies?: { get?: (name: string) => { value: string } | undefined }; headers: Headers }
): SessionPayload | null {
  let token: string | undefined;

  // 1. Check cookies
  if ('cookies' in request && typeof request.cookies?.get === 'function') {
    token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  } else {
    // Standard Request headers
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) {
      token = match[1];
    }
  }

  // 2. Fall back to Authorization: Bearer <token>
  if (!token) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const candidate = authHeader.slice(7).trim();
      // Only treat as session token if it has the dot-separated signature format
      if (candidate.includes('.')) {
        token = candidate;
      }
    }
  }

  if (!token) return null;

  return verifySessionToken(token);
}

/**
 * Attaches the signed HttpOnly session cookie to an outgoing response
 */
export function attachSessionCookie(
  response: CookieJarHolder,
  token: string,
  maxAgeSeconds = 7 * 24 * 60 * 60
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });

  // Always delete any legacy insecure cookie to clean up client state
  try {
    response.cookies.delete(LEGACY_COOKIE_NAME);
  } catch {
    // Non-fatal
  }
}

/**
 * Clears the session cookie on logout
 */
export function clearSessionCookie(response: CookieJarHolder): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
  try {
    response.cookies.delete(LEGACY_COOKIE_NAME);
  } catch {
    // Non-fatal
  }
}
