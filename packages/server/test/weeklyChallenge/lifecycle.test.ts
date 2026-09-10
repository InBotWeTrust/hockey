import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';
import { getWeeklyChallengeWindow } from '../../src/weeklyChallenge/schedule.js';
import { reconcileWeeklyChallengeLifecycle } from '../../src/weeklyChallenge/lifecycle.js';
import {
  claimWeeklyChallengeReward,
  getCurrentWeeklyChallenge,
  getWeeklyChallengeCatalog,
} from '../../src/weeklyChallenge/service.js';

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
    await pool.query(`truncate weekly_challenge_tasks, weekly_challenges restart identity cascade`);
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
      endAt: new Date('2026-09-30T16:00:00Z'),
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
    expect(await getAutomaticChallenges()).toEqual([
      expect.objectContaining({
        id: manualId,
        visible_from: new Date('2026-09-20T09:00:00Z'),
        join_open_at: new Date('2026-09-20T09:00:00Z'),
        end_at: new Date('2026-09-27T09:00:00Z'),
        is_active: false,
        join_enabled: false,
      }),
    ]);
  });

  it('shows an adopted draft at Sunday noon and excludes events at its normalized end', async () => {
    const id = await createSourceChallenge({
      startAt: new Date('2026-09-20T21:00:00Z'),
      endAt: new Date('2026-09-30T16:00:00Z'),
    });
    const user = await pool.query<{ id: string }>(
      `insert into users (id, display_name, timezone) values (gen_random_uuid(), 'Adoption player', 'Europe/Moscow') returning id`,
    );
    const userId = user.rows[0]!.id;
    await pool.query(`delete from weekly_challenge_tasks where challenge_id = $1`, [id]);
    await pool.query(
      `insert into weekly_challenge_tasks (challenge_id, type, target) values ($1, 'duel_invites_sent', 2)`,
      [id],
    );
    await reconcileAt(new Date('2026-09-15T09:00:00Z'));
    const before = await getWeeklyChallengeCatalog(pool, userId, new Date('2026-09-20T08:59:59Z'));
    expect(before.future).toEqual([]);
    const visible = await getWeeklyChallengeCatalog(pool, userId, new Date('2026-09-20T09:00:00Z'));
    expect(visible.future).toEqual([expect.objectContaining({ id })]);
    await reconcileAt(new Date('2026-09-20T21:00:00Z'));
    await pool.query(
      `insert into event_log (user_id, type, payload, created_at)
       values ($1::uuid, 'amateur_duel_challenge_accepted', jsonb_build_object('challenger_user_id', $1::uuid::text), '2026-09-27T08:59:59Z'),
              ($1::uuid, 'amateur_duel_challenge_accepted', jsonb_build_object('challenger_user_id', $1::uuid::text), '2026-09-27T09:00:00Z')`,
      [userId],
    );
    const current = await getCurrentWeeklyChallenge(pool, userId, new Date('2026-09-27T08:59:59Z'));
    expect(current.challenge).toMatchObject({
      endAt: '2026-09-27T09:00:00.000Z',
      canClaimReward: false,
      tasks: [expect.objectContaining({ progress: 1 })],
    });
    const ended = await getCurrentWeeklyChallenge(pool, userId, new Date('2026-09-27T09:00:00Z'));
    expect(ended.challenge).toBeNull();
  });

  it.each([false, true])(
    'does not launch a future legacy publication when disabled before Monday (initially disabled: %s)',
    async (initiallyDisabled) => {
      const id = await createSourceChallenge({
        startAt: new Date('2026-09-20T21:00:00Z'),
        endAt: new Date('2026-09-30T16:00:00Z'),
        isActive: true,
      });
      if (initiallyDisabled)
        await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);
      await reconcileAt(new Date('2026-09-15T09:00:00Z'));
      await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);
      await reconcileAt(new Date('2026-09-20T21:00:00Z'));
      const rows = await pool.query(
        `select id, is_active, launched_at, start_at from weekly_challenges where id = $1`,
        [id],
      );
      expect(rows.rows).toEqual([
        {
          id,
          is_active: false,
          launched_at: null,
          start_at: new Date('2026-09-27T21:00:00Z'),
        },
      ]);
      const userId = '11111111-1111-4111-8111-111111111111';
      expect(
        await getWeeklyChallengeCatalog(pool, userId, new Date('2026-09-20T21:00:00Z')),
      ).toEqual({ future: [], active: [], completed: [] });
      const client = await pool.connect();
      try {
        await expect(
          claimWeeklyChallengeReward(client, id, userId, new Date('2026-09-20T21:00:00Z')),
        ).rejects.toMatchObject({ statusCode: 409 });
      } finally {
        client.release();
      }
      await pool.query(`update weekly_challenges set title = 'Editable draft' where id = $1`, [id]);
      await pool.query(`update weekly_challenge_settings set enabled = true where id = true`);
      await reconcileAt(new Date('2026-09-21T09:00:00Z'));
      expect(await getAutomaticChallenges()).toEqual([
        expect.objectContaining({ id, title: 'Editable draft', is_active: false }),
      ]);
    },
  );

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

  it('clears an ended active legacy challenge before activating its delayed automatic replacement', async () => {
    const legacyChallengeId = await createSourceChallenge({
      title: 'Завершающаяся legacy-неделя',
      startAt: new Date('2026-09-13T21:00:00Z'),
      endAt: new Date('2026-09-23T09:00:00Z'),
      isActive: true,
    });
    const delayedChallengeId = await createSourceChallenge({
      title: 'Отложенная автоматическая неделя',
      startAt: new Date('2026-09-20T21:00:00Z'),
      endAt: new Date('2026-09-27T09:00:00Z'),
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));
    await reconcileAt(new Date('2026-09-27T22:00:00Z'));

    const rows = await pool.query<{ id: string; is_active: boolean }>(
      `select id, is_active
         from weekly_challenges
        where id = any($1::uuid[])
        order by id`,
      [[legacyChallengeId, delayedChallengeId]],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        { id: legacyChallengeId, is_active: false },
        { id: delayedChallengeId, is_active: true },
      ]),
    );
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
      endAt: new Date('2026-10-07T15:00:00Z'),
    });

    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const challenges = await getAutomaticChallenges();
    expect(challenges).toEqual([
      expect.objectContaining({
        id: delayedDraftId,
        title: 'Уже подготовленный delayed draft',
        start_at: new Date('2026-09-27T21:00:00Z'),
        visible_from: new Date('2026-09-27T09:00:00Z'),
        join_open_at: new Date('2026-09-27T09:00:00Z'),
        end_at: new Date('2026-10-04T09:00:00Z'),
        is_active: false,
        join_enabled: false,
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
    await reconcileAt(new Date('2026-09-20T21:00:00Z'));
    expect(await getAutomaticChallenges()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ start_at: new Date('2026-09-20T21:00:00Z'), is_active: true }),
      ]),
    );
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

  it('backfills launch only from active or reward evidence and leaves legacy rows unchanged', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`alter table weekly_challenges drop column launched_at`);
      const { rows } = await client.query<{ id: string; title: string }>(
        `insert into weekly_challenges (title, join_open_at, start_at, end_at, is_automatic, is_active)
         values ('active', '2026-09-01', '2026-09-01', '2026-09-07', true, true),
                ('claimed', '2026-08-01', '2026-08-01', '2026-08-07', true, false),
                ('draft', '2026-07-01', '2026-07-01', '2026-07-07', true, false),
                ('legacy', '2026-06-01', '2026-06-01', '2026-06-07', false, false)
         returning id, title`,
      );
      const user = await client.query<{ id: string }>(
        `insert into users (id, display_name, timezone) values (gen_random_uuid(), 'Migration user', 'Europe/Moscow') returning id`,
      );
      await client.query(
        `insert into weekly_challenge_reward_claims (challenge_id, user_id, coins, stars, experience) values ($1, $2, 1, 0, 0)`,
        [rows.find((row) => row.title === 'claimed')!.id, user.rows[0]!.id],
      );
      await client.query(
        await readFile(path.join(MIGRATIONS_DIR, '115_weekly_challenge_launch_marker.sql'), 'utf8'),
      );
      const result = await client.query(
        `select title, launched_at is not null as launched, launched_at = start_at as at_start from weekly_challenges order by title`,
      );
      expect(result.rows).toEqual([
        { title: 'active', launched: true, at_start: true },
        { title: 'claimed', launched: true, at_start: true },
        { title: 'draft', launched: false, at_start: null },
        { title: 'legacy', launched: false, at_start: null },
      ]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('repairs premature future launch markers while preserving participants and issued claims', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`insert into weekly_challenges (title, join_open_at, start_at, end_at, is_active, is_automatic, launched_at)
        values ('future', now() + interval '30 days', now() + interval '30 days', now() + interval '37 days', true, true, now() + interval '30 days'),
               ('claimed', now() + interval '40 days', now() + interval '40 days', now() + interval '47 days', false, true, now() + interval '40 days'),
               ('past', now() - interval '14 days', now() - interval '14 days', now() - interval '7 days', false, true, now() - interval '14 days')`);
      const user = await client.query<{ id: string }>(
        `insert into users (id, display_name, timezone) values (gen_random_uuid(), 'Repair user', 'Europe/Moscow') returning id`,
      );
      await client.query(
        `insert into weekly_challenge_participants (challenge_id, user_id) select id, $1 from weekly_challenges where title = 'future'`,
        [user.rows[0]!.id],
      );
      await client.query(
        `insert into weekly_challenge_reward_claims (challenge_id, user_id, coins, stars, experience) select id, $1, 1, 0, 0 from weekly_challenges where title = 'claimed'`,
        [user.rows[0]!.id],
      );
      await client.query(
        await readFile(
          path.join(MIGRATIONS_DIR, '116_weekly_challenge_future_publication.sql'),
          'utf8',
        ),
      );
      expect(
        (
          await client.query(
            `select title, is_active, launched_at is not null as launched from weekly_challenges order by title`,
          )
        ).rows,
      ).toEqual([
        { title: 'claimed', is_active: false, launched: true },
        { title: 'future', is_active: false, launched: false },
        { title: 'past', is_active: false, launched: true },
      ]);
      expect(
        (await client.query(`select count(*)::int as count from weekly_challenge_participants`))
          .rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (await client.query(`select count(*)::int as count from weekly_challenge_reward_claims`))
          .rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('leaves a due automatic week inactive when disabled before its start', async () => {
    const challengeId = await createSourceChallenge({
      startAt: new Date('2026-09-13T21:00:00Z'),
      endAt: new Date('2026-09-20T09:00:00Z'),
      isAutomatic: true,
      isActive: false,
    });
    await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);

    await reconcileAt(new Date('2026-09-14T09:00:00Z'));

    const challenge = await pool.query<{ is_active: boolean }>(
      `select is_active from weekly_challenges where id = $1`,
      [challengeId],
    );
    expect(challenge.rows).toEqual([{ is_active: false }]);
  });

  it('activates a due automatic week and keeps it active after disable until end', async () => {
    const challengeId = await createSourceChallenge({
      startAt: new Date('2026-09-13T21:00:00Z'),
      endAt: new Date('2026-09-20T09:00:00Z'),
      isAutomatic: true,
      isActive: false,
    });

    await reconcileAt(new Date('2026-09-14T09:00:00Z'));
    await pool.query(`update weekly_challenge_settings set enabled = false where id = true`);
    await reconcileAt(new Date('2026-09-15T09:00:00Z'));

    const active = await pool.query(
      `select is_active, launched_at from weekly_challenges where id = $1`,
      [challengeId],
    );
    expect(active.rows).toEqual([
      { is_active: true, launched_at: new Date('2026-09-14T09:00:00Z') },
    ]);

    await reconcileAt(new Date('2026-09-21T09:00:00Z'));
    const expired = await pool.query(
      `select is_active, launched_at, start_at from weekly_challenges where id = $1`,
      [challengeId],
    );
    expect(expired.rows).toEqual([
      {
        is_active: false,
        launched_at: new Date('2026-09-14T09:00:00Z'),
        start_at: new Date('2026-09-13T21:00:00Z'),
      },
    ]);
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
