import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { observeCareerExperience } from '../achievements/service.js';
import { listBonusGameCards } from './catalog.js';
import { normalizeBonusQualificationRules } from './qualification.js';
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
  const old = (
    await client.query<StoredRecord>(
      'select * from bonus_game_record where game_id=$1 and rules_version=$2 and user_id=$3',
      [...args, attempt.user_id],
    )
  ).rows[0];
  const leader = (
    await client.query<StoredRecord>(
      'select * from bonus_game_record where game_id=$1 and rules_version=$2 order by primary_score,secondary_score,tertiary_score,quaternary_score limit 1',
      args,
    )
  ).rows[0];
  const score = recordScore(
    rules.skillCode,
    elapsedMs,
    Number(attempt.shots_taken),
    Number(attempt.goals),
    Number(attempt.best_goal_streak),
  );
  const better = (r: StoredRecord) =>
    compareRecordScores(score, [Number(r.primary_score), Number(r.secondary_score),Number(r.tertiary_score??0),Number(r.quaternary_score??0)]) < 0;
  const personal = old !== undefined && better(old);
  const global = leader !== undefined && better(leader);
  if (old === undefined || personal)
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
  const best = (
    await client.query<StoredRecord>(
      'select * from bonus_game_record where game_id=$1 and rules_version=$2 and user_id=$3',
      [...args, attempt.user_id],
    )
  ).rows[0]!;
  const place = Number(
    (
      await client.query<{ place: string }>(
        `select 1+count(*) as place from bonus_game_record
    where game_id=$1 and rules_version=$2 and (primary_score,secondary_score,tertiary_score,quaternary_score)<($3,$4,$5,$6)`,
        [...args, best.primary_score, best.secondary_score,best.tertiary_score,best.quaternary_score],
      )
    ).rows[0]!.place,
  );
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
    const definition = (
      await client.query(
        'select skill_code,qualification_rules,period_rules,use_inventory,target_goals from bonus_game where id=$1',
        [gameId],
      )
    ).rows[0]!;
    const qualification = normalizeBonusQualificationRules(definition.qualification_rules, {
      targetGoals: Number(definition.target_goals),
      shotsLimit: definition.period_rules.reduce(
        (sum: number, period: { shotsLimit: number | null }) => sum + (period.shotsLimit ?? 0),
        0,
      ),
    });
    const v = await version(
      client,
      definition.skill_code,
      qualification,
      definition.period_rules,
      definition.use_inventory,
    );
    const sql = `with ranked as(select r.*,rank() over(order by primary_score,secondary_score,tertiary_score,quaternary_score)::int as place
      from bonus_game_record r where game_id=$1 and rules_version=$2)
      select r.place,r.user_id as "userId",u.display_name as "displayName",u.avatar_url as "avatarUrl",
      r.elapsed_ms::float8 as "elapsedMs",greatest(0,-r.secondary_score)::int as "bestSeries",r.shots,r.goals,r.points from ranked r join users u on u.id=r.user_id`;
    const rows = (
      await client.query(sql + ' order by r.place,r.achieved_at,r.user_id limit $3 offset $4', [
        gameId,
        v,
        Math.min(20, 100 - offset),
        offset,
      ])
    ).rows;
    const currentUser =
      (await client.query(sql + ' where r.user_id=$3', [gameId, v, userId])).rows[0] ?? null;
    const previousRecords = (
      await client.query(
        `select elapsed_ms::float8 as "elapsedMs", shots, goals, points,
              greatest(0,-secondary_score)::int as "bestSeries", achieved_at as "achievedAt"
         from bonus_game_record
        where game_id=$1 and user_id=$2 and rules_version<>$3
        order by achieved_at desc, rules_version
        limit 20`,
        [gameId, userId, v],
      )
    ).rows.map((row) => ({ ...row, achievedAt: row.achievedAt.toISOString() as string }));
    return {
      rows,
      currentUser,
      previousRecords,
      skillCode: definition.skill_code,
      nextOffset: rows.length === 20 && offset + 20 < 100 ? offset + 20 : null,
    };
  } finally {
    client.release();
  }
}
