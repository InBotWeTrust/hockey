// Single source of truth for allowed reaction emojis on the web.
// MUST stay in sync with packages/server/src/chat/whitelist.ts.

export const EMOJI_WHITELIST = [
  '👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏',
  '🙏', '💯', '🤔', '😍', '😡', '🥳', '😎', '🤩',
  '👎', '💔', '🤯', '🥶', '🤝', '🍻', '💪', '🎯',
] as const;

export type WhitelistEmoji = (typeof EMOJI_WHITELIST)[number];

// Top row shown in the long-press action menu shelf.
export const FAVORITE_EMOJI = EMOJI_WHITELIST.slice(0, 6) as readonly WhitelistEmoji[];

export function isWhitelistEmoji(s: string): s is WhitelistEmoji {
  return (EMOJI_WHITELIST as readonly string[]).includes(s);
}
