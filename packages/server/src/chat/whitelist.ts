// Single source of truth for allowed reaction emojis on the server.
// MUST stay in sync with packages/web/src/chat/reactions.ts (asserted
// by both whitelist.test.ts files via list length + content snapshot).

export const EMOJI_WHITELIST = [
  '👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏',
  '🙏', '💯', '🤔', '😍', '😡', '🥳', '😎', '🤩',
  '👎', '💔', '🤯', '🥶', '🤝', '🍻', '💪', '🎯',
] as const;

export type WhitelistEmoji = (typeof EMOJI_WHITELIST)[number];

export function isWhitelistEmoji(s: string): s is WhitelistEmoji {
  return (EMOJI_WHITELIST as readonly string[]).includes(s);
}
