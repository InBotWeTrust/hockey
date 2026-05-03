import type { ChatMessageDTO, ReactionGroupDTO } from './api.js';

interface Reactable {
  reactions: ReactionGroupDTO[];
}

interface ReactionEvent {
  type: 'reaction:added' | 'reaction:removed';
  userId: string;
  emoji: string;
}

// Apply a WS reaction event to a single message DTO. Returns the same
// reference when nothing changes (so React.memo / setQueryData stay cheap).
// Self-events are deduped against the local optimistic state via meId.
export function applyReactionEventToMessage(
  m: ChatMessageDTO,
  event: ReactionEvent,
  meId: string | null,
): ChatMessageDTO {
  const isMine = meId !== null && event.userId === meId;
  const existing = m.reactions.find((r) => r.emoji === event.emoji);

  if (event.type === 'reaction:added') {
    if (isMine && existing?.reactedByMe) return m;
    if (existing) {
      return {
        ...m,
        reactions: m.reactions.map((r) =>
          r.emoji === event.emoji
            ? { ...r, count: r.count + 1, reactedByMe: isMine ? true : r.reactedByMe }
            : r,
        ),
      };
    }
    return {
      ...m,
      reactions: [...m.reactions, { emoji: event.emoji, count: 1, reactedByMe: isMine }],
    };
  }

  // reaction:removed
  if (!existing) return m;
  if (isMine && existing.reactedByMe === false) return m;
  const nextCount = existing.count - 1;
  if (nextCount <= 0) {
    return { ...m, reactions: m.reactions.filter((r) => r.emoji !== event.emoji) };
  }
  return {
    ...m,
    reactions: m.reactions.map((r) =>
      r.emoji === event.emoji
        ? { ...r, count: nextCount, reactedByMe: isMine ? false : r.reactedByMe }
        : r,
    ),
  };
}

// Optimistic: drop my prev reaction (any other emoji) and add `emoji` as mine.
// Returns the same reference if I'm already on `emoji`.
export function switchMyReactionTo(m: ChatMessageDTO, emoji: string): ChatMessageDTO {
  return switchMyReactionToReactable(m, emoji);
}

export function switchMyReactionToReactable<T extends Reactable>(m: T, emoji: string): T {
  const mine = m.reactions.find((r) => r.reactedByMe);
  if (mine?.emoji === emoji) return m;

  let reactions: ReactionGroupDTO[] = m.reactions;

  // Drop mine.
  if (mine) {
    const nextCount = mine.count - 1;
    if (nextCount <= 0) {
      reactions = reactions.filter((r) => r.emoji !== mine.emoji);
    } else {
      reactions = reactions.map((r) =>
        r.emoji === mine.emoji ? { ...r, count: nextCount, reactedByMe: false } : r,
      );
    }
  }

  // Add new.
  const target = reactions.find((r) => r.emoji === emoji);
  if (target) {
    reactions = reactions.map((r) =>
      r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r,
    );
  } else {
    reactions = [...reactions, { emoji, count: 1, reactedByMe: true }];
  }

  return { ...m, reactions };
}

// Optimistic: remove my reaction with this emoji. No-op if not mine.
export function removeMyReaction(m: ChatMessageDTO, emoji: string): ChatMessageDTO {
  return removeMyReactionFromReactable(m, emoji);
}

export function removeMyReactionFromReactable<T extends Reactable>(m: T, emoji: string): T {
  const target = m.reactions.find((r) => r.emoji === emoji);
  if (!target || !target.reactedByMe) return m;
  const nextCount = target.count - 1;
  if (nextCount <= 0) {
    return { ...m, reactions: m.reactions.filter((r) => r.emoji !== emoji) };
  }
  return {
    ...m,
    reactions: m.reactions.map((r) =>
      r.emoji === emoji ? { ...r, count: nextCount, reactedByMe: false } : r,
    ),
  };
}
