import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMigrations } from '../src/db/migrations.js';
import { lockTournament } from '../src/tournament/locks.js';
import { openTournamentFixtureSegment } from '../src/tournament/fixtureLifecycle.js';
import {
  dispatchTournamentCommunication,
  reconcilePlayoffDayStartingCommunications,
} from '../src/tournament/communications.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from './helpers/testDb.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../db/migrations',
);
const migrationName = '108_remove_daily_aggregate_tournaments.sql';
const startsAt = '2026-09-07T08:00:00Z';
const endsAt = '2026-09-07T09:00:00Z';
type Row = Record<string, unknown>;

describe.skipIf(!hasIntegrationEnv)('migration 108 removes daily aggregate tournaments', () => {
  let pool: Pool;
  let priorMigrationsDir: string;
  let users: string[];
  const removed = new Map<string, Row[]>();

  async function insert(table: string, values: Row, remove: boolean): Promise<Row> {
    const columns = Object.keys(values);
    const result = await pool.query<Row>(
      `insert into ${table} (${columns.join(', ')})
       values (${columns.map((_, index) => `$${index + 1}`).join(', ')}) returning *`,
      Object.values(values),
    );
    const row = result.rows[0]!;
    if (!removed.has(table)) removed.set(table, []);
    if (remove) removed.get(table)!.push(row);
    return row;
  }

  async function seedDuel(source: 'tournament' | 'challenge' | 'matchmaking', remove: boolean) {
    const match = await insert(
      'amateur_duel_match',
      {
        challenger_user_id: users[0],
        opponent_user_id: users[1],
        status: 'settled',
        source,
        rules_snapshot: {},
        match_seed: randomUUID(),
        starts_at: startsAt,
        ends_at: endsAt,
        game_core_version: 1,
        ranked: false,
      },
      remove,
    );
    await insert(
      'amateur_duel_participant',
      {
        match_id: match.id,
        user_id: users[0],
        side: 'challenger',
        state: 'completed',
      },
      remove,
    );
    await insert(
      'amateur_duel_period_log',
      {
        match_id: match.id,
        user_id: users[0],
        period_number: 1,
        started_at: startsAt,
        ended_at: endsAt,
        shots_taken: 1,
        goals: 1,
        duration_ms: 1000,
        closed_reason: 'quota',
      },
      remove,
    );
    await insert(
      'amateur_duel_rating_match',
      {
        match_id: match.id,
        user_id: users[0],
        season_key: '2026-09',
        points: 0,
      },
      remove,
    );
    await insert(
      'shot_session',
      {
        user_id: users[0],
        mode: 'amateur_duel',
        amateur_duel_match_id: match.id,
        period_number: 1,
        shot_index: 1,
        seed: 'duel-shot',
        input_payload: {},
        server_result: 'goal',
        game_core_version: 1,
      },
      remove,
    );
    for (const type of ['amateur_duel_settled', 'amateur_duel_inventory_reserved']) {
      await insert(
        'event_log',
        {
          user_id: users[0],
          type,
          payload: { match_id: match.id },
        },
        remove,
      );
    }
    await insert(
      'event_log',
      {
        user_id: users[0],
        type: 'shot_mismatch',
        payload: { mode: 'amateur_duel', amateur_duel_match_id: match.id },
      },
      remove,
    );
    // Similar-looking fields on unrelated events are not evidence of ownership.
    await insert(
      'event_log',
      {
        user_id: users[0],
        type: 'diagnostic_note',
        payload: { match_id: match.id },
      },
      false,
    );
    await insert(
      'event_log',
      {
        user_id: users[0],
        type: 'shot_mismatch',
        payload: { match_id: match.id },
      },
      false,
    );
    await insert(
      'currency_ledger',
      {
        user_id: users[0],
        reason: 'duel_entry_fee',
        available_delta: 0,
        reserved_delta: 0,
        balance_after: 0,
        reserved_after: 0,
        duel_match_id: match.id,
      },
      remove,
    );
    const template = await insert(
      'amateur_duel_template',
      {
        title: 'Migration duel template',
        is_active: false,
        starts_at: startsAt,
        ends_at: endsAt,
        period_speed_presets: '[]',
      },
      false,
    );
    await insert(
      'amateur_duel_matchmaking_ticket',
      {
        template_id: template.id,
        user_id: users[0],
        status: 'matched',
        expires_at: endsAt,
        matched_match_id: match.id,
        duel_kinds: '["classic"]',
      },
      remove,
    );
    return match.id;
  }

  async function seedTournament(source: 'daily_aggregate' | 'classic' | 'head_to_head') {
    const remove = source === 'daily_aggregate';
    const tournament = await insert(
      'tournament',
      {
        slug: `migration108-${source}`,
        title: source,
        regular_source: source,
        created_by: users[0],
        status: 'playoff',
      },
      remove,
    );
    const revision = await insert(
      'tournament_revision',
      {
        tournament_id: tournament.id,
        revision: 1,
        rules_snapshot: {},
        is_published: true,
        published_at: startsAt,
        created_by: users[0],
      },
      remove,
    );
    await insert(
      'tournament_revision',
      {
        tournament_id: tournament.id,
        revision: 2,
        rules_snapshot: {},
        created_by: users[0],
      },
      remove,
    );
    await pool.query('update tournament set published_revision_id = $2 where id = $1', [
      tournament.id,
      revision.id,
    ]);
    // Keep the expected target row current after setting the reverse revision FK.
    tournament.published_revision_id = revision.id;
    const participants = [];
    for (let index = 0; index < 3; index += 1) {
      participants.push(
        await insert(
          'tournament_participant',
          {
            tournament_id: tournament.id,
            user_id: users[index],
            state: index === 2 ? 'applied' : 'approved',
          },
          remove,
        ),
      );
    }
    const home = participants[0]!.id;
    const away = participants[1]!.id;
    const day = await insert(
      'tournament_matchday',
      {
        tournament_id: tournament.id,
        number: 1,
        local_date: '2026-09-07',
        starts_at: startsAt,
        ends_at: endsAt,
      },
      remove,
    );
    const round = await insert(
      'tournament_round',
      {
        tournament_id: tournament.id,
        matchday_id: day.id,
        stage: 'playoff',
        number: 1,
      },
      remove,
    );
    const series = await insert(
      'tournament_playoff_series',
      {
        tournament_id: tournament.id,
        round_id: round.id,
        bracket_position: 1,
        higher_seed_participant_id: home,
        lower_seed_participant_id: away,
        winner_participant_id: home,
        wins_required: 1,
        home_sequence: '["higher"]',
      },
      remove,
    );
    const fixture = await insert(
      'tournament_fixture',
      {
        tournament_id: tournament.id,
        round_id: round.id,
        series_id: series.id,
        fixture_number: 1,
        home_participant_id: home,
        away_participant_id: away,
        winner_participant_id: home,
        venue_owner_participant_id: home,
      },
      remove,
    );
    const segmentDuel = await seedDuel('tournament', remove);
    await insert(
      'tournament_fixture_segment',
      {
        fixture_id: fixture.id,
        sequence_number: 1,
        kind: 'regulation',
        duel_match_id: segmentDuel,
        rules_snapshot: {},
      },
      remove,
    );
    const gameDay = await insert(
      'tournament_round_game_day',
      {
        round_id: round.id,
        day_number: 1,
        local_date: '2026-09-07',
        first_game_local_time: '11:00',
        first_game_starts_at: startsAt,
        max_result_bearing_games: 1,
        readiness_duration: '5 minutes',
        planned_start_interval: '1 hour',
      },
      remove,
    );
    const attemptDuel = await seedDuel('tournament', remove);
    const attempt = await insert(
      'tournament_fixture_attempt',
      {
        fixture_id: fixture.id,
        round_game_day_id: gameDay.id,
        attempt_number: 1,
        kind: 'initial',
        scheduled_starts_at: startsAt,
        readiness_expires_at: '2026-09-07T08:05:00Z',
        hard_deadline_at: endsAt,
        is_result_bearing: true,
        winner_participant_id: home,
        amateur_duel_match_id: attemptDuel,
      },
      remove,
    );
    await insert(
      'tournament_next_game_choice',
      {
        fixture_attempt_id: attempt.id,
        participant_id: home,
        next_fixture_id: fixture.id,
        choice: 'scheduled',
        created_at: startsAt,
        expires_at: endsAt,
      },
      remove,
    );
    await insert(
      'tournament_incident',
      {
        tournament_id: tournament.id,
        series_id: series.id,
        fixture_id: fixture.id,
        fixture_attempt_id: attempt.id,
        kind: 'both_no_show',
      },
      remove,
    );
    await insert(
      'tournament_series_admin_decision',
      {
        series_id: series.id,
        winner_participant_id: home,
        reason: 'Migration fixture',
        requested_by: users[0],
        idempotency_key: randomUUID(),
      },
      remove,
    );
    await insert(
      'tournament_live_proposal',
      {
        fixture_id: fixture.id,
        proposed_by_participant_id: home,
        responded_by_participant_id: away,
        proposed_at: startsAt,
      },
      remove,
    );
    await insert(
      'tournament_daily_result',
      {
        tournament_id: tournament.id,
        participant_id: home,
        tournament_day: 1,
        player_local_date: '2026-09-07',
        goals: 1,
        shots: 1,
        finalized_at: endsAt,
      },
      remove,
    );
    await insert(
      'tournament_standing',
      { tournament_id: tournament.id, participant_id: home, rank: 1 },
      remove,
    );
    await insert(
      'tournament_adjustment',
      {
        tournament_id: tournament.id,
        fixture_id: fixture.id,
        participant_id: home,
        kind: 'score',
        payload: {},
        reason: 'Migration fixture',
        created_by: users[0],
      },
      remove,
    );
    const dispatch = await insert(
      'tournament_dispatch',
      {
        tournament_id: tournament.id,
        idempotency_key: randomUUID(),
        kind: 'push',
        event_key: 'tournament.manual',
        audience_snapshot: '[]',
        payload_snapshot: {},
      },
      remove,
    );
    await insert(
      'tournament_economy_event',
      {
        tournament_id: tournament.id,
        participant_id: home,
        idempotency_key: randomUUID(),
        kind: 'stage_reward',
        status: 'pending',
        coins: 0,
      },
      remove,
    );
    await insert(
      'tournament_readiness_hint_preference',
      { tournament_id: tournament.id, user_id: users[0] },
      remove,
    );
    await insert(
      'tournament_regular_podium_congratulation',
      {
        tournament_id: tournament.id,
        user_id: users[0],
        place: 1,
        tournament_title: source,
      },
      remove,
    );
    const session = await insert(
      'tournament_classic_session',
      {
        tournament_id: tournament.id,
        participant_id: home,
        matchday_id: day.id,
        tournament_day: 1,
        rules_snapshot: {},
        game_core_version: 1,
        session_seed: 'classic',
        closes_at: endsAt,
      },
      remove,
    );
    await insert(
      'tournament_classic_period',
      {
        session_id: session.id,
        period_number: 1,
        started_at: startsAt,
        ended_at: endsAt,
        shots_taken: 1,
        goals: 1,
        closed_reason: 'quota',
      },
      remove,
    );
    await insert(
      'tournament_classic_period_loadout',
      { session_id: session.id, period_number: 1 },
      remove,
    );
    await insert(
      'shot_session',
      {
        user_id: users[0],
        mode: 'tournament_classic',
        tournament_classic_session_id: session.id,
        period_number: 1,
        shot_index: 1,
        seed: 'classic-shot',
        input_payload: {},
        server_result: 'goal',
        game_core_version: 1,
      },
      remove,
    );
    for (const id of [
      tournament.id,
      fixture.id,
      home,
      series.id,
      attempt.id,
      dispatch.id,
      segmentDuel,
      attemptDuel,
    ]) {
      await insert(
        'push_delivery_log',
        {
          user_id: users[0],
          event_type: 'tournament.manual',
          event_key: `${id}:notification`,
          status: 'queued',
          payload: {},
        },
        remove,
      );
    }
    await insert(
      'event_log',
      {
        user_id: users[0],
        type: 'admin_tournament_lifecycle_enabled',
        payload: { tournamentId: tournament.id, automaticLifecycleVersion: 1 },
      },
      remove,
    );
    await insert(
      'event_log',
      {
        user_id: users[0],
        type: 'admin_tournament_application_rejected',
        payload: { tournament_id: tournament.id, participant_id: home },
      },
      remove,
    );
    await insert(
      'currency_ledger',
      {
        user_id: users[0],
        reason: 'tournament_entry_fee',
        available_delta: 0,
        reserved_delta: 0,
        balance_after: 0,
        reserved_after: 0,
        metadata: { tournament_id: tournament.id, participant_id: home },
      },
      remove,
    );
    const channel = await insert(
      'chats',
      {
        type: 'channel',
        name: `${source} announcements`,
        channel_slug: source,
        created_by: users[0],
      },
      false,
    );
    const announcement = await insert(
      'messages',
      {
        chat_id: channel.id,
        sender_id: users[0],
        content: 'Tournament announcement',
        metadata: {
          type: 'tournament_announcement',
          tournamentId: tournament.id,
          tournamentDispatchId: dispatch.id,
        },
      },
      remove,
    );
    await insert(
      'messages',
      {
        chat_id: channel.id,
        sender_id: users[0],
        content: 'Dispatch-only announcement',
        metadata: { tournamentDispatchId: dispatch.id },
      },
      remove,
    );
    await insert(
      'message_reactions',
      { message_id: announcement.id, user_id: users[0], emoji: '👍' },
      remove,
    );
    await insert(
      'channel_post_comments',
      {
        post_message_id: announcement.id,
        author_id: users[0],
        content: 'Tournament comment',
      },
      remove,
    );
    await insert(
      'messages',
      {
        chat_id: channel.id,
        sender_id: users[0],
        content: `Ordinary message mentioning ${tournament.id}`,
      },
      false,
    );
    const entityChat = await insert(
      'chats',
      {
        type: 'group',
        created_by: users[0],
        entity_type: 'tournament',
        entity_id: tournament.id,
      },
      remove,
    );
    await insert('chat_members', { chat_id: entityChat.id, user_id: users[0] }, remove);
    await insert(
      'messages',
      { chat_id: entityChat.id, sender_id: users[0], content: 'Tournament group message' },
      remove,
    );
    if (remove) {
      // Even an unexpected link from a legacy fixture must not delete an ordinary duel.
      const ordinaryDuel = await seedDuel('challenge', false);
      await insert(
        'tournament_fixture_segment',
        {
          fixture_id: fixture.id,
          sequence_number: 2,
          kind: 'overtime',
          duel_match_id: ordinaryDuel,
          rules_snapshot: {},
        },
        true,
      );
      await insert(
        'push_delivery_log',
        {
          user_id: users[0],
          event_type: 'daily.available',
          event_key: `${tournament.id}:notification`,
          status: 'queued',
          payload: { tournament_id: tournament.id },
        },
        false,
      );
      await insert(
        'push_delivery_log',
        {
          user_id: users[0],
          event_type: 'tournament.manual',
          event_key: `unrelated:${tournament.id}`,
          status: 'queued',
          payload: { body: `Only mentions ${tournament.id}` },
        },
        false,
      );
    }
    return tournament.id;
  }

  async function runMigration() {
    const sql = await readFile(path.join(migrationsDir, migrationName), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function waitForAdvisoryWait(observer: PoolClient) {
    await vi.waitFor(
      async () => {
        const result = await observer.query<{ count: number }>(
          `select count(*)::int as count from pg_locks
          where locktype = 'advisory' and not granted
            and pg_backend_pid() = any(pg_blocking_pids(pid))`,
        );
        expect(
          result.rows[0]!.count,
          'the other connection waits for the tournament advisory lock',
        ).toBe(1);
      },
      { interval: 10, timeout: 1500 },
    );
  }

  beforeAll(async () => {
    pool = createTestPool();
    priorMigrationsDir = await mkdtemp(path.join(os.tmpdir(), 'hockey-before-108-'));
    const files = (await readdir(migrationsDir)).filter(
      (file) => file.endsWith('.sql') && file < migrationName,
    );
    await Promise.all(
      files.map((file) =>
        copyFile(path.join(migrationsDir, file), path.join(priorMigrationsDir, file)),
      ),
    );
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, priorMigrationsDir);
    removed.clear();
    users = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of users)
      await insert(
        'users',
        { id, display_name: 'Migration player', timezone: 'Europe/Moscow' },
        false,
      );
  });

  afterAll(async () => {
    await pool?.end();
    if (priorMigrationsDir) await rm(priorMigrationsDir, { recursive: true, force: true });
  });

  it('removes every owned row and preserves supported tournaments and ordinary games for the same users', async () => {
    await seedTournament('daily_aggregate');
    await seedTournament('classic');
    await seedTournament('head_to_head');
    await seedDuel('matchmaking', false);
    const day = await insert(
      'day_pool',
      {
        user_id: users[0],
        day_date: '2026-09-07',
        state: 'closed',
        game_core_version: 1,
        daily_seed: 'ordinary-daily',
      },
      false,
    );
    await insert(
      'period_log',
      {
        day_pool_id: day.id,
        period_number: 1,
        started_at: startsAt,
        ended_at: endsAt,
        shots_taken: 1,
        goals: 1,
        closed_reason: 'quota',
      },
      false,
    );
    await insert(
      'shot_session',
      {
        user_id: users[0],
        mode: 'daily',
        day_pool_id: day.id,
        period_number: 1,
        shot_index: 1,
        seed: 'ordinary-shot',
        input_payload: {},
        server_result: 'goal',
        game_core_version: 1,
      },
      false,
    );
    await insert(
      'user_currency_account',
      { user_id: users[0], balance: 123, reserved_balance: 0 },
      false,
    );
    await insert(
      'currency_ledger',
      {
        user_id: users[0],
        reason: 'admin_adjustment',
        available_delta: 123,
        reserved_delta: 0,
        balance_after: 123,
        reserved_after: 0,
      },
      false,
    );

    // Every current descendant table must be represented, including later migrations.
    const graph = await pool.query<{ table_name: string }>(
      `with recursive dependencies(oid) as (
         select 'tournament'::regclass::oid
         union
         select fk.conrelid from pg_constraint fk
         join dependencies parent on parent.oid = fk.confrelid where fk.contype = 'f'
       ) select oid::regclass::text as table_name from dependencies`,
    );
    for (const { table_name: table } of graph.rows) expect(removed.has(table), table).toBe(true);

    const survivors = new Map<string, Row[]>();
    for (const [table, targetRows] of removed) {
      const before = await pool.query<Row>(`select * from ${table}`);
      survivors.set(
        table,
        before.rows.filter(
          (row) =>
            !targetRows.some((target) =>
              target.id === undefined
                ? JSON.stringify(target) === JSON.stringify(row)
                : target.id === row.id,
            ),
        ),
      );
      expect(before.rows.length, `${table} has seeded rows`).toBeGreaterThan(0);
    }
    await runMigration();
    for (const [table, expected] of survivors) {
      const actual = await pool.query<Row>(`select * from ${table}`);
      expect(actual.rows, `${table}: exact surviving rows`).toHaveLength(expected.length);
      expect(actual.rows, `${table}: surviving data unchanged`).toEqual(
        expect.arrayContaining(expected),
      );
    }
    expect(
      (await pool.query('select regular_source from tournament order by regular_source')).rows,
    ).toEqual([{ regular_source: 'classic' }, { regular_source: 'head_to_head' }]);
  });

  it('can run twice and leaves a validated source constraint with no temporary targets', async () => {
    await seedTournament('daily_aggregate');
    await runMigration();
    await runMigration();
    expect((await pool.query('select id from tournament')).rows).toEqual([]);
    expect(
      (
        await pool.query(
          "select convalidated from pg_constraint where conrelid = 'tournament'::regclass and conname = 'tournament_regular_source_check'",
        )
      ).rows,
    ).toEqual([{ convalidated: true }]);
    expect(
      (
        await pool.query(
          "select relname from pg_class where relpersistence = 't' and relname like 'removed_daily_aggregate%'",
        )
      ).rows,
    ).toEqual([]);
  });

  it.each([
    ['dispatch', 'messages'],
    ['dispatch', 'push_delivery_log'],
    ['playoff-day', 'messages'],
    ['playoff-day', 'push_delivery_log'],
  ] as const)(
    'prevents an old %s writer from recreating %s after migration commits',
    async (writerKind, table) => {
      const retiredId = String(await seedTournament('daily_aggregate'));
      const supportedId = String(await seedTournament('classic'));
      await pool.query(
        "update tournament_fixture set status = 'scheduled' where tournament_id = any($1::uuid[])",
        [[retiredId, supportedId]],
      );
      if (table === 'push_delivery_log') {
        for (const userId of users.slice(0, 2)) {
          await insert(
            'push_subscriptions',
            {
              user_id: userId,
              endpoint: `https://push.example/${userId}`,
              p256dh: 'key',
              auth: 'auth',
            },
            false,
          );
        }
      }

      // Keep the real old communications implementation, SQL and transaction
      // boundaries. Only pause its next write after it has loaded its snapshot
      // and acquired its own dispatch/playoff-day session advisory lock.
      let resumeWriter!: () => void;
      const resume = new Promise<void>((resolve) => {
        resumeWriter = resolve;
      });
      let paused = false;
      const pauseQuery = (query: Pool['query']) => async (sql: string, values?: unknown[]) => {
        if (!paused && sql.includes(`insert into ${table}`)) {
          paused = true;
          await resume;
        }
        return query(sql, values);
      };
      const oldPool = new Proxy(pool, {
        get(target, property) {
          if (property === 'query') return pauseQuery(target.query.bind(target));
          if (property === 'connect')
            return async () => {
              const client = await target.connect();
              return new Proxy(client, {
                get(connection, key) {
                  if (key === 'query') return pauseQuery(connection.query.bind(connection));
                  const value = Reflect.get(connection, key);
                  return typeof value === 'function' ? value.bind(connection) : value;
                },
              });
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const communicate = async (tournamentId: string) => {
        const publisher = { publish: async () => undefined };
        if (writerKind === 'dispatch') {
          return dispatchTournamentCommunication(oldPool, publisher, {
            tournamentId,
            idempotencyKey: randomUUID(),
            kind: table === 'messages' ? 'direct_message' : 'push',
            audience: 'approved',
            title: 'Concurrent announcement',
            body: 'Concurrent announcement',
            createdBy: users[2]!,
            systemUserId: users[2]!,
          });
        }
        const fixture = await pool.query<{ id: string }>(
          'select id from tournament_fixture where tournament_id = $1',
          [tournamentId],
        );
        return reconcilePlayoffDayStartingCommunications(oldPool, {
          now: new Date('2026-09-07T07:45:00Z'),
          fixtureId: fixture.rows[0]!.id,
          systemUserId: users[2]!,
          publisher,
        });
      };
      const writer = communicate(retiredId).then(
        (value) => value,
        (error: unknown) => error,
      );
      try {
        await vi.waitFor(() => expect(paused, 'old writer reached the real insert').toBe(true));
        const retiredOwners = await pool.query<{ id: string }>(
          'select id from tournament_dispatch where tournament_id = $1',
          [retiredId],
        );
        await runMigration();
        resumeWriter();
        await writer;
        expect(
          (
            await pool.query(`select id from messages where metadata->>'tournamentId' = $1`, [
              retiredId,
            ])
          ).rows,
          'no stale messages survive',
        ).toEqual([]);
        expect(
          (
            await pool.query(
              `select id from push_delivery_log where event_type like 'tournament.%'
             and split_part(event_key, ':', 1) = any($1::text[])`,
              [[retiredId, ...retiredOwners.rows.map((row) => row.id)]],
            )
          ).rows,
          'no stale pushes survive',
        ).toEqual([]);

        // The same real writers must remain usable for a supported tournament.
        await communicate(supportedId);
        const supportedOwners = await pool.query<{ id: string }>(
          'select id from tournament_dispatch where tournament_id = $1',
          [supportedId],
        );
        const surviving =
          table === 'messages'
            ? await pool.query(
                `select id from messages where content like '%Concurrent announcement%'
               and metadata->>'tournamentId' = $1 or metadata->>'type' = 'tournament_playoff_day_starting'
               and metadata->>'tournamentId' = $1`,
                [supportedId],
              )
            : await pool.query(
                `select id from push_delivery_log where event_type like 'tournament.%'
               and split_part(event_key, ':', 1) = any($1::text[]) and event_key not like '%:notification'`,
                [[supportedId, ...supportedOwners.rows.map((row) => row.id)]],
              );
        expect(surviving.rows.length, 'supported communications still write').toBeGreaterThan(0);
      } finally {
        resumeWriter();
        await writer;
      }
    },
  );

  it('waits for a runtime writer before capturing and deleting its newly linked duel', async () => {
    const tournamentId = await seedTournament('daily_aggregate');
    const fixture = await pool.query<{ id: string }>(
      'select id from tournament_fixture where tournament_id = $1',
      [tournamentId],
    );
    const writer = await pool.connect();
    const migrator = await pool.connect();
    let migrationResult: Promise<unknown> | undefined;
    let writerOpen = false;
    let migratorOpen = false;
    const newDuelId = randomUUID();
    try {
      await writer.query('begin');
      writerOpen = true;
      await lockTournament(writer, String(tournamentId));
      await migrator.query('begin');
      migratorOpen = true;
      migrationResult = migrator
        .query(await readFile(path.join(migrationsDir, migrationName), 'utf8'))
        .then(
          () => null,
          (error: unknown) => error,
        );
      await waitForAdvisoryWait(writer);

      await writer.query(
        `insert into amateur_duel_match
           (id, challenger_user_id, opponent_user_id, status, source, rules_snapshot,
            match_seed, starts_at, ends_at, game_core_version)
         values ($1, $2, $3, 'active', 'tournament', '{}', 'late-duel', $4, $5, 1)`,
        [newDuelId, users[0], users[1], startsAt, endsAt],
      );
      await writer.query(
        `insert into tournament_fixture_segment (fixture_id, sequence_number, kind, duel_match_id, rules_snapshot)
         values ($1, 3, 'overtime', $2, '{}')`,
        [fixture.rows[0]!.id, newDuelId],
      );
      await writer.query(
        `insert into event_log (user_id, type, payload)
         values ($1, 'amateur_duel_inventory_reserved', jsonb_build_object('match_id', $2::text))`,
        [users[0], newDuelId],
      );
      await writer.query('commit');
      writerOpen = false;
      expect(await migrationResult).toBeNull();
      await migrator.query('commit');
      migratorOpen = false;

      expect(
        (await pool.query('select id from tournament where id = $1', [tournamentId])).rows,
      ).toEqual([]);
      expect(
        (await pool.query('select id from amateur_duel_match where id = $1', [newDuelId])).rows,
      ).toEqual([]);
      expect(
        (await pool.query("select id from event_log where payload->>'match_id' = $1", [newDuelId]))
          .rows,
      ).toEqual([]);
    } finally {
      if (writerOpen) await writer.query('rollback');
      await migrationResult;
      if (migratorOpen) await migrator.query('rollback');
      writer.release();
      migrator.release();
    }
  });

  it('keeps a later runtime writer waiting until commit and returns not found after removal', async () => {
    const tournamentId = await seedTournament('daily_aggregate');
    const fixture = await pool.query<{ id: string }>(
      'select id from tournament_fixture where tournament_id = $1',
      [tournamentId],
    );
    const migrator = await pool.connect();
    let migratorOpen = false;
    let writerResult: Promise<unknown> | undefined;
    try {
      await migrator.query('begin');
      migratorOpen = true;
      await migrator.query(await readFile(path.join(migrationsDir, migrationName), 'utf8'));
      writerResult = openTournamentFixtureSegment(
        pool,
        {
          tournamentId: String(tournamentId),
          fixtureId: fixture.rows[0]!.id,
          userId: users[0]!,
          now: new Date(startsAt),
        },
        async () => {
          throw new Error('A removed fixture must not create a duel');
        },
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForAdvisoryWait(migrator);
      await migrator.query('commit');
      migratorOpen = false;
      expect(await writerResult).toMatchObject({ code: 'not_found', statusCode: 404 });
    } finally {
      if (migratorOpen) await migrator.query('rollback');
      await writerResult;
      migrator.release();
    }
  });

  it('preserves a tournament changed to a supported source while waiting for its runtime lock', async () => {
    const tournamentId = await seedTournament('daily_aggregate');
    const fixturesBefore = await pool.query('select * from tournament_fixture');
    const duelsBefore = await pool.query('select * from amateur_duel_match');
    const writer = await pool.connect();
    const migrator = await pool.connect();
    let migrationResult: Promise<unknown> | undefined;
    let writerOpen = false;
    let migratorOpen = false;
    try {
      await writer.query('begin');
      writerOpen = true;
      await lockTournament(writer, String(tournamentId));
      await migrator.query('begin');
      migratorOpen = true;
      migrationResult = migrator
        .query(await readFile(path.join(migrationsDir, migrationName), 'utf8'))
        .then(
          () => null,
          (error: unknown) => error,
        );
      await waitForAdvisoryWait(writer);
      const changed = await writer.query(
        "update tournament set regular_source = 'classic' where id = $1 returning *",
        [tournamentId],
      );
      await writer.query('commit');
      writerOpen = false;
      expect(await migrationResult).toBeNull();
      await migrator.query('commit');
      migratorOpen = false;

      expect((await pool.query('select * from tournament')).rows).toEqual(changed.rows);
      expect((await pool.query('select * from tournament_fixture')).rows).toEqual(
        fixturesBefore.rows,
      );
      expect((await pool.query('select * from amateur_duel_match')).rows).toEqual(duelsBefore.rows);
    } finally {
      if (writerOpen) await writer.query('rollback');
      await migrationResult;
      if (migratorOpen) await migrator.query('rollback');
      writer.release();
      migrator.release();
    }
  });
});
