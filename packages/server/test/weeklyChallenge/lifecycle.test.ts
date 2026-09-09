import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';
import { getWeeklyChallengeWindow } from '../../src/weeklyChallenge/schedule.js';
import { reconcileWeeklyChallengeLifecycle } from '../../src/weeklyChallenge/lifecycle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe('getWeeklyChallengeWindow', () => {
  it('uses Moscow boundaries before the Sunday noon cutoff', () => {
    expect(getWeeklyChallengeWindow(new Date('2026-09-13T08:59:59Z'))).toMatchObject({
      currentStart: new Date('2026-09-06T21:00:00Z'),
      currentEnd: new Date('2026-09-13T09:00:00Z'),
      nextStart: new Date('2026-09-13T21:00:00Z'),
    });
  });

  it('opens the next challenge at the Sunday noon cutoff', () => {
    expect(getWeeklyChallengeWindow(new Date('2026-09-13T09:00:00Z'))).toMatchObject({
      nextVisibleFrom: new Date('2026-09-13T09:00:00Z'),
      nextStart: new Date('2026-09-13T21:00:00Z'),
    });
  });

  it('starts a fresh window at Monday midnight Moscow time', () => {
    expect(getWeeklyChallengeWindow(new Date('2026-09-13T21:00:00Z'))).toMatchObject({
      currentStart: new Date('2026-09-13T21:00:00Z'),
      currentEnd: new Date('2026-09-20T09:00:00Z'),
      nextStart: new Date('2026-09-20T21:00:00Z'),
      nextVisibleFrom: new Date('2026-09-20T09:00:00Z'),
    });
  });

  it('keeps the Sunday 23:59:59 Moscow instant in the same scheduled week', () => {
    expect(getWeeklyChallengeWindow(new Date('2026-09-13T20:59:59Z'))).toMatchObject({
      currentStart: new Date('2026-09-06T21:00:00Z'),
      currentEnd: new Date('2026-09-13T09:00:00Z'),
      nextStart: new Date('2026-09-13T21:00:00Z'),
    });
  });
});

describe.skipIf(!hasIntegrationEnv)('automatic weekly challenge lifecycle schema', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  beforeEach(async () => {
    await pool.query(
      `truncate weekly_challenge_tasks, weekly_challenges restart identity cascade`,
    );
    await pool.query(`update weekly_challenge_settings set enabled = true where id = true`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('seeds enabled settings and enforces one automatic challenge per start time', async () => {
    const settings = await pool.query(
      `select enabled from weekly_challenge_settings where id = true`,
    );
    expect(settings.rows).toEqual([{ enabled: true }]);

    const visibleFrom = new Date('2026-09-07T06:00:00.000Z');
    const startAt = new Date('2026-09-08T06:00:00.000Z');
    const endAt = new Date('2026-09-15T06:00:00.000Z');

    await pool.query(
      `insert into weekly_challenges
         (title, join_open_at, visible_from, start_at, end_at, is_automatic)
       values ('A', $1, $1, $2, $3, true)`,
      [visibleFrom, startAt, endAt],
    );
    await expect(
      pool.query(
        `insert into weekly_challenges
           (title, join_open_at, visible_from, start_at, end_at, is_automatic)
         values ('B', $1, $1, $2, $3, true)`,
        [visibleFrom, startAt, endAt],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await pool.query(
      `insert into weekly_challenges
         (title, join_open_at, start_at, end_at)
       values ('C', $1, $2, $3), ('D', $1, $2, $3)`,
      [visibleFrom, startAt, endAt],
    );
    const manual = await pool.query(
      `select title, visible_from, is_automatic
         from weekly_challenges
        where title in ('C', 'D')
        order by title`,
    );
    expect(manual.rows).toEqual([
      { title: 'C', visible_from: startAt, is_automatic: false },
      { title: 'D', visible_from: startAt, is_automatic: false },
    ]);
  });

  async function createSourceChallenge({
    title = 'Шаблон недели',
    description = 'Скопировать без изменений',
    startAt = new Date('2026-09-13T21:00:00Z'),
    endAt = new Date('2026-09-20T09:00:00Z'),
    isAutomatic = false,
    isActive = false,
  }: {
    title?: string;
    description?: string;
    startAt?: Date;
    endAt?: Date;
    isAutomatic?: boolean;
    isActive?: boolean;
  } = {}): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into weekly_challenges
         (title, description, join_open_at, visible_from, start_at, end_at,
          is_automatic, is_active, join_enabled,
          reward_coins, reward_stars, reward_experience)
       values ($1, $2, $3, $3, $3, $4, $5, $6, true, 125, 7, 33)
       returning id`,
      [title, description, startAt, endAt, isAutomatic, isActive],
    );
    const challengeId = rows[0]!.id;
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
       values
         ($1, 'goals_scored', 'Забросить 100 шайб', 100, 3),
         ($1, 'duels_won', 'Выиграть 4 дуэли', 4, 8)`,
      [challengeId],
    );
    return challengeId;
  }

  async function reconcileAt(now: Date): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await reconcileWeeklyChallengeLifecycle(client, now);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function getAutomaticChallenges(): Promise<
    Array<{
      id: string;
      title: string;
      description: string;
      join_open_at: Date;
      visible_from: Date;
      start_at: Date;
      end_at: Date;
      is_active: boolean;
      join_enabled: boolean;
      reward_coins: number;
      reward_stars: number;
      reward_experience: number;
    }>
  > {
    const { rows } = await pool.query(
      `select id, title, description, join_open_at, visible_from, start_at, end_at,
              is_active, join_enabled, reward_coins, reward_stars, reward_experience
         from weekly_challenges
        where is_automatic
        order by start_at`,
    );
    return rows;
  }

  it('copies the latest configuration and ordered tasks into the next automatic week', async () => {
    await createSourceChallenge();

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges).toEqual([
      expect.objectContaining({
        title: 'Шаблон недели',
        description: 'Скопировать без изменений',
        join_open_at: new Date('2026-09-20T09:00:00Z'),
        visible_from: new Date('2026-09-20T09:00:00Z'),
        start_at: new Date('2026-09-20T21:00:00Z'),
        end_at: new Date('2026-09-27T09:00:00Z'),
        is_active: false,
        join_enabled: false,
        reward_coins: 125,
        reward_stars: 7,
        reward_experience: 33,
      }),
    ]);
    const tasks = await pool.query(
      `select type, title, target, sort_order
         from weekly_challenge_tasks
        where challenge_id = $1
        order by sort_order`,
      [challenges[0]!.id],
    );
    expect(tasks.rows).toEqual([
      { type: 'goals_scored', title: 'Забросить 100 шайб', target: 100, sort_order: 3 },
      { type: 'duels_won', title: 'Выиграть 4 дуэли', target: 4, sort_order: 8 },
    ]);
  });

  it('creates one next automatic week across repeated reconciliation calls', async () => {
    await createSourceChallenge();

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));
    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges).toHaveLength(1);
    const tasks = await pool.query(
      `select count(*)::int as count from weekly_challenge_tasks where challenge_id = $1`,
      [challenges[0]!.id],
    );
    expect(tasks.rows).toEqual([{ count: 2 }]);
  });

  it('adopts a manually configured row at the next start instead of adding a duplicate', async () => {
    await createSourceChallenge();
    const manualId = await createSourceChallenge({
      title: 'Ручная следующая неделя',
      description: 'Сохранить условия ручной настройки',
      startAt: new Date('2026-09-20T21:00:00Z'),
      endAt: new Date('2026-09-27T09:00:00Z'),
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const rows = await pool.query(
      `select id, title, description, is_automatic
         from weekly_challenges
        where start_at = '2026-09-20T21:00:00Z'::timestamptz`,
    );
    expect(rows.rows).toEqual([
      {
        id: manualId,
        title: 'Ручная следующая неделя',
        description: 'Сохранить условия ручной настройки',
        is_automatic: true,
      },
    ]);
    const tasks = await pool.query(
      `select type, title, target, sort_order
         from weekly_challenge_tasks
        where challenge_id = $1
        order by sort_order`,
      [manualId],
    );
    expect(tasks.rows).toEqual([
      { type: 'goals_scored', title: 'Забросить 100 шайб', target: 100, sort_order: 3 },
      { type: 'duels_won', title: 'Выиграть 4 дуэли', target: 4, sort_order: 8 },
    ]);
  });

  it('adopts an active manual row at the next start and preserves its configuration', async () => {
    await createSourceChallenge();
    const manualId = await createSourceChallenge({
      title: 'Активная ручная следующая неделя',
      description: 'Не потерять активную ручную конфигурацию',
      startAt: new Date('2026-09-20T21:00:00Z'),
      endAt: new Date('2026-09-27T09:00:00Z'),
      isActive: true,
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const rows = await pool.query(
      `select id, title, description, is_automatic
         from weekly_challenges
        where start_at = '2026-09-20T21:00:00Z'::timestamptz`,
    );
    expect(rows.rows).toEqual([
      {
        id: manualId,
        title: 'Активная ручная следующая неделя',
        description: 'Не потерять активную ручную конфигурацию',
        is_automatic: true,
      },
    ]);
    const tasks = await pool.query(
      `select type, title, target, sort_order
         from weekly_challenge_tasks
        where challenge_id = $1
        order by sort_order`,
      [manualId],
    );
    expect(tasks.rows).toEqual([
      { type: 'goals_scored', title: 'Забросить 100 шайб', target: 100, sort_order: 3 },
      { type: 'duels_won', title: 'Выиграть 4 дуэли', target: 4, sort_order: 8 },
    ]);
  });

  it('creates only the nearest automatic week after a multi-week gap', async () => {
    await createSourceChallenge({
      startAt: new Date('2026-08-03T21:00:00Z'),
      endAt: new Date('2026-08-10T09:00:00Z'),
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges.map((challenge) => challenge.start_at)).toEqual([
      new Date('2026-09-20T21:00:00Z'),
    ]);
  });

  it('delays the next automatic week until after an overlapping legacy active challenge ends', async () => {
    await createSourceChallenge({
      startAt: new Date('2026-09-13T21:00:00Z'),
      endAt: new Date('2026-09-23T09:00:00Z'),
      isActive: true,
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges.map((challenge) => challenge.start_at)).toEqual([
      new Date('2026-09-27T21:00:00Z'),
    ]);
  });

  it('moves and adopts a separate target draft after an overlapping legacy challenge', async () => {
    await createSourceChallenge({
      title: 'Действующая legacy-неделя',
      startAt: new Date('2026-09-13T21:00:00Z'),
      endAt: new Date('2026-09-23T09:00:00Z'),
      isActive: true,
    });
    const draftId = await createSourceChallenge({
      title: 'Переносимый ручной draft',
      description: 'Сохранить при переносе',
      startAt: new Date('2026-09-20T21:00:00Z'),
      endAt: new Date('2026-09-27T09:00:00Z'),
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges).toEqual([
      expect.objectContaining({
        id: draftId,
        title: 'Переносимый ручной draft',
        description: 'Сохранить при переносе',
        start_at: new Date('2026-09-27T21:00:00Z'),
        end_at: new Date('2026-10-04T09:00:00Z'),
      }),
    ]);
    const tasks = await pool.query(
      `select type, title, target, sort_order
         from weekly_challenge_tasks
        where challenge_id = $1
        order by sort_order`,
      [draftId],
    );
    expect(tasks.rows).toEqual([
      { type: 'goals_scored', title: 'Забросить 100 шайб', target: 100, sort_order: 3 },
      { type: 'duels_won', title: 'Выиграть 4 дуэли', target: 4, sort_order: 8 },
    ]);
  });

  it('adopts an existing delayed row instead of duplicating it after an overlap', async () => {
    await createSourceChallenge({
      title: 'Действующая legacy-неделя',
      startAt: new Date('2026-09-13T21:00:00Z'),
      endAt: new Date('2026-09-23T09:00:00Z'),
      isActive: true,
    });
    await createSourceChallenge({
      title: 'Ранний ручной draft',
      startAt: new Date('2026-09-20T21:00:00Z'),
      endAt: new Date('2026-09-27T09:00:00Z'),
    });
    const delayedDraftId = await createSourceChallenge({
      title: 'Уже подготовленный delayed draft',
      startAt: new Date('2026-09-27T21:00:00Z'),
      endAt: new Date('2026-10-04T09:00:00Z'),
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges).toEqual([
      expect.objectContaining({
        id: delayedDraftId,
        title: 'Уже подготовленный delayed draft',
        start_at: new Date('2026-09-27T21:00:00Z'),
      }),
    ]);
  });

  it('does not defer the next week for a future active manual challenge outside its interval', async () => {
    await createSourceChallenge();
    await createSourceChallenge({
      title: 'Будущая ручная неделя',
      startAt: new Date('2026-09-27T21:00:00Z'),
      endAt: new Date('2026-10-04T09:00:00Z'),
      isActive: true,
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges.map((challenge) => challenge.start_at)).toEqual([
      new Date('2026-09-20T21:00:00Z'),
    ]);
  });

  it('creates one automatic week when two open transactions reconcile concurrently', async () => {
    await createSourceChallenge();
    const first = await pool.connect();
    const second = await pool.connect();
    let firstInTransaction = false;
    let secondInTransaction = false;

    try {
      await first.query('begin');
      firstInTransaction = true;
      await second.query('begin');
      secondInTransaction = true;
      const { rows: firstPidRows } = await first.query<{ pid: number }>(
        `select pg_backend_pid() as pid`,
      );

      await reconcileWeeklyChallengeLifecycle(first, new Date('2026-09-15T09:00:00Z'));
      const secondReconcile = reconcileWeeklyChallengeLifecycle(
        second,
        new Date('2026-09-15T09:00:00Z'),
      );
      await waitForBlockedWriter(pool, firstPidRows[0]!.pid, /weekly_challenge_settings/);
      await first.query('commit');
      firstInTransaction = false;
      await secondReconcile;
      await second.query('commit');
      secondInTransaction = false;
    } finally {
      if (firstInTransaction) await first.query('rollback');
      if (secondInTransaction) await second.query('rollback');
      first.release();
      second.release();
    }

    const challenges = await getAutomaticChallenges();
    expect(challenges).toHaveLength(1);
    const tasks = await pool.query(
      `select count(*)::int as count from weekly_challenge_tasks where challenge_id = $1`,
      [challenges[0]!.id],
    );
    expect(tasks.rows).toEqual([{ count: 2 }]);
  });

  it('does not create a next automatic week while disabled', async () => {
    await createSourceChallenge();
    await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    expect(await getAutomaticChallenges()).toEqual([]);
  });

  it('does not invalidate an already-started automatic week while disabled', async () => {
    const startedChallengeId = await createSourceChallenge({ isAutomatic: true, isActive: true });
    await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const started = await pool.query(
      `select is_active, join_enabled from weekly_challenges where id = $1`,
      [startedChallengeId],
    );
    expect(started.rows).toEqual([{ is_active: true, join_enabled: true }]);
    expect(await getAutomaticChallenges()).toHaveLength(1);
  });

  it('schedules the next Monday instead of starting a challenge midweek after re-enable', async () => {
    await createSourceChallenge({
      startAt: new Date('2026-09-06T21:00:00Z'),
      endAt: new Date('2026-09-13T09:00:00Z'),
    });
    await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);

    await reconcileAt(new Date('2026-09-16T09:00:00Z'));
    await pool.query(`update weekly_challenge_settings set enabled = true where id = true`);
    await reconcileAt(new Date('2026-09-16T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges.map((challenge) => challenge.start_at)).toEqual([
      new Date('2026-09-20T21:00:00Z'),
    ]);
  });
});
