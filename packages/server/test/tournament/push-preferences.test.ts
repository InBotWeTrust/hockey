import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUSH_PREFERENCES,
  isPushEventAllowed,
  mapPushPreferencesRow,
} from '../../src/push/preferences.js';

describe('tournament push preferences', () => {
  it('enables tournament events by default', () => {
    expect(DEFAULT_PUSH_PREFERENCES.tournamentEvents).toBe(true);
    expect(mapPushPreferencesRow(undefined).tournamentEvents).toBe(true);
  });

  it('routes tournament notifications through their own preference', () => {
    expect(
      isPushEventAllowed(
        { ...DEFAULT_PUSH_PREFERENCES, tournamentEvents: false, duelEvents: true },
        'tournament.fixture_opened',
      ),
    ).toBe(false);
  });
});
