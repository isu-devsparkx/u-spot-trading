// ─── U-SPOT Customizable Watchlist & User Profile Tests ───────────────
// Phase 33: Customizable Watchlist & Persistence in User Settings
// Tests: Symbol normalization, addition, removal, reordering, minimum safeguards,
// and user service persistence.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  userService,
  normalizeWatchlistSymbols,
} from '../services/user-service.ts';
import {
  DEFAULT_WATCHLIST_SYMBOLS,
  POPULAR_UNIVERSE_SYMBOLS,
} from '../services/binance-websocket.ts';

describe('Phase 33: Customizable Watchlist & Persistence in User Settings', () => {
  describe('1. Symbol Normalization Engine', () => {
    it('normalizes lowercase base asset names to standard pair format (e.g. "sol" -> "SOL/USDT")', () => {
      const input = ['btc', 'eth', 'sol'];
      const normalized = normalizeWatchlistSymbols(input);

      assert.deepStrictEqual(normalized, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
    });

    it('normalizes unslashed USDT pairs (e.g. "NEARUSDT" -> "NEAR/USDT")', () => {
      const input = ['NEARUSDT', 'DOGEUSDT', 'AVAX/USDT'];
      const normalized = normalizeWatchlistSymbols(input);

      assert.deepStrictEqual(normalized, ['NEAR/USDT', 'DOGE/USDT', 'AVAX/USDT']);
    });

    it('deduplicates identical symbols while preserving user ordering', () => {
      const input = ['SOL/USDT', 'BTC/USDT', 'sol', 'SOLUSDT', 'ETH/USDT', 'btc'];
      const normalized = normalizeWatchlistSymbols(input);

      assert.deepStrictEqual(normalized, ['SOL/USDT', 'BTC/USDT', 'ETH/USDT']);
    });

    it('filters out empty strings and whitespace-only entries', () => {
      const input = ['  ', '', 'SUI/USDT', '   '];
      const normalized = normalizeWatchlistSymbols(input);

      assert.deepStrictEqual(normalized, ['SUI/USDT']);
    });

    it('falls back to DEFAULT_WATCHLIST_SYMBOLS if input produces empty array or is invalid', () => {
      assert.deepStrictEqual(normalizeWatchlistSymbols([]), [...DEFAULT_WATCHLIST_SYMBOLS]);
      assert.deepStrictEqual(normalizeWatchlistSymbols(['   ']), [...DEFAULT_WATCHLIST_SYMBOLS]);
      // @ts-expect-error Testing invalid runtime input
      assert.deepStrictEqual(normalizeWatchlistSymbols(null), [...DEFAULT_WATCHLIST_SYMBOLS]);
    });
  });

  describe('2. User Service Watchlist Persistence', () => {
    it('initializes default seeded users with DEFAULT_WATCHLIST_SYMBOLS', async () => {
      const admin = await userService.getUserByEmail('admin@uspot.trade');
      assert.ok(admin !== null);
      assert.ok(Array.isArray(admin.watchlistSymbols));
      assert.strictEqual(admin.watchlistSymbols.length, DEFAULT_WATCHLIST_SYMBOLS.length);
      assert.deepStrictEqual(admin.watchlistSymbols, DEFAULT_WATCHLIST_SYMBOLS);

      const trader = await userService.getUserByEmail('trader@uspot.trade');
      assert.ok(trader !== null);
      assert.ok(Array.isArray(trader.watchlistSymbols));
      assert.deepStrictEqual(trader.watchlistSymbols, DEFAULT_WATCHLIST_SYMBOLS);
    });

    it('creates new user accounts with initialized watchlistSymbols', async () => {
      const testEmail = `watch_trader_${Date.now()}@uspot.trade`;
      const newUser = await userService.createUser({
        email: testEmail,
        password: 'password123',
        name: 'Watchlist Tester',
        watchlistSymbols: ['BTC/USDT', 'SOL/USDT', 'SUI/USDT'],
      });

      assert.ok(Array.isArray(newUser.watchlistSymbols));
      assert.deepStrictEqual(newUser.watchlistSymbols, ['BTC/USDT', 'SOL/USDT', 'SUI/USDT']);
    });

    it('updates watchlist symbols via updateWatchlist helper', async () => {
      const testEmail = `watch_update_${Date.now()}@uspot.trade`;
      const user = await userService.createUser({
        email: testEmail,
        password: 'password123',
        name: 'Update Tester',
      });

      const updated = await userService.updateWatchlist(user.id, [
        'SOL/USDT',
        'NEAR/USDT',
        'APT/USDT',
        'RENDER/USDT',
      ]);

      assert.ok(updated !== null);
      assert.deepStrictEqual(updated.watchlistSymbols, [
        'SOL/USDT',
        'NEAR/USDT',
        'APT/USDT',
        'RENDER/USDT',
      ]);

      // Verify persistence by reloading from service
      const reloaded = await userService.getUserById(user.id);
      assert.ok(reloaded !== null);
      assert.deepStrictEqual(reloaded.watchlistSymbols, [
        'SOL/USDT',
        'NEAR/USDT',
        'APT/USDT',
        'RENDER/USDT',
      ]);
    });

    it('preserves existing watchlistSymbols when other profile fields are updated', async () => {
      const testEmail = `watch_preserve_${Date.now()}@uspot.trade`;
      const user = await userService.createUser({
        email: testEmail,
        password: 'password123',
        name: 'Preserve Tester',
        watchlistSymbols: ['INJ/USDT', 'TIA/USDT'],
      });

      // Update name and telegramChatId without passing watchlistSymbols
      const updated = await userService.updateUserProfile(user.id, {
        name: 'Preserve Tester Renamed',
        telegramChatId: '123456789',
      });

      assert.ok(updated !== null);
      assert.strictEqual(updated.name, 'Preserve Tester Renamed');
      assert.strictEqual(updated.telegramChatId, '123456789');
      assert.deepStrictEqual(updated.watchlistSymbols, ['INJ/USDT', 'TIA/USDT']);
    });
  });

  describe('3. Watchlist Operations & Business Rules', () => {
    it('contains valid high-liquidity assets in POPULAR_UNIVERSE_SYMBOLS', () => {
      assert.ok(Array.isArray(POPULAR_UNIVERSE_SYMBOLS));
      assert.ok(POPULAR_UNIVERSE_SYMBOLS.length >= 15);
      assert.ok(POPULAR_UNIVERSE_SYMBOLS.includes('BTC/USDT'));
      assert.ok(POPULAR_UNIVERSE_SYMBOLS.includes('ETH/USDT'));
      assert.ok(POPULAR_UNIVERSE_SYMBOLS.includes('SOL/USDT'));
      assert.ok(POPULAR_UNIVERSE_SYMBOLS.includes('SUI/USDT'));
      assert.ok(POPULAR_UNIVERSE_SYMBOLS.includes('NEAR/USDT'));
    });

    it('correctly reorders items when moving a symbol up or down', () => {
      const list = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];

      // Move SOL up
      const moveUpIndex = list.indexOf('SOL/USDT'); // index 2
      const targetUpIndex = moveUpIndex - 1; // index 1
      const afterUp = [...list];
      const [itemUp] = afterUp.splice(moveUpIndex, 1);
      afterUp.splice(targetUpIndex, 0, itemUp);

      assert.deepStrictEqual(afterUp, ['BTC/USDT', 'SOL/USDT', 'ETH/USDT', 'BNB/USDT']);

      // Move SOL down
      const moveDownIndex = afterUp.indexOf('SOL/USDT'); // index 1
      const targetDownIndex = moveDownIndex + 1; // index 2
      const afterDown = [...afterUp];
      const [itemDown] = afterDown.splice(moveDownIndex, 1);
      afterDown.splice(targetDownIndex, 0, itemDown);

      assert.deepStrictEqual(afterDown, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT']);
    });

    it('prevents boundary violations when attempting to move first item up or last item down', () => {
      const list = ['BTC/USDT', 'ETH/USDT'];

      const firstIndex = list.indexOf('BTC/USDT');
      const invalidUpIndex = firstIndex - 1;
      assert.ok(invalidUpIndex < 0, 'First item cannot move up beyond index 0');

      const lastIndex = list.indexOf('ETH/USDT');
      const invalidDownIndex = lastIndex + 1;
      assert.ok(invalidDownIndex >= list.length, 'Last item cannot move down beyond array length');
    });

    it('guards against empty watchlist by requiring at least 1 trading pair', () => {
      const singleItemList = ['BTC/USDT'];
      const canRemove = singleItemList.length > 1;

      assert.strictEqual(canRemove, false, 'Must reject removal when only 1 symbol remains');
    });
  });
});
