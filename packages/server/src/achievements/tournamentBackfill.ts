import type { Pool, PoolClient } from 'pg';
import { completeAchievementCandidates, type AchievementCompletionCandidate } from './service.js';
import {
  collectTournamentAchievementCandidates,
  TOURNAMENT_ACHIEVEMENT_IDS,
} from './tournamentEvaluator.js';

export interface TournamentAchievementBackfillReport {
  tournamentsScanned: number;
  distinctUsers: number;
  candidatesByAchievement: Record<string, number>;
  attempted: number;
  alreadyCompleted: number;
  insertable: number;
  inserted: number;
  timestampFallbacks: number;
  ambiguousExperienceSeries: number;
}

function keyOf(candidate: Pick<AchievementCompletionCandidate, 'userId' | 'achievementId'>) {
  return `${candidate.userId}\u0000${candidate.achievementId}`;
}

async function loadExistingKeys(
  db: Pool | PoolClient,
  candidates: AchievementCompletionCandidate[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const payload = candidates.map((candidate) => ({
    user_id: candidate.userId,
    achievement_id: candidate.achievementId,
  }));
  const result = await db.query<{ user_id: string; achievement_id: string }>(
    `select completion.user_id, completion.achievement_id
       from jsonb_to_recordset($1::jsonb) requested(user_id uuid, achievement_id text)
       join user_achievements completion
         on completion.user_id = requested.user_id
        and completion.achievement_id = requested.achievement_id`,
    [JSON.stringify(payload)],
  );
  return new Set(
    result.rows.map((row) => keyOf({ userId: row.user_id, achievementId: row.achievement_id })),
  );
}

async function runBackfill(
  db: Pool | PoolClient,
  options: { apply: boolean; batchSize: number },
): Promise<TournamentAchievementBackfillReport> {
  const tournaments = await db.query<{ id: string }>(
    `select id from tournament
      where status <> 'cancelled' and published_revision_id is not null
      order by created_at, id`,
  );
  const unique = new Map<string, AchievementCompletionCandidate>();
  let timestampFallbacks = 0;
  let ambiguousExperienceSeries = 0;
  for (const tournament of tournaments.rows) {
    const result = await collectTournamentAchievementCandidates(db, {
      tournamentId: tournament.id,
      source: 'tournament_backfill',
    });
    timestampFallbacks += result.diagnostics.timestampFallbacks;
    ambiguousExperienceSeries += result.diagnostics.ambiguousExperienceSeries;
    for (const candidate of result.candidates) {
      const key = keyOf(candidate);
      const existing = unique.get(key);
      if (existing === undefined || candidate.achievedAt < existing.achievedAt) {
        unique.set(key, candidate);
      }
    }
  }

  const candidates = [...unique.values()];
  const existingKeys = await loadExistingKeys(db, candidates);
  const insertableCandidates = candidates.filter(
    (candidate) => !existingKeys.has(keyOf(candidate)),
  );
  const candidatesByAchievement = Object.fromEntries(
    TOURNAMENT_ACHIEVEMENT_IDS.map((achievementId) => [achievementId, 0]),
  );
  for (const candidate of candidates) {
    candidatesByAchievement[candidate.achievementId] =
      (candidatesByAchievement[candidate.achievementId] ?? 0) + 1;
  }

  let inserted = 0;
  if (options.apply) {
    for (let offset = 0; offset < insertableCandidates.length; offset += options.batchSize) {
      const result = await completeAchievementCandidates(
        db,
        insertableCandidates.slice(offset, offset + options.batchSize),
      );
      inserted += result.inserted;
    }
    const persisted = await loadExistingKeys(db, insertableCandidates);
    if (persisted.size !== insertableCandidates.length) {
      throw new Error('tournament achievement backfill verification failed');
    }
  }

  return {
    tournamentsScanned: tournaments.rowCount ?? 0,
    distinctUsers: new Set(candidates.map((candidate) => candidate.userId)).size,
    candidatesByAchievement,
    attempted: candidates.length,
    alreadyCompleted: existingKeys.size,
    insertable: insertableCandidates.length,
    inserted,
    timestampFallbacks,
    ambiguousExperienceSeries,
  };
}

export async function backfillTournamentAchievements(
  pool: Pool,
  options: { apply: boolean; batchSize: number },
): Promise<TournamentAchievementBackfillReport> {
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('batchSize must be a positive integer');
  }
  if (!options.apply) return runBackfill(pool, options);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const lock = await client.query<{ acquired: boolean }>(
      `select pg_try_advisory_xact_lock(
         hashtext('tournament-achievement-backfill:v1')
       ) as acquired`,
    );
    if (lock.rows[0]?.acquired !== true) throw new Error('backfill already running');
    const report = await runBackfill(client, options);
    await client.query('commit');
    return report;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
