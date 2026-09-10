import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  TournamentSocket,
  type TournamentEventFrame,
  type TournamentRealtimeEvent,
} from './TournamentSocket.js';

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
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent);
  }

  fireOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  fireMessage(frame: TournamentEventFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  fireClose(code = 1006, reason = 'lost'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: false } as CloseEvent);
  }
}

function lastSocket(): MockWebSocket {
  const socket = MockWebSocket.instances.at(-1);
  if (!socket) throw new Error('no tournament socket exists');
  return socket;
}

const sampleEvent: TournamentRealtimeEvent = {
  type: 'tournament:fixture_update',
  fixtureId: '00000000-0000-4000-8000-000000000801',
  sequence: 10,
  payload: { live: { status: 'active' } },
};

describe('TournamentSocket', () => {
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

  it('connects to the participant fixture endpoint', () => {
    const socket = new TournamentSocket({
      fixtureId: sampleEvent.fixtureId,
      getToken,
      refresh,
      onEvent,
      onStatus,
    });

    socket.connect();

    expect(lastSocket().url).toMatch(
      /\/api\/tournaments\/fixtures\/00000000-0000-4000-8000-000000000801\/ws\?token=TOKEN-A$/,
    );
    expect(onStatus).toHaveBeenCalledWith('connecting');
  });

  it('forwards valid events once and ignores malformed or duplicate frames', () => {
    const socket = new TournamentSocket({
      fixtureId: sampleEvent.fixtureId,
      getToken,
      refresh,
      onEvent,
      onStatus,
    });
    socket.connect();
    lastSocket().fireOpen();

    lastSocket().fireMessage({ v: 1, event: sampleEvent });
    lastSocket().fireMessage({ v: 1, event: sampleEvent });
    lastSocket().onmessage?.({ data: '{not-json' } as MessageEvent);
    lastSocket().onmessage?.({ data: JSON.stringify({ v: 2, event: sampleEvent }) } as MessageEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(sampleEvent);
  });

  it('reconnects with exponential backoff and keeps event dedup across reconnects', async () => {
    const socket = new TournamentSocket({
      fixtureId: sampleEvent.fixtureId,
      getToken,
      refresh,
      onEvent,
      onStatus,
    });
    socket.connect();
    lastSocket().fireOpen();
    lastSocket().fireMessage({ v: 1, event: sampleEvent });
    lastSocket().fireClose();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(MockWebSocket.instances).toHaveLength(2);
    lastSocket().fireOpen();
    lastSocket().fireMessage({ v: 1, event: sampleEvent });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith('reconnecting');
  });

  it('refreshes an unauthorized session and reconnects with the rotated token', async () => {
    const socket = new TournamentSocket({
      fixtureId: sampleEvent.fixtureId,
      getToken,
      refresh,
      onEvent,
      onStatus,
    });
    socket.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose(4401, 'unauthorized');

    await vi.runAllTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(lastSocket().url).toMatch(/\?token=TOKEN-B$/);
  });

  it('cancels a pending reconnect when disconnected', async () => {
    const socket = new TournamentSocket({
      fixtureId: sampleEvent.fixtureId,
      getToken,
      refresh,
      onEvent,
      onStatus,
    });
    socket.connect();
    lastSocket().fireOpen();
    lastSocket().fireClose();

    socket.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith('closed');
  });
});
