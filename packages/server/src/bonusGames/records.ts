import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { observeCareerExperience } from '../achievements/service.js';
import { listBonusGameCards } from './catalog.js';
import type { BonusGameAttemptRow, BonusSkillCode } from './types.js';

export function recordScore(
  skill: BonusSkillCode,
  elapsedMs: number,
  shots: number,
  goals: number,
  bestSeries = 0,
): [number, number] | [number, number, number, number] {
  if (skill === 'rhythm') {
    if (!Number.isInteger(shots) || shots < 1 || shots > 1000000 || !Number.isInteger(goals) || goals < 0 || goals > shots) throw new Error("invalid Rhythm record counts");
    return [Math.round(elapsedMs / 10), -bestSeries, -Number(BigInt(goals)*1000000000000n/BigInt(shots)), shots];
  }
  if (skill === 'accuracy') {
    if (!Number.isInteger(shots) || shots < 1 || shots > 1_000_000 || !Number.isInteger(goals) || goals < 0 || goals > shots) throw new Error('invalid accuracy record counts');
    // With denominators <= 1e6, distinct fractions differ by >= 1e-12.
    // This integer key preserves their exact ordering and equality, including
    // equivalent fractions, without using rounded display percentages or floats.
    return [-Number(BigInt(goals) * 1_000_000_000_000n / BigInt(shots)), elapsedMs];
  }
  if (skill === 'marksmanship') return [elapsedMs, shots];
  // Successful endurance duration is fixed within a rules version, so more goals
  // is exactly the ordering of duration/goals, without floating point rounding.
  if (skill === 'endurance') return [-goals, 0];
  return [elapsedMs, 0];
}
export function compareRecordScores(a: readonly number[], b: readonly number[]): number {
  for (let i=0;i<Math.max(a.length,b.length);i++) {const delta=(a[i]??0)-(b[i]??0); if(delta) return Math.sign(delta);}
  return 0;
}
export function recordReward(
  personal: boolean,
  global: boolean,
): { stars: number; experience: number } {
  return {
    stars: (personal ? 10 : 0) + (global ? 30 : 0),
    experience: (personal ? 10 : 0) + (global ? 30 : 0),
  };
}
export interface BonusRecordResult {
  elapsedMs: number;
  shots: number;
  goals: number;
  points: number;
  bestSeries?: number;
  personalImproved: boolean;
  globalImproved: boolean;
  personalBest: { elapsedMs: number; shots: number; goals: number; points: number; bestSeries?: number };
  place: number;
  stars: number;
  experience: number;
}
interface StoredRecord {
  primary_score: string;
  secondary_score: string;
  tertiary_score: string;
  quaternary_score: string;
  elapsed_ms: string;
  shots: number;
  goals: number;
  points: number;
}
// Keep versioned history, but rank only each player's best result across all rules.
const allTimeRecords = `with scored as (
  select r.*, case when skill_code='endurance' then elapsed_ms::numeric / nullif(goals,0)
    else primary_score::numeric end as ranking_primary
  from bonus_game_record r where game_id=$1 and skill_code=$2
), personal as (
  select *, row_number() over(partition by user_id order by ranking_primary,
    secondary_score,tertiary_score,quaternary_score,achieved_at,attempt_id) as personal_position
  from scored
), ranked as (
  select *, rank() over(order by ranking_primary,secondary_score,tertiary_score,quaternary_score)::int as place
  from personal where personal_position=1
)`;
function comparableScore(skill: BonusSkillCode, record: StoredRecord): number[] {
  return [skill === 'endurance' ? Number(record.elapsed_ms) / record.goals : Number(record.primary_score),
    Number(record.secondary_score), Number(record.tertiary_score), Number(record.quaternary_score)];
}
async function version(
  client: PoolClient,
  skill: string,
  qualification: unknown,
  periods: unknown,
  inventory: boolean,
): Promise<string> {
  return (
    await client.query<{ v: string }>(
      'select bonus_record_rules_version($1,$2::jsonb,$3::jsonb,$4) as v',
      [skill, JSON.stringify(qualification), JSON.stringify(periods), inventory],
    )
  ).rows[0]!.v;
}
export async function settleBonusRecord(
  client: PoolClient,
  attempt: BonusGameAttemptRow,
  elapsedMs: number,
  now: Date,
): Promise<void> {
  const rules = attempt.rules_snapshot;
  if (
    attempt.status !== 'completed' ||
    rules.skillCode === 'challenge' ||
    elapsedMs <= 0 ||
    attempt.goals <= 0 ||
    attempt.shots_taken <= 0
  )
    return;
  const v = await version(
    client,
    rules.skillCode,
    rules.qualificationRules,
    rules.periods,
    rules.useInventory,
  );
  // Use an independent advisory lock: catalog readers already hold row share locks.
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `bonus-record:${attempt.bonus_game_id}`,
  ]);
  if (
    (await client.query('select 1 from bonus_game_record_result where attempt_id=$1', [attempt.id]))
      .rowCount
  )
    return;
  const args = [attempt.bonus_game_id, v];
  const versionOld = (
    await client.query<StoredRecord>(
      'select * from bonus_game_record where game_id=$1 and rules_version=$2 and user_id=$3',
      [...args, attempt.user_id],
    )
  ).rows[0];
  const rankingArgs = [attempt.bonus_game_id, rules.skillCode];
  const old = (await client.query<StoredRecord>(
    allTimeRecords + ' select * from ranked where user_id=$3',
    [...rankingArgs, attempt.user_id],
  )).rows[0];
  const leader = (await client.query<StoredRecord>(
    allTimeRecords + ' select * from ranked order by place limit 1', rankingArgs,
  )).rows[0];
  const score = recordScore(
    rules.skillCode,
    elapsedMs,
    Number(attempt.shots_taken),
    Number(attempt.goals),
    Number(attempt.best_goal_streak),
  );
  const rankingScore = rules.skillCode === 'endurance'
    ? [elapsedMs / Number(attempt.goals), 0] : score;
  const better = (r: StoredRecord) =>
    compareRecordScores(rankingScore, comparableScore(rules.skillCode, r)) < 0;
  const personal = old !== undefined && better(old);
  const global = leader !== undefined && better(leader);
  if (versionOld === undefined || better(versionOld))
    await client.query(
      `insert into bonus_game_record
    (game_id,rules_version,user_id,attempt_id,skill_code,primary_score,secondary_score,elapsed_ms,shots,goals,points,achieved_at,tertiary_score,quaternary_score)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    on conflict(game_id,rules_version,user_id) do update set attempt_id=excluded.attempt_id,
    primary_score=excluded.primary_score,secondary_score=excluded.secondary_score,elapsed_ms=excluded.elapsed_ms,
    shots=excluded.shots,goals=excluded.goals,points=excluded.points,achieved_at=excluded.achieved_at,tertiary_score=excluded.tertiary_score,quaternary_score=excluded.quaternary_score`,
      [
        ...args,
        attempt.user_id,
        attempt.id,
        rules.skillCode,
        score[0],score[1],
        elapsedMs,
        attempt.shots_taken,
        attempt.goals,
        attempt.total_points,
        now,score[2]??0,score[3]??0,
      ],
    );
  const best = (await client.query<StoredRecord & { place: number }>(
    allTimeRecords + ' select * from ranked where user_id=$3',
    [...rankingArgs, attempt.user_id],
  )).rows[0]!;
  const place = Number(best.place);
  const reward = recordReward(personal, global);
  const result: BonusRecordResult = {
    elapsedMs,
    ...(rules.skillCode === 'rhythm' ? {bestSeries:Number(attempt.best_goal_streak)} : {}),
    shots: Number(attempt.shots_taken),
    goals: Number(attempt.goals),
    points: Number(attempt.total_points),
    personalImproved: personal,
    globalImproved: global,
    place,
    ...reward,
    personalBest: {
      ...(rules.skillCode === 'rhythm' ? {bestSeries:Math.max(0,-Number(best.secondary_score))} : {}),
      elapsedMs: Number(best.elapsed_ms),
      shots: best.shots,
      goals: best.goals,
      points: best.points,
    },
  };
  await client.query(
    `insert into bonus_game_record_result(attempt_id,game_id,user_id,rules_version,personal_improved,global_improved,stars,experience,result_snapshot,created_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      attempt.id,
      attempt.bonus_game_id,
      attempt.user_id,
      v,
      personal,
      global,
      reward.stars,
      reward.experience,
      JSON.stringify(result),
      now,
    ],
  );
  if (reward.stars || reward.experience) {
    const user = (
      await client.query<{ experience: number }>(
        'update users set xp=xp+$2,experience=experience+$3 where id=$1 returning experience',
        [attempt.user_id, reward.stars, reward.experience],
      )
    ).rows[0]!;
    await observeCareerExperience(client, attempt.user_id, {
      eventKey: `bonus-record:${attempt.id}:reward`,
      occurredAt: now,
      lifetimeTotal: Number(user.experience),
    });
  }
}
export async function getBonusRecordResult(
  client: PoolClient,
  attemptId: string,
): Promise<BonusRecordResult | null> {
  return (
    (
      await client.query<{ result_snapshot: BonusRecordResult }>(
        'select result_snapshot from bonus_game_record_result where attempt_id=$1',
        [attemptId],
      )
    ).rows[0]?.result_snapshot ?? null
  );
}
export async function listBonusRecords(pool: Pool, userId: string, gameId: string, offset: number) {
  const game = (await listBonusGameCards(pool, userId)).find((g) => g.id === gameId);
  if (!game || game.skill_code === 'challenge')
    throw new AppError('not_found', 'game not found', 404);
  if (!game.is_completed)
    throw new AppError('bonus_records_locked', 'Сначала пройди эту локацию', 403);
  const client = await pool.connect();
  try {
    const sql = allTimeRecords + `
      select r.place,r.user_id as "userId",u.display_name as "displayName",u.avatar_url as "avatarUrl",
      r.elapsed_ms::float8 as "elapsedMs",greatest(0,-r.secondary_score)::int as "bestSeries",r.shots,r.goals,r.points
      from ranked r join users u on u.id=r.user_id`;
    const rows = (
      await client.query(sql + ' order by r.place,r.achieved_at,r.user_id limit $3 offset $4', [
        gameId,
        game.skill_code,
        Math.min(20, 100 - offset),
        offset,
      ])
    ).rows;
    const currentUser =
      (await client.query(sql + ' where r.user_id=$3', [gameId, game.skill_code, userId])).rows[0] ?? null;
    return {
      rows,
      currentUser,
      previousRecords: [],
      skillCode: game.skill_code,
      nextOffset: rows.length === 20 && offset + 20 < 100 ? offset + 20 : null,
    };
  } finally {
    client.release();
  }
}
