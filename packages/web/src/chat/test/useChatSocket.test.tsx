import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChatSocket } from '../useChatSocket.js';
import { useChatStore } from '../chatStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import { chatKeys } from '../../lib/queryKeys.js';
import type { ChatDTO, ChatEvent, ChatEventFrame, ChatMessageDTO } from '../api.js';

// --- Reuse the MockWebSocket pattern from ws.test.ts ----------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  readonly OPEN = 1;
  url: string;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(_d: string): void {}
  close(code = 1000): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: code === 1000 } as CloseEvent);
  }
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  fireMessage(frame: ChatEventFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
  fireClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: false } as CloseEvent);
  }
}

const SELF = '00000000-0000-0000-0000-00000000aaaa';
const OTHER = '00000000-0000-0000-0000-00000000bbbb';

function Harness(): ReactNode {
  useChatSocket();
  return null;
}

interface InfinitePages {
  pages: ChatMessageDTO[][];
  pageParams: unknown[];
}

const fixtureMsg = (id: string, chatId: string, senderId: string): ChatMessageDTO => ({
  id,
  chatId,
  senderId,
  senderDisplayName: null,
  senderAvatarUrl: null,
  content: `msg-${id}`,
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-26T10:00:00.000Z',
  reactions: [],
});

function setup(): { qc: QueryClient; rerender: () => void; unmount: () => void } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
  return {
    qc,
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={qc}>
          <Harness />
        </QueryClientProvider>,
      ),
    unmount: () => view.unmount(),
  };
}

// ---------------------------------------------------------------------------

describe('useChatSocket lifecycle', () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not open a socket when there is no access token', () => {
    setup();
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it('opens a socket once the access token appears', async () => {
    const { rerender } = setup();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT1',
        refreshToken: 'RT1',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    rerender();
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]?.url).toMatch(/\?token=AT1$/);
  });

  it('closes the socket on unmount', async () => {
    const { unmount } = setup();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT1',
        refreshToken: 'RT1',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    const ws = MockWebSocket.instances[0]!;
    unmount();
    expect(ws.readyState).toBe(3);
  });

  it('rebuilds the socket when accessToken rotates', async () => {
    const { rerender } = setup();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT1',
        refreshToken: 'RT1',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    rerender();
    await act(async () => {
      useAuthStore.setState({
        accessToken: 'AT2',
        refreshToken: 'RT2',
        user: { id: SELF, displayName: 'Me' },
      });
    });
    rerender();
    // Old socket closed, new socket opened with new token.
    expect(MockWebSocket.instances.at(-1)?.url).toMatch(/\?token=AT2$/);
    expect(MockWebSocket.instances[0]?.readyState).toBe(3);
  });
});

describe('useChatSocket dispatch', () => {
  let qc: QueryClient;

  beforeEach(async () => {
    MockWebSocket.instances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    useAuthStore.setState({
      accessToken: 'AT1',
      refreshToken: 'RT1',
      user: { id: SELF, displayName: 'Me' },
    });
    useChatStore.setState({ unreadByChat: {}, activeChatId: null });
    const harness = setup();
    qc = harness.qc;
    // Seed a messages cache for "c1".
    qc.setQueryData<InfinitePages>(chatKeys.messages('c1'), {
      pages: [[fixtureMsg('m0', 'c1', OTHER)]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireOpen();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('message:new on a non-active chat: prepends to messages cache, increments unread, invalidates list', async () => {
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    const newMsg = fixtureMsg('m-new', 'c1', OTHER);
    const ev: ChatEvent = { type: 'message:new', chatId: 'c1', message: newMsg };
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: ev });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    expect(cached?.pages[0]?.[0]?.id).toBe('m-new');
    expect(useChatStore.getState().unreadByChat['c1']).toBe(1);
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.list() });
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.unread() });
  });

  it('regression: message:new with no cache yet does not write a shell — invalidates messages query so refetch picks it up', async () => {
    // Reproduces the "messages disappear" bug: a {pages:[[msg]]} shell here
    // would be overwritten when the in-flight initial fetchMessages resolves
    // (TanStack replaces the page for pageParam=undefined), and the WS
    // message would silently vanish until reload.
    expect(qc.getQueryData(chatKeys.messages('c-fresh'))).toBeUndefined();
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    const newMsg = fixtureMsg('m-fresh', 'c-fresh', OTHER);
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'message:new', chatId: 'c-fresh', message: newMsg },
      });
    });
    expect(qc.getQueryData(chatKeys.messages('c-fresh'))).toBeUndefined();
    expect(invalSpy).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c-fresh'),
    });
  });

  it('message:new dedup — same message id is prepended only once', async () => {
    const newMsg = fixtureMsg('m-dedup', 'c1', SELF);
    const ev: ChatEvent = { type: 'message:new', chatId: 'c1', message: newMsg };
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: ev });
      MockWebSocket.instances[0]?.fireMessage({ v: 1, event: ev });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    const ids = cached?.pages.flat().map((m) => m.id) ?? [];
    expect(ids.filter((id) => id === 'm-dedup').length).toBe(1);
  });

  it('message:new on the active chat: prepends, but does NOT bump unread', async () => {
    useChatStore.getState().setActive('c1');
    const newMsg = fixtureMsg('m-active', 'c1', OTHER);
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'message:new', chatId: 'c1', message: newMsg },
      });
    });
    expect(useChatStore.getState().unreadByChat['c1']).toBeUndefined();
  });

  it('message:deleted: patches the cached message to is_deleted=true, content=""', async () => {
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'message:deleted', chatId: 'c1', messageId: 'm0' },
      });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    const m0 = cached?.pages.flat().find((m) => m.id === 'm0');
    expect(m0?.isDeleted).toBe(true);
    expect(m0?.content).toBe('');
  });

  it('message:updated patches cached content and marks it edited', async () => {
    const updated = { ...fixtureMsg('m0', 'c1', OTHER), content: 'edited', isEdited: true };
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'message:updated', chatId: 'c1', message: updated },
      });
    });
    const cached = qc.getQueryData<InfinitePages>(chatKeys.messages('c1'));
    const m0 = cached?.pages.flat().find((m) => m.id === 'm0');
    expect(m0?.content).toBe('edited');
    expect(m0?.isEdited).toBe(true);
  });

  it('message:updated with no cache invalidates messages so the room refetches from REST', async () => {
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    const updated = fixtureMsg('m-missing', 'c-fresh-update', OTHER);
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'message:updated', chatId: 'c-fresh-update', message: updated },
      });
    });
    expect(invalSpy).toHaveBeenCalledWith({
      queryKey: chatKeys.messages('c-fresh-update'),
    });
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.list() });
  });

  it('chat:read: resets unread for that chat and invalidates /chat/unread', async () => {
    useChatStore.getState().setUnread({ c1: 5 });
    const invalSpy = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: {
          type: 'chat:read',
          chatId: 'c1',
          userId: SELF,
          lastReadAt: '2026-04-26T11:00:00.000Z',
        },
      });
    });
    expect(useChatStore.getState().unreadByChat['c1']).toBe(0);
    expect(invalSpy).toHaveBeenCalledWith({ queryKey: chatKeys.unread() });
  });

  it('chat:read from a DM counterpart updates read receipt state without resetting my unread', async () => {
    useChatStore.getState().setUnread({ c1: 5 });
    qc.setQueryData<ChatDTO[]>(chatKeys.list(), [
      {
        id: 'c1',
        type: 'direct',
        name: null,
        entityType: null,
        entityId: null,
        lastMessageAt: null,
        unreadCount: 5,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: {
          userId: OTHER,
          displayName: 'Other',
          avatarUrl: null,
          lastSeenAt: null,
          lastReadAt: null,
        },
        memberCount: 2,
        pinnedAt: null,
      },
    ]);

    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: {
          type: 'chat:read',
          chatId: 'c1',
          userId: OTHER,
          lastReadAt: '2026-04-26T11:00:00.000Z',
        },
      });
    });

    expect(useChatStore.getState().unreadByChat['c1']).toBe(5);
    const list = qc.getQueryData<ChatDTO[]>(chatKeys.list());
    expect(list?.[0]?.dmCounterpart?.lastReadAt).toBe('2026-04-26T11:00:00.000Z');
  });

  it('reaction:added (stranger): inserts pill in chatKeys.messages cache, count 1, reactedByMe=false', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z', reactions: [] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('reaction:removed (stranger): decrements; pill disappears at 0', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:removed', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([]);
  });

  it('reaction:added (self) is deduped when reactedByMe already true', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: SELF, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '🔥', count: 1, reactedByMe: true }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: SELF, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('reaction:removed (self) is deduped when pill no longer mine', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: SELF, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:removed', chatId: 'c1', messageId: 'm0', userId: SELF, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    // No-op: count not double-decremented to 0.
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('reaction:added when no cache exists for the chat: no crash, no patch', async () => {
    expect(qc.getQueryData(chatKeys.messages('c-unknown'))).toBeUndefined();
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c-unknown', messageId: 'm', userId: OTHER, emoji: '🔥' },
      });
    });
    expect(qc.getQueryData(chatKeys.messages('c-unknown'))).toBeUndefined();
  });

  it('switch via two stranger events (removed prev + added new) keeps state consistent', async () => {
    qc.setQueryData(chatKeys.messages('c1'), {
      pages: [[{ id: 'm0', chatId: 'c1', senderId: OTHER, content: 'x', replyToId: null,
                  isDeleted: false, createdAt: '2026-04-26T00:00:00.000Z',
                  reactions: [{ emoji: '❤️', count: 1, reactedByMe: false }] }]],
      pageParams: [undefined],
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:removed', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '❤️' },
      });
    });
    await act(async () => {
      MockWebSocket.instances[0]?.fireMessage({
        v: 1,
        event: { type: 'reaction:added', chatId: 'c1', messageId: 'm0', userId: OTHER, emoji: '🔥' },
      });
    });
    const data = qc.getQueryData<{ pages: ChatMessageDTO[][] }>(chatKeys.messages('c1'));
    expect(data?.pages[0]?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('on reconnect open: refetches list + active chat messages', async () => {
    useChatStore.getState().setActive('c1');
    const refetchSpy = vi.spyOn(qc, 'refetchQueries');
    await act(async () => {
      MockWebSocket.instances[0]?.fireClose(1006);
    });
    // ChatSocket would schedule a setTimeout for the real reconnect, but no fake
    // timers are installed here. Instead we synthesize the post-reconnect 'open'
    // by firing onOpen again on the same MockWebSocket — this hits the
    // `firstOpenRef === false` branch in useChatSocket exactly as a real
    // reconnect would.
    await act(async () => {
      MockWebSocket.instances[0]?.fireOpen();
    });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: chatKeys.list() });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: chatKeys.messages('c1') });
  });
});
