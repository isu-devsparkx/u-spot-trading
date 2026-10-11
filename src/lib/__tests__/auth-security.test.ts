// ─── U-SPOT Phase A: Authentication & Session Security Tests ───────────
// Verifies:
// 1. Insecure unsigned cookie uspot_user_id cannot impersonate other users or administrators.
// 2. Cryptographically signed session tokens cannot be forged or tampered with.
// 3. Expired or malformed sessions fail closed.
// 4. Passwords use salted bcrypt hashing, with automatic seamless legacy SHA-256 migration.
// 5. Registration strictly defaults to 'user' role; admin claims are denied.
// 6. Server-side role authorization guards block regular users from administrative routes.
// 7. Internal worker token authorization blocks unauthorized invocations.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';

import {
  createSessionToken,
  verifySessionToken,
  getSessionFromRequest,
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
} from '../services/session-service.ts';
import { userService } from '../services/user-service.ts';
import { requireAuth, requireAdmin, requireWorkerOrAdmin } from '../auth-guard.ts';
import type { UserProfile } from '../../types/index.ts';

function createMockRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/protected', {
    headers: new Headers(headers),
  });
}

describe('Phase A: Authentication, Authorization & Session Security', () => {
  const adminProfile: UserProfile = {
    id: 'usr_admin_001',
    email: 'admin@uspot.trade',
    name: 'System Admin',
    role: 'admin',
    telegramEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const traderProfile: UserProfile = {
    id: 'usr_trader_002',
    email: 'trader@uspot.trade',
    name: 'Pro Trader',
    role: 'user',
    telegramEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('1. Signed Session Tokens & Tamper Resistance', () => {
    it('creates and verifies a valid signed session token', () => {
      const token = createSessionToken(adminProfile);
      assert.ok(typeof token === 'string' && token.includes('.'));

      const verified = verifySessionToken(token);
      assert.ok(verified !== null);
      assert.strictEqual(verified.userId, adminProfile.id);
      assert.strictEqual(verified.email, adminProfile.email);
      assert.strictEqual(verified.role, 'admin');
    });

    it('rejects tampered payload in session token', () => {
      const token = createSessionToken(traderProfile);
      const [payloadB64, sig] = token.split('.');

      // Attacker attempts to change role from 'user' to 'admin'
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      payload.role = 'admin';
      const forgedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

      const tamperedToken = `${forgedPayloadB64}.${sig}`;
      const verified = verifySessionToken(tamperedToken);

      assert.strictEqual(verified, null, 'Tampered token must be rejected');
    });

    it('rejects tampered or forged signature', () => {
      const token = createSessionToken(adminProfile);
      const [payloadB64] = token.split('.');
      const forgedToken = `${payloadB64}.fakeSignature1234567890abcdef`;

      const verified = verifySessionToken(forgedToken);
      assert.strictEqual(verified, null, 'Forged signature must be rejected');
    });

    it('rejects expired session tokens', () => {
      // Create token with negative TTL (already expired)
      const token = createSessionToken(adminProfile, -1000);
      const verified = verifySessionToken(token);
      assert.strictEqual(verified, null, 'Expired session must be rejected');
    });

    it('rejects malformed tokens', () => {
      assert.strictEqual(verifySessionToken(''), null);
      assert.strictEqual(verifySessionToken('invalid-token-no-dots'), null);
      assert.strictEqual(verifySessionToken('a.b.c'), null);
      // @ts-expect-error Testing runtime types
      assert.strictEqual(verifySessionToken(null), null);
    });
  });

  describe('2. Legacy Cookie Impersonation Invalidation', () => {
    it('rejects client spoofing via raw uspot_user_id cookie', () => {
      // Attacker sends only `uspot_user_id=usr_admin_001` without signed session
      const req = createMockRequest({
        cookie: `${LEGACY_COOKIE_NAME}=usr_admin_001`,
      });

      const session = getSessionFromRequest(req);
      assert.strictEqual(session, null, 'Raw unsigned uspot_user_id cookie must be completely ignored');
    });

    it('authenticates when valid signed uspot_session cookie is provided', () => {
      const validToken = createSessionToken(traderProfile);
      const req = createMockRequest({
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      });

      const session = getSessionFromRequest(req);
      assert.ok(session !== null);
      assert.strictEqual(session.userId, traderProfile.id);
      assert.strictEqual(session.role, 'user');
    });
  });

  describe('3. Password Hashing & Legacy SHA-256 Transparent Migration', () => {
    it('verifies seeded admin and trader credentials with bcrypt', async () => {
      const admin = await userService.verifyCredentials('admin@uspot.trade', 'admin123');
      assert.ok(admin !== null);
      assert.strictEqual(admin.role, 'admin');

      const trader = await userService.verifyCredentials('trader@uspot.trade', 'trader123');
      assert.ok(trader !== null);
      assert.strictEqual(trader.role, 'user');
    });

    it('rejects invalid password', async () => {
      const failed = await userService.verifyCredentials('admin@uspot.trade', 'wrong_password');
      assert.strictEqual(failed, null);
    });

    it('creates new users with modern bcrypt hash format', async () => {
      const testEmail = `newtrader_${Date.now()}@test.com`;
      const newUser = await userService.createUser({
        email: testEmail,
        password: 'securePassword99!',
        name: 'New Trader',
      });

      assert.strictEqual(newUser.role, 'user');

      // Verify the stored hash format
      const stored = await userService.getUserByEmail(testEmail);
      assert.ok(stored !== null);
      assert.ok(stored.passwordHash.startsWith('$2'), 'Password hash must be in bcrypt format');
    });

    it('transparently upgrades legacy SHA-256 hash to bcrypt on successful login', async () => {
      const migrationEmail = `legacy_${Date.now()}@test.com`;
      const legacyPassword = 'legacyPassword123';
      const legacySha256Hash = createHash('sha256').update(legacyPassword).digest('hex');

      // Seed a user with legacy SHA-256 hash directly
      await userService.createUser({
        email: migrationEmail,
        password: legacyPassword,
        name: 'Legacy User',
      });
      const userRecord = await userService.getUserByEmail(migrationEmail);
      assert.ok(userRecord !== null);

      // Force hash to legacy SHA-256
      userRecord.passwordHash = legacySha256Hash;
      assert.strictEqual(userRecord.passwordHash.length, 64);
      assert.ok(!userRecord.passwordHash.startsWith('$2'));

      // Authenticate with legacy credentials
      const authenticated = await userService.verifyCredentials(migrationEmail, legacyPassword);
      assert.ok(authenticated !== null);

      // Check that stored hash was automatically upgraded to bcrypt
      const upgradedRecord = await userService.getUserByEmail(migrationEmail);
      assert.ok(upgradedRecord !== null);
      assert.ok(upgradedRecord.passwordHash.startsWith('$2'), 'Hash must be automatically upgraded to bcrypt');
    });
  });

  describe('4. Privilege Escalation & Role Enforcement Guards', () => {
    it('strictly defaults registration to "user" role even if email contains "admin"', async () => {
      const email = `attacker_admin_${Date.now()}@domain.com`;
      const user = await userService.createUser({
        email,
        password: 'password123',
        name: 'Fake Admin',
      });

      assert.strictEqual(user.role, 'user', 'Cannot claim admin role via email address');
    });

    it('blocks regular users from administrator-only routes (requireAdmin)', () => {
      const traderToken = createSessionToken(traderProfile);
      const req = createMockRequest({
        cookie: `${SESSION_COOKIE_NAME}=${traderToken}`,
      });

      const guard = requireAdmin(req);
      assert.strictEqual(guard.isAuthorized, false);
      assert.ok(guard.errorResponse !== undefined);
      assert.strictEqual(guard.errorResponse.status, 403);
    });

    it('grants administrator access to verified admin session (requireAdmin)', () => {
      const adminToken = createSessionToken(adminProfile);
      const req = createMockRequest({
        cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
      });

      const guard = requireAdmin(req);
      assert.strictEqual(guard.isAuthorized, true);
      assert.strictEqual(guard.session?.role, 'admin');
    });

    it('authorizes background worker with valid CRON_SECRET (requireWorkerOrAdmin)', () => {
      const req = createMockRequest({
        authorization: `Bearer ${process.env.CRON_SECRET || 'dev-cron-secret'}`,
      });

      const guard = requireWorkerOrAdmin(req);
      assert.strictEqual(guard.isAuthorized, true);
      assert.strictEqual(guard.isWorker, true);
    });

    it('blocks unauthenticated requests to worker endpoints without valid secret or admin session', () => {
      const req = createMockRequest({
        authorization: 'Bearer wrong-secret',
      });

      const guard = requireWorkerOrAdmin(req);
      assert.strictEqual(guard.isAuthorized, false);
      assert.strictEqual(guard.errorResponse?.status, 401);
    });
  });
});
