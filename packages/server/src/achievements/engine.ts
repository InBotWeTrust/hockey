import type { Pool, PoolClient } from 'pg';
import { getAchievementProgress, setAchievementProgress } from './progress.js';
import { completeAchievements } from './service.js';

type Queryable = Pool | PoolClient;
type ShotResult = 'goal' | 'save' | 'miss';

interface DailyPeriodStats {
  periodNumber: number;
  shotsTaken: number;
  goals: number;
}

export interface AchievementShotEvent {
  userId: string;
  mode: 'daily' | 'training' | 'duel';
  ownerId?: string;
  containerId: string;
  periodNumber: number;
  shotIndex: number;
  result: ShotResult;
}

export async function evaluateShotAchievements(
  db: Queryable,
  event: AchievementShotEvent,
): Promise<void> {
  const ids: string[] = [];
  if (event.result === 'goal') ids.push('first-goal');
  await completeAchievements(db, event.userId, ids, { ...event });
}

export interface DailyShotAchievementEvent {
  userId: string;
  dayPoolId: string;
  periodNumber: number;
  shotIndex: number;
  result: ShotResult;
}

export interface DailyPeriodClosedAchievementEvent {
  userId: string;
  dayPoolId: string;
  periodNumber: number;
}

export interface DailyClosedAchievementEvent {
  userId: string;
  dayPoolId: string;
  dayDate: string;
  totalPeriods: number;
  shotsPerPeriod: number;
}

export interface TrainingClosedAchievementEvent {
  userId: string;
  trainingSessionId: string;
  dayDate: string;
  shotsLimit: number;
  dailyTotalPeriods?: number;
  dailyShotsPerPeriod?: number;
}

interface TrainingStreakProgress {
  count: number;
  lastTrainingSessionId?: string;
}

export function hasGoalStreak(results: readonly ShotResult[], target: number): boolean {
  if (target <= 0) return true;
  let streak = 0;
  for (const result of results) {
    streak = result === 'goal' ? streak + 1 : 0;
    if (streak >= target) return true;
  }
  return false;
}

export function lastNAllGoals(results: readonly ShotResult[], target: number): boolean {
  if (target <= 0) return true;
  if (results.length < target) return false;
  return results.slice(-target).every((result) => result === 'goal');
}

function firstNAllGoals(results: readonly ShotResult[], target: number): boolean {
  if (target <= 0) return true;
  if (results.length < target) return false;
  return results.slice(0, target).every((result) => result === 'goal');
}

export function hasNoPanicPattern(results: readonly ShotResult[]): boolean {
  for (let index = 0; index <= results.length - 13; index += 1) {
    const firstThreeAreNonGoals = results
      .slice(index, index + 3)
      .every((result) => result !== 'goal');
    if (!firstThreeAreNonGoals) continue;
    if (firstNAllGoals(results.slice(index + 3, index + 13), 10)) return true;
  }
  return false;
}

export async function evaluateDailyShotAchievements(
  db: Queryable,
  event: DailyShotAchievementEvent,
): Promise<void> {
  const completed = new Set<string>();
  if (event.result === 'goal') completed.add('first-goal');

  const results = await fetchDailyResults(db, event.dayPoolId);
  if (hasGoalStreak(results, 25)) completed.add('daily-sniper-streak');
  if (hasNoPanicPattern(results)) completed.add('no-panic');

  await completeAchievements(db, event.userId, [...completed], { source: 'daily_shot', ...event });
}

export async function evaluateDailyPeriodClosedAchievements(
  db: Queryable,
  event: DailyPeriodClosedAchievementEvent,
): Promise<void> {
  const results = await fetchDailyPeriodResults(db, event.dayPoolId, event.periodNumber);
  await completeAchievements(
    db,
    event.userId,
    lastNAllGoals(results, 10) ? ['final-push'] : [],
    { source: 'daily_period_closed', ...event },
  );
}

export async function evaluateDailyClosedAchievements(
  db: Queryable,
  event: DailyClosedAchievementEvent,
): Promise<void> {
  const completed = new Set<string>(['first-daily-game']);
  const periods = await fetchDailyPeriods(db, event.dayPoolId);
  const results = await fetchDailyResults(db, event.dayPoolId);
  const goals = results.filter((result) => result === 'goal').length;
  const accuracy = results.length > 0 ? goals / results.length : 0;

  if (accuracy >= 0.95) completed.add('ice-hand');
  if (event.totalPeriods === 3 && periods.length >= 3) {
    const [p1, p2, p3] = periods;
    if (
      p1 !== undefined &&
      p2 !== undefined &&
      p3 !== undefined &&
      p1.goals >= 20 &&
      p1.goals === p2.goals &&
      p2.goals === p3.goals
    ) {
      completed.add('steady-tempo');
    }
    if (
      p1 !== undefined &&
      p2 !== undefined &&
      p3 !== undefined &&
      p1.goals >= 20 &&
      p2.goals >= 20 &&
      p3.goals > p1.goals &&
      p3.goals > p2.goals
    ) {
      completed.add('third-period-decides');
    }
  }
  if (lastNAllGoals(results, 20)) completed.add('dry-finish');
  if (await hasCompletedDailyAccuracyWindow(db, event, 7, 0.5, 'each')) {
    completed.add('keeping-fit');
  }
  if (await hasCompletedDailyAccuracyWindow(db, event, 7, 0.75, 'combined')) {
    completed.add('sniper-week');
  }
  if (await hasCompletedDailyAccuracyWindow(db, event, 30, 0.75, 'combined')) {
    completed.add('sniper-month');
  }
  if (await hasIdealDay(db, event.userId, event.dayDate, event.totalPeriods, event.shotsPerPeriod)) {
    completed.add('ideal-day');
  }
  if (await hasReachedAmateurGoalThreshold(db, event.userId)) {
    completed.add('amateur-ticket');
  }

  await completeAchievements(db, event.userId, [...completed], {
    source: 'daily_closed',
    ...event,
    goals,
    shots: results.length,
    accuracy,
  });
}

export async function evaluateTrainingClosedAchievements(
  db: Queryable,
  event: TrainingClosedAchievementEvent,
): Promise<void> {
  const results = await fetchTrainingResults(db, event.trainingSessionId);
  const goals = results.filter((result) => result === 'goal').length;
  const completed = new Set<string>(['first-training']);
  const finishedQuota = results.length >= event.shotsLimit;

  if (finishedQuota && event.shotsLimit === 50 && results.length === 50 && goals >= 45) {
    completed.add('training-monster');
  }
  if (finishedQuota && event.shotsLimit === 50 && results.length === 50 && goals === 49) {
    completed.add('almost-perfect-training');
  }
  if (hasGoalStreak(results, 30)) completed.add('rhythm-control');
  if (firstNAllGoals(results, 20)) completed.add('no-warmup-needed');
  if (finishedQuota && event.shotsLimit >= 20 && lastNAllGoals(results, 20)) {
    completed.add('finish-machine');
  }

  if (finishedQuota && event.shotsLimit === 50 && results.length === 50 && goals >= 40) {
    const streak = await incrementTraining40Of50Streak(db, event.userId, event.trainingSessionId);
    if (streak >= 5) completed.add('stable-student');
  } else {
    await resetTraining40Of50Streak(db, event.userId, event.trainingSessionId);
  }

  if (
    await hasIdealDay(
      db,
      event.userId,
      event.dayDate,
      event.dailyTotalPeriods ?? 3,
      event.dailyShotsPerPeriod ?? 30,
    )
  ) {
    completed.add('ideal-day');
  }

  await setAchievementProgress(db, event.userId, 'training_before_duel_pending', {
    trainingSessionId: event.trainingSessionId,
    dayDate: event.dayDate,
  });

  await completeAchievements(db, event.userId, [...completed], {
    source: 'training_closed',
    ...event,
    goals,
    shots: results.length,
  });
}

async function fetchDailyResults(db: Queryable, dayPoolId: string): Promise<ShotResult[]> {
  const { rows } = await db.query<{ server_result: ShotResult }>(
    `select server_result
       from shot_session
      where mode = 'daily'
        and day_pool_id = $1
      order by period_number asc, shot_index asc`,
    [dayPoolId],
  );
  return rows.map((row) => row.server_result);
}

async function fetchDailyPeriodResults(
  db: Queryable,
  dayPoolId: string,
  periodNumber: number,
): Promise<ShotResult[]> {
  const { rows } = await db.query<{ server_result: ShotResult }>(
    `select server_result
       from shot_session
      where mode = 'daily'
        and day_pool_id = $1
        and period_number = $2
      order by shot_index asc`,
    [dayPoolId, periodNumber],
  );
  return rows.map((row) => row.server_result);
}

async function fetchTrainingResults(
  db: Queryable,
  trainingSessionId: string,
): Promise<ShotResult[]> {
  const { rows } = await db.query<{ server_result: ShotResult }>(
    `select server_result
       from shot_session
      where mode = 'training'
        and training_session_id = $1
      order by shot_index asc`,
    [trainingSessionId],
  );
  return rows.map((row) => row.server_result);
}

async function incrementTraining40Of50Streak(
  db: Queryable,
  userId: string,
  trainingSessionId: string,
): Promise<number> {
  const progress = await getAchievementProgress<TrainingStreakProgress>(
    db,
    userId,
    'training_40_of_50_streak',
  );
  if (progress?.lastTrainingSessionId === trainingSessionId) {
    return progress.count;
  }
  const count = (progress?.count ?? 0) + 1;
  await setAchievementProgress(db, userId, 'training_40_of_50_streak', {
    count,
    lastTrainingSessionId: trainingSessionId,
  });
  return count;
}

async function resetTraining40Of50Streak(
  db: Queryable,
  userId: string,
  trainingSessionId: string,
): Promise<void> {
  const progress = await getAchievementProgress<TrainingStreakProgress>(
    db,
    userId,
    'training_40_of_50_streak',
  );
  if (progress?.lastTrainingSessionId === trainingSessionId && progress.count === 0) return;
  await setAchievementProgress(db, userId, 'training_40_of_50_streak', {
    count: 0,
    lastTrainingSessionId: trainingSessionId,
  });
}

async function fetchDailyPeriods(db: Queryable, dayPoolId: string): Promise<DailyPeriodStats[]> {
  const { rows } = await db.query<{
    period_number: number;
    shots_taken: number | string;
    goals: number | string;
  }>(
    `select period_number, shots_taken, goals
       from period_log
      where day_pool_id = $1
      order by period_number asc`,
    [dayPoolId],
  );
  return rows.map((row) => ({
    periodNumber: Number(row.period_number),
    shotsTaken: Number(row.shots_taken),
    goals: Number(row.goals),
  }));
}

async function hasCompletedDailyAccuracyWindow(
  db: Queryable,
  event: DailyClosedAchievementEvent,
  days: number,
  minAccuracy: number,
  mode: 'each' | 'combined',
): Promise<boolean> {
  const { rows } = await db.query<{
    day_date: string;
    pool_id: string | null;
    closed_periods: number | string | null;
    shots: number | string | null;
    goals: number | string | null;
  }>(
    `with days as (
       select generate_series(
                $2::date - (($3::int - 1) * interval '1 day'),
                $2::date,
                interval '1 day'
              )::date as day_date
     ),
     pools as (
       select distinct on (day_date)
              id,
              day_date
         from day_pool
        where user_id = $1
          and state = 'closed'
          and day_date between $2::date - (($3::int - 1) * interval '1 day') and $2::date
        order by day_date asc, closed_at desc nulls last, created_at desc
     ),
     stats as (
       select p.id as pool_id,
              count(distinct pl.period_number)::int as closed_periods,
              count(ss.id)::int as shots,
              count(ss.id) filter (where ss.server_result = 'goal')::int as goals
         from pools p
         left join period_log pl on pl.day_pool_id = p.id
         left join shot_session ss
           on ss.mode = 'daily'
          and ss.day_pool_id = p.id
        group by p.id
     )
     select to_char(d.day_date, 'YYYY-MM-DD') as day_date,
            p.id as pool_id,
            stats.closed_periods,
            stats.shots,
            stats.goals
       from days d
       left join pools p on p.day_date = d.day_date
       left join stats on stats.pool_id = p.id
      order by d.day_date asc`,
    [event.userId, event.dayDate, days],
  );

  if (rows.length !== days) return false;

  const dailyStats = rows.map((row) => ({
    dayDate: row.day_date,
    poolId: row.pool_id,
    closedPeriods: Number(row.closed_periods ?? 0),
    shots: Number(row.shots ?? 0),
    goals: Number(row.goals ?? 0),
  }));

  if (
    dailyStats.some(
      (row) => row.poolId === null || row.closedPeriods < event.totalPeriods || row.shots <= 0,
    )
  ) {
    return false;
  }

  if (mode === 'each') {
    return dailyStats.every((row) => row.goals / row.shots >= minAccuracy);
  }

  const totalShots = dailyStats.reduce((sum, row) => sum + row.shots, 0);
  const totalGoals = dailyStats.reduce((sum, row) => sum + row.goals, 0);
  return totalShots > 0 && totalGoals / totalShots >= minAccuracy;
}

async function hasIdealDay(
  db: Queryable,
  userId: string,
  dayDate: string,
  totalPeriods: number,
  shotsPerPeriod: number,
): Promise<boolean> {
  const { rows } = await db.query<{ daily_perfect: boolean; training_perfect: boolean }>(
    `with daily as (
       select dp.id,
              count(distinct pl.period_number)::int as closed_periods,
              count(ss.id)::int as shots,
              count(ss.id) filter (where ss.server_result = 'goal')::int as goals
         from day_pool dp
         left join period_log pl on pl.day_pool_id = dp.id
         left join shot_session ss
           on ss.mode = 'daily'
          and ss.day_pool_id = dp.id
        where dp.user_id = $1
          and dp.day_date = $2::date
          and dp.state = 'closed'
        group by dp.id
     ),
     training as (
       select ts.id,
              count(ss.id)::int as shots,
              count(ss.id) filter (where ss.server_result = 'goal')::int as goals
         from training_session ts
         left join shot_session ss
           on ss.mode = 'training'
          and ss.training_session_id = ts.id
        where ts.user_id = $1
          and ts.day_date = $2::date
          and ts.state = 'closed'
        group by ts.id
     )
     select exists (
              select 1
                from daily
               where closed_periods >= $3
                 and shots = $4
                 and goals = $4
            ) as daily_perfect,
            exists (
              select 1
                from training
               where shots = 50
                 and goals = 50
            ) as training_perfect`,
    [userId, dayDate, totalPeriods, totalPeriods * shotsPerPeriod],
  );
  const row = rows[0];
  return row?.daily_perfect === true && row.training_perfect === true;
}

async function hasReachedAmateurGoalThreshold(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ goals: number | string; threshold: number | string }>(
    `select u.lifetime_goals_total as goals,
            coalesce(
              (
                select (value #>> '{}')::int
                  from game_settings
                 where key = 'amateur.unlock_goals_required'
              ),
              300
            ) as threshold
       from users u
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return false;
  return Number(row.goals) >= Number(row.threshold);
}
