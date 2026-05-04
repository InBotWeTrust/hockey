import { describe, expect, it } from 'vitest';
import { DEFAULT_PUSH_PREFERENCES, isPushEventAllowed } from '../../src/push/preferences.js';

describe('push preferences', () => {
  it('maps chat push only to the first message in a new dialog', () => {
    expect(
      isPushEventAllowed(
        { ...DEFAULT_PUSH_PREFERENCES, chatNewDialogMessage: false },
        'chat.new_dialog_message',
      ),
    ).toBe(false);
    expect(isPushEventAllowed(DEFAULT_PUSH_PREFERENCES, 'chat.new_dialog_message')).toBe(true);
  });

  it('groups daily game events under the daily preference', () => {
    const preferences = { ...DEFAULT_PUSH_PREFERENCES, dailyGame: false };
    expect(isPushEventAllowed(preferences, 'daily.available')).toBe(false);
    expect(isPushEventAllowed(preferences, 'daily.unlocked_after_training')).toBe(false);
    expect(isPushEventAllowed(preferences, 'daily.period_ending')).toBe(false);
    expect(isPushEventAllowed(preferences, 'daily.break_finished')).toBe(false);
  });

  it('maps news posts to the game news preference', () => {
    expect(
      isPushEventAllowed({ ...DEFAULT_PUSH_PREFERENCES, gameNews: false }, 'news.posted'),
    ).toBe(false);
    expect(isPushEventAllowed(DEFAULT_PUSH_PREFERENCES, 'news.posted')).toBe(true);
  });
});
