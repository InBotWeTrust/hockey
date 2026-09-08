import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  decideTournamentApplication,
  evaluateTournamentEligibility,
} from '../../src/tournament/registration.js';
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
const ADMIN_ID = '00000000-0000-4000-8000-000000000181';
const APPLY_USER_ID = '00000000-0000-4000-8000-000000000182';
const INVITED_USER_ID = '00000000-0000-4000-8000-000000000183';
const WITHDRAW_USER_ID = '00000000-0000-4000-8000-000000000184';
const INVITED_PARTICIPANT_ID = '00000000-0000-4000-8000-000000000185';
const WITHDRAW_PARTICIPANT_ID = '00000000-0000-4000-8000-000000000186';
const JWT_SECRET = 'tournament-preview-registration-access';
const REFRESH_SECRET = 'tournament-preview-registration-refresh';

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

describe('tournament registration', () => {
  const player = { userId: 'u1', level: 4, goals: 500, experience: 250 };

  it('evaluates allowlist, banlist and progress filters', () => {
    expect(
      evaluateTournamentEligibility(player, {
        minLevel: 3,
        maxLevel: 5,
        minGoals: 400,
        minExperience: 200,
        invitedUserIds: ['u1'],
        bannedUserIds: [],
      }),
    ).toEqual({ eligible: true, reasons: [] });

    expect(
      evaluateTournamentEligibility(player, {
        minLevel: 5,
        maxLevel: null,
        minGoals: 600,
        minExperience: 300,
        invitedUserIds: [],
        bannedUserIds: ['u1'],
      }).reasons,
    ).toEqual(['banned', 'level_too_low', 'goals_too_low', 'experience_too_low']);
  });

  it('requires an invitation for invite-only registration', () => {
    expect(
      decideTournamentApplication({
        mode: 'invite_only',
        invited: false,
        eligible: true,
        approvedParticipants: 2,
        participantLimit: 8,
      }),
    ).toEqual({ accepted: false, state: null, reason: 'invitation_required' });
  });

  it('auto-approves open registration and queues approval mode', () => {
    expect(
      decideTournamentApplication({
        mode: 'open',
        invited: false,
        eligible: true,
        approvedParticipants: 2,
        participantLimit: 8,
      }),
    ).toEqual({ accepted: true, state: 'approved', reason: null });
    expect(
      decideTournamentApplication({
        mode: 'approval',
        invited: false,
        eligible: true,
        approvedParticipants: 2,
        participantLimit: 8,
      }),
    ).toEqual({ accepted: true, state: 'applied', reason: null });
  });

  it('rejects ineligible and full tournaments before charging', () => {
    expect(
      decideTournamentApplication({
        mode: 'open',
        invited: false,
        eligible: false,
        approvedParticipants: 2,
        participantLimit: 8,
      }).reason,
    ).toBe('not_eligible');
    expect(
      decideTournamentApplication({
        mode: 'open',
        invited: false,
        eligible: true,
        approvedParticipants: 8,
        participantLimit: 8,
      }).reason,
    ).toBe('capacity_reached');
  });
});

describe.skipIf(!hasIntegrationEnv)('beginner tournament registration preview', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejects create, invitation acceptance and withdrawal without changing participation', async () => {
    await pool.query(
      `insert into users (id, display_name, timezone, role, level, lifetime_goals_total)
       values ($1, 'Admin', 'Europe/Moscow', 'admin', 10, 1000),
              ($2, 'Beginner apply', 'Europe/Moscow', 'player', 1, 17),
              ($3, 'Beginner invited', 'Europe/Moscow', 'player', 1, 17),
              ($4, 'Beginner withdraw', 'Europe/Moscow', 'player', 1, 17)`,
      [ADMIN_ID, APPLY_USER_ID, INVITED_USER_ID, WITHDRAW_USER_ID],
    );
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'preview test'),
              ('amateur.unlock_goals_required', '300'::jsonb, 'Порог любителей', 'preview test')
       on conflict (key) do update set value = excluded.value`,
    );
    const tournament = await createTournamentDraft(pool, {
      slug: 'beginner-registration-preview',
      title: 'Турнир для просмотра',
      description: 'Доступен новичку только для просмотра',
      rules: previewTournamentRules(),
      createdBy: ADMIN_ID,
      registrationOpensAt: new Date('2020-01-01T00:00:00.000Z'),
      registrationClosesAt: new Date('2099-01-01T00:00:00.000Z'),
      startsAt: new Date('2099-01-02T00:00:00.000Z'),
    });
    await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
    await pool.query(
      `insert into tournament_participant (id, tournament_id, user_id, state, invited_by)
       values ($1, $3, $4, 'invited', $6),
              ($2, $3, $5, 'approved', $6)`,
      [
        INVITED_PARTICIPANT_ID,
        WITHDRAW_PARTICIPANT_ID,
        tournament.id,
        INVITED_USER_ID,
        WITHDRAW_USER_ID,
        ADMIN_ID,
      ],
    );

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
        TELEGRAM_BOT_TOKEN: 'tournament-preview-registration-bot',
        DAILY_SEED_SECRET: 'tournament-preview-registration-seed',
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
      tournamentLifecycleEnabled: false,
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const authorizationFor = async (userId: string) => ({
      authorization: `Bearer ${await jwt.issueAccessToken({ sub: userId })}`,
    });
    try {
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/tournaments/${tournament.id}/applications`,
          headers: await authorizationFor(APPLY_USER_ID),
        }),
        app.inject({
          method: 'POST',
          url: `/tournaments/${tournament.id}/applications`,
          headers: await authorizationFor(INVITED_USER_ID),
        }),
        app.inject({
          method: 'DELETE',
          url: `/tournaments/${tournament.id}/applications/me`,
          headers: await authorizationFor(WITHDRAW_USER_ID),
        }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({
          error: {
            code: 'amateur_level_required',
            message: 'amateur league is locked',
            details: { goalsRemaining: 283, unlockGoalsRequired: 300 },
          },
        });
      }

      const participants = await pool.query<{ user_id: string; state: string }>(
        `select user_id, state from tournament_participant
          where tournament_id = $1 order by user_id`,
        [tournament.id],
      );
      expect(participants.rows).toEqual([
        { user_id: INVITED_USER_ID, state: 'invited' },
        { user_id: WITHDRAW_USER_ID, state: 'approved' },
      ]);
    } finally {
      await app.close();
    }
  });
});
