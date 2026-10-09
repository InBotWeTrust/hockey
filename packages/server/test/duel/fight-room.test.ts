import { expect, it } from 'vitest';
import { createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { FightRoom } from '../../src/duel/amateur/fight/runtime/room.js';
const payload = (seq: number) => ({
  type: 'fight:action' as const,
  fightId: 'fight',
  phaseId: 0,
  seq,
  actionId: `action-${seq}`,
  kind: 'attack' as const,
  zone: 'head' as const,
});
const room = () =>
  new FightRoom('fight', createFightState({ ...DEFAULT_FIGHT_RULES, deliveryGraceMs: 0 }, 1000));
it('groups simultaneous attacks and acknowledges each exactly once', async () => {
  const r = room();
  const a = r.enqueue(0, payload(1), 1010);
  const b = r.enqueue(1, payload(1), 1010);
  r.tick(1010);
  expect(await a).toMatchObject({ accepted: true, seq: 1 });
  expect(await b).toMatchObject({ accepted: true, seq: 1 });
  expect(r.state.hp).toEqual([4, 4]);
  expect(r.state.responsive?.contacts).toHaveLength(2);
  expect(await r.enqueue(0, payload(1), 1020)).toEqual(await a);
  r.tick(1020);
  expect(r.state.hp).toEqual([4, 4]);
});
it('does not accept a changed duplicate or a previous fight', async () => {
  const r = room();
  const first = r.enqueue(0, payload(1), 1010);
  r.tick(1010);
  await first;
  await expect(r.enqueue(0, { ...payload(1), zone: 'body' }, 1020)).rejects.toThrow(
    'duplicate_payload_mismatch',
  );
  await expect(r.enqueue(0, { ...payload(2), fightId: 'old' }, 1020)).rejects.toThrow(
    'unknown_fight',
  );
});
it('retains crouch before attack and releases only the intended held inputs', async () => {
  const r = room();
  const input = {
    ...payload(1),
    kind: 'input' as const,
    input: { direction: 0 as const, crouch: true, guard: true },
  };
  const p1 = r.enqueue(0, input, 1001);
  const p2 = r.enqueue(0, payload(2), 1002);
  const p3 = r.enqueue(
    0,
    { ...input, seq: 3, actionId: 'release', input: { direction: 0, crouch: false, guard: false } },
    1003,
  );
  r.tick(1010);
  await Promise.all([p1, p2, p3]);
  expect(r.state.actions[0]?.zone).toBe('body');
  expect(r.state.hp).toEqual([5, 4]);
});
it('stops accepting input after ownership is lost and rejects pending work', async () => {
  const r = room();
  const pending = r.enqueue(0, payload(1), 1010);
  const rejected = expect(pending).rejects.toThrow('owner_lost');
  r.stop();
  await rejected;
  await expect(r.enqueue(0, payload(2), 1020)).rejects.toThrow('owner_lost');
  r.tick(1030);
  expect(r.state.hp).toEqual([5, 5]);
});

it('returns a structured rejection the socket can correlate and explain', async () => {
  const r = room();
  await expect(r.enqueue(0, { ...payload(1), phaseId: 7 }, 1010)).rejects.toMatchObject({
    code: 'conflict',
    details: { reason: 'old_phase' },
  });
});

it('does not replay idle history faster than positional fanout but processes new input immediately', async () => {
  const r = room();
  const hit = r.enqueue(0, payload(1), 1010);
  r.tick(1010);
  await hit;
  const previous = r.state;
  r.tick(1020);
  expect(r.state).toBe(previous);
  const held = r.enqueue(
    1,
    { ...payload(2), seq: 1, kind: 'input', input: { direction: -1, crouch: false, guard: true } },
    1021,
  );
  r.tick(1021);
  await held;
  expect(r.state.lastSeq[1]).toBe(1);
  r.tick(1071);
  expect(r.state.finalizedThroughMs).toBe(1071);
});

it('resumes at the unconsumed sequence after a deadline rejection', async () => {
  const r = room();
  const deadline = r.state.deadlineMs;
  await expect(r.enqueue(0, payload(1), deadline)).rejects.toThrow('late_action');
  r.tick(deadline);
  expect(r.state.status).toBe('sudden_death');
  expect(r.state.lastSeq[0]).toBe(0);
  const next = r.enqueue(0, { ...payload(1), phaseId: r.state.phaseId }, deadline + 1);
  r.tick(deadline + 1);
  expect(await next).toMatchObject({ accepted: true, seq: 1 });
});
