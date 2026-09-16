import { afterEach, describe, expect, it } from 'vitest';
import { waitForWorkerTick } from '../../src/push/workerLoop.js';

describe('push worker loop', () => {
  const timers: NodeJS.Timeout[] = [];

  afterEach(() => {
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
  });

  it('keeps the process alive while waiting for its next tick', () => {
    const tick = waitForWorkerTick(60_000);
    timers.push(tick.timer);

    expect(tick.timer.hasRef()).toBe(true);
  });
});
