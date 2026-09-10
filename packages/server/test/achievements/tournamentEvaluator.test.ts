import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { collectTournamentAchievementCandidates } from '../../src/achievements/tournamentEvaluator.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('tournament achievement evaluator', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users cascade');
  });

  async function createUser(label: string): Promise<string> {
    const id = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone) values ($1, $2, 'Europe/Moscow')`,
      [id, label],
    );
    return id;
  }

  async function createTournament(input: {
    ownerId: string;
    status: 'regular' | 'playoff' | 'completed';
    startsAt?: string;
    completedAt?: string;
    playoffSize?: number;
  }): Promise<string> {
    const tournamentId = randomUUID();
    const revisionId = randomUUID();
    await pool.query(
      `insert into tournament
         (id, slug, title, status, regular_source, starts_at, completed_at, created_by)
       values ($1, $2, 'Test Cup', $3, 'head_to_head', $4, $5, $6)`,
      [
        tournamentId,
        `test-${tournamentId}`,
        input.status,
        input.startsAt ?? '2026-09-01T10:00:00.000Z',
        input.completedAt ?? null,
        input.ownerId,
      ],
    );
    await pool.query(
      `insert into tournament_revision
         (id, tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
       values ($1, $2, 1, $3, true, $4, '2026-08-01T10:00:00.000Z')`,
      [
        revisionId,
        tournamentId,
        JSON.stringify({
          config: {
            timezone: 'Europe/Moscow',
            playoffSize: input.playoffSize ?? 4,
            regularSource: 'head_to_head',
          },
        }),
        input.ownerId,
      ],
    );
    await pool.query(
      `update tournament set published_revision_id = $2, current_revision = 1 where id = $1`,
      [tournamentId, revisionId],
    );
    return tournamentId;
  }

  async function addParticipant(tournamentId: string, userId: string, rank: number) {
    const participantId = randomUUID();
    await pool.query(
      `insert into tournament_participant
         (id, tournament_id, user_id, state, joined_at)
       values ($1, $2, $3, 'approved', '2026-08-01T10:00:00.000Z')`,
      [participantId, tournamentId, userId],
    );
    await pool.query(
      `insert into tournament_standing
         (tournament_id, participant_id, rank, played, recalculated_at)
       values ($1, $2, $3, 3, '2026-09-05T10:00:00.000Z')`,
      [tournamentId, participantId, rank],
    );
    return participantId;
  }

  it('awards final regular placements and only fully assigned playoff rounds', async () => {
    const users = await Promise.all([1, 2, 3, 4].map((number) => createUser(`Player ${number}`)));
    const tournamentId = await createTournament({ ownerId: users[0]!, status: 'playoff' });
    const participants = await Promise.all(
      users.map((userId, index) => addParticipant(tournamentId, userId, index + 1)),
    );
    const semifinalRound = randomUUID();
    const finalRound = randomUUID();
    await pool.query(
      `insert into tournament_round (id, tournament_id, stage, number, status, starts_at)
       values ($1, $3, 'playoff', 1, 'open', '2026-09-06T10:00:00.000Z'),
              ($2, $3, 'playoff', 2, 'scheduled', '2026-09-07T10:00:00.000Z')`,
      [semifinalRound, finalRound, tournamentId],
    );
    await pool.query(
      `insert into tournament_playoff_series
         (tournament_id, round_id, bracket_position, higher_seed_participant_id,
          lower_seed_participant_id, wins_required, home_sequence, status, created_at)
       values ($1, $2, 1, $4, $7, 2, '[]', 'active', '2026-09-06T10:00:00.000Z'),
              ($1, $2, 2, $5, $6, 2, '[]', 'active', '2026-09-06T10:00:00.000Z'),
              ($1, $3, 1, $4, null, 2, '[]', 'pending', '2026-09-06T10:00:00.000Z')`,
      [tournamentId, semifinalRound, finalRound, ...participants],
    );

    const result = await collectTournamentAchievementCandidates(pool, {
      tournamentId,
      source: 'tournament_backfill',
    });
    const idsByUser = new Map<string, string[]>();
    for (const candidate of result.candidates) {
      const ids = idsByUser.get(candidate.userId) ?? [];
      ids.push(candidate.achievementId);
      idsByUser.set(candidate.userId, ids);
    }

    expect(idsByUser.get(users[0]!)?.sort()).toEqual(
      ['playoff-semifinal', 'regular-season-champion'].sort(),
    );
    expect(idsByUser.get(users[1]!)?.sort()).toEqual(
      ['playoff-semifinal', 'regular-season-medalist'].sort(),
    );
    expect(idsByUser.get(users[2]!)?.sort()).toEqual(
      ['playoff-semifinal', 'regular-season-medalist'].sort(),
    );
    expect(idsByUser.get(users[3]!)).toEqual(['playoff-semifinal']);
    expect(result.candidates.some((candidate) => candidate.achievementId === 'playoff-final')).toBe(
      false,
    );
  });

  it('does not award final regular places while regular coverage is unfinished', async () => {
    const userId = await createUser('Regular Player');
    const tournamentId = await createTournament({ ownerId: userId, status: 'regular' });
    await addParticipant(tournamentId, userId, 1);

    const result = await collectTournamentAchievementCandidates(pool, {
      tournamentId,
      source: 'tournament_backfill',
    });

    expect(result.candidates).toEqual([]);
  });

  it('awards an official cup and the third championship in one local hockey season', async () => {
    const userId = await createUser('Champion');
    const tournamentIds: string[] = [];
    for (const [index, completedAt] of [
      '2026-09-10T10:00:00.000Z',
      '2026-10-10T10:00:00.000Z',
      '2026-11-10T10:00:00.000Z',
    ].entries()) {
      const tournamentId = await createTournament({
        ownerId: userId,
        status: 'completed',
        startsAt: `2026-${String(index + 9).padStart(2, '0')}-01T10:00:00.000Z`,
        completedAt,
        playoffSize: 2,
      });
      tournamentIds.push(tournamentId);
      const champion = await addParticipant(tournamentId, userId, 1);
      const opponentUser = await createUser(`Opponent ${index}`);
      const opponent = await addParticipant(tournamentId, opponentUser, 2);
      const finalRound = randomUUID();
      await pool.query(
        `insert into tournament_round (id, tournament_id, stage, number, status)
         values ($1, $2, 'playoff', 1, 'settled')`,
        [finalRound, tournamentId],
      );
      await pool.query(
        `insert into tournament_playoff_series
           (tournament_id, round_id, bracket_position, higher_seed_participant_id,
            lower_seed_participant_id, winner_participant_id, wins_required,
            higher_seed_wins, home_sequence, status, updated_at)
         values ($1, $2, 1, $3, $4, $3, 1, 1, '[]', 'completed', $5)`,
        [tournamentId, finalRound, champion, opponent, completedAt],
      );
    }

    const result = await collectTournamentAchievementCandidates(pool, {
      tournamentId: tournamentIds[2]!,
      source: 'tournament_backfill',
    });
    const championCandidates = result.candidates.filter((candidate) => candidate.userId === userId);

    expect(championCandidates.map((candidate) => candidate.achievementId)).toEqual(
      expect.arrayContaining(['tournament-cup', 'tournament-streak']),
    );
    expect(
      championCandidates.find((candidate) => candidate.achievementId === 'tournament-streak')
        ?.achievedAt,
    ).toEqual(new Date('2026-11-10T10:00:00.000Z'));
  });

  it('derives dark horse, comeback, and no-shake from played tournament duels', async () => {
    const winnerUserId = await createUser('Comeback Winner');
    const opponentUserId = await createUser('Experienced Opponent');
    const tournamentId = await createTournament({ ownerId: winnerUserId, status: 'playoff' });
    const winnerParticipant = await addParticipant(tournamentId, winnerUserId, 1);
    const opponentParticipant = await addParticipant(tournamentId, opponentUserId, 2);
    const roundId = randomUUID();
    const seriesId = randomUUID();
    await pool.query(
      `insert into tournament_round (id, tournament_id, stage, number, status)
       values ($1, $2, 'playoff', 1, 'settled')`,
      [roundId, tournamentId],
    );
    await pool.query(
      `insert into tournament_playoff_series
         (id, tournament_id, round_id, bracket_position, higher_seed_participant_id,
          lower_seed_participant_id, winner_participant_id, wins_required,
          higher_seed_wins, lower_seed_wins, home_sequence, status, updated_at)
       values ($1, $2, $3, 1, $4, $5, $4, 2, 2, 1, '[]', 'completed',
               '2026-09-09T10:00:00Z')`,
      [seriesId, tournamentId, roundId, winnerParticipant, opponentParticipant],
    );

    for (const [index, winningParticipant] of [
      opponentParticipant,
      winnerParticipant,
      winnerParticipant,
    ].entries()) {
      const matchId = randomUUID();
      const fixtureId = randomUUID();
      const settledAt = `2026-09-0${index + 6}T10:00:00Z`;
      await pool.query(
        `insert into amateur_duel_match
           (id, challenger_user_id, opponent_user_id, status, source, rules_snapshot,
            match_seed, starts_at, ends_at, winner_user_id, outcome,
            game_core_version, settled_at)
         values ($1, $2, $3, 'settled', 'tournament', '{}', $4,
                 '2026-09-01T10:00:00Z', '2026-09-30T10:00:00Z', $5, $6, 1, $7)`,
        [
          matchId,
          winnerUserId,
          opponentUserId,
          `seed-${index}`,
          winningParticipant === winnerParticipant ? winnerUserId : opponentUserId,
          winningParticipant === winnerParticipant ? 'challenger_win' : 'opponent_win',
          settledAt,
        ],
      );
      await pool.query(
        `insert into amateur_duel_participant
           (match_id, user_id, side, state, shots_taken, goals, experience_snapshot)
         values ($1, $2, 'challenger', 'completed', 10, 9, 100),
                ($1, $3, 'opponent', 'completed', 10, 8, 200)`,
        [matchId, winnerUserId, opponentUserId],
      );
      await pool.query(
        `insert into tournament_fixture
           (id, tournament_id, round_id, series_id, fixture_number,
            home_participant_id, away_participant_id, status, winner_participant_id,
            outcome, settled_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'settled', $8, $9, $10)`,
        [
          fixtureId,
          tournamentId,
          roundId,
          seriesId,
          index + 1,
          winnerParticipant,
          opponentParticipant,
          winningParticipant,
          winningParticipant === winnerParticipant ? 'home_win' : 'away_win',
          settledAt,
        ],
      );
      await pool.query(
        `insert into tournament_fixture_segment
           (fixture_id, sequence_number, kind, duel_match_id, status,
            home_score, away_score, rules_snapshot, settled_at)
         values ($1, 1, 'regulation', $2, 'settled', 1, 0, '{}', $3)`,
        [fixtureId, matchId, settledAt],
      );
    }

    const result = await collectTournamentAchievementCandidates(pool, {
      tournamentId,
      source: 'tournament_backfill',
    });
    const ids = result.candidates
      .filter((candidate) => candidate.userId === winnerUserId)
      .map((candidate) => candidate.achievementId);

    expect(ids).toEqual(expect.arrayContaining(['dark-horse', 'series-comeback', 'no-shake']));
  });
});
