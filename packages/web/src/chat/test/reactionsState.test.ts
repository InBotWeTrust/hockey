import { describe, it, expect } from 'vitest';
import {
  applyReactionEventToMessage,
  switchMyReactionTo,
  removeMyReaction,
} from '../reactionsState.js';
import type { ChatMessageDTO } from '../api.js';

const baseMsg: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: 'u-other',
  content: 'hi',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T00:00:00.000Z',
  reactions: [],
};

const ME = 'me-id';
const OTHER = 'other-id';

describe('applyReactionEventToMessage — WS event handler', () => {
  it('adds a new pill from a stranger (count 1, reactedByMe=false)', () => {
    const next = applyReactionEventToMessage(
      baseMsg,
      { type: 'reaction:added', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('increments existing pill from a stranger', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:added', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 3, reactedByMe: false }]);
  });

  it('decrements existing pill from a stranger; pill disappears at 0', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:removed', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([]);
  });

  it('reaction:removed for missing pill is a no-op (returns same reference)', () => {
    const next = applyReactionEventToMessage(
      baseMsg,
      { type: 'reaction:removed', userId: OTHER, emoji: '🔥' },
      ME,
    );
    expect(next).toBe(baseMsg);
  });

  it('dedup: my own added when reactedByMe is already true → no-op', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:added', userId: ME, emoji: '🔥' },
      ME,
    );
    expect(next).toBe(m);
  });

  it('dedup: my own removed when reactedByMe is already false → no-op', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }] };
    const next = applyReactionEventToMessage(
      m,
      { type: 'reaction:removed', userId: ME, emoji: '🔥' },
      ME,
    );
    expect(next).toBe(m);
  });

  it('my own added that has not been optimistically applied → applied, reactedByMe=true', () => {
    const next = applyReactionEventToMessage(
      baseMsg,
      { type: 'reaction:added', userId: ME, emoji: '🔥' },
      ME,
    );
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });
});

describe('switchMyReactionTo — optimistic switch', () => {
  it('first-add: creates new pill with reactedByMe=true', () => {
    const next = switchMyReactionTo(baseMsg, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('switch: drops my prev (different emoji), adds new', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '❤️', count: 3, reactedByMe: true }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next.reactions).toContainEqual({ emoji: '❤️', count: 2, reactedByMe: false });
    expect(next.reactions).toContainEqual({ emoji: '🔥', count: 1, reactedByMe: true });
  });

  it('switch where my prev had count=1 → prev pill disappears', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '❤️', count: 1, reactedByMe: true }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('idempotent: setting the same emoji that is already mine → no-op', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next).toBe(m);
  });

  it('add to a pill that exists from strangers → I join (count+1, reactedByMe=true)', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 2, reactedByMe: false }] };
    const next = switchMyReactionTo(m, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 3, reactedByMe: true }]);
  });
});

describe('removeMyReaction — optimistic remove', () => {
  it('removes my pill, count 1 → pill gone', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] };
    const next = removeMyReaction(m, '🔥');
    expect(next.reactions).toEqual([]);
  });

  it('removes my pill, count 3 → count=2, reactedByMe=false', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 3, reactedByMe: true }] };
    const next = removeMyReaction(m, '🔥');
    expect(next.reactions).toEqual([{ emoji: '🔥', count: 2, reactedByMe: false }]);
  });

  it('no-op when pill not mine', () => {
    const m = { ...baseMsg, reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] };
    const next = removeMyReaction(m, '🔥');
    expect(next).toBe(m);
  });

  it('no-op when pill not present', () => {
    const next = removeMyReaction(baseMsg, '🔥');
    expect(next).toBe(baseMsg);
  });
});
