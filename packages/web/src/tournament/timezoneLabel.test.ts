import { describe, expect, it } from 'vitest';
import { tournamentTimezoneLabel, tournamentTimezoneOptionLabel } from './timezoneLabel.js';

describe('tournament timezone labels', () => {
  it('shows familiar city names instead of internal timezone identifiers', () => {
    expect(tournamentTimezoneLabel('Europe/Moscow')).toBe('МСК');
    expect(tournamentTimezoneOptionLabel('Europe/Moscow')).toBe('Москва (МСК)');
    expect(tournamentTimezoneLabel('America/Los_Angeles')).toBe('Лос-Анджелес');
    expect(tournamentTimezoneLabel('UTC')).toBe('Всемирное время');
  });
});
