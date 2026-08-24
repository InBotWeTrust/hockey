import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  getFixtureLiveState,
  proposeFixtureLiveTime,
  respondFixtureLiveProposal,
} from '../../src/tournament/live.js';
import {
  applyToTournament,
  cancelTournament,
  createTournamentDraft,
  generateRegularSchedule,
  publishRegularSchedule,
  publishTournament,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

const ADMIN_ID = '00000000-0000-4000-8000-000000000701';
const PLAYER_IDS = [
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000712',
  '00000000-0000-4000-8000-000000000713',
  '00000000-0000-4000-8000-000000000714',
] as const;

function rules(entryFeeCoins: number): TournamentRulesSnapshot {
  return {
    config: parseTournamentConfig({
      regularSource: 'head_to_head',
      participantLimit: 4,
      playoffSize: 2,
      timezone: 'Europe/Moscow',
      registrationMode: 'open',
      visibility: 'public',
      entryFeeCoins,
      roundRobinCycles: 2,
      roundsPerDay: 2,
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
    regularDuelTemplateId: '00000000-0000-4000-8000-000000000799',
  };
}

async function seedUsers(pool: Pool, playerBalance: number): Promise<void> {
  await pool.query(
    `insert into users (id, display_name, timezone, role, level, lifetime_goals_total, experience)
     values ($1, 'Tournament Admin', 'Europe/Moscow', 'admin', 10, 1000, 1000)`,
    [ADMIN_ID],
  );
  for (const [index, playerId] of PLAYER_IDS.entries()) {
    await pool.query(
      `insert into users
         (id, display_name, timezone, level, lifetime_goals_total, experience)
       values ($1, $2, 'Europe/Moscow', 5, 500, 500)`,
      [playerId, `Tournament Player ${index + 1}`],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance) values ($1, $2)`,
      [playerId, playerBalance],
    );
  }
}

async function createPublishedTournament(pool: Pool, slug: string, entryFeeCoins: number) {
  const tournament = await createTournamentDraft(pool, {
    slug,
    title: 'Integration Championship',
    description: 'Tournament integration test',
    rules: rules(entryFeeCoins),
    createdBy: ADMIN_ID,
    registrationOpensAt: null,
    registrationClosesAt: null,
    startsAt: new Date('2030-09-01T07:00:00.000Z'),
  });
  await publishTournament(pool, tournament.id, tournament.revision, ADMIN_ID);
  return tournament;
}

describe.skipIf(!hasIntegrationEnv)('tournament service integration', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('charges and refunds an entry fee exactly once under concurrent requests', async () => {
    await seedUsers(pool, 100);
    const tournament = await createPublishedTournament(pool, 'concurrent-entry-fee', 25);

    const applications = await Promise.allSettled([
      applyToTournament(pool, tournament.id, PLAYER_IDS[0]),
      applyToTournament(pool, tournament.id, PLAYER_IDS[0]),
    ]);

    expect(applications.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(applications.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const charged = await pool.query<{ balance: number }>(
      `select balance from user_currency_account where user_id = $1`,
      [PLAYER_IDS[0]],
    );
    expect(charged.rows[0]?.balance).toBe(75);

    const entryEvents = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_economy_event
        where tournament_id = $1 and kind = 'entry_fee' and status = 'applied'`,
      [tournament.id],
    );
    expect(entryEvents.rows[0]?.count).toBe('1');

    const cancellations = await Promise.allSettled([
      cancelTournament(pool, tournament.id, tournament.revision, ADMIN_ID),
      cancelTournament(pool, tournament.id, tournament.revision, ADMIN_ID),
    ]);
    expect(cancellations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(cancellations.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const refunded = await pool.query<{ balance: number }>(
      `select balance from user_currency_account where user_id = $1`,
      [PLAYER_IDS[0]],
    );
    expect(refunded.rows[0]?.balance).toBe(100);

    const refundEvents = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_economy_event
        where tournament_id = $1 and kind = 'entry_refund' and status = 'applied'`,
      [tournament.id],
    );
    expect(refundEvents.rows[0]?.count).toBe('1');
  });

  it('rolls back the participant and economy event when the balance is insufficient', async () => {
    await seedUsers(pool, 10);
    const tournament = await createPublishedTournament(pool, 'insufficient-entry-fee', 25);

    await expect(applyToTournament(pool, tournament.id, PLAYER_IDS[0])).rejects.toMatchObject({
      code: 'insufficient_coins',
    });

    const participants = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_participant where tournament_id = $1`,
      [tournament.id],
    );
    expect(participants.rows[0]?.count).toBe('0');

    const events = await pool.query<{ count: string }>(
      `select count(*)::text as count from tournament_economy_event where tournament_id = $1`,
      [tournament.id],
    );
    expect(events.rows[0]?.count).toBe('0');
  });

  it('regenerates a round-robin schedule without duplicate persisted rows', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'schedule-regeneration', 0);
    for (const playerId of PLAYER_IDS) {
      await applyToTournament(pool, tournament.id, playerId);
    }

    const first = await generateRegularSchedule(pool, tournament.id, tournament.revision);
    const second = await generateRegularSchedule(pool, tournament.id, tournament.revision);

    expect(first).toMatchObject({ status: 'scheduling', roundCount: 6, fixtureCount: 12 });
    expect(second).toMatchObject({ status: 'scheduling', roundCount: 6, fixtureCount: 12 });

    const persisted = await pool.query<{
      matchdays: string;
      rounds: string;
      fixtures: string;
      participant_appearances: string;
    }>(
      `select
         (select count(*) from tournament_matchday where tournament_id = $1)::text as matchdays,
         (select count(*) from tournament_round where tournament_id = $1)::text as rounds,
         (select count(*) from tournament_fixture where tournament_id = $1)::text as fixtures,
         (select count(*) from tournament_fixture f
           where f.tournament_id = $1
             and ($2 = f.home_participant_id or $2 = f.away_participant_id))::text
           as participant_appearances`,
      [tournament.id, (await pool.query<{ id: string }>(
        `select id from tournament_participant where tournament_id = $1 and user_id = $2`,
        [tournament.id, PLAYER_IDS[0]],
      )).rows[0]!.id],
    );
    expect(persisted.rows[0]).toEqual({
      matchdays: '3',
      rounds: '6',
      fixtures: '12',
      participant_appearances: '6',
    });
  });

  it('returns a stable live DTO through proposal and acceptance', async () => {
    await seedUsers(pool, 0);
    const tournament = await createPublishedTournament(pool, 'live-proposal-contract', 0);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[0]);
    await applyToTournament(pool, tournament.id, PLAYER_IDS[1]);
    await generateRegularSchedule(pool, tournament.id, tournament.revision);
    await publishRegularSchedule(pool, tournament.id);
    const fixture = await pool.query<{ id: string }>(
      `select id from tournament_fixture where tournament_id = $1 order by fixture_number limit 1`,
      [tournament.id],
    );
    const fixtureId = fixture.rows[0]!.id;

    expect(await getFixtureLiveState(pool, fixtureId, PLAYER_IDS[0])).toEqual({
      fixtureId,
      status: 'scheduled',
      score: { home: 0, away: 0 },
      scheduledStartsAt: '2030-09-01T07:00:00.000Z',
      windowEndsAt: '2030-09-01T08:00:00.000Z',
      proposal: null,
      duelMatchId: null,
      participants: [],
    });

    const proposal = await proposeFixtureLiveTime(pool, {
      fixtureId,
      userId: PLAYER_IDS[0],
      proposedAt: new Date('2030-09-01T07:30:00.000Z'),
    });
    await respondFixtureLiveProposal(pool, {
      fixtureId,
      proposalId: proposal.id,
      userId: PLAYER_IDS[1],
      accept: true,
    });

    expect(await getFixtureLiveState(pool, fixtureId, PLAYER_IDS[1])).toMatchObject({
      fixtureId,
      scheduledStartsAt: '2030-09-01T07:30:00.000Z',
      proposal: {
        id: proposal.id,
        proposedAt: '2030-09-01T07:30:00.000Z',
        proposedByUserId: PLAYER_IDS[0],
        state: 'accepted',
      },
    });
  });
});
