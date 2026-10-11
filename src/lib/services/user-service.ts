// ─── U-SPOT User Management & Authentication Service ──────────────────
// Manages user profiles, role-based access (admin vs trader), and personal Telegram routing

import { createHash, randomUUID } from 'crypto';
import { getSupabaseClient } from './supabase.ts';
import type { UserProfile, UserRole } from '../../types/index.ts';
import { DEFAULT_WATCHLIST_SYMBOLS } from './binance-websocket.ts';

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

/**
 * Normalizes watchlist symbols array: ensures uppercase, formats properly (e.g. BTC -> BTC/USDT),
 * deduplicates, and filters empty strings.
 */
export function normalizeWatchlistSymbols(symbols: string[]): string[] {
  if (!Array.isArray(symbols)) return [...DEFAULT_WATCHLIST_SYMBOLS];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of symbols) {
    if (!raw || typeof raw !== 'string') continue;
    let sym = raw.trim().toUpperCase();
    if (!sym) continue;
    if (!sym.includes('/')) {
      if (sym.endsWith('USDT')) {
        sym = `${sym.slice(0, -4)}/USDT`;
      } else {
        sym = `${sym}/USDT`;
      }
    }
    if (!seen.has(sym)) {
      seen.add(sym);
      result.push(sym);
    }
  }

  return result.length > 0 ? result : [...DEFAULT_WATCHLIST_SYMBOLS];
}

class UserStore {
  private users: Map<string, StoredUser> = new Map();

  constructor() {
    this.seedDefaultUsers();
  }

  private hashPassword(password: string): string {
    return createHash('sha256').update(password.trim()).digest('hex');
  }

  private seedDefaultUsers() {
    // Default Admin Account
    const adminUser: StoredUser = {
      id: 'usr_admin_001',
      email: 'admin@uspot.trade',
      passwordHash: this.hashPassword('admin123'),
      name: 'System Admin',
      role: 'admin',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
      telegramEnabled: true,
      alertPreferences: {
        onSignalCreated: true,
        onEntryFilled: true,
        onDcaFilled: true,
        onTpHit: true,
        onSlHit: true,
      },
      watchlistSymbols: [...DEFAULT_WATCHLIST_SYMBOLS],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Default Pro Trader Account
    const traderUser: StoredUser = {
      id: 'usr_trader_002',
      email: 'trader@uspot.trade',
      passwordHash: this.hashPassword('trader123'),
      name: 'Pro Trader',
      role: 'user',
      telegramChatId: null,
      telegramEnabled: false,
      alertPreferences: {
        onSignalCreated: true,
        onEntryFilled: true,
        onDcaFilled: true,
        onTpHit: true,
        onSlHit: true,
      },
      watchlistSymbols: [...DEFAULT_WATCHLIST_SYMBOLS],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.users.set(adminUser.email.toLowerCase(), adminUser);
    this.users.set(traderUser.email.toLowerCase(), traderUser);
  }

  /**
   * Look up a user by email
   */
  async getUserByEmail(email: string): Promise<StoredUser | null> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check memory first
    const memoryUser = this.users.get(normalizedEmail);
    if (memoryUser) return memoryUser;

    // Check Supabase if configured
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('user_profiles')
          .select('*')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (data && !error) {
          const user: StoredUser = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash,
            name: data.name,
            role: data.role || 'user',
            telegramChatId: data.telegram_chat_id,
            telegramEnabled: data.telegram_enabled ?? false,
            alertPreferences: data.alert_preferences || {
              onSignalCreated: true,
              onEntryFilled: true,
              onDcaFilled: true,
              onTpHit: true,
              onSlHit: true,
            },
            watchlistSymbols: data.watchlist_symbols || [...DEFAULT_WATCHLIST_SYMBOLS],
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          this.users.set(normalizedEmail, user);
          return user;
        }
      } catch {
        // Fall back to memory
      }
    }

    return null;
  }

  /**
   * Look up a user by ID
   */
  async getUserById(id: string): Promise<StoredUser | null> {
    for (const user of this.users.values()) {
      if (user.id === id) return user;
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('user_profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (data && !error) {
          const user: StoredUser = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash,
            name: data.name,
            role: data.role || 'user',
            telegramChatId: data.telegram_chat_id,
            telegramEnabled: data.telegram_enabled ?? false,
            alertPreferences: data.alert_preferences,
            watchlistSymbols: data.watchlist_symbols || [...DEFAULT_WATCHLIST_SYMBOLS],
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          this.users.set(user.email.toLowerCase(), user);
          return user;
        }
      } catch {
        // Fallback
      }
    }

    return null;
  }

  /**
   * Register a new user
   */
  async createUser(params: {
    email: string;
    password: string;
    name: string;
    telegramChatId?: string | null;
    role?: UserRole;
    watchlistSymbols?: string[];
  }): Promise<UserProfile> {
    const normalizedEmail = params.email.toLowerCase().trim();
    const existing = await this.getUserByEmail(normalizedEmail);
    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    // First user or explicitly assigned role
    const assignedRole: UserRole =
      params.role ||
      (this.users.size === 0 || normalizedEmail.includes('admin')
        ? 'admin'
        : 'user');

    const newUser: StoredUser = {
      id: `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      email: normalizedEmail,
      passwordHash: this.hashPassword(params.password),
      name: params.name.trim() || 'Trader',
      role: assignedRole,
      telegramChatId: params.telegramChatId?.trim() || null,
      telegramEnabled: Boolean(params.telegramChatId?.trim()),
      alertPreferences: {
        onSignalCreated: true,
        onEntryFilled: true,
        onDcaFilled: true,
        onTpHit: true,
        onSlHit: true,
      },
      watchlistSymbols: params.watchlistSymbols
        ? normalizeWatchlistSymbols(params.watchlistSymbols)
        : [...DEFAULT_WATCHLIST_SYMBOLS],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store in memory
    this.users.set(normalizedEmail, newUser);

    // Persist to Supabase if available
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('user_profiles').upsert({
          id: newUser.id,
          email: newUser.email,
          password_hash: newUser.passwordHash,
          name: newUser.name,
          role: newUser.role,
          telegram_chat_id: newUser.telegramChatId,
          telegram_enabled: newUser.telegramEnabled,
          alert_preferences: newUser.alertPreferences,
          created_at: newUser.createdAt,
          updated_at: newUser.updatedAt,
        });
      } catch (err) {
        console.warn('Could not persist user to Supabase user_profiles (table may not exist yet):', err);
      }
    }

    const { passwordHash: _, ...publicProfile } = newUser;
    return publicProfile;
  }

  /**
   * Authenticate a user with email & password
   */
  async verifyCredentials(
    email: string,
    password: string
  ): Promise<UserProfile | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;

    const inputHash = this.hashPassword(password);
    if (user.passwordHash !== inputHash) {
      return null;
    }

    const { passwordHash: _, ...publicProfile } = user;
    return publicProfile;
  }

  /**
   * Update an existing user's profile
   */
  async updateUserProfile(
    id: string,
    updates: Partial<UserProfile>
  ): Promise<UserProfile | null> {
    const user = await this.getUserById(id);
    if (!user) return null;

    const updatedUser: StoredUser = {
      ...user,
      name: updates.name !== undefined ? updates.name : user.name,
      telegramChatId:
        updates.telegramChatId !== undefined
          ? updates.telegramChatId?.trim() || null
          : user.telegramChatId,
      telegramEnabled:
        updates.telegramEnabled !== undefined
          ? updates.telegramEnabled
          : user.telegramEnabled,
      alertPreferences: updates.alertPreferences
        ? { ...user.alertPreferences, ...updates.alertPreferences }
        : user.alertPreferences,
      watchlistSymbols:
        updates.watchlistSymbols !== undefined
          ? normalizeWatchlistSymbols(updates.watchlistSymbols)
          : user.watchlistSymbols || [...DEFAULT_WATCHLIST_SYMBOLS],
      updatedAt: new Date().toISOString(),
    };

    this.users.set(user.email.toLowerCase(), updatedUser);

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('user_profiles').upsert({
          id: updatedUser.id,
          email: updatedUser.email,
          password_hash: updatedUser.passwordHash,
          name: updatedUser.name,
          role: updatedUser.role,
          telegram_chat_id: updatedUser.telegramChatId,
          telegram_enabled: updatedUser.telegramEnabled,
          alert_preferences: updatedUser.alertPreferences,
          watchlist_symbols: updatedUser.watchlistSymbols,
          updated_at: updatedUser.updatedAt,
        });
      } catch (err) {
        console.warn('Could not update user in Supabase user_profiles:', err);
      }
    }

    const { passwordHash: _, ...publicProfile } = updatedUser;
    return publicProfile;
  }

  /**
   * Update a user's customized watchlist symbols array
   */
  async updateWatchlist(
    id: string,
    symbols: string[]
  ): Promise<UserProfile | null> {
    return this.updateUserProfile(id, {
      watchlistSymbols: symbols,
    });
  }

  /**
   * Get all active users who have configured Telegram notifications
   */
  async getAllUsersWithTelegram(): Promise<UserProfile[]> {
    const recipients: UserProfile[] = [];

    // Query in-memory users
    for (const u of this.users.values()) {
      if (u.telegramEnabled && u.telegramChatId) {
        const { passwordHash: _, ...profile } = u;
        recipients.push(profile);
      }
    }

    // Try Supabase if configured
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('user_profiles')
          .select('*')
          .eq('telegram_enabled', true)
          .not('telegram_chat_id', 'is', null);

        if (data && !error) {
          for (const row of data) {
            if (!recipients.some((r) => r.id === row.id)) {
              recipients.push({
                id: row.id,
                email: row.email,
                name: row.name,
                role: row.role || 'user',
                telegramChatId: row.telegram_chat_id,
                telegramEnabled: true,
                alertPreferences: row.alert_preferences,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
              });
            }
          }
        }
      } catch {
        // Fallback to in-memory
      }
    }

    return recipients;
  }
}

export const userService = new UserStore();
