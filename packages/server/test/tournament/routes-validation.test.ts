import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  parseRules,
  tournamentScheduleOtherGamesQuerySchema,
  tournamentScheduleQuerySchema,
  tournamentTitleSchema,
} from '../../src/tournament/routes.js';
import {
  createTournamentDraft,
  publishTournament,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const ADMIN_ID = '00000000-0000-4000-8000-000000000171';
const BEGINNER_ID = '00000000-0000-4000-8000-000000000172';
const INVITED_USER_ID = '00000000-0000-4000-8000-000000000173';
const FIXTURE_ID = '00000000-0000-4000-8000-000000000174';
const PROPOSAL_ID = '00000000-0000-4000-8000-000000000175';
const CONGRATULATION_ID = '00000000-0000-4000-8000-000000000176';
const JWT_SECRET = 'tournament-preview-route-access';
const REFRESH_SECRET = 'tournament-preview-route-refresh';

function previewTournamentRules(): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 8,
      playoffSize: 4,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins: 0,
      roundRobinCycles: 1,
      roundsPerDay: 1,
      firstRoundLocalTime: '10:00',
      fixtureWindowMs: 3_600_000,
      roundBreakMs: 900_000,
      dailyDays: null,
      dailyMetric: null,
      bestDays: null,
    }),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  };
}

describe('tournament route validation', () => {
  it('returns a bad request for obsolete daily-aggregate rules', () => {
    expect(() =>
      parseRules({
        config: {
          regularSource: 'daily_aggregate',
          participantLimit: 16,
          playoffSize: 8,
          timezone: 'Europe/Moscow',
          registrationMode: 'open',
          visibility: 'public',
          entryFeeCoins: 0,
          roundRobinCycles: null,
          roundsPerDay: null,
          firstRoundLocalTime: null,
          fixtureWindowMs: null,
          roundBreakMs: null,
          dailyDays: 7,
          dailyMetric: 'goals_sum',
          bestDays: null,
        },
        eligibility: {
          minLevel: null,
          maxLevel: null,
          minGoals: 0,
          minExperience: 0,
          invitedUserIds: [],
          bannedUserIds: [],
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'bad_request', statusCode: 400 }));
  });

  it('rejects tournament titles longer than 60 characters', () => {
    expect(tournamentTitleSchema.safeParse('Т'.repeat(60)).success).toBe(true);
    expect(tournamentTitleSchema.safeParse('Т'.repeat(61)).success).toBe(false);
  });

  it('requires an explicit local date for a public schedule read', () => {
    expect(tournamentScheduleQuerySchema.safeParse({ date: '2030-09-03' }).success).toBe(true);
    expect(tournamentScheduleQuerySchema.safeParse({}).success).toBe(false);
    expect(tournamentScheduleQuerySchema.safeParse({ date: '03.09.2030' }).success).toBe(false);
  });

  it('accepts only complete stable cursors for other-game pages', () => {
    expect(
      tournamentScheduleOtherGamesQuerySchema.safeParse({
        date: '2030-09-03',
        cursorFixtureNumber: '15',
        cursorId: '00000000-0000-4000-8000-000000000715',
      }).success,
    ).toBe(true);
    expect(
      tournamentScheduleOtherGamesQuerySchema.safeParse({
        date: '2030-09-03',
        cursorFixtureNumber: '15',
      }).success,
    ).toBe(false);
  });
});

describe.skipIf(!hasIntegrationEnv)('beginner read-only tournament routes', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('keeps reads and acknowledgements open while rejecting gameplay mutations', async () => {
    await pool.query(
      `insert into users (id, display_name, timezone, role, level, lifetime_goals_total)
       values ($1, 'Beginner admin', 'Europe/Moscow', 'admin', 1, 0),
              ($2, 'Beginner viewer', 'Europe/Moscow', 'player', 1, 17),
              ($3, 'Invited player', 'Europe/Moscow', 'player', 1, 0)`,
      [ADMIN_ID, BEGINNER_ID, INVITED_USER_ID],
    );
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'preview test'),
              ('amateur.unlock_goals_required', '300'::jsonb, 'Порог любителей', 'preview test')
       on conflict (key) do update set value = excluded.value`,
    );
    const tournament = await createTournamentDraft(pool, {
      slug: 'beginner-read-only-preview',
      title: 'Турнир для просмотра',
      description: 'Новичок видит детали, правила и таблицы',
      rules: previewTournamentRules(),
      createdBy: ADMIN_ID,
      registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2099-01-01T00:00:00.000Z'),
      startsAt: new Date('2099-01-02T00:00:00.000Z'),
    });
    await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);

    const { databaseUrl, redisUrl } = getTestUrls();
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'tournament-preview-route-bot',
        DAILY_SEED_SECRET: 'tournament-preview-route-seed',
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
      tournamentLifecycleEnabled: false,
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const beginnerAuthorization = {
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: BEGINNER_ID })}`,
    };
    const adminAuthorization = {
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: ADMIN_ID })}`,
    };
    try {
      const economyPresetResponses = await Promise.all([
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=16',
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=16',
          headers: beginnerAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset',
          headers: adminAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=16.5',
          headers: adminAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=1',
          headers: adminAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=10001',
          headers: adminAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=65',
          headers: adminAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=10000',
          headers: adminAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: '/admin/tournaments/economy-preset?participantLimit=16',
          headers: adminAuthorization,
        }),
      ]);
      expect(economyPresetResponses.map((response) => response.statusCode)).toEqual([
        401, 403, 400, 400, 400, 400, 200, 200, 200,
      ]);
      expect(economyPresetResponses[6]!.json()).toMatchObject({
        participantLimit: 65,
        entryFeeCoins: 15_000,
      });
      expect(economyPresetResponses[7]!.json()).toMatchObject({
        participantLimit: 10_000,
        entryFeeCoins: 15_000,
      });
      expect(economyPresetResponses[8]!.json()).toMatchObject({
        participantLimit: 16,
        entryFeeCoins: 10_000,
        payoutValueCoins: 136_000,
        sinkValueCoins: 24_000,
      });

      const reads = await Promise.all([
        app.inject({ method: 'GET', url: '/tournaments', headers: beginnerAuthorization }),
        app.inject({
          method: 'GET',
          url: `/tournaments/${tournament.id}`,
          headers: beginnerAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: `/tournaments/${tournament.id}/standings`,
          headers: beginnerAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: `/tournaments/${tournament.id}/bracket`,
          headers: beginnerAuthorization,
        }),
        app.inject({
          method: 'GET',
          url: `/tournaments/${tournament.id}/schedule?date=2099-01-02`,
          headers: beginnerAuthorization,
        }),
      ]);
      expect(reads.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200]);
      expect(reads[1]!.json()).toMatchObject({
        tournament: { id: tournament.id, rules: expect.any(Object) },
      });

      const restricted = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/tournaments/${tournament.id}/fixtures/${FIXTURE_ID}/segments/open`,
          headers: beginnerAuthorization,
        }),
        app.inject({
          method: 'POST',
          url: `/tournaments/fixtures/${FIXTURE_ID}/live/proposals`,
          headers: beginnerAuthorization,
          payload: { proposedAt: '2099-01-02T10:00:00.000Z' },
        }),
        app.inject({
          method: 'POST',
          url: `/tournaments/fixtures/${FIXTURE_ID}/live/proposals/${PROPOSAL_ID}/respond`,
          headers: beginnerAuthorization,
          payload: { accept: true },
        }),
      ]);
      for (const response of restricted) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({
          error: {
            code: 'amateur_level_required',
            message: 'amateur league is locked',
            details: { goalsRemaining: 283, unlockGoalsRequired: 300 },
          },
        });
      }
      const mutationCounts = await pool.query<{
        proposals: number;
        segments: number;
        duels: number;
      }>(
        `select
           (select count(*)::int from tournament_live_proposal) as proposals,
           (select count(*)::int from tournament_fixture_segment) as segments,
           (select count(*)::int from amateur_duel_match where source = 'tournament') as duels`,
      );
      expect(mutationCounts.rows[0]).toEqual({ proposals: 0, segments: 0, duels: 0 });

      const dismissed = await app.inject({
        method: 'POST',
        url: `/tournaments/${tournament.id}/readiness-hint/dismiss`,
        headers: beginnerAuthorization,
      });
      expect(dismissed.statusCode).toBe(200);
      expect(dismissed.json()).toMatchObject({ dismissed: true });
      const missingCongratulation = await app.inject({
        method: 'POST',
        url: `/tournaments/congratulations/${CONGRATULATION_ID}/read`,
        headers: beginnerAuthorization,
      });
      expect(missingCongratulation.statusCode).toBe(404);
      expect(missingCongratulation.json().error.code).toBe('not_found');

      const adminInvitation = await app.inject({
        method: 'POST',
        url: `/admin/tournaments/${tournament.id}/invitations`,
        headers: adminAuthorization,
        payload: { userId: INVITED_USER_ID },
      });
      expect(adminInvitation.statusCode).toBe(200);
      expect(adminInvitation.json()).toMatchObject({ state: 'invited' });
    } finally {
      await app.close();
    }
  });
});
