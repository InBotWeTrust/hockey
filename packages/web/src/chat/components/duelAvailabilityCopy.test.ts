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
  it('mentions both sides when all formats are blocked for different reasons', () => {
    expect(allFormatsBlockedCopy({
      express: { available: false, reason: 'format', player: 'self', retryAt: null },
      express_plus: { available: false, reason: 'format', player: 'opponent', retryAt: null },
      classic: { available: false, reason: 'format', player: 'opponent', retryAt: null },
    })).toBe('Нет доступных форматов. У вас исчерпан месячный лимит этого формата. У соперника исчерпан месячный лимит этого формата.');
  });
});
