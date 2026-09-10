import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client, type Pool, type PoolClient } from 'pg';
import { getGameplayLockState } from '../../src/duel/gameplayLocks.js';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  createTestPool,
  createTestRedis,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
  resetRedis,
} from '../helpers/testDb.js';
import { waitForBlockedWriter } from '../helpers/postgresLocks.js';
import { reconcileCompletedMonthlyRating } from '../../src/duel/amateur/monthlyRewards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const JWT_SECRET = 'access-secret-at-least-16-chars';
const REFRESH_SECRET = 'refresh-secret-at-least-16-chars';
const DAILY_SEED_SECRET = 'daily-seed-secret-at-least-16!!';

const SPEEDS = [
  {
    periodNumber: 1,
    goalFrequency: 0.55,
    goalieFrequency: 0.65,
    shooterFrequency: 0.8,
    puckSpeedPerMs: 1.3,
  },
];

function speedsFor(totalPeriods: number) {
  return Array.from({ length: totalPeriods }, (_, index) => ({
    ...SPEEDS[0]!,
    periodNumber: index + 1,
  }));
}

describe.skipIf(!hasIntegrationEnv)('/duel/amateur/*', () => {
  const { databaseUrl, redisUrl } = hasIntegrationEnv
    ? getTestUrls()
    : { databaseUrl: '', redisUrl: '' };
  let app: FastifyInstance;
  let pool: Pool;
  let userA: string;
  let userB: string;
  let tokenA: string;
  let tokenB: string;
  let homeArenaGameOrder = 10_000;

  beforeAll(async () => {
    const initPool = createTestPool();
    await resetDatabase(initPool);
    await applyMigrations(initPool, MIGRATIONS_DIR);
    await initPool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();

    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'test-bot-token',
        DAILY_SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    pool = app.pg;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query(
      `truncate users, auth_providers, user_equipment, user_sticks,
              user_currency_account, user_inventory_item,
              amateur_duel_template, amateur_duel_match, amateur_duel_participant,
              amateur_duel_period_log, amateur_duel_rating, amateur_duel_matchmaking_ticket,
              currency_ledger, monthly_duel_rating_season,
              training_session, day_pool, period_log, shot_session, event_log,
              chats, chat_members, messages, message_reactions, push_delivery_log
              restart identity cascade`,
    );
    const a = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-a',
      displayName: 'Player A',
      timezone: 'Europe/Moscow',
    });
    const b = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-b',
      displayName: 'Player B',
      timezone: 'Europe/Moscow',
    });
    userA = a.id;
    userB = b.id;
    await pool.query(`update users set level = 2 where id = any($1::uuid[])`, [[userA, userB]]);
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 100), ($2, 100)
       on conflict (user_id) do update set balance = excluded.balance, reserved_balance = 0`,
      [userA, userB],
    );
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'false'::jsonb, 'Турниры включены', 'test reset')
       on conflict (key) do update set value = excluded.value`,
    );
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    tokenA = await jwt.issueAccessToken({ sub: userA });
    tokenB = await jwt.issueAccessToken({ sub: userB });
  });

  afterEach(async () => {
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'false'::jsonb, 'Турниры включены', 'test cleanup')
       on conflict (key) do update set value = excluded.value`,
    );
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createTemplate(
    opts: {
      startsAt?: string;
      endsAt?: string;
      stake?: number;
      fee?: number;
      ranked?: boolean;
      variant?: 'classic' | 'time_attack';
      duelKind?: 'express' | 'express_plus' | 'classic';
      periodRules?: Array<{
        periodNumber: number;
        mode: 'quota' | 'time_attack';
        durationMs: number;
        shotsLimit: number | null;
      }>;
      totalPeriods?: number;
      periodDurationMs?: number;
      breakDurationMs?: number;
      challengeTtlMs?: number;
      readyDurationMs?: number;
      winStarReward?: number;
      matchmakingVenuePolicy?: 'neutral_default' | 'random_participant_home' | 'random_unselected';
    } = {},
  ) {
    const startsAt = opts.startsAt ?? '2026-01-01T00:00:00.000Z';
    const endsAt = opts.endsAt ?? '2100-01-01T00:00:00.000Z';
    const { rows } = await pool.query<{ id: string }>(
      `insert into amateur_duel_template
         (title, description, starts_at, ends_at, duel_kind, total_periods, shots_per_period,
          period_duration_ms, break_duration_ms, goalie_id, period_speed_presets,
          stake_amount, entry_fee_amount, ranked_enabled, duel_variant, period_rules,
          challenge_ttl_ms, ready_duration_ms, win_star_reward, matchmaking_venue_policy)
       values ('Test duel', '', $1, $2, $10, $6, 1, $7, $12, 'rookie', $3, $4, $5, $8, $9, $11,
               $13, $14, $15, $16)
       returning id`,
      [
        startsAt,
        endsAt,
        JSON.stringify(speedsFor(opts.totalPeriods ?? 1)),
        opts.stake ?? 0,
        opts.fee ?? 0,
        opts.totalPeriods ?? 1,
        opts.periodDurationMs ?? 1200000,
        opts.ranked ?? true,
        opts.variant ?? 'classic',
        opts.duelKind ?? 'classic',
        opts.periodRules ? JSON.stringify(opts.periodRules) : null,
        opts.breakDurationMs ?? (opts.duelKind === 'express_plus' ? 120000 : 0),
        opts.challengeTtlMs ?? 900000,
        opts.readyDurationMs ?? 900000,
        opts.winStarReward ?? 0,
        opts.matchmakingVenuePolicy ?? 'neutral_default',
      ],
    );
    return rows[0]!.id;
  }

  async function createOpponent(index: number) {
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `amateur-opponent-${index}`,
      displayName: `Opponent ${index}`,
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set level = 2 where id = $1`, [user.id]);
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 100)
       on conflict (user_id) do update set balance = excluded.balance, reserved_balance = 0`,
      [user.id],
    );
    return user.id;
  }

  async function challenge(templateId: string, opponentUserId = userB) {
    const res = await app.inject({
      method: 'POST',
      url: '/duel/amateur/challenge',
      headers: auth(tokenA),
      payload: { template_id: templateId, opponent_user_id: opponentUserId },
    });
    return res;
  }

  async function attachTournamentHierarchy(
    matchId: string,
    opts: {
      slug: string;
      tournamentStatus: 'regular' | 'completed';
      fixtureStatus: 'active' | 'settled' | 'cancelled';
      segmentStatus: 'active' | 'settled' | 'cancelled';
    },
  ): Promise<{ tournamentId: string; fixtureId: string }> {
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ($1, 'Tournament duel hierarchy', $2, 'head_to_head', $3)
       returning id`,
      [opts.slug, opts.tournamentStatus, userA],
    );
    const fixture = await pool.query<{ id: string }>(
      `insert into tournament_fixture
         (tournament_id, fixture_number, status, home_score, away_score)
       values ($1, 1, $2, 0, 0)
       returning id`,
      [tournament.rows[0]!.id, opts.fixtureStatus],
    );
    await pool.query(
      `insert into tournament_fixture_segment
         (fixture_id, sequence_number, kind, duel_match_id, status, rules_snapshot)
       values ($1, 1, 'regulation', $2, $3, '{}'::jsonb)`,
      [fixture.rows[0]!.id, matchId, opts.segmentStatus],
    );
    return { tournamentId: tournament.rows[0]!.id, fixtureId: fixture.rows[0]!.id };
  }

  async function setHomeArena(userId: string, slug: string): Promise<string> {
    const arena = await pool.query<{
      id: string;
      slug: string;
      title: string;
      artwork_url: string;
      thumbnail_url: string;
    }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ($1, $2, $3, $4, 'active', true)
       on conflict (slug) do update
         set is_selectable = true,
             status = 'active'
       returning id, slug, title, artwork_url, thumbnail_url`,
      [slug, `Arena ${slug}`, `/arenas/${slug}.webp`, `/arenas/${slug}-thumb.webp`],
    );
    const theme = arena.rows[0]!;
    homeArenaGameOrder += 1;
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, skill_code, description, sort_order, status, access_type, unlock_price_stars,
          target_goals, qualification_rules, total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, 'accuracy', '', $4, 'draft', 'free', 0, 1,
               '{"type":"goals_from_shots","targetGoals":1,"shotsLimit":1}'::jsonb,
               1, 0, '[]'::jsonb, 0, 0, 0, $3,
               '/goalies/ready.webp', '/goalies/save.webp')
       returning id`,
      [`duel-${userId}-${slug}`, `Duel ${slug}`, theme.id, homeArenaGameOrder],
    );
    const snapshot = {
      id: theme.id,
      slug: theme.slug,
      title: theme.title,
      artworkUrl: theme.artwork_url,
      thumbnailUrl: theme.thumbnail_url,
    };
    const attempt = await pool.query<{ id: string }>(
      `insert into bonus_game_attempt
         (user_id, bonus_game_id, status, state, current_period, closed_at,
          attempt_seed, game_core_version, definition_revision, rules_snapshot,
          reward_snapshot, arena_theme_id_snapshot, arena_snapshot,
          goalkeeper_ready_url, goalkeeper_save_url)
       values ($1, $2, 'completed', 'closed', 1, now(), $3, 1, 1, $4::jsonb, $5::jsonb,
               $6, $7::jsonb, '/goalies/ready.webp', '/goalies/save.webp')
       returning id`,
      [
        userId,
        game.rows[0]!.id,
        `duel-attempt-${userId}-${slug}`,
        JSON.stringify({
          gameId: game.rows[0]!.id,
          slug: `duel-${userId}-${slug}`,
          title: `Duel ${slug}`,
          revision: 1,
          targetGoals: 1,
          totalPeriods: 1,
          breakDurationMs: 0,
          periods: [],
          goalkeeperReadyUrl: '/goalies/ready.webp',
          goalkeeperSaveUrl: '/goalies/save.webp',
          arena: snapshot,
        }),
        JSON.stringify({ coins: 0, stars: 0, experience: 0 }),
        theme.id,
        JSON.stringify(snapshot),
      ],
    );
    const completion = await pool.query<{ id: string }>(
      `insert into user_bonus_game_completion
         (user_id, bonus_game_id, attempt_id, reward_snapshot)
       values ($1, $2, $3, $4::jsonb)
       returning id`,
      [
        userId,
        game.rows[0]!.id,
        attempt.rows[0]!.id,
        JSON.stringify({ coins: 0, stars: 0, experience: 0 }),
      ],
    );
    await pool.query(
      `insert into user_arena_unlock
         (user_id, arena_theme_id, source_bonus_game_id, source_completion_id)
       values ($1, $2, $3, $4)`,
      [userId, theme.id, game.rows[0]!.id, completion.rows[0]!.id],
    );
    await pool.query('update users set home_arena_theme_id = $1 where id = $2', [theme.id, userId]);
    return theme.id;
  }

  async function createMatchmakingPair(
    matchmakingVenuePolicy: 'neutral_default' | 'random_participant_home' | 'random_unselected',
  ) {
    const templateId = await createTemplate({ matchmakingVenuePolicy });
    const first = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { template_id: templateId },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { template_id: templateId },
    });
    expect(second.statusCode).toBe(200);
    return second.json().match;
  }

  async function createInventoryItem(kind: 'stick' | 'skates' | 'nutrition', title: string) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into admin_inventory_items
         (photo_url, title, description, price_rub, item_kind, charges_per_purchase,
          duel_period_cost, power_score, rarity)
       values ('', $1, '', 0, $2, 10, 1, 10, 'epic')
       returning id`,
      [title, kind],
    );
    return rows[0]!.id;
  }

  async function createInventoryInstance(userId: string, itemId: string, chargesAvailable: number) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into user_inventory_instance (user_id, inventory_item_id, charges_available)
       values ($1, $2, $3)
       returning id`,
      [userId, itemId, chargesAvailable],
    );
    return rows[0]!.id;
  }

  async function createLongPeriodLoadout() {
    const skates = await createInventoryItem('skates', 'Gameplay lock skates');
    const nutrition = await createInventoryItem('nutrition', 'Gameplay lock nutrition');
    await pool.query(
      `update admin_inventory_items
          set duel_period_cost = 0,
              resource_unit = case when id = $1 then 'distance' else 'energy_ms' end
        where id = any($2::uuid[])`,
      [skates, [skates, nutrition]],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 100000), ($1, $3, 14400000)`,
      [userA, skates, nutrition],
    );
    return { skates, nutrition };
  }

  async function acceptReadyAndStart(
    matchId: string,
    opts: { token?: string; loadout?: Record<string, string | null> } = {},
  ) {
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(opts.token ?? tokenA),
      payload: { loadout: opts.loadout ?? {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    return app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(opts.token ?? tokenA),
    });
  }

  async function createActiveMatch(startPeriod = false): Promise<string> {
    const matchId = String((await challenge(await createTemplate())).json().match.id);
    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    for (const token of [tokenA, tokenB]) {
      const ready = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/ready`,
        headers: auth(token),
        payload: { loadout: {} },
      });
      expect(ready.statusCode).toBe(200);
    }
    if (startPeriod) {
      const started = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/period/start`,
        headers: auth(tokenA),
      });
      expect(started.statusCode).toBe(200);
    }
    return matchId;
  }

  async function snapshotRestrictedAmateurState(): Promise<Record<string, unknown>> {
    const queries = {
      users: pool.query(
        `select id, level, xp, experience, lifetime_shots_total, lifetime_goals_total
           from users
          where id = any($1::uuid[])
          order by id`,
        [[userA, userB]],
      ),
      matches: pool.query(
        `select to_jsonb(duel_match) - 'created_at' - 'updated_at' as row
           from amateur_duel_match duel_match
          order by duel_match.id`,
      ),
      participants: pool.query(
        `select to_jsonb(participant) - 'created_at' - 'updated_at' as row
           from amateur_duel_participant participant
          order by participant.match_id, participant.user_id`,
      ),
      periodLogs: pool.query(
        `select to_jsonb(period_log) - 'created_at' as row
           from amateur_duel_period_log period_log
          order by period_log.id`,
      ),
      tickets: pool.query(
        `select to_jsonb(ticket) - 'created_at' - 'updated_at' as row
           from amateur_duel_matchmaking_ticket ticket
          order by ticket.id`,
      ),
      shots: pool.query(
        `select to_jsonb(shot) - 'created_at' as row
           from shot_session shot
          where shot.mode = 'amateur_duel'
          order by shot.id`,
      ),
      inventoryInstances: pool.query(
        `select to_jsonb(instance) - 'created_at' - 'updated_at' as row
           from user_inventory_instance instance
          where instance.user_id = $1
          order by instance.id`,
        [userA],
      ),
      legacyInventory: pool.query(
        `select to_jsonb(inventory) - 'created_at' - 'updated_at' as row
           from user_inventory_item inventory
          where inventory.user_id = $1
          order by inventory.inventory_item_id`,
        [userA],
      ),
      currencyAccounts: pool.query(
        `select to_jsonb(account) - 'created_at' - 'updated_at' as row
           from user_currency_account account
          where account.user_id = any($1::uuid[])
          order by account.user_id`,
        [[userA, userB]],
      ),
      currencyLedger: pool.query(
        `select to_jsonb(ledger) - 'created_at' as row
           from currency_ledger ledger
          where ledger.user_id = any($1::uuid[])
          order by ledger.id`,
        [[userA, userB]],
      ),
      ratings: pool.query(
        `select to_jsonb(rating) - 'updated_at' as row
           from amateur_duel_rating rating
          where rating.user_id = any($1::uuid[])
          order by rating.season_key, rating.user_id`,
        [[userA, userB]],
      ),
      ratingMatches: pool.query(
        `select to_jsonb(rating_match) - 'created_at' as row
           from amateur_duel_rating_match rating_match
          where rating_match.user_id = any($1::uuid[])
          order by rating_match.match_id, rating_match.user_id`,
        [[userA, userB]],
      ),
      achievements: pool.query(
        `select to_jsonb(user_achievement) as row
           from user_achievements user_achievement
          where user_achievement.user_id = any($1::uuid[])
          order by user_achievement.user_id, user_achievement.achievement_id`,
        [[userA, userB]],
      ),
      achievementProgress: pool.query(
        `select to_jsonb(progress) - 'updated_at' as row
           from achievement_progress progress
          where progress.user_id = any($1::uuid[])
          order by progress.user_id, progress.key`,
        [[userA, userB]],
      ),
      rewardTokens: pool.query(
        `select to_jsonb(account) - 'created_at' - 'updated_at' as row
           from user_reward_token_account account
          where account.user_id = any($1::uuid[])
          order by account.user_id`,
        [[userA, userB]],
      ),
      achievementTokenLedger: pool.query(
        `select to_jsonb(ledger) - 'created_at' as row
           from achievement_token_ledger ledger
          where ledger.user_id = any($1::uuid[])
          order by ledger.id`,
        [[userA, userB]],
      ),
      events: pool.query(
        `select to_jsonb(event) - 'created_at' as row
           from event_log event
          where event.user_id = any($1::uuid[])
          order by event.id`,
        [[userA, userB]],
      ),
      messages: pool.query(
        `select to_jsonb(chat_message) - 'created_at' - 'updated_at' as row
           from messages chat_message
          order by chat_message.id`,
      ),
    };
    return Object.fromEntries(
      await Promise.all(
        Object.entries(queries).map(async ([key, query]) => [key, (await query).rows] as const),
      ),
    );
  }

  async function scheduleTournamentLock(userId = userA, startsInMs = 30 * 60_000) {
    const startsAt = new Date(Date.now() + startsInMs);
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ($1, 'Lock cup', 'regular', 'head_to_head', $2) returning id`,
      [`lock-${userId}`, userId],
    );
    const tournamentId = tournament.rows[0]!.id;
    const participant = await pool.query<{ id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state)
       values ($1, $2, 'approved') returning id`,
      [tournamentId, userId],
    );
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status, starts_at)
       values ($1, 'regular', 1, 'open', $2) returning id`,
      [tournamentId, startsAt],
    );
    await pool.query(
      `insert into tournament_fixture
       (tournament_id, round_id, fixture_number, home_participant_id, scheduled_starts_at, window_ends_at, status)
       values ($1, $2, 1, $3, $4, $5, 'scheduled')`,
      [
        tournamentId,
        round.rows[0]!.id,
        participant.rows[0]!.id,
        startsAt,
        new Date(startsAt.getTime() + 2 * 3_600_000),
      ],
    );
    return tournamentId;
  }

  async function createPlayoffSeriesPair(
    firstUserId = userA,
    secondUserId = userB,
    status: 'pending' | 'scheduled' | 'active' | 'completed' | 'paused' | 'cancelled' = 'scheduled',
  ) {
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ($1, 'Playoff opponent cup', 'playoff', 'head_to_head', $2)
       returning id`,
      [`playoff-opponent-${firstUserId}-${secondUserId}`, firstUserId],
    );
    const participants = await pool.query<{ id: string; user_id: string }>(
      `insert into tournament_participant (tournament_id, user_id, state, seed)
       values ($1, $2, 'approved', 1), ($1, $3, 'approved', 2)
       returning id, user_id`,
      [tournament.rows[0]!.id, firstUserId, secondUserId],
    );
    const firstParticipantId = participants.rows.find(
      (participant) => participant.user_id === firstUserId,
    )!.id;
    const secondParticipantId = participants.rows.find(
      (participant) => participant.user_id === secondUserId,
    )!.id;
    const round = await pool.query<{ id: string }>(
      `insert into tournament_round (tournament_id, stage, number, status)
       values ($1, 'playoff', 1, 'scheduled') returning id`,
      [tournament.rows[0]!.id],
    );
    const series = await pool.query<{ id: string }>(
      `insert into tournament_playoff_series
         (tournament_id, round_id, bracket_position, higher_seed_participant_id,
          lower_seed_participant_id, wins_required, home_sequence, status)
       values ($1, $2, 1, $3, $4, 4, '["higher","lower"]'::jsonb, $5)
       returning id`,
      [tournament.rows[0]!.id, round.rows[0]!.id, firstParticipantId, secondParticipantId, status],
    );
    return series.rows[0]!.id;
  }

  it('hides a future playoff opponent from ordinary duel search until the series ends', async () => {
    await createTemplate();
    const seriesId = await createPlayoffSeriesPair();

    const blocked = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().users.map((user: { userId: string }) => user.userId)).not.toContain(
      userB,
    );

    await pool.query("update tournament_playoff_series set status = 'completed' where id = $1", [
      seriesId,
    ]);
    const available = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(available.json().users.map((user: { userId: string }) => user.userId)).toContain(userB);
  });

  it.each(['pending', 'scheduled', 'active', 'paused'] as const)(
    'rejects a direct ordinary challenge against a %s playoff opponent',
    async (seriesStatus) => {
      const templateId = await createTemplate();
      await createPlayoffSeriesPair(userA, userB, seriesStatus);

      const response = await challenge(templateId);

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({ code: 'playoff_opponent_blocked' });
      expect(
        (await pool.query('select count(*)::int as total from amateur_duel_match')).rows[0].total,
      ).toBe(0);
    },
  );

  it('rejects opening ordinary duel setup for a future playoff opponent', async () => {
    await createPlayoffSeriesPair();

    const blocked = await app.inject({
      method: 'GET',
      url: `/duel/amateur/challenge/availability?opponent_user_id=${userB}`,
      headers: auth(tokenA),
    });

    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toMatchObject({ code: 'playoff_opponent_blocked' });
  });

  it('allows opening ordinary duel setup after the playoff series finishes', async () => {
    const seriesId = await createPlayoffSeriesPair();
    await pool.query("update tournament_playoff_series set status = 'completed' where id = $1", [
      seriesId,
    ]);

    const available = await app.inject({
      method: 'GET',
      url: `/duel/amateur/challenge/availability?opponent_user_id=${userB}`,
      headers: auth(tokenA),
    });

    expect(available.statusCode).toBe(200);
    expect(available.json()).toEqual({ available: true });
  });

  it('rechecks the playoff pairing when an older ordinary invitation is accepted', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    await createPlayoffSeriesPair();

    const response = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: 'playoff_opponent_blocked' });
  });

  it('skips a queued future playoff opponent during ordinary matchmaking', async () => {
    const templateId = await createTemplate();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/duel/amateur/matchmaking/join',
          headers: auth(tokenB),
          payload: { duel_kinds: ['classic'] },
        })
      ).statusCode,
    ).toBe(200);
    await createPlayoffSeriesPair();
    const laterUser = await createOpponent(101);
    await pool.query(
      `insert into amateur_duel_matchmaking_ticket
         (template_id, user_id, expires_at, duel_kinds)
       values ($1, $2, now() + interval '2 minutes', '["classic"]'::jsonb)`,
      [templateId, laterUser],
    );

    const response = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { duel_kinds: ['classic'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().match.opponent.user_id).toBe(laterUser);
  });

  it.each(['challenger', 'opponent'])(
    'blocks challenge when the %s has a tournament lock',
    async (side) => {
      const templateId = await createTemplate();
      await scheduleTournamentLock(side === 'challenger' ? userA : userB);
      const response = await challenge(templateId);
      expect(response.statusCode).toBe(409);
      expect(
        (await pool.query('select count(*)::int as total from amateur_duel_match')).rows[0].total,
      ).toBe(0);
    },
  );

  it('keeps locked invitations visible and decline available while rejecting acceptance', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    await scheduleTournamentLock(userB);
    const overview = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenB),
    });
    expect(overview.json().duel_lock).toMatchObject({
      blocked: true,
      reason: 'scheduled_tournament',
    });
    expect(overview.json().matches[0]).toMatchObject({ id: matchId, duel_lock: { blocked: true } });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/accept`,
          headers: auth(tokenB),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/decline`,
          headers: auth(tokenB),
        })
      ).statusCode,
    ).toBe(200);
  });

  it('hides locked opponents, cancels their queued tickets, and restores visibility after completion', async () => {
    await createTemplate();
    const joined = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { duel_kinds: ['classic'] },
    });
    expect(joined.statusCode).toBe(200);
    const tournamentId = await scheduleTournamentLock(userB);
    const search = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(search.json().users.map((u: { userId: string }) => u.userId)).not.toContain(userB);
    const refused = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { duel_kinds: ['classic'] },
    });
    expect(refused.statusCode).toBe(409);
    expect(
      (
        await pool.query('select status from amateur_duel_matchmaking_ticket where user_id = $1', [
          userB,
        ])
      ).rows[0].status,
    ).toBe('cancelled');
    const available = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { duel_kinds: ['classic'] },
    });
    expect(available.json().ticket).toBeDefined();
    await pool.query("update tournament_fixture set status = 'settled' where tournament_id = $1", [
      tournamentId,
    ]);
    const unlocked = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(unlocked.json().users.map((u: { userId: string }) => u.userId)).toContain(userB);
    expect(
      (await pool.query('select matchmaking_enabled from amateur_duel_template')).rows.every(
        (r) => r.matchmaking_enabled,
      ),
    ).toBe(true);
  });

  it('uses a constant query count for 1 and 50 opponents while preserving per-format locks', async () => {
    await createTemplate({ duelKind: 'classic', readyDurationMs: 60_000 });
    await createTemplate({ duelKind: 'express', readyDurationMs: 60_000 });
    await createTemplate({ duelKind: 'express_plus', readyDurationMs: 60_000 });
    for (let index = 0; index < 49; index += 1) await createOpponent(index);
    await scheduleTournamentLock(userB, 3_600_000 + 300_000);
    const search = (limit: number) =>
      app.inject({
        method: 'GET',
        url: `/duel/amateur/opponents?limit=${limit}`,
        headers: auth(tokenA),
      });
    await search(1); // Warm the authenticated presence throttle before measuring.
    const queries = vi.spyOn(Client.prototype, 'query');
    const countSearchQueries = () => {
      const candidateIndex = queries.mock.calls.findIndex((call) =>
        String(call[0]).includes('select id, display_name, avatar_url, last_seen_at'),
      );
      expect(candidateIndex).toBeGreaterThanOrEqual(0);
      const connection = queries.mock.instances[candidateIndex];
      const transactionQueries = queries.mock.calls
        .filter((_, index) => queries.mock.instances[index] === connection)
        .map((call) => String(call[0]));
      const start = transactionQueries.indexOf('begin');
      const end = transactionQueries.indexOf('commit', start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      return end - start + 1;
    };
    try {
      expect((await search(1)).json().users).toHaveLength(1);
      const singleCount = countSearchQueries();
      queries.mockClear();
      const response = await search(50);
      const fiftyCount = countSearchQueries();
      expect(response.statusCode).toBe(200);
      const users = response.json().users;
      expect(users).toHaveLength(50);
      const scheduled = users.find((user: { userId: string }) => user.userId === userB);
      expect(scheduled.format_locks.classic).toMatchObject({
        blocked: true,
        reason: 'scheduled_tournament',
      });
      expect(scheduled.format_locks.express).toBeNull();
      expect(
        users.find((user: { userId: string }) => user.userId !== userB).format_locks.classic,
      ).toBeNull();
      console.info('opponent query counts', { one: singleCount, fifty: fiftyCount });
      expect(fiftyCount).toBe(singleCount);
      expect(fiftyCount).toBeLessThanOrEqual(15);
    } finally {
      queries.mockRestore();
    }
  });

  it('keeps cancellation and terminal match history usable during a tournament lock', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    await scheduleTournamentLock(userA);
    const cancelled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/cancel`,
      headers: auth(tokenA),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().match).toMatchObject({ status: 'cancelled', duel_lock: null });
    expect(
      (await app.inject({ method: 'GET', url: '/duel/amateur/history', headers: auth(tokenA) }))
        .statusCode,
    ).toBe(200);
  });

  it('skips a queued candidate whose selected format became unsafe and matches a later candidate', async () => {
    const templateId = await createTemplate({ periodDurationMs: 120_000, readyDurationMs: 60_000 });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/duel/amateur/matchmaking/join',
          headers: auth(tokenB),
          payload: { duel_kinds: ['classic'] },
        })
      ).statusCode,
    ).toBe(200);
    await scheduleTournamentLock(userB, 3_600_000 + 150_000);
    const laterUser = await createOpponent(98);
    await pool.query(
      "insert into amateur_duel_matchmaking_ticket (template_id, user_id, expires_at, duel_kinds) values ($1, $2, now() + interval '2 minutes', '[\"classic\"]'::jsonb)",
      [templateId, laterUser],
    );
    const joined = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { duel_kinds: ['classic'] },
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().match.opponent.user_id).toBe(laterUser);
  });

  it('exposes per-format safe starts and keeps a shorter selected format joinable', async () => {
    await createTemplate({
      duelKind: 'classic',
      periodDurationMs: 1_200_000,
      readyDurationMs: 60_000,
    });
    await createTemplate({
      duelKind: 'express',
      periodDurationMs: 60_000,
      readyDurationMs: 60_000,
    });
    await scheduleTournamentLock(userA, 3_600_000 + 300_000);
    const overview = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });
    expect(overview.json().duel_lock).toBeNull();
    expect(overview.json().format_locks.classic).toMatchObject({
      blocked: true,
      reason: 'scheduled_tournament',
    });
    expect(overview.json().format_locks.express).toBeNull();
    const joined = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { duel_kinds: ['classic', 'express'] },
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().ticket.duel_kinds).toEqual(['express']);
  });

  it('keeps an invitation readable after its template is soft deleted', async () => {
    const templateId = await createTemplate();
    const matchId = (await challenge(templateId)).json().match.id;
    await pool.query('update amateur_duel_template set deleted_at = now() where id = $1', [
      templateId,
    ]);
    const response = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenB),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().match.id).toBe(matchId);
  });

  it('exposes safe-start locks for invitation acceptance, readiness and the next period before T-60', async () => {
    const templateId = await createTemplate({ periodDurationMs: 120_000, readyDurationMs: 60_000 });
    const matchId = (await challenge(templateId)).json().match.id;
    const tournamentId = await scheduleTournamentLock(userA, 3_600_000 + 150_000);
    const read = () =>
      app.inject({ method: 'GET', url: `/duel/amateur/matches/${matchId}`, headers: auth(tokenB) });
    expect((await read()).json().match.duel_lock).toMatchObject({
      blocked: true,
      reason: 'scheduled_tournament',
    });
    await pool.query("update tournament_fixture set status='settled' where tournament_id=$1", [
      tournamentId,
    ]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/accept`,
          headers: auth(tokenB),
        })
      ).statusCode,
    ).toBe(200);
    await pool.query("update tournament_fixture set status='scheduled' where tournament_id=$1", [
      tournamentId,
    ]);
    expect((await read()).json().match.duel_lock?.blocked).toBe(true);
    await pool.query("update tournament_fixture set status='settled' where tournament_id=$1", [
      tournamentId,
    ]);
    await acceptReadyAndStart(matchId);
    await pool.query(
      "update tournament_fixture set status='scheduled', scheduled_starts_at=now() + interval '61 minutes' where tournament_id=$1",
      [tournamentId],
    );
    await pool.query(
      "update amateur_duel_participant set state='accepted', current_period=0, period_started_at=null where match_id=$1 and user_id=$2",
      [matchId, userA],
    );
    const next = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(next.json().match.duel_lock?.blocked).toBe(true);
  });

  it('timestamps an accepted ordinary shot after the gameplay-lock wait and recovers exactly one hour later', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    const blocker = await pool.connect();
    let accepted;
    let releasedAt = 0;
    try {
      await blocker.query('begin');
      const backend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query("select pg_advisory_xact_lock(hashtext('gameplay:' || $1))", [userA]);
      const pending = app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/shot`,
        headers: auth(tokenA),
        payload: { shot_index: 1, input: { tapTime: 1000 }, claimed_result: 'goal' },
      });
      await waitForBlockedWriter(pool, backend.rows[0]!.pid, /pg_advisory_xact_lock/i);
      releasedAt = Date.now();
      await blocker.query('commit');
      accepted = await pending;
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    expect(accepted.statusCode).toBe(200);
    const acceptedAt = new Date(accepted.json().match.server_now);
    const shot = (
      await pool.query<{ created_at: Date }>(
        'select created_at from shot_session where amateur_duel_match_id=$1',
        [matchId],
      )
    ).rows[0]!;
    expect(shot.created_at.getTime()).toBeGreaterThanOrEqual(releasedAt);
    expect(shot.created_at.toISOString()).toBe(acceptedAt.toISOString());
    const endsAt = new Date(acceptedAt.getTime() + 3_600_000);
    expect(
      await getGameplayLockState(pool as unknown as PoolClient, {
        userId: userA,
        action: 'start_classic',
        now: new Date(endsAt.getTime() - 1),
      }),
    ).toMatchObject({ blocked: true, endsAt });
    expect(
      await getGameplayLockState(pool as unknown as PoolClient, {
        userId: userA,
        action: 'start_classic',
        now: endsAt,
      }),
    ).toMatchObject({ blocked: false });
  });

  it('does not use recovery from an ordinary shot to block invitations or matchmaking', async () => {
    const templateId = await createTemplate();
    const matchId = (await challenge(templateId)).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: { shot_index: 1, input: { tapTime: 1000 }, claimed_result: 'goal' },
    });
    expect(shot.statusCode).toBe(200);
    expect((await challenge(templateId, await createOpponent(99))).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/duel/amateur/matchmaking/join',
          headers: auth(tokenA),
          payload: { duel_kinds: ['classic'] },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('rejects new periods under a tournament lock without consuming inventory', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    await scheduleTournamentLock(userB);
    const start = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenB),
    });
    expect(start.statusCode).toBe(409);
    expect(
      (
        await pool.query(
          'select state from amateur_duel_participant where match_id=$1 and user_id=$2',
          [matchId, userB],
        )
      ).rows[0].state,
    ).toBe('accepted');
  });

  it.each(['express', 'express_plus', 'classic'] as const)(
    'rejects %s readiness plus the first segment crossing T-60',
    async (duelKind) => {
      const templateId = await createTemplate({
        duelKind,
        totalPeriods: duelKind === 'express_plus' ? 2 : 1,
        periodDurationMs: 120_000,
        readyDurationMs: 60_000,
      });
      await scheduleTournamentLock(userA, 3_600_000 + 150_000);
      expect((await challenge(templateId)).statusCode).toBe(409);
    },
  );

  it.each(['express', 'express_plus', 'classic'] as const)(
    'rejects a %s period whose rules snapshot crosses T-60',
    async (duelKind) => {
      const templateId = await createTemplate({
        duelKind,
        totalPeriods: duelKind === 'express_plus' ? 2 : 1,
        periodDurationMs: 120_000,
      });
      const matchId = (await challenge(templateId)).json().match.id;
      expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
      await scheduleTournamentLock(userB, 3_600_000 + 60_000);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/duel/amateur/matches/${matchId}/period/start`,
            headers: auth(tokenB),
          })
        ).statusCode,
      ).toBe(409);
    },
  );

  it('serializes invitation creation with tournament gameplay and rechecks after waiting', async () => {
    const templateId = await createTemplate();
    const blocker = await pool.connect();
    let response;
    try {
      await blocker.query('begin');
      const backend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query("select pg_advisory_xact_lock(hashtext('gameplay:' || $1))", [userA]);
      const pending = challenge(templateId);
      await waitForBlockedWriter(pool, backend.rows[0]!.pid, /pg_advisory_xact_lock/i);
      await scheduleTournamentLock(userA);
      await blocker.query('commit');
      response = await pending;
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    expect(response.statusCode).toBe(409);
  });

  it('rejects an ordinary shot from a stale segment begun inside the tournament prelock', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    await scheduleTournamentLock(userA);
    const stale = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: { shot_index: 1, input: { tapTime: 1000 }, claimed_result: 'goal' },
    });
    expect(stale.statusCode).toBe(409);
    expect(
      (
        await pool.query(
          'select count(*)::int as total from shot_session where amateur_duel_match_id=$1',
          [matchId],
        )
      ).rows[0].total,
    ).toBe(0);
  });

  it('preserves a timed segment accepted before the scheduled prelock boundary', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect(
      (await acceptReadyAndStart(matchId, { loadout: await createLongPeriodLoadout() })).statusCode,
    ).toBe(200);
    // A valid random no-skates interval is 48 rolls: at 0.8 Hz the player
    // stumbles exactly at this test's 120-second tap. Keep that adverse case.
    await pool.query(
      `update amateur_duel_match set rules_snapshot = jsonb_set(jsonb_set(rules_snapshot,
         '{noInventoryTiming,skates,stumbleIntervalMinRolls}', '48'),
         '{noInventoryTiming,skates,stumbleIntervalMaxRolls}', '48') where id = $1`,
      [matchId],
    );
    await pool.query(
      "update amateur_duel_participant set period_started_at = now() - interval '2 minutes' where match_id=$1 and user_id=$2",
      [matchId, userA],
    );
    await scheduleTournamentLock(userA, 59 * 60_000);
    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(state.json().match.duel_lock).toBeNull();
    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: { shot_index: 1, input: { tapTime: 120_000 }, claimed_result: 'goal' },
    });
    expect(shot.statusCode, shot.json().error?.message).toBe(200);
  });

  it.each([
    [1, 200, false],
    [0, 409, true],
    [-1, 409, true],
  ] as const)(
    'ordinary accepted segment with tournament starting in %sms returns shot %s and DTO blocked=%s',
    async (startsInMs, expectedStatus, blocked) => {
      const now = new Date();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      try {
        const matchId = (
          await challenge(
            await createTemplate({
              periodDurationMs: 2 * 60 * 60_000,
              periodRules: [
                { periodNumber: 1, mode: 'quota', shotsLimit: 10, durationMs: 2 * 60 * 60_000 },
              ],
            }),
          )
        ).json().match.id;
        expect(
          (await acceptReadyAndStart(matchId, { loadout: await createLongPeriodLoadout() }))
            .statusCode,
        ).toBe(200);
        // A legacy accepted segment is still live when an administrator schedules
        // tournament play over it. Its original acceptance precedes the prelock.
        await pool.query(
          'update amateur_duel_participant set period_started_at = $3 where match_id = $1 and user_id = $2',
          [matchId, userA, new Date(now.getTime() - 61 * 60_000 - 10_000)],
        );
        await scheduleTournamentLock(userA, startsInMs);
        const state = await app.inject({
          method: 'GET',
          url: `/duel/amateur/matches/${matchId}`,
          headers: auth(tokenA),
        });
        const shot = await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/shot`,
          headers: auth(tokenA),
          payload: {
            shot_index: 1,
            input: { tapTime: 61 * 60_000 + 10_000 },
            claimed_result: 'goal',
          },
        });
        expect(
          { status: shot.statusCode, blocked: state.json().match.gameplay_lock?.blocked ?? false },
          shot.json().error?.message,
        ).toEqual({ status: expectedStatus, blocked });
        expect(state.json().match.duel_lock).toEqual(state.json().match.gameplay_lock);
        expect(
          (
            await pool.query(
              'select count(*)::int as total from shot_session where amateur_duel_match_id = $1',
              [matchId],
            )
          ).rows[0].total,
        ).toBe(blocked ? 0 : 1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('does not let a preserved scheduled segment bypass a simultaneous active Classic game', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    await pool.query(
      "update amateur_duel_participant set period_started_at = now() - interval '2 minutes' where match_id=$1 and user_id=$2",
      [matchId, userA],
    );
    await scheduleTournamentLock(userA, 59 * 60_000);
    const tournament = await pool.query<{ id: string }>(
      "insert into tournament (slug, title, status, regular_source, created_by) values ('parallel-classic', 'Classic', 'regular', 'classic', $1) returning id",
      [userA],
    );
    const tournamentId = tournament.rows[0]!.id;
    const participant = await pool.query<{ id: string }>(
      "insert into tournament_participant (tournament_id, user_id, state) values ($1, $2, 'approved') returning id",
      [tournamentId, userA],
    );
    const matchday = await pool.query<{ id: string }>(
      "insert into tournament_matchday (tournament_id, number, local_date, starts_at, ends_at, status) values ($1, 1, current_date, now() - interval '1 hour', now() + interval '1 hour', 'open') returning id",
      [tournamentId],
    );
    const session = await pool.query<{ id: string }>(
      "insert into tournament_classic_session (tournament_id, participant_id, matchday_id, tournament_day, state, current_period, rules_snapshot, game_core_version, session_seed, closes_at) values ($1, $2, $3, 1, 'period_active', 1, '{}'::jsonb, 1, 'classic-seed', now() + interval '1 hour') returning id",
      [tournamentId, participant.rows[0]!.id, matchday.rows[0]!.id],
    );
    await pool.query(
      "insert into shot_session (user_id, mode, tournament_classic_session_id, period_number, shot_index, seed, input_payload, server_result, game_core_version) values ($1, 'tournament_classic', $2, 1, 1, 'seed', '{}'::jsonb, 'miss', 1)",
      [userA, session.rows[0]!.id],
    );
    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: { shot_index: 1, input: { tapTime: 120_000 }, claimed_result: 'goal' },
    });
    expect(shot.statusCode).toBe(409);
    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(state.json().match.duel_lock?.blocked).toBe(true);
  });

  it('allows tournament-source period and shot mutations while an ordinary-duel lock applies', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    await pool.query("update amateur_duel_match set source='tournament' where id=$1", [matchId]);
    await pool.query(
      "update game_settings set value='true'::jsonb where key='tournaments.enabled'",
    );
    await attachTournamentHierarchy(matchId, {
      slug: 'allowed-tournament',
      tournamentStatus: 'regular',
      fixtureStatus: 'active',
      segmentStatus: 'active',
    });
    await scheduleTournamentLock(userB);
    const start = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenB),
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().match.duel_lock).toBeNull();
    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenB),
      payload: { shot_index: 1, input: { tapTime: 1000 }, claimed_result: 'goal' },
    });
    expect(shot.statusCode).toBe(200);
  });

  it('creates a pending challenge and rejects duplicate open matches', async () => {
    const templateId = await createTemplate({ duelKind: 'express_plus', totalPeriods: 2 });
    const first = await challenge(templateId);
    expect(first.statusCode).toBe(200);
    expect(first.json().match.status).toBe('invited');

    const inviteMessage = await pool.query<{ content: string; metadata: Record<string, unknown> }>(
      `select content, metadata
         from messages
        where metadata->>'type' = 'amateur_duel_invite'
        order by created_at desc
        limit 1`,
    );
    expect(inviteMessage.rows[0]?.content).toContain('Ответить: в течение 15 мин');
    expect(inviteMessage.rows[0]?.content).toContain('Формат: Микс, 2 период(а)');
    expect(inviteMessage.rows[0]?.content.split('\n')[0]).toBe('Player A вызывает вас на дуэль.');
    expect(inviteMessage.rows[0]?.content).not.toContain('Окно:');
    expect(Date.parse(String(inviteMessage.rows[0]?.metadata.endsAt))).toBeLessThan(
      Date.parse('2100-01-01T00:00:00.000Z'),
    );
    const unreadInvite = await pool.query<{ cnt: string }>(
      `select count(m.id)::int as cnt
         from messages m
         left join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = $1
        where m.metadata->>'type' = 'amateur_duel_invite'
          and m.sender_id != $1
          and m.created_at > coalesce(cm.last_read_at, '1970-01-01'::timestamptz)`,
      [userB],
    );
    expect(Number(unreadInvite.rows[0]?.cnt)).toBe(0);

    const duplicate = await challenge(templateId);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.message).toBe('open duel already exists for this opponent');
  });

  it('rejects another open challenge against the same opponent with another template', async () => {
    const templateId = await createTemplate({ duelKind: 'express' });
    const anotherTemplateId = await createTemplate({ duelKind: 'classic' });

    const first = await challenge(templateId);
    expect(first.statusCode).toBe(200);

    const duplicatePair = await challenge(anotherTemplateId);
    expect(duplicatePair.statusCode).toBe(409);
    expect(duplicatePair.json().error.message).toBe('open duel already exists for this opponent');
  });

  it('returns a settled tournament duel alongside ordinary matches and keeps settlement readback idempotent', async () => {
    const templateId = await createTemplate();
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
       on conflict (key) do update set value = excluded.value`,
    );
    const tournamentChallenge = await challenge(templateId);
    expect(tournamentChallenge.statusCode).toBe(200);
    const tournamentMatchId = tournamentChallenge.json().match.id as string;
    await pool.query(
      `update amateur_duel_match
          set source = 'tournament', status = 'settled', winner_user_id = $2,
              outcome = 'challenger_win', settled_reason = 'completed', settled_at = now()
        where id = $1`,
      [tournamentMatchId, userA],
    );
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed', completed_at = now(),
              result_points = case when user_id = $2 then 3 else 0 end
        where match_id = $1`,
      [tournamentMatchId, userA],
    );
    const tournament = await pool.query<{ id: string }>(
      `insert into tournament (slug, title, status, regular_source, created_by)
       values ('settled-duel-readback', 'Settled duel readback', 'completed', 'head_to_head', $1)
       returning id`,
      [userA],
    );
    const fixture = await pool.query<{ id: string }>(
      `insert into tournament_fixture
         (tournament_id, fixture_number, status, outcome, home_score, away_score, settled_at)
       values ($1, 1, 'settled', 'home_win', 1, 0, now())
       returning id`,
      [tournament.rows[0]!.id],
    );
    await pool.query(
      `insert into tournament_fixture_segment
         (fixture_id, sequence_number, kind, duel_match_id, status,
          home_score, away_score, rules_snapshot, settled_at)
       values ($1, 1, 'regulation', $2, 'settled', 1, 0, '{}'::jsonb, now())`,
      [fixture.rows[0]!.id, tournamentMatchId],
    );
    const ordinaryChallenge = await challenge(templateId);
    expect(ordinaryChallenge.statusCode).toBe(200);
    const ordinaryMatchId = ordinaryChallenge.json().match.id as string;

    const list = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().matches.map((match: { id: string }) => match.id)).toEqual([
      ordinaryMatchId,
      tournamentMatchId,
    ]);

    const detail = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${tournamentMatchId}`,
      headers: auth(tokenA),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().match).toMatchObject({
      id: tournamentMatchId,
      source: 'tournament',
      status: 'settled',
      winner_user_id: userA,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const settlementReadback = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${tournamentMatchId}/settle`,
        headers: auth(tokenA),
      });
      expect(settlementReadback.statusCode).toBe(200);
      expect(settlementReadback.json().match).toMatchObject({
        id: tournamentMatchId,
        source: 'tournament',
        status: 'settled',
        winner_user_id: userA,
      });
    }

    await pool.query(
      `update game_settings set value = 'false'::jsonb where key = 'tournaments.enabled'`,
    );
    const hiddenList = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });
    expect(hiddenList.statusCode).toBe(200);
    expect(hiddenList.json().matches.map((match: { id: string }) => match.id)).toEqual([
      ordinaryMatchId,
    ]);
    const hiddenDetail = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${tournamentMatchId}`,
      headers: auth(tokenA),
    });
    expect(hiddenDetail.statusCode).toBe(404);
    const hiddenSettlementReadback = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${tournamentMatchId}/settle`,
      headers: auth(tokenA),
    });
    expect(hiddenSettlementReadback.statusCode).toBe(404);
  });

  it('keeps cancelled and expired tournament duel settlement readback idempotent', async () => {
    const templateId = await createTemplate();
    await pool.query(
      `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
    );

    for (const terminalStatus of ['cancelled', 'expired'] as const) {
      const created = await challenge(templateId);
      expect(created.statusCode).toBe(200);
      const matchId = created.json().match.id as string;
      await pool.query(
        `update amateur_duel_match
            set source = 'tournament', status = $2, settled_reason = $2, settled_at = now()
          where id = $1`,
        [matchId, terminalStatus],
      );
      await attachTournamentHierarchy(matchId, {
        slug: `terminal-duel-${terminalStatus}`,
        tournamentStatus: 'completed',
        fixtureStatus: 'cancelled',
        segmentStatus: 'cancelled',
      });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const settlementReadback = await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/settle`,
          headers: auth(tokenA),
        });
        expect(settlementReadback.statusCode).toBe(200);
        expect(settlementReadback.json().match).toMatchObject({
          id: matchId,
          source: 'tournament',
          status: terminalStatus,
        });
      }
    }
  });

  it('uses the freshly locked status when a tournament duel settles during mixed list readback', async () => {
    const templateId = await createTemplate();
    await pool.query(
      `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
    );
    const created = await challenge(templateId);
    expect(created.statusCode).toBe(200);
    const matchId = created.json().match.id as string;
    await pool.query(
      `update amateur_duel_match set source = 'tournament', status = 'active' where id = $1`,
      [matchId],
    );
    const hierarchy = await attachTournamentHierarchy(matchId, {
      slug: 'concurrent-settled-list-readback',
      tournamentStatus: 'regular',
      fixtureStatus: 'active',
      segmentStatus: 'active',
    });
    const blocker = await pool.connect();
    let list;
    let blocked;
    try {
      await blocker.query('begin');
      const blockerBackend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query(`select pg_advisory_xact_lock(hashtext($1))`, [
        `tournament:${hierarchy.tournamentId}`,
      ]);
      const listPromise = app.inject({
        method: 'GET',
        url: '/duel/amateur/matches',
        headers: auth(tokenA),
      });
      blocked = await waitForBlockedWriter(
        pool,
        blockerBackend.rows[0]!.pid,
        /pg_advisory_xact_lock/i,
      );
      await pool.query(
        `update amateur_duel_match
            set status = 'settled', winner_user_id = $2, outcome = 'challenger_win',
                settled_reason = 'completed', settled_at = now()
          where id = $1`,
        [matchId, userA],
      );
      await pool.query(
        `update amateur_duel_participant
            set state = 'completed', completed_at = now(),
                result_points = case when user_id = $2 then 3 else 0 end
          where match_id = $1`,
        [matchId, userA],
      );
      await pool.query(
        `update tournament_fixture_segment set status = 'settled', settled_at = now()
          where fixture_id = $1`,
        [hierarchy.fixtureId],
      );
      await pool.query(
        `update tournament_fixture
            set status = 'settled', outcome = 'home_win', home_score = 1, settled_at = now()
          where id = $1`,
        [hierarchy.fixtureId],
      );
      await pool.query(
        `update tournament set status = 'completed', completed_at = now() where id = $1`,
        [hierarchy.tournamentId],
      );
      await blocker.query('commit');
      list = await listPromise;
    } finally {
      await blocker.query('rollback').catch(() => undefined);
      blocker.release();
    }

    expect(blocked.query).toMatch(/pg_advisory_xact_lock/i);
    expect(list.statusCode).toBe(200);
    expect(list.json().matches).toContainEqual(
      expect.objectContaining({ id: matchId, source: 'tournament', status: 'settled' }),
    );
  });

  it('hides disabled tournament duels while ordinary amateur duels remain usable', async () => {
    const templateId = await createTemplate();
    const tournamentChallenge = await challenge(templateId);
    const tournamentMatchId = tournamentChallenge.json().match.id as string;
    await pool.query(`update amateur_duel_match set source = 'tournament' where id = $1`, [
      tournamentMatchId,
    ]);
    const ordinaryChallenge = await challenge(templateId);
    const ordinaryMatchId = ordinaryChallenge.json().match.id as string;

    const list = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().matches.map((match: { id: string }) => match.id)).toEqual([ordinaryMatchId]);
    const hidden = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${tournamentMatchId}`,
      headers: auth(tokenA),
    });
    expect(hidden.statusCode).toBe(404);

    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
       on conflict (key) do update set value = excluded.value`,
    );
    try {
      const visible = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${tournamentMatchId}`,
        headers: auth(tokenA),
      });
      expect(visible.statusCode).toBe(200);
      const orphanedMutation = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${tournamentMatchId}/ready`,
        headers: auth(tokenA),
        payload: { loadout: {} },
      });
      expect(orphanedMutation.statusCode).toBe(409);
      expect(orphanedMutation.json().error.message).toBe('tournament duel is not playable');
      const ordinary = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${ordinaryMatchId}`,
        headers: auth(tokenA),
      });
      expect(ordinary.statusCode).toBe(200);
    } finally {
      await pool.query(
        `insert into game_settings (key, value, label, description)
         values ('tournaments.enabled', 'false'::jsonb, 'Турниры включены', 'test')
         on conflict (key) do update set value = excluded.value`,
      );
    }
  });

  it('limits one player to five open duel slots', async () => {
    const templateId = await createTemplate();
    const opponentIds = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createOpponent(index)),
    );

    for (const opponentId of opponentIds.slice(0, 5)) {
      const created = await challenge(templateId, opponentId);
      expect(created.statusCode).toBe(200);
      expect(created.json().match.status).toBe('invited');
    }

    const blocked = await challenge(templateId, opponentIds[5]);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toBe('open duel slot limit reached');
  });

  it('rejects duel challenges from beginners and against beginners', async () => {
    const templateId = await createTemplate();

    await pool.query(`update users set level = 1, lifetime_goals_total = 116 where id = $1`, [
      userA,
    ]);
    const fromBeginner = await challenge(templateId);
    expect(fromBeginner.statusCode).toBe(403);
    expect(fromBeginner.json().error).toMatchObject({
      code: 'amateur_level_required',
      details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });

    await pool.query(`update users set level = 2 where id = $1`, [userA]);
    await pool.query(`update users set level = 1, lifetime_goals_total = 116 where id = $1`, [
      userB,
    ]);
    const againstBeginner = await challenge(templateId);
    expect(againstBeginner.statusCode).toBe(403);
    expect(againstBeginner.json().error).toMatchObject({
      code: 'amateur_level_required',
      details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
    });

    const [{ rows: matches }, { rows: balances }] = await Promise.all([
      pool.query(`select id from amateur_duel_match`),
      pool.query<{ user_id: string; balance: number; reserved_balance: number }>(
        `select user_id, balance, reserved_balance
           from user_currency_account
          where user_id = any($1::uuid[])
          order by user_id`,
        [[userA, userB]],
      ),
    ]);
    expect(matches).toEqual([]);
    expect(balances).toEqual([
      expect.objectContaining({ balance: 100, reserved_balance: 0 }),
      expect.objectContaining({ balance: 100, reserved_balance: 0 }),
    ]);
  });

  it.each([
    {
      label: 'decline',
      setup: async () => {
        const templateId = await createTemplate();
        const created = await app.inject({
          method: 'POST',
          url: '/duel/amateur/challenge',
          headers: auth(tokenB),
          payload: { template_id: templateId, opponent_user_id: userA },
        });
        expect(created.statusCode).toBe(200);
        return {
          method: 'POST' as const,
          url: `/duel/amateur/matches/${String(created.json().match.id)}/decline`,
        };
      },
    },
    {
      label: 'cancel',
      setup: async () => {
        const matchId = String((await challenge(await createTemplate())).json().match.id);
        return { method: 'POST' as const, url: `/duel/amateur/matches/${matchId}/cancel` };
      },
    },
    {
      label: 'ready',
      setup: async () => {
        const matchId = String((await challenge(await createTemplate())).json().match.id);
        const accepted = await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/accept`,
          headers: auth(tokenB),
        });
        expect(accepted.statusCode).toBe(200);
        return {
          method: 'POST' as const,
          url: `/duel/amateur/matches/${matchId}/ready`,
          payload: { loadout: {} },
        };
      },
    },
    {
      label: 'tournament loadout confirmation',
      setup: async () => {
        const matchId = await createActiveMatch();
        await pool.query(
          `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
        );
        await pool.query(
          `update amateur_duel_match
              set source = 'tournament',
                  ranked = false,
                  rules_snapshot = jsonb_set(
                    rules_snapshot,
                    '{tournamentLoadoutLifecycleVersion}',
                    '1'::jsonb
                  )
            where id = $1`,
          [matchId],
        );
        await attachTournamentHierarchy(matchId, {
          slug: 'beginner-retained-loadout',
          tournamentStatus: 'regular',
          fixtureStatus: 'active',
          segmentStatus: 'active',
        });
        return {
          method: 'POST' as const,
          url: `/duel/amateur/matches/${matchId}/tournament-loadout`,
          payload: { loadout: {} },
        };
      },
    },
    {
      label: 'matchmaking leave',
      setup: async () => {
        const templateId = await createTemplate();
        const joined = await app.inject({
          method: 'POST',
          url: '/duel/amateur/matchmaking/join',
          headers: auth(tokenA),
          payload: { template_id: templateId },
        });
        expect(joined.statusCode).toBe(200);
        return { method: 'POST' as const, url: '/duel/amateur/matchmaking/leave', payload: {} };
      },
    },
    {
      label: 'matchmaking rejoin before retained-ticket cancellation',
      setup: async () => {
        const templateId = await createTemplate({
          periodDurationMs: 120_000,
          readyDurationMs: 60_000,
        });
        const joined = await app.inject({
          method: 'POST',
          url: '/duel/amateur/matchmaking/join',
          headers: auth(tokenA),
          payload: { template_id: templateId },
        });
        expect(joined.statusCode).toBe(200);
        await scheduleTournamentLock(userA, 3_600_000 + 150_000);
        return {
          method: 'POST' as const,
          url: '/duel/amateur/matchmaking/join',
          payload: { template_id: templateId },
        };
      },
    },
    {
      label: 'active loadout update',
      setup: async () => {
        const stickId = await createInventoryItem('stick', 'Retained beginner stick');
        await pool.query(
          `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
           values ($1, $2, 2)`,
          [userA, stickId],
        );
        const matchId = await createActiveMatch(true);
        return {
          method: 'PATCH' as const,
          url: `/duel/amateur/matches/${matchId}/loadout`,
          payload: { loadout: { stick: stickId } },
        };
      },
    },
    {
      label: 'period start',
      setup: async () => {
        const matchId = await createActiveMatch();
        return {
          method: 'POST' as const,
          url: `/duel/amateur/matches/${matchId}/period/start`,
          payload: {},
        };
      },
    },
    {
      label: 'shot',
      setup: async () => {
        const matchId = await createActiveMatch(true);
        return {
          method: 'POST' as const,
          url: `/duel/amateur/matches/${matchId}/shot`,
          payload: { shot_index: 1, input: { tapTime: 1000 }, claimed_result: 'goal' },
        };
      },
    },
    {
      label: 'settlement',
      setup: async () => {
        const matchId = await createActiveMatch();
        await pool.query(
          `update amateur_duel_match
              set starts_at = now() - interval '2 minutes',
                  ends_at = now() - interval '1 minute'
            where id = $1`,
          [matchId],
        );
        return { method: 'POST' as const, url: `/duel/amateur/matches/${matchId}/settle` };
      },
    },
  ])(
    'rejects retained Amateur $label mutations for a demoted beginner without side effects',
    async ({ setup }) => {
      const request = await setup();
      await pool.query(`update users set level = 1, lifetime_goals_total = 116 where id = $1`, [
        userA,
      ]);
      const before = await snapshotRestrictedAmateurState();
      const publish = vi.spyOn(app.realtime, 'publish');

      try {
        const response = await app.inject({
          method: request.method,
          url: request.url,
          headers: auth(tokenA),
          ...(request.payload === undefined ? {} : { payload: request.payload }),
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().error).toEqual({
          code: 'amateur_level_required',
          message: 'amateur league is locked',
          details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
        });
        expect(await snapshotRestrictedAmateurState()).toEqual(before);
        expect(publish).not.toHaveBeenCalled();
      } finally {
        publish.mockRestore();
      }
    },
  );

  it('lets beginners browse eligible duel opponents without listing other beginners', async () => {
    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userA]);
    const beginnerSearch = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(beginnerSearch.statusCode).toBe(200);
    expect(beginnerSearch.json().users).toEqual([
      expect.objectContaining({ userId: userB, displayName: 'Player B' }),
    ]);

    await pool.query(`update users set level = 2 where id = $1`, [userA]);
    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userB]);
    const opponents = await app.inject({
      method: 'GET',
      url: '/duel/amateur/opponents',
      headers: auth(tokenA),
    });
    expect(opponents.statusCode).toBe(200);
    expect(opponents.json().users).toEqual([]);
  });

  it('uses relaxed ranked limits for new duel templates by default', async () => {
    const templateId = await createTemplate();

    const templates = await app.inject({
      method: 'GET',
      url: '/duel/amateur/templates',
      headers: auth(tokenA),
    });

    expect(templates.statusCode).toBe(200);
    const template = templates
      .json()
      .templates.find((item: { id: string }) => item.id === templateId);
    expect(template.ranked_daily_limit).toBe(100);
    expect(template.ranked_same_opponent_limit).toBe(100);
  });

  it('stores configured no-inventory skates and nutrition timings in duel rules snapshot', async () => {
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values
         ('amateur.no_inventory.skates.stumble_interval_min_rolls', '8'::jsonb, '', ''),
         ('amateur.no_inventory.skates.stumble_interval_max_rolls', '8'::jsonb, '', ''),
         ('amateur.no_inventory.nutrition.fatigue_grace_ms', '5000'::jsonb, '', ''),
         ('amateur.no_inventory.nutrition.fatigue_slowdown_start_ms', '5000'::jsonb, '', ''),
         ('amateur.no_inventory.nutrition.fatigue_stop_start_ms', '9000'::jsonb, '', ''),
         ('amateur.no_inventory.nutrition.fatigue_stop_duration_ms', '2000'::jsonb, '', ''),
         ('amateur.no_inventory.nutrition.fatigue_after_rest_ms', '5000'::jsonb, '', '')
       on conflict (key) do update
         set value = excluded.value`,
    );
    try {
      const templateId = await createTemplate();
      const created = await challenge(templateId);

      expect(created.statusCode).toBe(200);
      expect(created.json().match.rules.noInventoryTiming.skates.stumbleIntervalMinRolls).toBe(8);
      expect(created.json().match.rules.noInventoryTiming.skates.stumbleIntervalMaxRolls).toBe(8);
      expect(created.json().match.rules.noInventoryTiming.nutrition.fatigueGraceMs).toBe(5000);
      expect(created.json().match.rules.noInventoryTiming.nutrition.fatigueStopStartMs).toBe(9000);
      expect(created.json().match.rules.noInventoryTiming.nutrition.fatigueStopDurationMs).toBe(
        2000,
      );
    } finally {
      await pool.query(
        `update game_settings gs
            set value = defaults.value
           from (values
             ('amateur.no_inventory.skates.stumble_interval_min_rolls', '35'::jsonb),
             ('amateur.no_inventory.skates.stumble_interval_max_rolls', '55'::jsonb),
             ('amateur.no_inventory.nutrition.fatigue_grace_ms', '15000'::jsonb),
             ('amateur.no_inventory.nutrition.fatigue_slowdown_start_ms', '15000'::jsonb),
             ('amateur.no_inventory.nutrition.fatigue_stop_start_ms', '60000'::jsonb),
             ('amateur.no_inventory.nutrition.fatigue_stop_duration_ms', '5000'::jsonb),
             ('amateur.no_inventory.nutrition.fatigue_after_rest_ms', '30000'::jsonb)
           ) as defaults(key, value)
          where gs.key = defaults.key`,
      );
    }
  });

  it('keeps null period rules as SQL null when admin updates a duel template', async () => {
    await pool.query(`update users set role = 'admin' where id = $1`, [userA]);
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack', durationMs: 180000, shotsLimit: null },
      ],
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/duel-templates/${templateId}`,
      headers: auth(tokenA),
      payload: { periodRules: null },
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().template.periodRules).toHaveLength(2);
    const stored = await pool.query<{ period_rules: unknown }>(
      `select period_rules from amateur_duel_template where id = $1`,
      [templateId],
    );
    expect(stored.rows[0]?.period_rules).toBeNull();
  });

  it('snapshots editable reward rules into a created duel despite later template edits', async () => {
    await pool.query(`update users set role = 'admin' where id = $1`, [userA]);
    const templateId = await createTemplate();
    const rewardRules = {
      equalExperienceTolerancePercent: 15,
      strongerWin: { coins: 30, stars: 3, tokens: 2 },
      equalWin: { coins: 20, stars: 2, tokens: 1 },
      weakerWin: { coins: 10, stars: 1, tokens: 0 },
      draw: { coins: 5, stars: 0, tokens: 0 },
      loss: { coins: 0, stars: 0, tokens: 0 },
    };

    const defaults = await app.inject({
      method: 'GET',
      url: '/admin/duel-templates',
      headers: auth(tokenA),
    });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().templates[0].rewardRules).toEqual({
      equalExperienceTolerancePercent: 10,
      strongerWin: { coins: 0, stars: 0, tokens: 0 },
      equalWin: { coins: 0, stars: 0, tokens: 0 },
      weakerWin: { coins: 0, stars: 0, tokens: 0 },
      draw: { coins: 0, stars: 0, tokens: 0 },
      loss: { coins: 0, stars: 0, tokens: 0 },
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/duel-templates/${templateId}`,
      headers: auth(tokenA),
      payload: { rewardRules },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().template.rewardRules).toEqual(rewardRules);

    const created = await challenge(templateId);
    expect(created.statusCode).toBe(200);
    expect(created.json().match.rules.rewardRules).toEqual(rewardRules);

    const reset = await app.inject({
      method: 'PATCH',
      url: `/admin/duel-templates/${templateId}`,
      headers: auth(tokenA),
      payload: {
        rewardRules: {
          ...rewardRules,
          equalExperienceTolerancePercent: 0,
          strongerWin: { coins: 0, stars: 0, tokens: 0 },
        },
      },
    });
    expect(reset.statusCode).toBe(200);

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${created.json().match.id}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().match.rules.rewardRules).toEqual(rewardRules);
  });

  it('accepts storage-compatible reward amounts through the API and database constraint', async () => {
    await pool.query(`update users set role = 'admin' where id = $1`, [userA]);
    const templateId = await createTemplate();
    const baseRewardRules = {
      equalExperienceTolerancePercent: 10,
      strongerWin: { coins: 0, stars: 0, tokens: 0 },
      equalWin: { coins: 0, stars: 0, tokens: 0 },
      weakerWin: { coins: 0, stars: 0, tokens: 0 },
      draw: { coins: 0, stars: 0, tokens: 0 },
      loss: { coins: 0, stars: 0, tokens: 0 },
    };

    for (const coins of [2147483646, 2147483647]) {
      const rewardRules = {
        ...baseRewardRules,
        strongerWin: { coins, stars: 0, tokens: 0 },
      };
      const patch = await app.inject({
        method: 'PATCH',
        url: `/admin/duel-templates/${templateId}`,
        headers: auth(tokenA),
        payload: { rewardRules },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().template.rewardRules).toEqual(rewardRules);

      const valid = await pool.query<{ valid: boolean }>(
        'select duel_reward_rules_valid($1::jsonb) as valid',
        [JSON.stringify(rewardRules)],
      );
      expect(valid.rows[0]?.valid).toBe(true);
    }

    const unsafe = await app.inject({
      method: 'PATCH',
      url: `/admin/duel-templates/${templateId}`,
      headers: auth(tokenA),
      payload: {
        rewardRules: {
          ...baseRewardRules,
          strongerWin: { coins: 2147483648, stars: 0, tokens: 0 },
        },
      },
    });
    expect(unsafe.statusCode).toBe(400);

    const decimal = await pool.query<{ valid: boolean }>(
      'select duel_reward_rules_valid($1::jsonb) as valid',
      [
        JSON.stringify({
          ...baseRewardRules,
          strongerWin: { coins: 1, stars: 0, tokens: 0 },
        }).replace('"coins":1,', '"coins":1.0,'),
      ],
    );
    expect(decimal.rows[0]?.valid).toBe(true);

    const invalid = await pool.query<{ valid: boolean }>(
      'select duel_reward_rules_valid($1::jsonb) as valid',
      [
        JSON.stringify({
          ...baseRewardRules,
          strongerWin: {
            coins: 2147483648,
            stars: 0,
            tokens: 0,
          },
        }),
      ],
    );
    expect(invalid.rows[0]?.valid).toBe(false);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/admin/duel-templates/${templateId}`,
          headers: auth(tokenA),
          payload: { winCurrencyReward: 1 },
        })
      ).statusCode,
    ).toBe(400);
    await expect(
      pool.query('update amateur_duel_template set win_currency_reward=1 where id=$1', [
        templateId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('completely settles a storage-boundary matrix including additive legacy rewards', async () => {
    const templateId = await createTemplate({ winStarReward: 1 });
    await pool.query(
      `update amateur_duel_template set win_currency_reward=1,
      reward_rules=jsonb_set(reward_rules,'{equalWin}','{"coins":2147483546,"stars":2147483646,"tokens":2147483647}') where id=$1`,
      [templateId],
    );
    const matchId = (await challenge(templateId)).json().match.id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/accept`,
          headers: auth(tokenB),
        })
      ).statusCode,
    ).toBe(200);
    await pool.query("update amateur_duel_match set status='active' where id=$1", [matchId]);
    await pool.query(
      "update amateur_duel_participant set state='completed',current_period=1,shots_taken=2,goals=case when user_id=$2 then 2 else 1 end,experience_snapshot=0,completed_at=now() where match_id=$1",
      [matchId, userA],
    );
    const settle = () =>
      app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/settle`,
        headers: auth(tokenA),
      });
    expect((await settle()).statusCode).toBe(200);
    expect(
      (
        await pool.query(
          `select u.xp,c.balance,t.balance as tokens from users u join user_currency_account c on c.user_id=u.id join user_reward_token_account t on t.user_id=u.id where u.id=$1`,
          [userA],
        )
      ).rows[0],
    ).toEqual({ xp: 2147483647, balance: 2147483647, tokens: 2147483647 });
    expect((await settle()).statusCode).toBe(200);
    expect(
      (
        await pool.query(
          "select count(*)::int as count from currency_ledger where duel_match_id=$1 and reason='duel_reward'",
          [matchId],
        )
      ).rows[0]?.count,
    ).toBe(2);
  });

  it('accepts into a ready room without reserving stake or fee yet', async () => {
    const templateId = await createTemplate({
      startsAt: '2099-01-01T00:00:00.000Z',
      endsAt: '2100-01-01T00:00:00.000Z',
      stake: 10,
      fee: 2,
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().match.status).toBe('ready_check');
    expect(accepted.json().match.ready_expires_at).toBeTruthy();

    const acceptedMessage = await pool.query<{ chat_id: string; content: string }>(
      `select chat_id, content
         from messages
        where content like '%принял дуэль%'
        order by created_at desc
        limit 1`,
    );
    expect(acceptedMessage.rows[0]?.content).toBe('Player B принял дуэль «Test duel».');

    const unreadForChallenger = await app.inject({
      method: 'GET',
      url: '/chat/unread',
      headers: auth(tokenA),
    });
    expect(unreadForChallenger.statusCode).toBe(200);
    expect(unreadForChallenger.json()).not.toHaveProperty(acceptedMessage.rows[0]!.chat_id);

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);
  });

  it('starts an active duel only after both players are ready without touching balances', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    const firstReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    expect(firstReady.statusCode).toBe(200);
    expect(firstReady.json().match.status).toBe('ready_check');
    expect(firstReady.json().match.me.state).toBe('ready');

    const secondReady = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    expect(secondReady.statusCode).toBe(200);
    expect(secondReady.json().match.status).toBe('active');
    expect(secondReady.json().match.me.display_name).toBe('Player B');
    expect(secondReady.json().match.opponent.display_name).toBe('Player A');
    expect(secondReady.json().match.accepted_at).toBeTruthy();
    const acceptedAt = Date.parse(String(secondReady.json().match.accepted_at));
    const endsAt = Date.parse(String(secondReady.json().match.ends_at));
    expect(endsAt - acceptedAt).toBe(1200000);

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);
  });

  it('uses active equipment as the default duel loadout', async () => {
    const stickId = await createInventoryItem('stick', 'Test stick');
    const skatesId = await createInventoryItem('skates', 'Test skates');
    const nutritionId = await createInventoryItem('nutrition', 'Test nutrition');
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 10), ($1, $3, 10), ($1, $4, 10)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available`,
      [userA, stickId, skatesId, nutritionId],
    );
    await pool.query(
      `insert into user_equipment
         (user_id, equipped_stick_item_id, equipped_skates_item_id, equipped_nutrition_item_id)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update
          set equipped_stick_item_id = excluded.equipped_stick_item_id,
              equipped_skates_item_id = excluded.equipped_skates_item_id,
              equipped_nutrition_item_id = excluded.equipped_nutrition_item_id`,
      [userA, stickId, skatesId, nutritionId],
    );
    const templateId = await createTemplate({ totalPeriods: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    const itemIds = ready
      .json()
      .match.me.loadout.items.map((item: { id: string }) => item.id)
      .sort();
    expect(itemIds).toEqual([nutritionId, skatesId, stickId].sort());
    expect(ready.json().match.me.loadout.powerScore).toBe(30);
  });

  it('snapshots duel inventory resource units and timing', async () => {
    const stickId = await createInventoryItem('stick', 'Ультимейт Ван 1');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1300,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0.10,
              duel_period_cost = 0
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1300)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available`,
      [userA, stickId],
    );
    await pool.query(
      `insert into user_equipment (user_id, equipped_stick_item_id)
       values ($1, $2)
       on conflict (user_id) do update
          set equipped_stick_item_id = excluded.equipped_stick_item_id`,
      [userA, stickId],
    );
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });

    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    const stick = ready
      .json()
      .match.me.loadout.items.find((item: { id: string }) => item.id === stickId);
    expect(stick).toMatchObject({
      id: stickId,
      title: 'Ультимейт Ван 1',
      resourceUnit: 'shot',
      resourceAvailable: 1300,
      effectPuckSpeedPoints: 10,
      timing: {
        nutritionSlowdownMs: 2000,
        nutritionStopMs: 5000,
      },
    });
  });

  it('returns inventory state and updates active equipment', async () => {
    const stickId = await createInventoryItem('stick', 'Locker stick');
    const oneShotStickId = await createInventoryItem('stick', 'One shot stick');
    const twoShotStickId = await createInventoryItem('stick', 'Two shot stick');
    const fiveShotStickId = await createInventoryItem('stick', 'Five shot stick');
    const twentyOneShotStickId = await createInventoryItem('stick', 'Twenty one shot stick');
    const energyNutritionId = await createInventoryItem('nutrition', 'Energy nutrition');
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 3),
              ($1, $3, 1),
              ($1, $4, 2),
              ($1, $5, 5),
              ($1, $6, 21),
              ($1, $7, 59999)`,
      [
        userA,
        stickId,
        oneShotStickId,
        twoShotStickId,
        fiveShotStickId,
        twentyOneShotStickId,
        energyNutritionId,
      ],
    );
    await pool.query(
      `update admin_inventory_items
          set resource_unit = case id
                when $1 then 'shot'
                when $2 then 'shot'
                when $3 then 'shot'
                when $4 then 'shot'
                when $5 then 'energy_ms'
                else resource_unit
              end
        where id = any($6::uuid[])`,
      [
        oneShotStickId,
        twoShotStickId,
        fiveShotStickId,
        twentyOneShotStickId,
        energyNutritionId,
        [oneShotStickId, twoShotStickId, fiveShotStickId, twentyOneShotStickId, energyNutritionId],
      ],
    );

    const saved = await app.inject({
      method: 'PATCH',
      url: '/inventory/equipment',
      headers: auth(tokenA),
      payload: { stickItemId: stickId },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().equipped.stickItemId).toBe(stickId);

    const state = await app.inject({
      method: 'GET',
      url: '/inventory/me',
      headers: auth(tokenA),
    });
    expect(state.statusCode).toBe(200);
    const stick = state.json().items.stick.find((item: { id: string }) => item.id === stickId);
    expect(stick?.chargesAvailable).toBe(3);
    const labelById = new Map(
      [...state.json().items.stick, ...state.json().items.nutrition].map(
        (item: { id: string; resourceLabel: string }) => [item.id, item.resourceLabel],
      ),
    );
    expect(labelById.get(oneShotStickId)).toBe('1 бросок');
    expect(labelById.get(twoShotStickId)).toBe('2 броска');
    expect(labelById.get(fiveShotStickId)).toBe('5 бросков');
    expect(labelById.get(twentyOneShotStickId)).toBe('21 бросок');
    expect(labelById.get(energyNutritionId)).toBe('1 минута энергии');
  });

  it('purchases inventory with currency balance', async () => {
    const stickId = await createInventoryItem('stick', 'Bronze shop stick');
    await pool.query(
      `update admin_inventory_items
          set currency_price = 40,
              charges_per_purchase = 5
        where id = $1`,
      [stickId],
    );

    const purchased = await app.inject({
      method: 'POST',
      url: `/inventory/items/${stickId}/purchase`,
      headers: auth(tokenA),
    });

    expect(purchased.statusCode).toBe(200);
    expect(purchased.json().balances.tokens).toBe(60);
    const stick = purchased
      .json()
      .items.stick.find((item: { itemId: string }) => item.itemId === stickId);
    expect(stick?.chargesAvailable).toBe(5);
    expect(stick?.chargesPerPurchase).toBe(5);
    expect(purchased.json().purchaseHistory).toBeUndefined();
    expect(purchased.json().transactionHistory).toBeUndefined();

    const ledger = await pool.query<{ available_delta: number; balance_after: number }>(
      `select available_delta, balance_after
         from currency_ledger
        where user_id = $1 and reason = 'inventory_purchase'`,
      [userA],
    );
    expect(ledger.rows).toEqual([{ available_delta: -40, balance_after: 60 }]);

    await pool.query(
      `insert into currency_ledger
         (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
       values ($1, 'weekly_challenge_reward', 25, 0, 85, 0, $2)`,
      [userA, JSON.stringify({ stars: 2, experience: 10, title: 'Недельная награда' })],
    );
    await pool.query(
      `insert into payments (user_id, title, amount_rub, status, paid_at)
       values ($1, 'Игровой запас', 299, 'paid', now())`,
      [userA],
    );

    const state = await app.inject({
      method: 'GET',
      url: '/inventory/me',
      headers: auth(tokenA),
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().transactionHistory).toBeUndefined();

    const history = await app.inject({
      method: 'GET',
      url: '/inventory/transactions?filter=all&limit=20',
      headers: auth(tokenA),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Bronze shop stick',
          category: 'inventory',
          flow: 'debit',
          amounts: [{ currency: 'coin', value: -40 }],
        }),
        expect.objectContaining({
          title: 'Недельная награда',
          category: 'reward',
          flow: 'credit',
          amounts: [
            { currency: 'coin', value: 25 },
            { currency: 'star', value: 2 },
            { currency: 'experience', value: 10 },
          ],
        }),
        expect.objectContaining({
          title: 'Игровой запас',
          category: 'bank',
          flow: 'debit',
          amounts: [{ currency: 'ruble', value: -299 }],
        }),
      ]),
    );
    expect(history.json().nextCursor).toBeNull();
  });

  it('uses one recovery kit for the exact latest gameplay window and is idempotent', async () => {
    const recoveryItemId = '10900000-0000-4000-8000-000000000030';
    const instanceId = await createInventoryInstance(userA, recoveryItemId, 2);
    const training = await pool.query<{ id: string }>(
      `insert into training_session
         (user_id, day_date, selected_period, state, game_core_version, training_seed)
       values ($1, (now() at time zone 'Europe/Moscow')::date, 1, 'active', 1, 'recovery-test')
       returning id`,
      [userA],
    );
    const shot = await pool.query<{ id: string; created_at: Date }>(
      `insert into shot_session
         (user_id, mode, training_session_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version)
       values ($1, 'training', $2, 1, 1, 'recovery-shot', '{}'::jsonb, 'save', 1)
       returning id, created_at`,
      [userA, training.rows[0]!.id],
    );
    const idempotencyKey = '10900000-0000-4000-8000-000000000001';

    const first = await app.inject({
      method: 'POST',
      url: '/inventory/recovery/use',
      headers: auth(tokenA),
      payload: {
        itemId: recoveryItemId,
        action: 'start_daily_period',
        buyIfNeeded: false,
        idempotencyKey,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      appliedMinutes: 30,
      gameplayLock: { blocked: true, reason: 'recent_gameplay' },
    });
    expect(Date.parse(first.json().gameplayLock.ends_at)).toBe(
      shot.rows[0]!.created_at.getTime() + 30 * 60_000,
    );

    const replay = await app.inject({
      method: 'POST',
      url: '/inventory/recovery/use',
      headers: auth(tokenA),
      payload: {
        itemId: recoveryItemId,
        action: 'start_daily_period',
        buyIfNeeded: false,
        idempotencyKey,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().appliedMinutes).toBe(30);

    const instance = await pool.query<{ charges_available: number }>(
      `select charges_available from user_inventory_instance where id = $1`,
      [instanceId],
    );
    expect(instance.rows[0]?.charges_available).toBe(1);
    const applications = await pool.query<{ count: number }>(
      `select count(*)::int as count from recovery_kit_application where user_id = $1`,
      [userA],
    );
    expect(applications.rows[0]?.count).toBe(1);
  });

  it('rejects beginner Classic recovery before inventory or economy state changes', async () => {
    const recoveryItemId = '10900000-0000-4000-8000-000000000030';
    await pool.query(`update users set level = 1, lifetime_goals_total = 0 where id = $1`, [userA]);
    const training = await pool.query<{ id: string }>(
      `insert into training_session
         (user_id, day_date, selected_period, state, game_core_version, training_seed)
       values ($1, (now() at time zone 'Europe/Moscow')::date, 1, 'active', 1, 'classic-recovery-guard')
       returning id`,
      [userA],
    );
    await pool.query(
      `insert into shot_session
         (user_id, mode, training_session_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version)
       values ($1, 'training', $2, 1, 1, 'classic-recovery-guard-shot', '{}'::jsonb, 'save', 1)`,
      [userA, training.rows[0]!.id],
    );
    const snapshot = async () => {
      const { rows } = await pool.query<{
        balance: number;
        inventory_instances: number;
        legacy_inventory_rows: number;
        recovery_applications: number;
        ledger_entries: number;
      }>(
        `select account.balance::int,
                (select count(*)::int from user_inventory_instance where user_id = account.user_id)
                  as inventory_instances,
                (select count(*)::int from user_inventory_item where user_id = account.user_id)
                  as legacy_inventory_rows,
                (select count(*)::int from recovery_kit_application where user_id = account.user_id)
                  as recovery_applications,
                (select count(*)::int from currency_ledger where user_id = account.user_id)
                  as ledger_entries
           from user_currency_account account
          where account.user_id = $1`,
        [userA],
      );
      return rows[0]!;
    };
    const before = await snapshot();

    const response = await app.inject({
      method: 'POST',
      url: '/inventory/recovery/use',
      headers: auth(tokenA),
      payload: {
        itemId: recoveryItemId,
        action: 'start_classic',
        buyIfNeeded: true,
        idempotencyKey: '10900000-0000-4000-8000-000000000032',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toEqual({
      code: 'amateur_level_required',
      message: 'amateur league is locked',
      details: { goalsRemaining: 300, unlockGoalsRequired: 300 },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('paginates and filters inventory transaction history', async () => {
    await pool.query(
      `insert into currency_ledger
         (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata, created_at)
       select $1, 'weekly_challenge_reward', 1, 0, 101, 0,
              jsonb_build_object('title', 'Награда ' || series),
              timestamptz '2026-09-06 18:00:00+03' - series * interval '1 minute'
         from generate_series(1, 21) as series`,
      [userA],
    );
    await pool.query(
      `insert into payments (user_id, title, amount_rub, status, paid_at, created_at)
       values ($1, 'Игровой запас', 299, 'paid', now(), timestamptz '2026-09-05 12:00:00+03')`,
      [userA],
    );

    const first = await app.inject({
      method: 'GET',
      url: '/inventory/transactions?filter=credit&limit=20',
      headers: auth(tokenA),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().transactions).toHaveLength(20);
    expect(first.json().nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: 'GET',
      url: `/inventory/transactions?filter=credit&limit=20&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: auth(tokenA),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().transactions).toHaveLength(1);
    expect(second.json().nextCursor).toBeNull();
    expect(second.json().transactions[0].id).not.toBe(first.json().transactions[19].id);

    const rubles = await app.inject({
      method: 'GET',
      url: '/inventory/transactions?filter=ruble&limit=20',
      headers: auth(tokenA),
    });
    expect(rubles.statusCode).toBe(200);
    expect(rubles.json().transactions).toHaveLength(1);
    expect(rubles.json().transactions[0]).toMatchObject({ category: 'bank' });
  });

  it('keeps duplicate inventory purchases as separate instances', async () => {
    const stickId = await createInventoryItem('stick', 'Duplicate shop stick');
    await pool.query(
      `update admin_inventory_items
          set currency_price = 10,
              charges_per_purchase = 5,
              resource_unit = 'shot'
        where id = $1`,
      [stickId],
    );

    const first = await app.inject({
      method: 'POST',
      url: `/inventory/items/${stickId}/purchase`,
      headers: auth(tokenA),
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/inventory/items/${stickId}/purchase`,
      headers: auth(tokenA),
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().balances.tokens).toBe(80);
    const sticks = second
      .json()
      .items.stick.filter((item: { itemId: string }) => item.itemId === stickId);
    expect(sticks).toHaveLength(2);
    expect(new Set(sticks.map((item: { id: string }) => item.id)).size).toBe(2);
    expect(sticks.map((item: { chargesAvailable: number }) => item.chargesAvailable)).toEqual([
      5, 5,
    ]);

    const legacyAggregate = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(legacyAggregate.rows[0]?.charges_available).toBe(10);
  });

  it('equips one concrete inventory instance instead of the whole catalogue item', async () => {
    const stickId = await createInventoryItem('stick', 'Concrete stick');
    const firstInstanceId = await createInventoryInstance(userA, stickId, 1);
    const secondInstanceId = await createInventoryInstance(userA, stickId, 3);

    const saved = await app.inject({
      method: 'PATCH',
      url: '/inventory/equipment',
      headers: auth(tokenA),
      payload: { stickItemId: secondInstanceId },
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().equipped.stickItemId).toBe(secondInstanceId);
    const activeStick = saved
      .json()
      .items.stick.find((item: { id: string }) => item.id === secondInstanceId);
    expect(activeStick).toMatchObject({
      id: secondInstanceId,
      instanceId: secondInstanceId,
      itemId: stickId,
      chargesAvailable: 3,
    });
    expect(
      saved.json().items.stick.some((item: { id: string }) => item.id === firstInstanceId),
    ).toBe(true);
  });

  it('rejects inventory purchase when currency balance is too low', async () => {
    const skatesId = await createInventoryItem('skates', 'Gold shop skates');
    await pool.query(
      `update admin_inventory_items
          set currency_price = 140,
              charges_per_purchase = 5
        where id = $1`,
      [skatesId],
    );

    const purchased = await app.inject({
      method: 'POST',
      url: `/inventory/items/${skatesId}/purchase`,
      headers: auth(tokenA),
    });

    expect(purchased.statusCode).toBe(409);
    const account = await pool.query<{ balance: number }>(
      `select balance from user_currency_account where user_id = $1`,
      [userA],
    );
    expect(account.rows[0]?.balance).toBe(100);
  });

  it('keeps a classic duel active long enough for all periods and breaks', async () => {
    const templateId = await createTemplate({
      totalPeriods: 3,
      periodDurationMs: 1200000,
      breakDurationMs: 120000,
      readyDurationMs: 900000,
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json().match.status).toBe('active');
    const acceptedAt = Date.parse(String(ready.json().match.accepted_at));
    const endsAt = Date.parse(String(ready.json().match.ends_at));
    expect(endsAt - acceptedAt).toBe(4440000);
  });

  it('cancels an active duel without rating when both ready players never start', async () => {
    const templateId = await createTemplate({ readyDurationMs: 15000 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    await pool.query(
      `update amateur_duel_match
          set starts_at = now() - interval '2 seconds',
              ends_at = now() - interval '1 second'
        where id = $1`,
      [matchId],
    );

    const settled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/settle`,
      headers: auth(tokenA),
    });

    expect(settled.statusCode).toBe(200);
    expect(settled.json().match.status).toBe('cancelled');
    expect(settled.json().match.settled_reason).toBe('no_play');
    const rating = await pool.query(
      `select * from amateur_duel_rating where user_id = any($1::uuid[])`,
      [[userA, userB]],
    );
    expect(rating.rowCount).toBe(0);
  });

  it('lets a challenger cancel an unanswered challenge without cooldown or reserves', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/cancel`,
      headers: auth(tokenA),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().match.status).toBe('cancelled');
    expect(cancelled.json().match.settled_reason).toBe('cancelled_by_challenger');
  });

  it('declines a pending challenge without reserving stake', async () => {
    const templateId = await createTemplate({ stake: 10, fee: 2 });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const declined = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/decline`,
      headers: auth(tokenB),
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json().match.status).toBe('cancelled');
    expect(declined.json().match.settled_reason).toBe('declined');

    const accounts = await pool.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = any($1::uuid[])
        order by user_id`,
      [[userA, userB]],
    );
    expect(accounts.rows).toEqual([
      { balance: 100, reserved_balance: 0 },
      { balance: 100, reserved_balance: 0 },
    ]);

    const notification = await pool.query<{ content: string }>(
      `select content
         from messages
        where content like '%отклонил приглашение%'
        order by created_at desc
        limit 1`,
    );
    expect(notification.rows[0]?.content).toBe(
      'Player B отклонил приглашение на дуэль «Test duel».',
    );
  });

  it('omits cancelled and expired duels from the match list', async () => {
    const templateId = await createTemplate();

    const settled = await challenge(templateId);
    const settledMatchId = settled.json().match.id;
    await pool.query(
      `update amateur_duel_match
          set status = 'settled',
              season_key = '2026-01',
              accepted_at = now(),
              settled_at = now(),
              settled_reason = 'completed',
              winner_user_id = $2,
              outcome = 'challenger_win'
        where id = $1`,
      [settledMatchId, userA],
    );
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed',
              shots_taken = case when user_id = $2 then 5 else 4 end,
              goals = case when user_id = $2 then 3 else 1 end,
              result_points = case when user_id = $2 then 3 else 0 end
        where match_id = $1`,
      [settledMatchId, userA],
    );

    const cancelled = await challenge(templateId);
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${cancelled.json().match.id}/cancel`,
      headers: auth(tokenA),
    });

    const expired = await challenge(templateId);
    await pool.query(
      `update amateur_duel_match
          set status = 'expired',
              settled_at = now(),
              settled_reason = 'not_accepted'
        where id = $1`,
      [expired.json().match.id],
    );

    const listed = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().matches.map((match: { id: string }) => match.id)).toEqual([
      settledMatchId,
    ]);

    const history = await app.inject({
      method: 'GET',
      url: '/duel/amateur/history?season_key=2026-01',
      headers: auth(tokenA),
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().matches.map((match: { id: string }) => match.id)).toEqual([
      settledMatchId,
    ]);
    expect(history.json().stats).toEqual({ duels: 1, wins: 1, points: 3 });
  });

  it('keeps tournament duels out of ordinary duel history while tournaments are enabled', async () => {
    const templateId = await createTemplate();

    async function createSettledMatch(source: 'challenge' | 'tournament') {
      const created = await challenge(templateId);
      const matchId = String(created.json().match.id);
      await pool.query(
        `update amateur_duel_match
            set source = $2, status = 'settled', season_key = '2026-01', settled_at = now(),
                settled_reason = 'completed', winner_user_id = challenger_user_id,
                outcome = 'challenger_win'
          where id = $1`,
        [matchId, source],
      );
      await pool.query(
        `update amateur_duel_participant
            set state = 'completed', shots_taken = 5,
                goals = case when user_id = $2 then 3 else 1 end,
                result_points = case when user_id = $2 then 3 else 0 end
          where match_id = $1`,
        [matchId, userA],
      );
      return matchId;
    }

    const ordinaryMatchId = await createSettledMatch('challenge');
    const tournamentMatchId = await createSettledMatch('tournament');
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
       on conflict (key) do update set value = excluded.value`,
    );

    const history = await app.inject({
      method: 'GET',
      url: '/duel/amateur/history?season_key=2026-01',
      headers: auth(tokenA),
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().matches.map((match: { id: string }) => match.id)).toEqual([
      ordinaryMatchId,
    ]);
    expect(history.json().matches).not.toContainEqual(
      expect.objectContaining({ id: tournamentMatchId }),
    );
    expect(history.json().stats).toEqual({ duels: 1, wins: 1, points: 3 });
  });

  it('builds rating from match-linked ordinary duel entries instead of the stale aggregate', async () => {
    const templateId = await createTemplate();

    async function createRatedMatch(source: 'challenge' | 'tournament') {
      const created = await challenge(templateId);
      const matchId = String(created.json().match.id);
      await pool.query(
        `update amateur_duel_match
            set source = $2, status = 'settled', ranked = true, season_key = '2026-09',
                settled_at = now(), settled_reason = 'completed',
                winner_user_id = challenger_user_id, outcome = 'challenger_win'
          where id = $1`,
        [matchId, source],
      );
      await pool.query(
        `update amateur_duel_participant
            set result_points = case when user_id = $2 then 3 else 0 end,
                goals = case when user_id = $2 then 4 else 2 end,
                active_duration_ms = case when user_id = $2 then 180000 else 190000 end
          where match_id = $1`,
        [matchId, userA],
      );
      await pool.query(
        `insert into amateur_duel_rating_match
           (match_id, user_id, season_key, points, wins, draws, losses,
            goals_for, goals_against, active_duration_seconds)
         values ($1, $2, '2026-09', 3, 1, 0, 0, 4, 2, 180),
                ($1, $3, '2026-09', 0, 0, 0, 1, 2, 4, 190)`,
        [matchId, userA, userB],
      );
      return matchId;
    }

    await createRatedMatch('challenge');
    await createRatedMatch('tournament');
    await pool.query(
      `insert into amateur_duel_rating
         (season_key, user_id, points, wins, draws, losses, goals_for, goals_against,
          matches_played, active_duration_seconds)
       values ('2026-09', $1, 99, 9, 0, 0, 99, 0, 9, 1),
              ('2026-09', $2, 0, 0, 0, 9, 0, 99, 9, 999)`,
      [userA, userB],
    );

    const rating = await app.inject({
      method: 'GET',
      url: '/duel/amateur/rating?season_key=2026-09',
      headers: auth(tokenA),
    });

    expect(rating.statusCode).toBe(200);
    expect(rating.json().rating).toEqual([
      expect.objectContaining({ user_id: userA, points: 3, wins: 1, matches_played: 1 }),
      expect.objectContaining({ user_id: userB, points: 0, losses: 1, matches_played: 1 }),
    ]);

    const history = await app.inject({
      method: 'GET',
      url: '/duel/amateur/history?season_key=2026-09',
      headers: auth(tokenA),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      rating_place: 1,
      stats: { duels: 1, wins: 1, points: 3 },
    });
  });

  it('returns rating visibility and available Moscow seasons', async () => {
    const templateId = await createTemplate();
    for (const [seasonKey, points, wins, draws] of [
      ['2026-04', 3, 1, 0],
      ['2026-05', 1, 0, 1],
    ] as const) {
      const created = await challenge(templateId);
      const matchId = String(created.json().match.id);
      await pool.query(
        `update amateur_duel_match
            set status = 'settled', ranked = true, season_key = $2, settled_at = now(),
                settled_reason = 'completed', winner_user_id = $3,
                outcome = case when $4::int = 1 then 'challenger_win' else 'draw' end
          where id = $1`,
        [matchId, seasonKey, userA, wins],
      );
      await pool.query(
        `insert into amateur_duel_rating_match
           (match_id, user_id, season_key, points, wins, draws, losses,
            goals_for, goals_against, active_duration_seconds)
         values ($1, $2, $3, $4, $5, $6, 0, 4, 2, 180)`,
        [matchId, userA, seasonKey, points, wins, draws],
      );
    }

    const enabled = await app.inject({
      method: 'GET',
      url: '/duel/amateur/rating?season_key=2026-04',
      headers: auth(tokenA),
    });

    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toMatchObject({
      season_key: '2026-04',
      rating_visible: true,
      available_seasons: ['2026-05', '2026-04'],
    });

    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('amateur.rating_visibility', '"disabled"'::jsonb, 'Рейтинг', 'test')
       on conflict (key) do update set value = excluded.value`,
    );
    const disabled = await app.inject({
      method: 'GET',
      url: '/duel/amateur/rating?season_key=2026-05',
      headers: auth(tokenA),
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().rating_visible).toBe(false);
    expect(disabled.json().rating).toHaveLength(1);
  });

  it('keeps awarding rating points while rating visibility is disabled', async () => {
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('amateur.rating_visibility', '"disabled"'::jsonb, 'Рейтинг', 'test')
       on conflict (key) do update set value = excluded.value`,
    );
    const templateId = await createTemplate({ totalPeriods: 1 });
    const created = await challenge(templateId);
    const matchId = String(created.json().match.id);
    const startedA = await acceptReadyAndStart(matchId);
    expect(startedA.statusCode).toBe(200);
    const startedB = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenB),
    });
    expect(startedB.statusCode).toBe(200);
    for (const [token, tapTime] of [
      [tokenA, 1000],
      [tokenB, 1200],
    ] as const) {
      const shot = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/shot`,
        headers: auth(token),
        payload: { shot_index: 1, input: { tapTime }, claimed_result: 'goal' },
      });
      expect(shot.statusCode).toBe(200);
    }
    const ratings = await pool.query<{ matches_played: number }>(
      `select count(*)::int as matches_played
         from amateur_duel_rating_match
        where user_id = any($1::uuid[])
        group by user_id`,
      [[userA, userB]],
    );
    expect(ratings.rows).toHaveLength(2);
    expect(ratings.rows.every((row) => row.matches_played === 1)).toBe(true);
  });

  it('builds the personal-timezone history calendar from completed duels only', async () => {
    await pool.query(`update users set timezone = 'America/New_York' where id = $1`, [userA]);
    const templateId = await createTemplate();

    async function insertHistoryMatch(input: {
      settledAt: string;
      settledReason: string;
      challengerState: 'completed' | 'forfeit';
      opponentState: 'completed' | 'forfeit';
      outcome: 'challenger_win' | 'opponent_win' | 'draw';
    }) {
      const created = await challenge(templateId);
      const matchId = String(created.json().match.id);
      await pool.query(
        `update amateur_duel_match
            set status = 'settled', settled_at = $2, settled_reason = $3, outcome = $4,
                winner_user_id = case
                  when $4 = 'challenger_win' then challenger_user_id
                  when $4 = 'opponent_win' then opponent_user_id
                  else null
                end
          where id = $1`,
        [matchId, input.settledAt, input.settledReason, input.outcome],
      );
      await pool.query(
        `update amateur_duel_participant
            set state = case when side = 'challenger' then $2 else $3 end,
                goals = case when side = 'challenger' then 4 else 2 end,
                shots_taken = 5
          where match_id = $1`,
        [matchId, input.challengerState, input.opponentState],
      );
      return matchId;
    }

    const includedId = await insertHistoryMatch({
      settledAt: '2026-05-01T02:30:00.000Z',
      settledReason: 'completed',
      challengerState: 'completed',
      opponentState: 'completed',
      outcome: 'challenger_win',
    });
    const tournamentId = await insertHistoryMatch({
      settledAt: '2026-05-01T03:00:00.000Z',
      settledReason: 'completed',
      challengerState: 'completed',
      opponentState: 'completed',
      outcome: 'challenger_win',
    });
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
       on conflict (key) do update set value = excluded.value`,
    );
    await pool.query(`update amateur_duel_match set source = 'tournament' where id = $1`, [
      tournamentId,
    ]);
    const technicalWinId = await insertHistoryMatch({
      settledAt: '2026-05-02T12:00:00.000Z',
      settledReason: 'no_show',
      challengerState: 'completed',
      opponentState: 'forfeit',
      outcome: 'challenger_win',
    });
    await insertHistoryMatch({
      settledAt: '2026-06-01T04:30:00.000Z',
      settledReason: 'completed',
      challengerState: 'completed',
      opponentState: 'completed',
      outcome: 'draw',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/duel/amateur/history/calendar?month_key=2026-04',
      headers: auth(tokenA),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().month_key).toBe('2026-04');
    expect(response.json().available_months).toEqual(['2026-06', '2026-05', '2026-04']);
    expect(response.json().range).toEqual({ from: '2026-04', to: '2026-06' });
    expect(response.json().stats).toEqual({
      played: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      win_percentage: 67,
    });
    expect(response.json().days).toEqual([
      expect.objectContaining({
        day: 30,
        matches: [
          expect.objectContaining({ id: includedId, result: 'win', venue_role: 'neutral' }),
        ],
      }),
    ]);

    const technicalMonth = await app.inject({
      method: 'GET',
      url: '/duel/amateur/history/calendar?month_key=2026-05',
      headers: auth(tokenA),
    });
    expect(technicalMonth.statusCode).toBe(200);
    expect(technicalMonth.json().days).toEqual([
      expect.objectContaining({
        day: 2,
        matches: [
          expect.objectContaining({ id: technicalWinId, result: 'win', venue_role: 'neutral' }),
        ],
      }),
    ]);
  });

  it('pairs matchmaking players into a ready room', async () => {
    const templateId = await createTemplate();
    const first = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { template_id: templateId },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().ticket.status).toBe('queued');

    const second = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { template_id: templateId },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().match.status).toBe('ready_check');
    expect(second.json().match.opponent.user_id).toBe(userA);
  });

  it('uses the default neutral arena for every ordinary challenge despite a selected arena', async () => {
    await setHomeArena(userA, 'beach');
    const created = await challenge(await createTemplate());

    expect(created.statusCode).toBe(200);
    expect(created.json().match.home_user_id).toBeNull();
    expect(created.json().match.venue_policy).toBe('neutral_default');
    expect(created.json().match.venue_role).toBe('neutral');
    expect(created.json().match.arena.slug).toBe('default');
  });

  it('uses the default neutral arena for the neutral matchmaking venue policy', async () => {
    const match = await createMatchmakingPair('neutral_default');

    expect(match.venue_policy).toBe('neutral_default');
    expect(match.home_user_id).toBeNull();
    expect(match.arena.slug).toBe('default');
  });

  it('uses the default neutral arena when matchmaking template requests a participant home', async () => {
    await setHomeArena(userA, 'beach');
    await setHomeArena(userB, 'castle');
    const match = await createMatchmakingPair('random_participant_home');

    expect(match.venue_policy).toBe('neutral_default');
    expect(match.home_user_id).toBeNull();
    expect(match.arena.slug).toBe('default');
  });

  it('uses the default neutral arena when matchmaking template requests an unselected arena', async () => {
    await setHomeArena(userA, 'beach');
    await setHomeArena(userB, 'castle');
    const match = await createMatchmakingPair('random_unselected');

    expect(match.venue_policy).toBe('neutral_default');
    expect(match.home_user_id).toBeNull();
    expect(match.arena.slug).toBe('default');
  });

  it('keeps the default ordinary-duel snapshot after the challenger changes home arena', async () => {
    await setHomeArena(userA, 'beach');
    const created = await challenge(await createTemplate());
    const matchId = created.json().match.id;
    await setHomeArena(userA, 'castle');

    const loaded = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });

    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().match.arena.slug).toBe('default');
  });

  it('materializes an immutable default venue snapshot for a legacy match with null venue fields', async () => {
    const created = await challenge(await createTemplate());
    const matchId = created.json().match.id;
    await pool.query(
      `update amateur_duel_match
          set home_user_id = null,
              arena_theme_id = null,
              arena_snapshot = null,
              venue_policy = null
        where id = $1`,
      [matchId],
    );

    const first = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().match).toMatchObject({
      home_user_id: null,
      venue_policy: 'neutral_default',
      arena: {
        slug: 'default',
        title: 'Стандартная арена',
        artwork_url: '/sprites/arena-ice-court-v2.webp',
        thumbnail_url: '/sprites/arena-ice-court-v2.webp',
      },
    });
    const materialized = await pool.query<{
      home_user_id: string | null;
      arena_theme_id: string | null;
      arena_snapshot: {
        id: string;
        slug: string;
        title: string;
        artworkUrl: string;
        thumbnailUrl: string;
      } | null;
      venue_policy: string | null;
    }>(
      `select home_user_id, arena_theme_id, arena_snapshot, venue_policy
         from amateur_duel_match
        where id = $1`,
      [matchId],
    );
    expect(materialized.rows[0]).toEqual({
      home_user_id: null,
      arena_theme_id: '00000000-0000-4000-8000-000000000590',
      arena_snapshot: {
        id: '00000000-0000-4000-8000-000000000590',
        slug: 'default',
        title: 'Стандартная арена',
        artworkUrl: '/sprites/arena-ice-court-v2.webp',
        thumbnailUrl: '/sprites/arena-ice-court-v2.webp',
      },
      venue_policy: 'neutral_default',
    });

    await pool.query(
      `update arena_theme
          set title = 'Changed default',
              artwork_url = '/changed-default.webp',
              thumbnail_url = '/changed-default-thumb.webp'
        where slug = 'default'`,
    );
    await setHomeArena(userA, 'beach');

    const listed = await app.inject({
      method: 'GET',
      url: '/duel/amateur/matches',
      headers: auth(tokenA),
    });
    const listedMatch = listed.json().matches.find((match: { id: string }) => match.id === matchId);

    expect(listed.statusCode).toBe(200);
    expect(listedMatch.arena).toEqual(first.json().match.arena);
  });

  it('exposes the default matchmaking venue policy in templates and duel rule snapshots', async () => {
    const templateId = await createTemplate();
    const listed = await app.inject({
      method: 'GET',
      url: '/duel/amateur/templates',
      headers: auth(tokenA),
    });
    const template = listed.json().templates.find((item: { id: string }) => item.id === templateId);
    const created = await challenge(templateId);

    expect(template.matchmaking_venue_policy).toBe('neutral_default');
    expect(created.json().match.rules.matchmakingVenuePolicy).toBe('neutral_default');
  });

  it('pairs matchmaking players only when duel kind preferences overlap', async () => {
    await createTemplate({ duelKind: 'express' });
    await createTemplate({ duelKind: 'classic' });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const userC = await findOrCreateTelegramUser(pool, {
      providerUid: 'amateur-c',
      displayName: 'Player C',
      timezone: 'Europe/Moscow',
    });
    await pool.query(`update users set level = 2 where id = $1`, [userC.id]);
    await pool.query(`insert into user_currency_account (user_id, balance) values ($1, 100)`, [
      userC.id,
    ]);
    const tokenC = await jwt.issueAccessToken({ sub: userC.id });

    const first = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenA),
      payload: { duel_kinds: ['express'] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().ticket.status).toBe('queued');

    const second = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenB),
      payload: { duel_kinds: ['classic'] },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().ticket.status).toBe('queued');

    const third = await app.inject({
      method: 'POST',
      url: '/duel/amateur/matchmaking/join',
      headers: auth(tokenC),
      payload: { duel_kinds: ['express_plus', 'classic'] },
    });
    expect(third.statusCode).toBe(200);
    expect(third.json().match.status).toBe('ready_check');
    expect(third.json().match.rules.duelKind).toBe('classic');
    expect(third.json().match.opponent.user_id).toBe(userB);
  });

  it('settles a player as forfeit five minutes after intermission is ready', async () => {
    await pool.query(
      `update users
          set avatar_url = case when id = $1 then 'https://example.test/a.webp' else 'https://example.test/b.webp' end
        where id = any($2::uuid[])`,
      [userA, [userA, userB]],
    );
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodDurationMs: 1200000,
      breakDurationMs: 120000,
      readyDurationMs: 900000,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
        { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    await pool.query(
      `update amateur_duel_participant
          set state = 'completed',
              current_period = 2,
              shots_taken = 2,
              goals = 2,
              completed_at = now() - interval '6 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    await pool.query(
      `update amateur_duel_participant
          set state = 'accepted',
              current_period = 1,
              shots_taken = 1,
              goals = 1,
              ready_at = now() - interval '6 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userB],
    );
    await pool.query(
      `insert into amateur_duel_period_log
         (match_id, user_id, period_number, started_at, ended_at, shots_taken, goals, duration_ms, closed_reason)
       values ($1, $2, 1, now() - interval '10 minutes', now() - interval '7 minutes', 1, 1, 180000, 'quota')`,
      [matchId, userB],
    );

    const settled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });

    expect(settled.statusCode).toBe(200);
    expect(settled.json().match.status).toBe('settled');
    expect(settled.json().match.winner_user_id).toBe(userA);
    expect(settled.json().match.me).toMatchObject({
      display_name: 'Player A',
      avatar_url: 'https://example.test/a.webp',
    });
    expect(settled.json().match.opponent).toMatchObject({
      display_name: 'Player B',
      avatar_url: 'https://example.test/b.webp',
    });
    expect(settled.json().match.opponent.state).toBe('forfeit');
  });

  it.each([
    {
      experienceA: 1000,
      experienceB: 1200,
      result: 'a',
      categoryA: 'strongerWin',
      categoryB: 'loss',
      coinsA: 31,
      starsA: 7,
      tokensA: 3,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1000,
      experienceB: 1100,
      result: 'a',
      categoryA: 'equalWin',
      categoryB: 'loss',
      coinsA: 21,
      starsA: 6,
      tokensA: 2,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1000,
      experienceB: 900,
      result: 'a',
      categoryA: 'equalWin',
      categoryB: 'loss',
      coinsA: 21,
      starsA: 6,
      tokensA: 2,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1000,
      experienceB: 899,
      result: 'a',
      categoryA: 'weakerWin',
      categoryB: 'loss',
      coinsA: 11,
      starsA: 4,
      tokensA: 1,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1000,
      experienceB: 1101,
      result: 'a',
      categoryA: 'strongerWin',
      categoryB: 'loss',
      coinsA: 31,
      starsA: 7,
      tokensA: 3,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1200,
      experienceB: 1000,
      result: 'b',
      categoryA: 'loss',
      categoryB: 'strongerWin',
      coinsA: 5,
      starsA: 2,
      tokensA: 1,
      coinsB: 31,
      starsB: 7,
      tokensB: 3,
    },
    {
      experienceA: 0,
      experienceB: 0,
      result: 'a',
      categoryA: 'equalWin',
      categoryB: 'loss',
      coinsA: 21,
      starsA: 6,
      tokensA: 2,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 0,
      experienceB: 1,
      result: 'a',
      categoryA: 'strongerWin',
      categoryB: 'loss',
      coinsA: 31,
      starsA: 7,
      tokensA: 3,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1000,
      experienceB: 1200,
      result: 'draw',
      categoryA: 'draw',
      categoryB: 'draw',
      coinsA: 9,
      starsA: 3,
      tokensA: 2,
      coinsB: 9,
      starsB: 3,
      tokensB: 2,
    },
    {
      experienceA: 1000,
      experienceB: 1200,
      result: 'double_loss',
      categoryA: 'loss',
      categoryB: 'loss',
      coinsA: 5,
      starsA: 2,
      tokensA: 1,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
    },
    {
      experienceA: 1000,
      experienceB: 1200,
      result: 'a',
      categoryA: 'strongerWin',
      categoryB: 'loss',
      coinsA: 0,
      starsA: 0,
      tokensA: 0,
      coinsB: 0,
      starsB: 0,
      tokensB: 0,
      zero: true,
    },
    {
      experienceA: 1000,
      experienceB: 1200,
      result: 'a',
      categoryA: 'strongerWin',
      categoryB: 'loss',
      coinsA: 10,
      starsA: 7,
      tokensA: 0,
      coinsB: 0,
      starsB: 0,
      tokensB: 0,
      zero: true,
      legacy: true,
    },
    {
      experienceA: 1000,
      experienceB: 1200,
      result: 'a',
      categoryA: 'strongerWin',
      categoryB: 'loss',
      coinsA: 31,
      starsA: 7,
      tokensA: 3,
      coinsB: 5,
      starsB: 2,
      tokensB: 1,
      rollback: true,
    },
  ])(
    'settles matrix $categoryA/$categoryB from snapshots $experienceA/$experienceB once ($result)',
    async (fixture) => {
      const templateId = await createTemplate({ winStarReward: 'legacy' in fixture ? 7 : 0 });
      if ('legacy' in fixture) {
        await pool.query(
          'update amateur_duel_template set win_currency_reward = 10 where id = $1',
          [templateId],
        );
      }
      const rewardRules =
        'zero' in fixture
          ? {
              equalExperienceTolerancePercent: 10,
              strongerWin: { coins: 0, stars: 0, tokens: 0 },
              equalWin: { coins: 0, stars: 0, tokens: 0 },
              weakerWin: { coins: 0, stars: 0, tokens: 0 },
              draw: { coins: 0, stars: 0, tokens: 0 },
              loss: { coins: 0, stars: 0, tokens: 0 },
            }
          : {
              equalExperienceTolerancePercent: 10,
              strongerWin: { coins: 31, stars: 7, tokens: 3 },
              equalWin: { coins: 21, stars: 6, tokens: 2 },
              weakerWin: { coins: 11, stars: 4, tokens: 1 },
              draw: { coins: 9, stars: 3, tokens: 2 },
              loss: { coins: 5, stars: 2, tokens: 1 },
            };
      await pool.query('update amateur_duel_template set reward_rules = $2 where id = $1', [
        templateId,
        JSON.stringify(rewardRules),
      ]);
      const created = await challenge(templateId);
      expect(created.statusCode).toBe(200);
      const matchId = created.json().match.id;
      const accepted = await app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/accept`,
        headers: auth(tokenB),
      });
      expect(accepted.statusCode).toBe(200);
      await pool.query("update amateur_duel_match set status = 'active' where id = $1", [matchId]);
      await pool.query(
        `update amateur_duel_participant
          set state = $3, current_period = 1, shots_taken = 10,
              goals = case when user_id = $2 then $4::int else $5::int end,
              experience_snapshot = case when user_id = $2 then $6::int else $7::int end,
              active_duration_ms = 1000, completed_at = now()
        where match_id = $1`,
        [
          matchId,
          userA,
          fixture.result === 'double_loss' ? 'forfeit' : 'completed',
          fixture.result === 'b' ? 1 : 2,
          fixture.result === 'a' ? 1 : 2,
          fixture.experienceA,
          fixture.experienceB,
        ],
      );
      // Deliberately disagree with the snapshots and edit the template after creation.
      await pool.query(
        'update users set xp = 50, experience = case when id = $1 then 9999 else 0 end where id = any($2::uuid[])',
        [userA, [userA, userB]],
      );
      await pool.query(
        "update amateur_duel_template set reward_rules = jsonb_set(reward_rules, '{strongerWin,coins}', '999') where id = $1",
        [templateId],
      );
      await pool.query('insert into user_reward_token_account (user_id, balance) values ($1, 10)', [
        userA,
      ]);

      const readBalances = async () =>
        (
          await pool.query(
            `select u.id, u.xp, u.experience, a.balance, coalesce(t.balance, 0) as tokens
         from users u join user_currency_account a on a.user_id = u.id
         left join user_reward_token_account t on t.user_id = u.id
        where u.id = any($1::uuid[]) order by u.id`,
            [[userA, userB]],
          )
        ).rows;
      const settle = (token: string) =>
        app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/settle`,
          headers: auth(token),
        });
      if ('rollback' in fixture) {
        // Reject insufficient headroom before either recipient is credited.
        await pool.query(
          'insert into user_reward_token_account (user_id, balance) values ($1, 2147483647)',
          [userB],
        );
        const before = await readBalances();
        const capacityResponse = await settle(tokenA);
        expect(capacityResponse.statusCode).toBe(409);
        expect(capacityResponse.json().error).toMatchObject({
          code: 'reward_balance_capacity',
          message:
            'Недостаточно места на балансе для награды. Потратьте валюту и повторите получение.',
        });
        expect(await readBalances()).toEqual(before);
        expect(
          (await pool.query('select status from amateur_duel_match where id = $1', [matchId]))
            .rows[0]?.status,
        ).toBe('active');
        expect(
          (
            await pool.query(
              "select id from currency_ledger where duel_match_id = $1 and reason = 'duel_reward'",
              [matchId],
            )
          ).rows,
        ).toEqual([]);
        await pool.query('update user_reward_token_account set balance = 0 where user_id = $1', [
          userB,
        ]);
      }
      const responses = await Promise.all([settle(tokenA), settle(tokenB)]);
      for (const response of responses) {
        expect(response.statusCode).toBe(200);
        expect(response.json().match.status).toBe('settled');
      }
      const balances = await readBalances();
      expect(balances).toEqual(
        expect.arrayContaining([
          {
            id: userA,
            xp: 50 + fixture.starsA,
            experience: 9999,
            balance: 100 + fixture.coinsA,
            tokens: 10 + fixture.tokensA,
          },
          {
            id: userB,
            xp: 50 + fixture.starsB,
            experience: 0,
            balance: 100 + fixture.coinsB,
            tokens: fixture.tokensB,
          },
        ]),
      );
      const readLedger = async () =>
        (
          await pool.query(
            `select id, user_id, available_delta, metadata from currency_ledger
        where duel_match_id = $1 and reason = 'duel_reward' order by user_id`,
            [matchId],
          )
        ).rows;
      const ledger = await readLedger();
      expect(ledger).toHaveLength(2);
      for (const [userId, experience, otherExperience, category, coins, stars, tokens] of [
        [
          userA,
          fixture.experienceA,
          fixture.experienceB,
          fixture.categoryA,
          fixture.coinsA,
          fixture.starsA,
          fixture.tokensA,
        ],
        [
          userB,
          fixture.experienceB,
          fixture.experienceA,
          fixture.categoryB,
          fixture.coinsB,
          fixture.starsB,
          fixture.tokensB,
        ],
      ] as const) {
        const entry = ledger.find((row) => row.user_id === userId);
        expect(entry?.available_delta).toBe(coins);
        expect(entry?.metadata).toEqual({
          match_id: matchId,
          reward_category: category,
          winner_experience: experience,
          opponent_experience: otherExperience,
          tolerance_percent: 10,
          coins,
          stars,
          tokens,
        });
      }
      expect((await settle(tokenA)).statusCode).toBe(200);
      expect(await readBalances()).toEqual(balances);
      expect(await readLedger()).toEqual(ledger);
    },
  );

  async function oldSeasonMatch(
    endsAt: string,
    options: Parameters<typeof createTemplate>[0] = {},
  ) {
    const created = await challenge(await createTemplate(options));
    const matchId = created.json().match.id as string;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/accept`,
          headers: auth(tokenB),
        })
      ).statusCode,
    ).toBe(200);
    await pool.query(
      "update amateur_duel_match set status = 'active', season_key = '2026-08', starts_at = '2026-08-31T19:00:00Z', ends_at = $2 where id = $1",
      [matchId, endsAt],
    );
    await pool.query(
      "update amateur_duel_participant set state = 'completed', current_period = 1, shots_taken = 1, goals = 1, active_duration_ms = 1000, completed_at = '2026-08-31T20:59:00Z' where match_id = $1",
      [matchId],
    );
    await pool.query(
      `insert into amateur_duel_match (challenger_user_id, opponent_user_id, status, season_key, rules_snapshot, match_seed, starts_at, ends_at, game_core_version)
      select $1, $2, 'settled', '2026-08', '{}', 'seed', '2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z', 1 from generate_series(1,29)`,
      [userA, userB],
    );
    await pool.query(
      `insert into amateur_duel_rating_match (match_id,user_id,season_key,points,wins,active_duration_seconds)
      select id, $1, '2026-08', 3, 1, 1 from amateur_duel_match where season_key='2026-08' and status='settled'`,
      [userA],
    );
    return matchId;
  }

  it('settles expired prior-season matches before freezing the monthly placements', async () => {
    const matchId = await oldSeasonMatch('2026-08-31T20:59:59Z');
    await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
    expect(
      (await pool.query('select status from amateur_duel_match where id=$1', [matchId])).rows[0]
        ?.status,
    ).toBe('settled');
    expect(
      (
        await pool.query(
          "select matches_played from monthly_duel_rating_placement where season_key='2026-08' and user_id=$1",
          [userA],
        )
      ).rows,
    ).toEqual([{ matches_played: 30 }]);
  });

  it.each(['close', 'settle'])(
    'materializes the complete nonfinal timer chain before %s assigns a month',
    async (first) => {
      const matchId = await oldSeasonMatch('2026-09-01T01:00:00Z', {
        totalPeriods: 2,
        breakDurationMs: 900000,
      });
      await pool.query(
        "update amateur_duel_participant set state='period_active',completed_at=null,period_started_at='2026-08-31T20:15:00Z' where match_id=$1",
        [matchId],
      );
      const settle = () =>
        app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/settle`,
          headers: auth(tokenA),
        });
      if (first === 'settle') expect((await settle()).statusCode).toBe(200);
      await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
      expect(
        (
          await pool.query(
            "select matches_played from monthly_duel_rating_placement where user_id=$1 and season_key='2026-08'",
            [userA],
          )
        ).rows,
      ).toEqual([{ matches_played: 30 }]);
      expect((await settle()).statusCode).toBe(200);
      expect(
        (
          await pool.query(
            'select state,completed_at from amateur_duel_participant where match_id=$1',
            [matchId],
          )
        ).rows,
      ).toEqual([
        { state: 'forfeit', completed_at: new Date('2026-08-31T20:55:00Z') },
        { state: 'forfeit', completed_at: new Date('2026-08-31T20:55:00Z') },
      ]);
      expect(
        (
          await pool.query(
            'select distinct season_key from amateur_duel_rating_match where match_id=$1',
            [matchId],
          )
        ).rows,
      ).toEqual([{ season_key: '2026-08' }]);
    },
  );

  it.each(['challenge', 'matchmaking'] as const)(
    'settles old unranked %s after monthly close without rating writes',
    async (source) => {
      const matchId = await oldSeasonMatch('2026-08-31T20:59:59Z');
      await pool.query(
        `update amateur_duel_match set ranked=false,source=$2,
      reward_rules=jsonb_set(reward_rules,'{draw}','{"coins":5,"stars":3,"tokens":1}'),
      rules_snapshot=jsonb_set(rules_snapshot,'{rewardRules,draw}','{"coins":5,"stars":3,"tokens":1}') where id=$1`,
        [matchId, source],
      );
      const itemId = await createInventoryItem('stick', 'Unranked reserve');
      await pool.query(
        'insert into user_inventory_item(user_id,inventory_item_id,charges_available,charges_reserved) values($1,$2,1,2)',
        [userA, itemId],
      );
      await pool.query(
        `update amateur_duel_participant set reserved_inventory_charges=2,consumed_inventory_charges=0,loadout_snapshot=$3 where match_id=$1 and user_id=$2`,
        [
          matchId,
          userA,
          {
            items: [
              {
                id: itemId,
                itemId,
                instanceId: null,
                kind: 'stick',
                title: 'Unranked reserve',
                chargesReserved: 2,
                duelPeriodCost: 1,
              },
            ],
          },
        ],
      );
      await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
      const ratingState = async () => ({
        seasons: (await pool.query('select * from monthly_duel_rating_season order by season_key'))
          .rows,
        placements: (
          await pool.query('select * from monthly_duel_rating_placement order by user_id')
        ).rows,
        rating: (await pool.query('select * from amateur_duel_rating_live order by user_id')).rows,
      });
      const frozen = await ratingState();
      for (let retry = 0; retry < 2; retry += 1) {
        const response = await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/settle`,
          headers: auth(tokenA),
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().match).toMatchObject({
          status: 'settled',
          ranked: false,
          season_key: '2026-08',
        });
      }
      expect(
        (
          await pool.query(
            'select count(*)::int as count from amateur_duel_rating_match where match_id=$1',
            [matchId],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await pool.query(
            "select available_delta,metadata from currency_ledger where duel_match_id=$1 and reason='duel_reward'",
            [matchId],
          )
        ).rows,
      ).toEqual([
        expect.objectContaining({
          available_delta: 5,
          metadata: expect.objectContaining({ coins: 5, stars: 3, tokens: 1 }),
        }),
        expect.objectContaining({
          available_delta: 5,
          metadata: expect.objectContaining({ coins: 5, stars: 3, tokens: 1 }),
        }),
      ]);
      expect(
        (
          await pool.query(
            'select xp,balance from users join user_currency_account on user_id=id where id=$1',
            [userA],
          )
        ).rows,
      ).toEqual([{ xp: 3, balance: 105 }]);
      expect(
        (
          await pool.query(
            'select charges_available,charges_reserved from user_inventory_item where user_id=$1 and inventory_item_id=$2',
            [userA, itemId],
          )
        ).rows,
      ).toEqual([{ charges_available: 3, charges_reserved: 0 }]);
      expect(await ratingState()).toEqual(frozen);
    },
  );

  it('keeps the closed-season guard for a surviving ranked historical result', async () => {
    const matchId = await oldSeasonMatch('2026-08-31T20:59:59Z');
    // Emulate an old open result absent from a snapshot made by an earlier release.
    await pool.query('update amateur_duel_match set ranked=false where id=$1', [matchId]);
    await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
    await pool.query('update amateur_duel_match set ranked=true where id=$1', [matchId]);
    const before = (await pool.query('select * from monthly_duel_rating_season')).rows;
    const response = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/settle`,
      headers: auth(tokenA),
    });
    expect(response.statusCode).toBe(409);
    expect(
      (await pool.query('select status from amateur_duel_match where id=$1', [matchId])).rows,
    ).toEqual([{ status: 'active' }]);
    expect(
      (await pool.query('select * from amateur_duel_rating_match where match_id=$1', [matchId]))
        .rows,
    ).toEqual([]);
    expect((await pool.query('select * from monthly_duel_rating_season')).rows).toEqual(before);
  });

  it.each([
    { first: 'close', activeCount: 2, timeout: '2026-08-31T20:59:00Z', month: '2026-08' },
    { first: 'settle', activeCount: 2, timeout: '2026-08-31T20:59:00Z', month: '2026-08' },
    { first: 'close', activeCount: 1, timeout: '2026-08-31T20:59:00Z', month: '2026-08' },
    { first: 'settle', activeCount: 1, timeout: '2026-08-31T20:59:00Z', month: '2026-08' },
    { first: 'close', activeCount: 2, timeout: '2026-08-31T21:00:00Z', month: '2026-09' },
    { first: 'settle', activeCount: 2, timeout: '2026-08-31T21:00:00Z', month: '2026-09' },
  ])('materializes final timers before $first ($activeCount active, $month)', async (fixture) => {
    const matchId = await oldSeasonMatch('2026-09-01T01:00:00Z');
    await pool.query(
      `update amateur_duel_participant set state='period_active', completed_at=null,
         period_started_at=$2::timestamptz - interval '20 minutes'
       where match_id=$1 and ($3=2 or user_id=$4)`,
      [matchId, fixture.timeout, fixture.activeCount, userA],
    );
    const settle = () =>
      app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/settle`,
        headers: auth(tokenA),
      });
    if (fixture.first === 'settle') expect((await settle()).statusCode).toBe(200);
    await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
    const snapshot = (
      await pool.query('select * from monthly_duel_rating_placement order by user_id')
    ).rows;
    expect(snapshot.filter((row) => row.user_id === userA)).toEqual(
      fixture.month === '2026-08' ? [expect.objectContaining({ matches_played: 30 })] : [],
    );
    expect((await settle()).statusCode).toBe(200);
    expect((await settle()).statusCode).toBe(200);
    expect(
      (
        await pool.query(
          'select distinct season_key from amateur_duel_rating_match where match_id=$1',
          [matchId],
        )
      ).rows,
    ).toEqual([{ season_key: fixture.month }]);
    expect(
      (
        await pool.query(
          'select ended_at,closed_reason from amateur_duel_period_log where match_id=$1',
          [matchId],
        )
      ).rows,
    ).toEqual(
      Array.from({ length: fixture.activeCount }, () => ({
        ended_at: new Date(fixture.timeout),
        closed_reason: 'timeout',
      })),
    );
    expect(
      (
        await pool.query(
          'select state,completed_at from amateur_duel_participant where match_id=$1',
          [matchId],
        )
      ).rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'completed', completed_at: new Date(fixture.timeout) }),
      ]),
    );
    expect(
      (await pool.query('select * from monthly_duel_rating_placement order by user_id')).rows,
    ).toEqual(snapshot);
  });

  it('serializes ordinary settlement with monthly close before taking match rows', async () => {
    const matchId = await oldSeasonMatch('2026-08-31T20:59:59Z');
    const blocker = await pool.connect();
    let settled: ReturnType<typeof app.inject> | undefined;
    let closed: Promise<void> | undefined;
    try {
      await blocker.query('begin');
      const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await blocker.query('select id from amateur_duel_match where id=$1 for update', [matchId]);
      settled = app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/settle`,
        headers: auth(tokenA),
      });
      const writer = await waitForBlockedWriter(pool, pid, /for update of m/i);
      closed = reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
      const closing = await waitForBlockedWriter(pool, writer.pid, /pg_advisory_xact_lock/i);
      expect(closing.accountWriteLockHeld).toBe(false);
      await blocker.query('commit');
      expect((await settled).statusCode).toBe(200);
      await closed;
      expect(
        (
          await pool.query(
            "select matches_played from monthly_duel_rating_placement where season_key='2026-08' and user_id=$1",
            [userA],
          )
        ).rows,
      ).toEqual([{ matches_played: 30 }]);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await settled;
      await closed;
    }
  });

  it.each(['accepted', 'completed'] as const)(
    'carries an active boundary-spanning %s match forward without changing the closed season',
    async (state) => {
      const matchId = await oldSeasonMatch('2026-09-01T01:00:00Z');
      await pool.query(
        "update amateur_duel_participant set state=$2, completed_at='2026-08-31T21:00:01Z' where match_id=$1",
        [matchId, state],
      );
      await reconcileCompletedMonthlyRating(pool, new Date('2026-08-31T21:00:00Z'));
      expect(
        (
          await pool.query('select status,season_key from amateur_duel_match where id=$1', [
            matchId,
          ])
        ).rows[0],
      ).toEqual({ status: 'active', season_key: '2026-09' });
      const before = (await pool.query('select * from monthly_duel_rating_season')).rows;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/duel/amateur/matches/${matchId}/settle`,
            headers: auth(tokenA),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await pool.query(
            'select distinct season_key from amateur_duel_rating_match where match_id=$1',
            [matchId],
          )
        ).rows,
      ).toEqual([{ season_key: '2026-09' }]);
      expect((await pool.query('select * from monthly_duel_rating_season')).rows).toEqual(before);
    },
  );

  it('assigns a late-reconciled completed match to its completion month, independent of request month', async () => {
    const matchId = await oldSeasonMatch('2026-10-01T01:00:00Z');
    await pool.query(
      "update amateur_duel_match set season_key='2026-06',starts_at='2026-06-30T19:00:00Z' where id=$1",
      [matchId],
    );
    await pool.query(
      "update amateur_duel_participant set completed_at='2026-07-01T01:00:00Z' where match_id=$1",
      [matchId],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/settle`,
          headers: auth(tokenA),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          'select distinct season_key from amateur_duel_rating_match where match_id=$1',
          [matchId],
        )
      ).rows,
    ).toEqual([{ season_key: '2026-07' }]);
  });

  it('locks the complete match-list recipient set before processing recent matches', async () => {
    const lower = '00000000-0000-4000-8000-000000000001';
    const higher = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await pool.query(
      "insert into users(id,display_name,timezone,level) values($1,'Low','Europe/Moscow',2),($2,'High','Europe/Moscow',2)",
      [lower, higher],
    );
    const templateId = await createTemplate();
    expect((await challenge(templateId, lower)).statusCode).toBe(200);
    expect((await challenge(templateId, higher)).statusCode).toBe(200);
    const blocker = await pool.connect();
    let pending: ReturnType<typeof app.inject> | undefined;
    try {
      await blocker.query('begin');
      const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await blocker.query('select id from users where id=$1 for update', [lower]);
      pending = app.inject({ method: 'GET', url: '/duel/amateur/matches', headers: auth(tokenA) });
      await waitForBlockedWriter(pool, pid, /select id.*from users/i);
      await blocker.query('select id from users where id=$1 for update nowait', [higher]);
      await blocker.query('commit');
      expect((await pending).statusCode).toBe(200);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await pending;
    }
  });

  it('locks both shot participants in UUID order before the shooting player write', async () => {
    const matchId = (await challenge(await createTemplate())).json().match.id;
    expect((await acceptReadyAndStart(matchId)).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${matchId}/period/start`,
          headers: auth(tokenB),
        })
      ).statusCode,
    ).toBe(200);
    const [lower, higher] = [userA, userB].sort();
    const blocker = await pool.connect();
    let pending: ReturnType<typeof app.inject> | undefined;
    try {
      await blocker.query('begin');
      const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await blocker.query('select id from users where id=$1 for update', [lower]);
      pending = app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/shot`,
        headers: auth(higher === userA ? tokenA : tokenB),
        payload: { shot_index: 1, input: { tapTime: 1000 }, claimed_result: 'goal' },
      });
      const writer = await waitForBlockedWriter(pool, pid, /select id.*from users/i);
      expect(writer.accountWriteLockHeld).toBe(false);
      // The higher UUID must still be unlocked while this request waits for the lower UUID.
      await blocker.query('select id from users where id=$1 for update nowait', [higher]);
      await blocker.query('commit');
      expect((await pending).statusCode).toBe(200);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await pending;
    }
  });

  it('settles no-show after locking the star winner before currency accounts', async () => {
    const templateId = await createTemplate({ winStarReward: 7 });
    await pool.query('update amateur_duel_template set win_currency_reward = 10 where id = $1', [
      templateId,
    ]);
    const created = await challenge(templateId);
    const matchId = created.json().match.id;

    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    expect(accepted.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
    });
    expect(started.statusCode).toBe(200);

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(shot.statusCode).toBe(200);

    await pool.query(
      `update amateur_duel_match
          set starts_at = now() - interval '2 seconds',
              ends_at = now() - interval '1 second'
        where id = $1`,
      [matchId],
    );
    const blocker = await pool.connect();
    let settled;
    let blocked;
    try {
      await blocker.query('begin');
      const blockerBackend = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from users where id = $1 for update', [userA]);
      const settlePromise = app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${matchId}/settle`,
        headers: auth(tokenA),
      });
      blocked = await waitForBlockedWriter(
        pool,
        blockerBackend.rows[0]!.pid,
        /select id\s+from users/i,
      );
      await blocker.query('commit');
      settled = await settlePromise;
    } finally {
      await blocker.query('rollback').catch(() => undefined);
      blocker.release();
    }
    expect(settled.statusCode).toBe(200);
    expect(blocked.accountWriteLockHeld).toBe(false);
    expect(blocked.query).toMatch(/users/i);
    expect(settled.json().match.status).toBe('settled');
    expect(settled.json().match.winner_user_id).toBe(userA);
    expect(settled.json().match.outcome).toBe('challenger_win');
    const stars = await pool.query<{ xp: number }>(`select xp from users where id = $1`, [userA]);
    expect(Number(stars.rows[0]?.xp)).toBe(7);
  });

  it('normalizes legacy stick snapshots and applies the stick speed bonus on duel shot', async () => {
    const stickId = await createInventoryItem('stick', 'Ультимейт Ван test');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'period',
              charges_per_purchase = 2,
              duel_period_cost = 0,
              effect_puck_speed_points = 0,
              effect_puck_speed_delta = 0.10
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 2)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, stickId],
    );
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: stickId } });
    expect(started.statusCode).toBe(200);

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });

    expect(shot.statusCode).toBe(200);
    const inventory = await pool.query<{
      charges_available: number;
      charges_reserved: number;
    }>(
      `select charges_available, charges_reserved
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(inventory.rows[0]).toEqual({ charges_available: 1, charges_reserved: 0 });
    const storedShot = await pool.query<{
      input_payload: { puckSpeedPerMs: number };
      server_result: 'goal' | 'save' | 'miss';
    }>(
      `select input_payload, server_result
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2 and shot_index = 1`,
      [matchId, userA],
    );
    expect(storedShot.rows[0]?.input_payload.puckSpeedPerMs).toBe(1.4);
    const officialStats = await pool.query<{ shots: number; goals: number }>(
      `select lifetime_shots_total as shots, lifetime_goals_total as goals
         from users
        where id = $1`,
      [userA],
    );
    expect(officialStats.rows[0]).toEqual({
      shots: 1,
      goals: storedShot.rows[0]?.server_result === 'goal' ? 1 : 0,
    });
    const consumed = shot
      .json()
      .match.me.inventory_report.flatMap(
        (report: { consumed: Array<{ id: string; charges: number }> }) => report.consumed,
      )
      .find((item: { id: string }) => item.id === stickId);
    expect(consumed?.charges).toBe(1);
  });

  it('consumes charges from the selected duel inventory instance only', async () => {
    const stickId = await createInventoryItem('stick', 'Instance duel stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 2,
              duel_period_cost = 0
        where id = $1`,
      [stickId],
    );
    const firstInstanceId = await createInventoryInstance(userA, stickId, 1);
    const secondInstanceId = await createInventoryInstance(userA, stickId, 2);
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: secondInstanceId } });
    expect(started.statusCode).toBe(200);
    expect(
      started.json().match.me.loadout.items.find((item: { kind: string }) => item.kind === 'stick'),
    ).toMatchObject({
      id: secondInstanceId,
      instanceId: secondInstanceId,
      itemId: stickId,
      resourceAvailable: 2,
    });

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });

    expect(shot.statusCode).toBe(200);
    const instances = await pool.query<{ id: string; charges_available: number }>(
      `select id, charges_available
         from user_inventory_instance
        where id = any($1::uuid[])
        order by id`,
      [[firstInstanceId, secondInstanceId]],
    );
    const chargesByInstance = new Map(
      instances.rows.map((row) => [row.id, Number(row.charges_available)]),
    );
    expect(chargesByInstance.get(firstInstanceId)).toBe(1);
    expect(chargesByInstance.get(secondInstanceId)).toBe(1);

    const legacyAggregate = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(legacyAggregate.rows[0]?.charges_available).toBe(2);
    const consumed = shot
      .json()
      .match.me.inventory_report.flatMap(
        (report: { consumed: Array<{ id: string; itemId: string; charges: number }> }) =>
          report.consumed,
      )
      .find((item: { id: string }) => item.id === secondInstanceId);
    expect(consumed).toMatchObject({ id: secondInstanceId, itemId: stickId, charges: 1 });
  });

  it('does not reset shot-stick resource on the next duel period', async () => {
    const stickId = await createInventoryItem('stick', 'One duel shot stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1,
              duel_period_cost = 0,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0
        where id = $1`,
      [stickId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, stickId],
    );
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
        { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: stickId } });
    expect(started.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set state = 'accepted',
              current_period = 1,
              break_started_at = null
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const secondStarted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
    });
    expect(secondStarted.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);
    const storedShots = await pool.query<{
      period_number: number;
      input_payload: { puckSpeedPerMs: number };
    }>(
      `select period_number, input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2
        order by period_number`,
      [matchId, userA],
    );
    expect(storedShots.rows.map((row) => row.input_payload.puckSpeedPerMs)).toEqual([1.4, 1.3]);
    const inventory = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, stickId],
    );
    expect(inventory.rows[0]?.charges_available).toBe(0);
  });

  it('can switch shot-stick loadout before starting the next duel period', async () => {
    const firstStickId = await createInventoryItem('stick', 'One shot stick');
    const secondStickId = await createInventoryItem('stick', 'Fresh shot stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1,
              duel_period_cost = 0,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0
        where id = any($1::uuid[])`,
      [[firstStickId, secondStickId]],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1), ($1, $3, 1)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, firstStickId, secondStickId],
    );
    const templateId = await createTemplate({
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
        { periodNumber: 2, mode: 'quota', durationMs: 1200000, shotsLimit: 1 },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: firstStickId } });
    expect(started.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set state = 'accepted',
              current_period = 1,
              break_started_at = null
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const secondStarted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenA),
      payload: { loadout: { stick: secondStickId } },
    });
    expect(secondStarted.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);
    const storedShots = await pool.query<{
      period_number: number;
      input_payload: { puckSpeedPerMs: number };
    }>(
      `select period_number, input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2
        order by period_number`,
      [matchId, userA],
    );
    expect(storedShots.rows.map((row) => row.input_payload.puckSpeedPerMs)).toEqual([1.4, 1.4]);
  });

  it('can switch exhausted shot-stick loadout during an active duel period', async () => {
    const firstStickId = await createInventoryItem('stick', 'One shot stick');
    const secondStickId = await createInventoryItem('stick', 'Fresh shot stick');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'shot',
              charges_per_purchase = 1,
              duel_period_cost = 0,
              effect_puck_speed_points = 10,
              effect_puck_speed_delta = 0
        where id = any($1::uuid[])`,
      [[firstStickId, secondStickId]],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1), ($1, $3, 1)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, firstStickId, secondStickId],
    );
    const templateId = await createTemplate({
      periodRules: [{ periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 3 }],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { stick: firstStickId } });
    expect(started.statusCode).toBe(200);

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 1000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);

    const switched = await app.inject({
      method: 'PATCH',
      url: `/duel/amateur/matches/${matchId}/loadout`,
      headers: auth(tokenA),
      payload: { loadout: { stick: secondStickId } },
    });
    expect(switched.statusCode).toBe(200);
    expect(
      switched.json().match.me.loadout.items.find((item: { kind: string }) => item.kind === 'stick')
        ?.id,
    ).toBe(secondStickId);

    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 2,
        input: { tapTime: 2000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);

    const storedShots = await pool.query<{
      shot_index: number;
      input_payload: { puckSpeedPerMs: number };
    }>(
      `select shot_index, input_payload
         from shot_session
        where amateur_duel_match_id = $1 and user_id = $2
        order by shot_index`,
      [matchId, userA],
    );
    expect(storedShots.rows.map((row) => row.input_payload.puckSpeedPerMs)).toEqual([1.4, 1.4]);

    const inventory = await pool.query<{ inventory_item_id: string; charges_available: number }>(
      `select inventory_item_id, charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = any($2::uuid[])
        order by inventory_item_id`,
      [userA, [firstStickId, secondStickId]],
    );
    expect(
      inventory.rows.map((row) => ({
        id: row.inventory_item_id,
        charges: row.charges_available,
      })),
    ).toEqual([firstStickId, secondStickId].sort().map((id) => ({ id, charges: 0 })));
  });

  it('rejects duel shots during accumulated fatigue rest after nutrition is depleted', async () => {
    const nutritionId = await createInventoryItem('nutrition', 'Tiny nutrition');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'energy_ms',
              charges_per_purchase = 1000,
              duel_period_cost = 0,
              effect_energy_baseline_speed = 0.8,
              effect_fatigue_grace_ms = 30000,
              effect_fatigue_slowdown_start_ms = 30000,
              effect_fatigue_heavy_slowdown_start_ms = 75000,
              effect_fatigue_stop_start_ms = 90000,
              effect_fatigue_stop_duration_ms = 5000,
              effect_fatigue_after_rest_ms = 45000
        where id = $1`,
      [nutritionId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 1000)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, nutritionId],
    );
    const templateId = await createTemplate();
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { nutrition: nutritionId } });
    expect(started.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '93000 milliseconds'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );

    const shot = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 93000 },
        claimed_result: 'goal',
      },
    });

    expect(shot.statusCode).toBe(409);
    expect(shot.json().error.message).toContain('player cannot shoot');
  });

  it('consumes only nutrition delta between accepted duel shots', async () => {
    const nutritionId = await createInventoryItem('nutrition', 'Delta nutrition');
    await pool.query(
      `update admin_inventory_items
          set resource_unit = 'energy_ms',
              charges_per_purchase = 10000,
              duel_period_cost = 0
        where id = $1`,
      [nutritionId],
    );
    await pool.query(
      `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
       values ($1, $2, 10000)
       on conflict (user_id, inventory_item_id)
       do update set charges_available = excluded.charges_available, charges_reserved = 0`,
      [userA, nutritionId],
    );
    const templateId = await createTemplate({
      periodRules: [{ periodNumber: 1, mode: 'quota', durationMs: 1200000, shotsLimit: 3 }],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    const started = await acceptReadyAndStart(matchId, { loadout: { nutrition: nutritionId } });
    expect(started.statusCode).toBe(200);
    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '2000 milliseconds'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );

    const first = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 1,
        input: { tapTime: 2000 },
        claimed_result: 'goal',
      },
    });
    expect(first.statusCode).toBe(200);

    await pool.query(
      `update amateur_duel_participant
          set period_started_at = now() - interval '3000 milliseconds'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const second = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/shot`,
      headers: auth(tokenA),
      payload: {
        shot_index: 2,
        input: { tapTime: 3000 },
        claimed_result: 'goal',
      },
    });
    expect(second.statusCode).toBe(200);

    const inventory = await pool.query<{ charges_available: number }>(
      `select charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = $2`,
      [userA, nutritionId],
    );
    expect(inventory.rows[0]?.charges_available).toBe(6799);
    const participant = await pool.query<{ inventory_report: unknown }>(
      `select inventory_report
         from amateur_duel_participant
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    const consumed = (
      participant.rows[0]?.inventory_report as Array<{
        consumed: Array<{ id: string; charges: number }>;
      }>
    ).flatMap((report) => report.consumed);
    expect(consumed.filter((item) => item.id === nutritionId).map((item) => item.charges)).toEqual([
      2134, 1067,
    ]);
  });

  it('includes opponent live period shots in match state', async () => {
    const templateId = await createTemplate({ duelKind: 'express', variant: 'time_attack' });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/period/start`,
      headers: auth(tokenB),
    });
    expect(started.statusCode).toBe(200);

    await pool.query(
      `insert into shot_session
         (user_id, mode, amateur_duel_match_id, period_number, shot_index, seed,
          input_payload, server_result, game_core_version)
       values
         ($1, 'amateur_duel', $2, 1, 1, 'opponent-live-1', '{}'::jsonb, 'goal', 1),
         ($1, 'amateur_duel', $2, 1, 2, 'opponent-live-2', '{}'::jsonb, 'save', 1)`,
      [userB, matchId],
    );

    const state = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().match.opponent.state).toBe('period_active');
    expect(state.json().match.opponent.shots_taken).toBe(2);
    expect(state.json().match.opponent.goals).toBe(1);
  });

  it('settles express tied goals by better accuracy before time', async () => {
    const templateId = await createTemplate({ duelKind: 'express', variant: 'time_attack' });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    await pool.query(
      `update amateur_duel_participant
          set state = 'completed',
              current_period = 1,
              shots_taken = case when user_id = $2 then 50 else 80 end,
              goals = 40,
              active_duration_ms = 180000,
              completed_at = now()
        where match_id = $1`,
      [matchId, userB],
    );

    const settled = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/settle`,
      headers: auth(tokenA),
    });

    expect(settled.statusCode).toBe(200);
    expect(settled.json().match.status).toBe('settled');
    expect(settled.json().match.outcome).toBe('opponent_win');
    expect(settled.json().match.winner_user_id).toBe(userB);
    expect(settled.json().match.me.result_points).toBe(0);
    expect(settled.json().match.opponent.result_points).toBe(3);
  });

  it.each(['challenge', 'tournament'] as const)(
    'charges movement and energy at the end of a %s duel period even without a final shot',
    async (source) => {
      const skatesId = await createInventoryItem('skates', `Period-end skates ${source}`);
      const nutritionId = await createInventoryItem('nutrition', `Period-end nutrition ${source}`);
      await pool.query(
        `update admin_inventory_items
            set duel_period_cost = 0,
                resource_unit = case when id = $1 then 'distance' else 'energy_ms' end
          where id = any($2::uuid[])`,
        [skatesId, [skatesId, nutritionId]],
      );
      await pool.query(
        `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
         values ($1, $2, 100), ($1, $3, 10000)`,
        [userA, skatesId, nutritionId],
      );
      const templateId = await createTemplate({
        duelKind: 'express',
        variant: 'time_attack',
        totalPeriods: 1,
        periodDurationMs: 2000,
        periodRules: [{ periodNumber: 1, mode: 'time_attack', durationMs: 2000, shotsLimit: null }],
      });
      const created = await challenge(templateId);
      const matchId = created.json().match.id;
      const started = await acceptReadyAndStart(matchId, {
        loadout: { skates: skatesId, nutrition: nutritionId },
      });
      expect(started.statusCode).toBe(200);
      await pool.query(
        `update amateur_duel_participant
            set period_started_at = now() - interval '3 seconds'
          where match_id = $1 and user_id = $2`,
        [matchId, userA],
      );
      if (source === 'tournament') {
        await pool.query(
          `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
        );
        await pool.query(`update amateur_duel_match set source = 'tournament' where id = $1`, [
          matchId,
        ]);
        await attachTournamentHierarchy(matchId, {
          slug: 'period-end-inventory',
          tournamentStatus: 'regular',
          fixtureStatus: 'active',
          segmentStatus: 'active',
        });
      }

      const reconciled = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${matchId}`,
        headers: auth(tokenA),
      });
      expect(reconciled.statusCode).toBe(200);
      const balances = await pool.query<{ inventory_item_id: string; charges_available: number }>(
        `select inventory_item_id, charges_available
           from user_inventory_item
          where user_id = $1 and inventory_item_id = any($2::uuid[])`,
        [userA, [skatesId, nutritionId]],
      );
      const byItem = new Map(
        balances.rows.map((row) => [row.inventory_item_id, Number(row.charges_available)]),
      );
      expect(byItem.get(skatesId)).toBeLessThan(100);
      expect(byItem.get(nutritionId)).toBeLessThan(10_000);
    },
  );

  it.each([
    {
      label: 'ordinary classic',
      source: 'challenge' as const,
      duelKind: 'classic' as const,
      totalPeriods: 3,
      periodRules: undefined,
    },
    {
      label: 'ordinary mix',
      source: 'challenge' as const,
      duelKind: 'express_plus' as const,
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota' as const, durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack' as const, durationMs: 180000, shotsLimit: null },
      ],
    },
    {
      label: 'tournament classic',
      source: 'tournament' as const,
      duelKind: 'classic' as const,
      totalPeriods: 3,
      periodRules: undefined,
    },
    {
      label: 'tournament mix',
      source: 'tournament' as const,
      duelKind: 'express_plus' as const,
      totalPeriods: 2,
      periodRules: [
        { periodNumber: 1, mode: 'quota' as const, durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack' as const, durationMs: 180000, shotsLimit: null },
      ],
    },
  ])('keeps a $label duel playable after a started quota period times out', async (scenario) => {
    const templateId = await createTemplate({
      duelKind: scenario.duelKind,
      totalPeriods: scenario.totalPeriods,
      periodDurationMs: 180000,
      breakDurationMs: 120000,
      ...(scenario.periodRules === undefined ? {} : { periodRules: scenario.periodRules }),
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });
    await pool.query(
      `update amateur_duel_participant
          set state = 'period_active',
              current_period = 1,
              period_started_at = now() - interval '4 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    if (scenario.source === 'tournament') {
      await pool.query(
        `update game_settings set value = 'true'::jsonb where key = 'tournaments.enabled'`,
      );
      await pool.query(`update amateur_duel_match set source = 'tournament' where id = $1`, [
        matchId,
      ]);
      await attachTournamentHierarchy(matchId, {
        slug: `timeout-${scenario.duelKind}`,
        tournamentStatus: 'regular',
        fixtureStatus: 'active',
        segmentStatus: 'active',
      });
    }

    const reconciled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });

    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().match.status).toBe('active');
    expect(reconciled.json().match.me.state).toBe('break_active');
    expect(reconciled.json().match.me.current_period).toBe(1);
    expect(reconciled.json().match.recent_periods[0]).toMatchObject({
      period_number: 1,
      shots_taken: 0,
      goals: 0,
      closed_reason: 'timeout',
      duration_ms: 180000,
    });
  });

  it('snapshots express plus with mixed period rules and completes time attack on timeout', async () => {
    const templateId = await createTemplate({
      duelKind: 'express_plus',
      variant: 'classic',
      totalPeriods: 2,
      periodDurationMs: 180000,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack', durationMs: 180000, shotsLimit: null },
      ],
    });
    const created = await challenge(templateId);
    const matchId = created.json().match.id;
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/accept`,
      headers: auth(tokenB),
    });
    await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenA),
      payload: { loadout: {} },
    });
    const ready = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${matchId}/ready`,
      headers: auth(tokenB),
      payload: { loadout: {} },
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json().match.rules).toMatchObject({
      duelKind: 'express_plus',
      totalPeriods: 2,
      breakDurationMs: 120000,
      periodRules: [
        { periodNumber: 1, mode: 'quota', durationMs: 180000, shotsLimit: 30 },
        { periodNumber: 2, mode: 'time_attack', durationMs: 180000, shotsLimit: null },
      ],
    });

    await pool.query(
      `update amateur_duel_participant
          set state = 'period_active',
              current_period = 2,
              period_started_at = now() - interval '4 minutes'
        where match_id = $1 and user_id = $2`,
      [matchId, userA],
    );
    await pool.query(
      `insert into amateur_duel_period_log
         (match_id, user_id, period_number, started_at, ended_at, shots_taken, goals, duration_ms, closed_reason)
       values ($1, $2, 1, now() - interval '3 minutes', now(), 30, 11, 180000, 'quota')`,
      [matchId, userB],
    );

    const reconciled = await app.inject({
      method: 'GET',
      url: `/duel/amateur/matches/${matchId}`,
      headers: auth(tokenA),
    });
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().match.me.state).toBe('completed');
    expect(reconciled.json().match.recent_periods[0]).toMatchObject({
      period_number: 2,
      closed_reason: 'timeout',
      duration_ms: 180000,
    });
    expect(reconciled.json().match.opponent_recent_periods[0]).toMatchObject({
      period_number: 1,
      shots_taken: 30,
      goals: 11,
      duration_ms: 180000,
    });
  });
});
