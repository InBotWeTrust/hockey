import { expect, it, vi } from 'vitest';
import { ShotSubmissionQueue } from './shotSubmissionQueue.js';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it('sends requests in order and reports all outstanding work', async () => {
  const changed = vi.fn();
  const queue = new ShotSubmissionQueue(changed);
  const one = deferred<number>();
  const two = vi.fn(async () => 2);
  const a = queue.enqueue(() => one.promise);
  const b = queue.enqueue(two);
  expect(queue.pending).toBe(2);
  expect(two).not.toHaveBeenCalled();
  one.resolve(1);
  expect(await a).toBe(1);
  expect(await b).toBe(2);
  expect(queue.pending).toBe(0);
  expect(changed).toHaveBeenLastCalledWith(0);
});
it.each(['rejected', 'unreconciled'] as const)(
  'abandons dependent shots after a %s first request',
  async (kind) => {
    const queue = new ShotSubmissionQueue(() => {});
    const one = deferred<number | null>();
    const two = vi.fn(async () => 2);
    const a = queue.enqueue(() => one.promise);
    const b = queue.enqueue(two);
    if (kind === 'rejected') {
      const check = expect(a).rejects.toThrow('offline');
      one.reject(new Error('offline'));
      await check;
    } else {
      one.resolve(null);
      expect(await a).toBeNull();
    }
    expect(await b).toBeNull();
    expect(two).not.toHaveBeenCalled();
    expect(queue.pending).toBe(0);
    expect(await queue.enqueue(async () => 3)).toBe(3);
  },
);
it('cancels another period without allowing its late response to release a new request', async () => {
  const queue = new ShotSubmissionQueue(() => {});
  const old = deferred<number>();
  const next = deferred<number>();
  const a = queue.enqueue(() => old.promise);
  const abandoned = vi.fn(async () => 2);
  const b = queue.enqueue(abandoned);
  queue.cancel();
  expect(await a).toBeNull();
  expect(await b).toBeNull();
  const c = queue.enqueue(() => next.promise);
  old.resolve(1);
  await Promise.resolve();
  expect(queue.pending).toBe(1);
  expect(abandoned).not.toHaveBeenCalled();
  next.resolve(3);
  expect(await c).toBe(3);
  expect(queue.pending).toBe(0);
});
