import { describe, expect, it, vi } from 'vitest';
import { TournamentDraftSaveQueue } from './tournamentDraftSaveQueue.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type Snapshot = { title: string };
type Saved = { revision: number; title: string };

describe('TournamentDraftSaveQueue', () => {
  it('serializes writes and saves only the latest pending snapshot with the next revision', async () => {
    const first = deferred<Saved>();
    const second = deferred<Saved>();
    const save = vi
      .fn<[Snapshot, number], Promise<Saved>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queue = new TournamentDraftSaveQueue({
      initialRevision: 1,
      initialSnapshotKey: 'initial',
      save,
      revisionOf: (result) => result.revision,
    });

    queue.enqueue({ title: 'A' }, 'A');
    queue.enqueue({ title: 'B' }, 'B');
    queue.enqueue({ title: 'C' }, 'C');

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenNthCalledWith(1, { title: 'A' }, 1);

    first.resolve({ revision: 2, title: 'A' });
    await first.promise;
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(2, { title: 'C' }, 2);

    second.resolve({ revision: 3, title: 'C' });
    await expect(queue.flush()).resolves.toEqual({ revision: 3, title: 'C' });
    expect(queue.snapshotKey).toBe('C');
    expect(queue.status).toBe('saved');
  });

  it('keeps flush pending until the in-flight write is acknowledged', async () => {
    const pending = deferred<Saved>();
    const queue = new TournamentDraftSaveQueue({
      initialRevision: 4,
      initialSnapshotKey: 'initial',
      save: () => pending.promise,
      revisionOf: (result: Saved) => result.revision,
    });
    queue.enqueue({ title: 'Latest' }, 'latest');
    const flushed = queue.flush();
    let settled = false;
    void flushed.finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve({ revision: 5, title: 'Latest' });
    await expect(flushed).resolves.toEqual({ revision: 5, title: 'Latest' });
  });

  it('drops a newer pending edit when the form returns to the in-flight snapshot', async () => {
    const pending = deferred<Saved>();
    const save = vi.fn<[Snapshot, number], Promise<Saved>>().mockReturnValue(pending.promise);
    const queue = new TournamentDraftSaveQueue({
      initialRevision: 4,
      initialSnapshotKey: 'initial',
      save,
      revisionOf: (result: Saved) => result.revision,
    });

    queue.enqueue({ title: 'A' }, 'A');
    queue.enqueue({ title: 'B' }, 'B');
    queue.enqueue({ title: 'A' }, 'A');

    pending.resolve({ revision: 5, title: 'A' });
    await expect(queue.flush()).resolves.toEqual({ revision: 5, title: 'A' });
    expect(save).toHaveBeenCalledTimes(1);
    expect(queue.snapshotKey).toBe('A');
  });

  it('stays dirty after a failed write and retries the latest snapshot', async () => {
    const error = new Error('revision conflict');
    const save = vi
      .fn<[Snapshot, number], Promise<Saved>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ revision: 8, title: 'Retry' });
    const queue = new TournamentDraftSaveQueue({
      initialRevision: 7,
      initialSnapshotKey: 'initial',
      save,
      revisionOf: (result) => result.revision,
    });

    queue.enqueue({ title: 'Retry' }, 'retry');
    await expect(queue.flush()).rejects.toBe(error);
    expect(queue.status).toBe('error');
    expect(queue.snapshotKey).toBe('initial');

    queue.retry();
    await expect(queue.flush()).resolves.toEqual({ revision: 8, title: 'Retry' });
    expect(save).toHaveBeenNthCalledWith(2, { title: 'Retry' }, 7);
  });
});
