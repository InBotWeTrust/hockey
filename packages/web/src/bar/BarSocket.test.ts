import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { BarSocket } from './BarSocket.js';
class Socket {
  static all: Socket[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: unknown = null;
  close = vi.fn();
  constructor(public url: string) {
    Socket.all.push(this);
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  closed(code = 1006) {
    this.onclose?.({ code } as CloseEvent);
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.all = [];
  vi.stubGlobal('WebSocket', Socket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const board = { online: [], upcoming: [], page: 0, hasMore: false };
function setup() {
  const onSnapshot = vi.fn(),
    onStatus = vi.fn(),
    refresh = vi.fn(async (): Promise<string | null> => null);
  return {
    onSnapshot,
    onStatus,
    refresh,
    client: new BarSocket({
      resource: 'page=0',
      getToken: () => 'unit-test',
      refresh,
      onSnapshot,
      onStatus,
    }),
  };
}
describe('bar transport', () => {
  it('becomes ready only after a snapshot and ignores malformed frames', () => {
    const t = setup();
    t.client.connect();
    const s = Socket.all[0]!;
    s.message({ bad: 1 });
    expect(t.onSnapshot).not.toHaveBeenCalled();
    s.message(board);
    expect(t.onStatus).toHaveBeenLastCalledWith('ready');
    t.client.disconnect();
    s.message(board);
    expect(t.onSnapshot).toHaveBeenCalledTimes(1);
  });
  it('reconnects and cleans retry timers on exit', async () => {
    const t = setup();
    t.client.connect();
    Socket.all[0]!.closed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(Socket.all).toHaveLength(2);
    Socket.all[1]!.closed();
    t.client.disconnect();
    await vi.advanceTimersByTimeAsync(30000);
    expect(Socket.all).toHaveLength(2);
  });
  it('ignores old socket close after tab return', () => {
    const t = setup();
    t.client.connect();
    const old = Socket.all[0]!;
    t.client.disconnect();
    t.client.connect();
    old.closed();
    Socket.all[1]!.message(board);
    expect(t.onStatus).toHaveBeenLastCalledWith('ready');
    t.client.disconnect();
  });
  it('stops on forbidden or invalid subscriptions without refreshing auth', () => {
    const t = setup();
    t.client.connect();
    Socket.all[0]!.closed(4403);
    expect(t.refresh).not.toHaveBeenCalled();
    expect(t.onStatus).toHaveBeenLastCalledWith('closed');
    t.client.disconnect();
  });
  it('does not reopen after an auth refresh finishes following exit', async () => {
    const t = setup();
    let resolve!: (v: string | null) => void;
    t.refresh.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    t.client.connect();
    Socket.all[0]!.closed(4401);
    t.client.disconnect();
    resolve('unit-test');
    await Promise.resolve();
    expect(Socket.all).toHaveLength(1);
  });
});
