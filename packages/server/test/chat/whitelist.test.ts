import { describe, it, expect } from 'vitest';
import { EMOJI_WHITELIST, isWhitelistEmoji } from '../../src/chat/whitelist.js';

describe('chat emoji whitelist', () => {
  it('has exactly 24 entries (3 rows × 8 cols in the picker)', () => {
    expect(EMOJI_WHITELIST.length).toBe(24);
  });

  it('all entries are unique', () => {
    expect(new Set(EMOJI_WHITELIST).size).toBe(EMOJI_WHITELIST.length);
  });

  it('isWhitelistEmoji accepts whitelisted values', () => {
    for (const e of EMOJI_WHITELIST) {
      expect(isWhitelistEmoji(e)).toBe(true);
    }
  });

  it('isWhitelistEmoji rejects unknown strings', () => {
    expect(isWhitelistEmoji('hello')).toBe(false);
    expect(isWhitelistEmoji('')).toBe(false);
    expect(isWhitelistEmoji('🦄')).toBe(false);
  });
});
