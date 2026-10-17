import { describe, expect, it } from 'vitest';
import {
  visitorSnapshot,
  defaultVisitorSettings,
  messageSource,
  extendVisitorCard,
} from './visitorRules.js';

const now = Date.parse('2026-10-17T12:00:00Z');
const account = {
  purchasedAt: null,
  expiresAt: null,
  paidMessages: 0,
  messagesUsed: 0,
  gamesUsed: {} as Record<string, number>,
  resetAt: '2026-10-18T00:00:00Z',
};
describe('visitor card rules', () => {
  it('shares ten free messages and three games across characters', () => {
    const state = visitorSnapshot(account, defaultVisitorSettings, now);
    expect(state.messages.remaining).toBe(10);
    expect(state.games.remaining).toBe(3);
  });
  it('upgrades without resetting usage and allows two games per character', () => {
    const state = visitorSnapshot(
      {
        ...account,
        purchasedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 86400000).toISOString(),
        messagesUsed: 10,
        gamesUsed: { daria: 1, maria: 2 },
      },
      defaultVisitorSettings,
      now,
    );
    expect(state.messages.remaining).toBe(20);
    expect(state.games.byCharacter.daria).toBe(1);
    expect(state.games.byCharacter.maria).toBe(0);
  });
  it('uses purchased messages only after the daily allowance and denies empty stock', () => {
    expect(messageSource({ ...account, paidMessages: 5 }, defaultVisitorSettings, now)).toBe(
      'daily',
    );
    expect(
      messageSource({ ...account, messagesUsed: 10, paidMessages: 5 }, defaultVisitorSettings, now),
    ).toBe('paid');
    expect(messageSource({ ...account, messagesUsed: 10 }, defaultVisitorSettings, now)).toBe(null);
  });
  it('retains ownership after expiry and falls back without refreshing usage', () => {
    const state = visitorSnapshot(
      {
        ...account,
        purchasedAt: '2026-09-01T00:00:00Z',
        expiresAt: new Date(now).toISOString(),
        messagesUsed: 15,
        gamesUsed: { daria: 2, maria: 2 },
      },
      defaultVisitorSettings,
      now,
    );
    expect(state.card).toMatchObject({ purchased: true, active: false });
    expect(state.messages.remaining).toBe(0);
    expect(state.games.remaining).toBe(0);
  });
  it('extends a current card and starts an expired card from server time', () => {
    expect(extendVisitorCard(new Date(now + 86400000).toISOString(), 30, now)).toBe(
      new Date(now + 31 * 86400000).toISOString(),
    );
    expect(extendVisitorCard(new Date(now - 1).toISOString(), 30, now)).toBe(
      new Date(now + 30 * 86400000).toISOString(),
    );
  });
});
