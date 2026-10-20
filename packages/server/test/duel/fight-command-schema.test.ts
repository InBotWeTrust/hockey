import { expect, it } from 'vitest';
import { fightActionSchema } from '../../src/duel/amateur/fight/commands.js';
const base = {
  type: 'fight:action',
  fightId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  actionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  phaseId: 0,
  seq: 1,
};
it('accepts start/stop movement and rejects invalid directions and action fields', () => {
  for (const direction of [-1, 0, 1])
    expect(fightActionSchema.safeParse({ ...base, kind: 'move', direction }).success).toBe(true);
  expect(fightActionSchema.safeParse({ ...base, kind: 'move', direction: 2 }).success).toBe(false);
  expect(
    fightActionSchema.safeParse({ ...base, kind: 'move', direction: 1, zone: 'head' }).success,
  ).toBe(false);
  expect(
    fightActionSchema.safeParse({ ...base, kind: 'attack', zone: 'head', direction: 1 }).success,
  ).toBe(false);
});
