import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Fastify from 'fastify';
import { afterAll, beforeAll, expect, it, describe } from 'vitest';
import { SqlConflictStore, nextConflict } from './conflict.js';
import { SqlConversationStore } from './conversationStore.js';
import { OlegFightService, readBarAccess, assertBarAccess } from './olegFightService.js';
import { createOlegRuntime } from './olegBot.js';
import { olegFightRoutes } from './olegFightRoutes.js';
const url = process.env.BAR_OLEG_TEST_DATABASE_URL;
const enabled = !!url && url.includes('uh_bar_oleg_test_');
describe.skipIf(!enabled)('isolated Oleg persistence', () => {
  const pool = new Pool({ connectionString: url }),
    user = randomUUID(),
    other = randomUUID();
  const store = new SqlConversationStore(pool),
    conflicts = new SqlConflictStore(pool),
    service = new OlegFightService(pool);
  beforeAll(async () => {
    await pool.query(
      "insert into users(id,display_name,timezone) values($1,'Synthetic Oleg QA','Europe/Moscow'),($2,'Synthetic other QA','UTC')",
      [user, other],
    );
  });
  afterAll(async () => {
    await pool.query('delete from users where id=any($1::uuid[])', [[user, other]]);
    await pool.end();
  });
  it('atomically saves cross-character warnings, speaker and a single automatic fight', async () => {
    for (const [character, verdict] of [
      ['maria', 'sexual'],
      ['daria', 'sexual'],
      ['daria', 'insult'],
    ] as const) {
      const row = await store.read(user, character),
        id = randomUUID();
      expect((await store.reserve(user, character, id, row.revision)).kind).toBe('reserved');
      const state = await conflicts.state(user),
        effect = { ...nextConflict(state, verdict), day: state.day, category: verdict };
      const result = await store.complete(
        user,
        character,
        {
          id,
          user: 'Synthetic violation',
          assistant: 'Замечание',
          createdAt: new Date().toISOString(),
          ...(effect.kind !== 'warning'
            ? { speaker: 'oleg' as const, intervention: effect.kind }
            : {}),
        },
        [],
        effect,
      );
      if (effect.kind === 'fight') expect(result.turns.at(-1)?.fightId).toBeTruthy();
      expect((await store.reserve(user, character, id, result.revision)).kind).toBe('duplicate');
    }
    expect((await conflicts.state(user)).warnings).toBe(3);
    expect(
      (await pool.query('select id from bar_oleg_fights where user_id=$1', [user])).rows,
    ).toHaveLength(1);
    expect((await conflicts.state(other)).warnings).toBe(0);
  });
  it('rejects foreign fight access and repeated voluntary start does not create another fight', async () => {
    const a = await service.start(user),
      b = await service.start(user);
    expect(a).toBe(b);
    await expect(service.read(other, a)).rejects.toMatchObject({ statusCode: 404 });
    await expect(assertBarAccess(pool, user)).rejects.toMatchObject({ code: 'bar_fight_pending' });
  });
  it('recovers an elapsed fight after restart and locks until the daily reset only once', async () => {
    const id = await service.start(user),
      now = Date.now();
    await pool.query('update bar_oleg_fights set runtime=$2 where id=$1', [
      id,
      JSON.stringify(createOlegRuntime(now - 60000, 123)),
    ]);
    const restarted = new OlegFightService(pool);
    expect((await restarted.read(user, id)).outcome).toBe('loss');
    const first = await readBarAccess(pool, user);
    expect(first.blockedUntil).toBeTruthy();
    expect(first.fightId).toBe(id);
    expect(
      new Date(first.blockedUntil!).toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow' }),
    ).toBe('00:00:00');
    await restarted.read(user, id);
    expect((await readBarAccess(pool, user)).blockedUntil).toBe(first.blockedUntil);
    await restarted.acknowledge(user, id);
    expect((await readBarAccess(pool, user)).fightId).toBeNull();
    await expect(assertBarAccess(pool, user)).rejects.toMatchObject({ code: 'bar_closed' });
  });
  it('guards all bar HTTP endpoints including direct links while allowing result recovery', async () => {
    const app = Fastify();
    app.decorate('pg', pool);
    // Fastify plugin dependency registration is part of the production route contract.
    const fp = (await import('fastify-plugin')).default;
    await app.register(fp(async () => {}, { name: 'db' }));
    app.decorate(
      'authenticate',
      async (req: { user?: { id: string }; headers: Record<string, unknown> }) => {
        if (!req.headers.authorization)
          throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
        req.user = { id: String(req.headers.authorization) };
      },
    );
    await app.register(olegFightRoutes);
    for (const path of [
      '/bar/layout',
      '/bar/conversations/maria',
      '/bar/cards/lobby',
      '/bar/duel/example/chat',
    ])
      app.get(path, { preHandler: [app.authenticate] }, async () => ({ ok: true }));
    for (const path of [
      '/bar/layout',
      '/bar/conversations/maria',
      '/bar/cards/lobby',
      '/bar/duel/example/chat',
    ])
      expect((await app.inject({ url: path, headers: { authorization: user } })).statusCode).toBe(
        403,
      );
    expect(
      (await app.inject({ url: '/bar/access', headers: { authorization: user } })).statusCode,
    ).toBe(200);
    expect((await app.inject('/bar/access')).statusCode).toBe(401);
    await app.close();
  });
  it('expires daily warnings and blocked access without a reset job', async () => {
    await pool.query(
      "update bar_conflicts set day=current_date-3,blocked_until=now()-interval '1 second',intervening=true where user_id=$1",
      [user],
    );
    expect((await conflicts.state(user)).warnings).toBe(0);
    expect((await conflicts.state(user)).intervening).toBe(false);
    await expect(assertBarAccess(pool, user)).resolves.toBeUndefined();
  });
  it('does not save yesterday intervention or start a fight after midnight', async () => {
    const row = await store.read(other, 'maria'),
      id = randomUUID();
    await store.reserve(other, 'maria', id, row.revision);
    await expect(
      store.complete(
        other,
        'maria',
        {
          id,
          user: 'Synthetic old-day violation',
          assistant: 'Пойдём на улицу.',
          speaker: 'oleg',
          intervention: 'fight',
          createdAt: new Date().toISOString(),
        },
        [],
        { day: '2000-01-01', warnings: 3, intervening: false, kind: 'fight', category: 'insult' },
      ),
    ).rejects.toMatchObject({ code: 'conversation_stale' });
    expect((await store.read(other, 'maria')).turns).toHaveLength(0);
    expect((await readBarAccess(pool, other)).fightId).toBeNull();
    await store.release(other, 'maria', id);
  });
  it('deduplicates commands, rejects changed retries and retains the same fight across reads', async () => {
    const id = await service.start(other);
    await pool.query('update bar_oleg_fights set runtime=$2 where id=$1', [
      id,
      JSON.stringify(createOlegRuntime(Date.now() - 2000, 42)),
    ]);
    const a = await service.read(other, id);
    const command = {
      actionId: randomUUID(),
      seq: a.nextSeq,
      phaseId: a.state.phaseId,
      kind: 'input' as const,
      input: { direction: 0 as const, crouch: false, guard: true },
    };
    const first = await service.read(other, id, command);
    const retry = await service.read(other, id, command);
    expect(retry.nextSeq).toBe(first.nextSeq);
    await expect(
      service.read(other, id, { ...command, input: { ...command.input, guard: false } }),
    ).rejects.toMatchObject({ code: 'fight_conflict' });
    expect(
      (await pool.query('select * from bar_oleg_fight_commands where fight_id=$1', [id])).rows,
    ).toHaveLength(1);
    expect(await service.start(other)).toBe(id);
    // Synthetic terminal states exercise outcome persistence without trusting the client.
    for (const outcome of ['win', 'draw'] as const) {
      const runtime = createOlegRuntime(Date.now() - 1000, 1);
      runtime.state.status = outcome === 'draw' ? 'cancelled' : 'resolved';
      runtime.state.winner = outcome === 'win' ? 0 : null;
      runtime.state.endedAtMs = Date.now();
      await pool.query(
        "update bar_oleg_fights set runtime=$2,status='fighting',outcome=null where id=$1",
        [id, JSON.stringify(runtime)],
      );
      expect((await service.read(other, id)).outcome).toBe(outcome);
      expect((await readBarAccess(pool, other)).blockedUntil).toBeNull();
    }
    await service.acknowledge(other, id);
    const rematch = await service.start(other);
    expect(rematch).not.toBe(id);
    await pool.query(
      "update bar_oleg_fights set status='cancelled',outcome='cancelled',acknowledged=true where id=$1",
      [rematch],
    );
  });
  it('does not turn a technically cancelled fight into a loss on recovery', async () => {
    const id = await service.start(other);
    await pool.query(
      "update bar_oleg_fights set status='cancelled',outcome='cancelled',runtime=$2 where id=$1",
      [id, JSON.stringify(createOlegRuntime(Date.now() - 60000, 42))],
    );
    expect((await service.read(other, id)).outcome).toBe('cancelled');
    expect((await readBarAccess(pool, other)).blockedUntil).toBeNull();
    await service.acknowledge(other, id);
  });
});
