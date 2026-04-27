import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ChatSocket } from '../ws.js';
import type { ChatEvent, ChatEventFrame } from '../api.js';

// --- Mock WebSocket --------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(_data: string): void {}
  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent);
  }

  // Test helpers
  fireOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  fireMessage(frame: ChatEventFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
  fireClose(code = 1006, reason = 'lost'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: false } as CloseEvent);
  }
}

function lastSocket(): MockWebSocket {
  const s = MockWebSocket.instances.at(-1);
  if (!s) throw new Error('no MockWebSocket instance was constructed');
  return s;
}

const baseFrame = (event: ChatEvent): ChatEventFrame => ({ v: 1, event });

const sampleEvent: ChatEvent = {
  type: 'chat:read',
  chatId: 'c1',
  userId: 'u1',
  lastReadAt: '2026-04-26T00:00:00.000Z',
};

describe('ChatSocket', () => {
  let onEvent: Mock;
  let onStatus: Mock;
  let getToken: Mock;
  let refresh: Mock;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    onEvent = vi.fn();
    onStatus = vi.fn();
    getToken = vi.fn(() => 'TOKEN-A');
    refresh = vi.fn(async () => 'TOKEN-B');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to /api/chat/ws with the token in the query string', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    const ws = lastSocket();
    expect(ws.url).toMatch(/\/api\/chat\/ws\?token=TOKEN-A$/);
    expect(onStatus).toHaveBeenCalledWith('connecting');
  });

  it('reports status open after the WS opens', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    expect(onStatus).toHaveBeenCalledWith('open');
  });

  it('parses incoming v:1 frames and forwards events', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireMessage(baseFrame(sampleEvent));
    expect(onEvent).toHaveBeenCalledWith(sampleEvent);
  });

  it('ignores malformed JSON frames without crashing', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().onmessage?.({ data: 'not-json' } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('ignores frames with unexpected protocol version', () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().onmessage?.({
      data: JSON.stringify({ v: 99, event: sampleEvent }),
    } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('ChatSocket reconnect', () => {
  let onEvent: Mock;
  let onStatus: Mock;
  let getToken: Mock;
  let refresh: Mock;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    onEvent = vi.fn();
    onStatus = vi.fn();
    getToken = vi.fn(() => 'TOKEN-A');
    refresh = vi.fn(async () => 'TOKEN-B');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconnects after an abnormal close with backoff (1s, 2s, 4s, ..., 30s cap)', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(1006, 'lost');
    expect(onStatus).toHaveBeenCalledWith('reconnecting');

    // 1s after the first abnormal close → second connection attempt.
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances.length).toBe(2);

    // Fail again — backoff doubles to 2s.
    lastSocket().fireClose(1006);
    await vi.advanceTimersByTimeAsync(1999);
    expect(MockWebSocket.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(3);
  });

  it('caps backoff at 30 s', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    // Fail repeatedly to push backoff past 30s.
    for (let i = 0; i < 10; i++) {
      lastSocket().fireClose(1006);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    // 11th attempt schedules at 30s, not 60s+.
    const before = MockWebSocket.instances.length;
    lastSocket().fireClose(1006);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(MockWebSocket.instances.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('on close 4401 calls refresh and reconnects with the new token', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(4401, 'unauthorized');

    // Let the refresh microtask settle, then advance backoff.
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances.at(-1)?.url).toMatch(/\?token=TOKEN-B$/);
  });

  it('on close 4401 + refresh failure closes for good (no reconnect loop)', async () => {
    refresh = vi.fn(async () => null);
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    const wasInstances = MockWebSocket.instances.length;
    lastSocket().fireClose(4401, 'unauthorized');
    await vi.runAllTimersAsync();
    expect(MockWebSocket.instances.length).toBe(wasInstances);
    expect(onStatus).toHaveBeenCalledWith('closed');
  });

  it('on close 4408 reconnects without calling refresh', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(4408, 'heartbeat lost');
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).not.toHaveBeenCalled();
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('disconnect() cancels any pending reconnect and stops further attempts', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(1006);
    sock.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(onStatus).toHaveBeenLastCalledWith('closed');
  });

  it('a successful OPEN resets backoff to 1s', async () => {
    const sock = new ChatSocket({ getToken, refresh, onEvent, onStatus });
    sock.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(1006); // attempt 2 scheduled at +1s
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().fireOpen();      // success — backoff resets
    lastSocket().fireClose(1006); // next reconnect should be at +1s, not +2s
    await vi.advanceTimersByTimeAsync(999);
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });
});
