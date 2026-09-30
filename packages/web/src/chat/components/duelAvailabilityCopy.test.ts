import { describe, expect, it } from 'vitest';
import { allFormatsBlockedCopy, duelAvailabilityCopy } from './duelAvailabilityCopy.js';

describe('duelAvailabilityCopy', () => {
  it('explains a full open-duel limit for the opponent', () => {
    expect(duelAvailabilityCopy({ available: false, reason: 'open_slots',
      player: 'opponent', retryAt: null })).toBe('У соперника уже две открытые дуэли.');
  });
  it('explains a format-specific monthly limit for the current player', () => {
    expect(duelAvailabilityCopy({ available: false, reason: 'format',
      player: 'self', retryAt: null })).toBe('У вас исчерпан месячный лимит этого формата.');
  });
  it('explains a tournament block before the modal is opened', () => {
    expect(duelAvailabilityCopy({ available: false, reason: 'tournament',
      player: 'opponent', retryAt: null })).toBe('У соперника сейчас недоступны обычные дуэли из-за турнира.');
  });
  it.each([
    ['daily', 'дневной'],
    ['weekly', 'недельный'],
    ['monthly', 'месячный'],
  ] as const)('names the opponent %s global limit without mentioning the current player', (reason, label) => {
    expect(duelAvailabilityCopy({ available: false, reason,
      player: 'opponent', retryAt: null })).toBe(
      `Соперник исчерпал ${label} лимит дуэлей. Пригласите его после обновления лимита.`,
    );
  });
  it('prioritizes the opponent global limit over format-specific blocks', () => {
    expect(allFormatsBlockedCopy({
      express: { available: false, reason: 'format', player: 'self', retryAt: null },
      express_plus: { available: false, reason: 'daily', player: 'opponent', retryAt: null },
      classic: { available: false, reason: 'daily', player: 'opponent', retryAt: null },
    })).toBe('Соперник исчерпал дневной лимит дуэлей. Пригласите его после обновления лимита.');
  });
  it('reports the current player global limit directly', () => {
    expect(allFormatsBlockedCopy({
      express: { available: false, reason: 'daily', player: 'self', retryAt: null },
      express_plus: { available: false, reason: 'daily', player: 'self', retryAt: null },
      classic: { available: false, reason: 'daily', player: 'self', retryAt: null },
    })).toBe('Вы исчерпали дневной лимит дуэлей.');
  });
  it('uses a separate message when only format limits prevent a shared format', () => {
    expect(allFormatsBlockedCopy({
      express: { available: false, reason: 'format', player: 'self', retryAt: null },
      express_plus: { available: false, reason: 'format', player: 'opponent', retryAt: null },
      classic: { available: false, reason: 'format', player: 'opponent', retryAt: null },
    })).toBe('Нет общих доступных форматов дуэли.');
  });
});
