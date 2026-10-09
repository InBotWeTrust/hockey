import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { advanceFight, createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import type { FastifyInstance } from 'fastify';
import type { FightDuelAdapter } from '../../src/duel/amateur/fight/routes.js';
import { FightRuntime } from '../../src/duel/amateur/fight/runtime/manager.js';
const mocks = vi.hoisted(() => ({ getFight: vi.fn(), persist: vi.fn() }));
vi.mock('../../src/duel/amateur/fight/service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFight: mocks.getFight,
  persistAdvancedFight: mocks.persist,
}));
let runtime: FightRuntime;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  mocks.persist.mockReset();
});
afterEach(async () => {
  await runtime?.close();
  vi.useRealTimers();
});
function fixture(commit: () => Promise<void> = async () => {}, recovery = true) {
  let state = createFightState({ ...DEFAULT_FIGHT_RULES, version: 6, deliveryGraceMs: 0 }, 9900);
  state.hp = [5, 1];
  state = advanceFight(state, [], 9999).state;
  const fight = {
    id: 'fight',
    match_id: 'match',
    initiator_user_id: 'a',
    status: 'fighting',
    runtime_version: 1,
    engine_state: state,
    revision: 3,
  };
  mocks.getFight.mockResolvedValue(fight);
  let transactions = 0;
  const query = vi.fn(async (sql: string) =>
    sql.includes('returning *')
      ? {
          rows: [
            {
              ...fight,
              runtime_owner: 'owner',
              runtime_generation: 1,
              runtime_revision_limit: 1000003,
            },
          ],
        }
      : { rows: [fight], rowCount: 1 },
  );
  const publish = vi.fn(async () => {});
  const app = {
    pg: { query },
    realtime: { publish },
    log: { error: vi.fn() },
  } as unknown as FastifyInstance;
  const adapter = {
    prepare: async () => ({
      id: 'match',
      status: 'active',
      paused: true,
      nowMs: Date.now(),
      participants: [{ userId: 'a' }, { userId: 'b' }],
    }),
    transact: async (work: (c: unknown) => Promise<unknown>) => {
      transactions++;
      const result = await work({ query });
      if (transactions > 1) await commit();
      return result;
    },
  } as unknown as FightDuelAdapter;
  runtime = new FightRuntime(app, adapter);
  runtime.start(recovery);
  return { query, publish };
}
it('keeps the terminal result private until the result transaction commits', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { publish } = fixture(() => gate);
  const action = runtime.command('match', 'a', {
    type: 'fight:action',
    fightId: 'fight',
    phaseId: 0,
    seq: 1,
    actionId: 'hit',
    kind: 'attack',
    zone: 'head',
  });
  await vi.advanceTimersByTimeAsync(10);
  expect(await action).toMatchObject({ accepted: true });
  expect(mocks.persist).toHaveBeenCalledOnce();
  expect(runtime.view('match', 'a')).toMatchObject({
    fight: { status: 'fighting', engine_state: { hp: [5, 1] } },
  });
  expect(publish).not.toHaveBeenCalled();
  release();
  await vi.advanceTimersByTimeAsync(1);
  expect(runtime.view('match', 'a')).toBeNull();
  expect(publish).toHaveBeenCalledOnce();
});
it('retries a rolled-back result without publishing a false victory', async () => {
  fixture();
  mocks.persist.mockRejectedValueOnce(new Error('synthetic transaction failure'));
  const action = runtime.command('match', 'a', {
    type: 'fight:action',
    fightId: 'fight',
    phaseId: 0,
    seq: 1,
    actionId: 'hit',
    kind: 'attack',
    zone: 'head',
  });
  await vi.advanceTimersByTimeAsync(10);
  await action;
  expect(runtime.view('match', 'a')).toMatchObject({ fight: { status: 'fighting' } });
  await vi.advanceTimersByTimeAsync(100);
  expect(mocks.persist).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(160);
  expect(mocks.persist).toHaveBeenCalledTimes(2);
  expect(runtime.view('match', 'a')).toBeNull();
});
it('rejects a nonparticipant even when the room is already loaded', async () => {
  fixture();
  const pending = runtime.command('match', 'a', {
    type: 'fight:action',
    fightId: 'fight',
    phaseId: 0,
    seq: 1,
    actionId: 'move',
    kind: 'input',
    input: { direction: 0, guard: false, crouch: false },
  });
  await vi.advanceTimersByTimeAsync(10);
  await pending;
  await expect(
    runtime.command('match', 'outsider', {
      type: 'fight:action',
      fightId: 'fight',
      phaseId: 0,
      seq: 1,
      actionId: 'bad',
      kind: 'attack',
      zone: 'head',
    }),
  ).rejects.toMatchObject({ details: { reason: 'forbidden' } });
  expect(runtime.view('match', 'outsider')).toBeNull();
});

it('can disable background recovery scans in unrelated test applications', async () => {
 const {query}=fixture(undefined,false);
 await vi.advanceTimersByTimeAsync(1100);
 expect(query).not.toHaveBeenCalled();
});
