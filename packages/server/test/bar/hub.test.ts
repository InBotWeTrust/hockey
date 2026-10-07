import { describe, it, expect, vi, afterEach } from 'vitest';
import { SnapshotHub } from '../../src/bar/hub.js';

afterEach(() => vi.useRealTimers());
describe('spectator snapshot fanout', () => {
  it('shares a read for concurrent viewers, sends only changes and stops without viewers', async () => {
    vi.useFakeTimers();
    let value = { score: 0 };
    const load = vi.fn(async () => value);
    const hub = new SnapshotHub(load, 2000, vi.fn());
    const first = vi.fn();
    const second = vi.fn();
    const off1 = hub.subscribe('board:0', first);
    const off2 = hub.subscribe('board:0', second);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(first).toHaveBeenCalledTimes(1);
    value = { score: 1 };
    await vi.advanceTimersByTimeAsync(2000);
    expect(first).toHaveBeenLastCalledWith(JSON.stringify(value));
    off1();
    off2();
    const reads = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(load).toHaveBeenCalledTimes(reads);
    hub.close();
  });
  it('recovers failed reads and does not send to a subscriber that closed during loading', async () => {
    vi.useFakeTimers();
    const failure = vi.fn();
    const load = vi.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue({ score: 2 });
    const hub = new SnapshotHub(load, 2000, failure);
    const receive = vi.fn();
    const off = hub.subscribe('match:x', receive);
    await vi.advanceTimersByTimeAsync(0);
    expect(failure).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(receive).toHaveBeenLastCalledWith(JSON.stringify({ score: 2 }));
    off();
    hub.close();
  });
  it('notifies viewers when reads fail, then restores the same prior snapshot', async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce({ score: 1 })
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue({ score: 1 });
    const hub = new SnapshotHub(load, 2000, vi.fn());
    const receive = vi.fn();
    hub.subscribe('board:0', receive);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(receive).toHaveBeenLastCalledWith(JSON.stringify({ error: 'unavailable' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(receive).toHaveBeenLastCalledWith(JSON.stringify({ score: 1 }));
    hub.close();
  });
  it('shares one refresh and serialization for a thousand viewers', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({ score: 1 }));
    const hub = new SnapshotHub(load, 2000, vi.fn());
    const receives = Array.from({ length: 1000 }, () => vi.fn());
    const offs = receives.map((receive) => hub.subscribe('board:0', receive));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(receives.every((receive) => receive.mock.calls.length === 1)).toBe(true);
    offs.forEach((off) => off());
    hub.close();
  });
  it('stops refreshing terminal snapshots while preserving the final result for viewers', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({ complete: true, score: 4 }));
    const hub = new SnapshotHub(load, 2000, vi.fn());
    const receive = vi.fn();
    hub.subscribe('match:duel:x', receive);
    await vi.advanceTimersByTimeAsync(10000);
    expect(load).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    hub.subscribe('match:duel:x', late);
    expect(late).toHaveBeenLastCalledWith(JSON.stringify({ complete: true, score: 4 }));
    hub.close();
  });
});
