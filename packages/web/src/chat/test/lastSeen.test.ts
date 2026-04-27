import { describe, it, expect } from 'vitest';
import { formatLastSeen } from '../lastSeen.js';

const NOW = new Date('2026-04-27T15:30:00');

function iso(d: string): string {
  return new Date(d).toISOString();
}

describe('formatLastSeen', () => {
  it('returns null for null input', () => {
    expect(formatLastSeen(null, NOW)).toBeNull();
  });

  it('returns null for an unparseable iso', () => {
    expect(formatLastSeen('not-a-date', NOW)).toBeNull();
  });

  it('renders "в сети" when within 2-minute online window', () => {
    expect(formatLastSeen(iso('2026-04-27T15:29:30'), NOW)).toBe('в сети');
    expect(formatLastSeen(iso('2026-04-27T15:28:01'), NOW)).toBe('в сети');
  });

  it('renders minutes-ago for the next hour with russian plural', () => {
    expect(formatLastSeen(iso('2026-04-27T15:27:00'), NOW)).toBe('был 3 минуты назад');
    expect(formatLastSeen(iso('2026-04-27T15:29:00'), NOW)).toBe('в сети'); // online wins
    expect(formatLastSeen(iso('2026-04-27T14:35:00'), NOW)).toBe('был 55 минут назад');
    expect(formatLastSeen(iso('2026-04-27T15:25:00'), NOW)).toBe('был 5 минут назад');
    expect(formatLastSeen(iso('2026-04-27T14:49:00'), NOW)).toBe('был 41 минуту назад');
  });

  it('renders "сегодня в HH:MM" for earlier today (over an hour ago)', () => {
    expect(formatLastSeen(iso('2026-04-27T08:15:00'), NOW)).toBe('был сегодня в 08:15');
    expect(formatLastSeen(iso('2026-04-27T00:01:00'), NOW)).toBe('был сегодня в 00:01');
  });

  it('renders "вчера в HH:MM" for yesterday', () => {
    expect(formatLastSeen(iso('2026-04-26T22:10:00'), NOW)).toBe('был вчера в 22:10');
    expect(formatLastSeen(iso('2026-04-26T00:30:00'), NOW)).toBe('был вчера в 00:30');
  });

  it('renders "в <day> в HH:MM" for earlier this week', () => {
    // 2026-04-27 is a Monday, 2026-04-22 is the Wednesday before.
    expect(formatLastSeen(iso('2026-04-22T18:00:00'), NOW)).toBe('был в Ср в 18:00');
    // 2026-04-21 = Tuesday, 6 days back from a Monday.
    expect(formatLastSeen(iso('2026-04-21T09:00:00'), NOW)).toBe('был в Вт в 09:00');
  });

  it('renders absolute date for older entries', () => {
    expect(formatLastSeen(iso('2026-04-15T12:00:00'), NOW)).toBe('был 15.04.2026');
    expect(formatLastSeen(iso('2024-12-01T10:00:00'), NOW)).toBe('был 01.12.2024');
  });
});
