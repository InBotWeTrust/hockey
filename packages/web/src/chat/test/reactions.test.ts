import { describe, it, expect } from 'vitest';
import {
  EMOJI_WHITELIST,
  FAVORITE_EMOJI,
  isWhitelistEmoji,
} from '../reactions.js';

describe('web emoji whitelist', () => {
  it('has 24 entries', () => {
    expect(EMOJI_WHITELIST.length).toBe(24);
  });

  it('FAVORITE_EMOJI is the first 6 entries', () => {
    expect(FAVORITE_EMOJI).toHaveLength(6);
    expect(FAVORITE_EMOJI).toEqual(EMOJI_WHITELIST.slice(0, 6));
  });

  it('all entries are unique', () => {
    expect(new Set(EMOJI_WHITELIST).size).toBe(EMOJI_WHITELIST.length);
  });

  it('isWhitelistEmoji rejects unknown values', () => {
    expect(isWhitelistEmoji('🦄')).toBe(false);
    expect(isWhitelistEmoji('hello')).toBe(false);
  });

  it('matches the server-side whitelist (snapshot)', () => {
    // Lock the order. If you intentionally change the list, update both
    // packages/server/src/chat/whitelist.ts AND this snapshot.
    expect(EMOJI_WHITELIST).toEqual([
      '👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏',
      '🙏', '💯', '🤔', '😍', '😡', '🥳', '😎', '🤩',
      '👎', '💔', '🤯', '🥶', '🤝', '🍻', '💪', '🎯',
    ]);
  });
});
