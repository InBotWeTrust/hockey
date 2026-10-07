import { describe, it, expect } from 'vitest';
import { ReplayBuffer } from './replay.js';
import type { BarShot } from './types.js';
const shot = (id: string): BarShot => ({
  id,
  userId: 'a',
  period: 1,
  index: Number(id),
  result: 'goal',
  createdAt: '2026-10-07T00:00:00Z',
  shooterX: 280,
  goalX: 286,
  goalieX: 300,
});
describe('spectator replay', () => {
  it('starts at live edge, deduplicates reconnect and plays both participants independently', () => {
    const buffer = new ReplayBuffer();
    buffer.push([shot('1')], true);
    expect(buffer.take('a')).toBeNull();
    buffer.push([shot('1'), shot('2'), { ...shot('3'), userId: 'b' }]);
    expect(buffer.take('a')?.id).toBe('2');
    expect(buffer.take('b')?.id).toBe('3');
    buffer.push([shot('2'), shot('3')]);
    expect(buffer.take('a')).toBeNull();
  });
  it('bounds queues and resets across matches', () => {
    const buffer = new ReplayBuffer();
    buffer.push([], true);
    buffer.push(Array.from({ length: 100 }, (_, i) => shot(String(i))));
    expect(buffer.take('a')?.id).toBe('80');
    buffer.reset();
    buffer.push([shot('0')]);
    expect(buffer.take('a')?.id).toBe('0');
  });
});
