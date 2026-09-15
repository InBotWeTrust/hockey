import type { Pool, PoolClient } from 'pg';
import {
  deleteAchievementProgress,
  getAchievementProgress,
  setAchievementProgress,
} from './progress.js';
import { completeAchievements } from './service.js';
import { appendEvent } from '../duel/eventLog.js';
import { observeAchievementStage } from './stageProgress.js';

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

export type MonthlyRatingSettledContext = {
  type: 'monthly_duel_rating_settled';
  seasonKey: string;
  userId: string;
  place: number;
};

export async function evaluateMonthlyRatingSettledAchievements(
  db: Queryable,
  event: MonthlyRatingSettledContext,
): Promise<void> {
  if (!Number.isInteger(event.place) || event.place < 1) return;

  const placement = await db.query(
    `select 1
       from monthly_duel_rating_placement
      where season_key = $1 and user_id = $2 and place = $3`,
    [event.seasonKey, event.userId, event.place],
  );
  if (placement.rowCount !== 1) return;

  const achievementId = event.place === 1
    ? 'monthly-top-1'
    : event.place <= 3
      ? 'monthly-top-3'
      : null;
  if (achievementId === null) return;
  const count = await db.query<{ total: number | string }>(
    `select count(*)::int as total
       from monthly_duel_rating_placement
      where user_id = $1
        and ${event.place === 1 ? 'place = 1' : 'place between 2 and 3'}`,
    [event.userId],
  );
  await observeAchievementStage(db, event.userId, achievementId, {
    eventKey: `monthly-rating:${event.seasonKey}:${event.userId}:${event.place}`,
    occurredAt: new Date(),
    progress: { placements: Number(count.rows[0]?.total ?? 0) },
    context: event,
  });
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

interface CountProgress {
  count: number;
  lastMatchId?: string;
}

interface LastLossProgress {
  opponentUserId: string;
  matchId: string;
}

interface DuelMatchAchievementRow {
  id: string;
  challenger_user_id: string;
  opponent_user_id: string;
  winner_user_id: string | null;
  outcome: string | null;
  duel_kind: string;
  rules_snapshot: unknown;
  settled_reason: string | null;
  settled_at: Date | null;
}

interface DuelParticipantAchievementRow {
  user_id: string;
  side: 'challenger' | 'opponent';
  state: string;
  loadout_snapshot: unknown;
  completed_at: Date | null;
  shots_taken: number | string;
  goals: number | string;
  active_duration_ms: number | string;
  consumed_inventory_charges: number | string;
  reserved_inventory_charges: number | string;
  experience_snapshot: number | string;
}

interface DuelPeriodAchievementRow {
  user_id: string;
  period_number: number;
  shots_taken: number | string;
  goals: number | string;
  duration_ms: number | string;
}

interface DuelAchievementContext {
  match: DuelMatchAchievementRow;
  winner: DuelParticipantAchievement;
  loser: DuelParticipantAchievement;
  participants: DuelParticipantAchievement[];
  periods: DuelPeriodAchievementRow[];
  winnerResults: ShotResult[];
  winnerPeriodResults: ShotResult[][];
}

interface DuelParticipantAchievement {
  userId: string;
  side: 'challenger' | 'opponent';
  state: string;
  loadout: LoadoutSnapshotLike;
  completedAt: Date | null;
  shots: number;
  goals: number;
  activeDurationMs: number;
  consumedInventoryCharges: number;
  reservedInventoryCharges: number;
  experienceSnapshot: number;
}

interface LoadoutSnapshotLike {
  items: Array<{ id?: string; kind?: string }>;
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

function longestGoalStreak(results: readonly ShotResult[]): number {
  let current = 0;
  let best = 0;
  for (const result of results) {
    current = result === 'goal' ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

function endingGoalStreak(results: readonly ShotResult[]): number {
  let count = 0;
  for (let index = results.length - 1; index >= 0 && results[index] === 'goal'; index -= 1) {
    count += 1;
  }
  return count;
}

function openingGoalStreak(results: readonly ShotResult[]): number {
  return results.findIndex((result) => result !== 'goal') === -1
    ? results.length
    : results.findIndex((result) => result !== 'goal');
}

function longestNoPanicRecovery(results: readonly ShotResult[]): number {
  let best = 0;
  for (let index = 0; index <= results.length - 3; index += 1) {
    if (!results.slice(index, index + 3).every((result) => result !== 'goal')) continue;
    let goals = 0;
    while (results[index + 3 + goals] === 'goal') goals += 1;
    best = Math.max(best, goals);
  }
  return best;
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
  const occurredAt = new Date();
  await observeAchievementStage(db, event.userId, 'daily-sniper-streak', {
    eventKey: `daily:${event.dayPoolId}:shot:${event.shotIndex}`,
    occurredAt,
    progress: { goalStreak: longestGoalStreak(results) },
    context: { source: 'daily_shot', ...event },
  });
  await observeAchievementStage(db, event.userId, 'no-panic', {
    eventKey: `daily:${event.dayPoolId}:shot:${event.shotIndex}`,
    occurredAt,
    progress: { recoveryGoalStreak: longestNoPanicRecovery(results), precedingNonGoals: 3 },
    context: { source: 'daily_shot', ...event },
  });

  await completeAchievements(db, event.userId, [...completed], { source: 'daily_shot', ...event });
}

export async function evaluateDailyPeriodClosedAchievements(
  db: Queryable,
  event: DailyPeriodClosedAchievementEvent,
): Promise<void> {
  const results = await fetchDailyPeriodResults(db, event.dayPoolId, event.periodNumber);
  await observeAchievementStage(db, event.userId, 'final-push', {
    eventKey: `daily:${event.dayPoolId}:period:${event.periodNumber}`,
    occurredAt: new Date(),
    progress: { endingGoalStreak: endingGoalStreak(results) },
    context: { source: 'daily_period_closed', ...event },
  });
}

export async function evaluatePendingDailyPeriodClosedAchievements(
  db: Queryable,
  userId: string,
): Promise<void> {
  const { rows } = await db.query<{
    day_pool_id: string;
    period_number: string;
  }>(
    `select distinct
            closed.payload->>'day_pool_id' as day_pool_id,
            closed.payload->>'period_number' as period_number
       from event_log closed
      where closed.user_id = $1
        and closed.type = 'period_closed'
        and not exists (
          select 1
            from event_log evaluated
           where evaluated.user_id = closed.user_id
             and evaluated.type = 'daily_period_achievements_evaluated'
             and evaluated.payload->>'day_pool_id' = closed.payload->>'day_pool_id'
             and evaluated.payload->>'period_number' = closed.payload->>'period_number'
        )`,
    [userId],
  );

  for (const row of rows) {
    const periodNumber = Number(row.period_number);
    if (!row.day_pool_id || !Number.isInteger(periodNumber)) continue;
    await evaluateDailyPeriodClosedAchievements(db, {
      userId,
      dayPoolId: row.day_pool_id,
      periodNumber,
    });
    await appendEvent(db, userId, 'daily_period_achievements_evaluated', {
      day_pool_id: row.day_pool_id,
      period_number: periodNumber,
    });
  }
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
  const occurredAt = new Date();

  await observeAchievementStage(db, event.userId, 'ice-hand', {
    eventKey: `daily:${event.dayPoolId}:closed`,
    occurredAt,
    progress: { accuracyPercent: accuracy * 100 },
    context: { source: 'daily_closed', ...event },
  });
  if (event.totalPeriods === 3 && periods.length >= 3) {
    const [p1, p2, p3] = periods;
    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      await observeAchievementStage(db, event.userId, 'third-period-decides', {
        eventKey: `daily:${event.dayPoolId}:closed`,
        occurredAt,
        progress: {
          minimumFirstTwoGoals: Math.min(p1.goals, p2.goals),
          thirdPeriodStrictlyBetter: p3.goals > p1.goals && p3.goals > p2.goals,
        },
        context: { source: 'daily_closed', ...event },
      });
    }
  }
  await observeAchievementStage(db, event.userId, 'dry-finish', {
    eventKey: `daily:${event.dayPoolId}:closed`,
    occurredAt,
    progress: { endingGoalStreak: endingGoalStreak(results) },
    context: { source: 'daily_closed', ...event },
  });
  const week = await fetchCompletedDailyAccuracyWindow(db, event, 7);
  const month = await fetchCompletedDailyAccuracyWindow(db, event, 30);
  await observeAchievementStage(db, event.userId, 'keeping-fit', {
    eventKey: `daily:${event.dayPoolId}:keeping-fit`,
    occurredAt,
    progress: { days: week.complete ? 7 : 0, minimumAccuracyPercent: week.minimumAccuracyPercent },
  });
  await observeAchievementStage(db, event.userId, 'sniper-week', {
    eventKey: `daily:${event.dayPoolId}:sniper-week`,
    occurredAt,
    progress: { games: week.complete ? 7 : 0, accuracyPercent: week.combinedAccuracyPercent },
  });
  await observeAchievementStage(db, event.userId, 'sniper-month', {
    eventKey: `daily:${event.dayPoolId}:sniper-month`,
    occurredAt,
    progress: { games: month.complete ? 30 : 0, accuracyPercent: month.combinedAccuracyPercent },
  });
  if (
    await hasIdealDay(db, event.userId, event.dayDate, event.totalPeriods, event.shotsPerPeriod)
  ) {
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
  const occurredAt = new Date();
  const accuracyPercent = results.length > 0 ? (goals / event.shotsLimit) * 100 : 0;

  const eventKey = `training:${event.trainingSessionId}:closed`;
  await observeAchievementStage(db, event.userId, 'training-monster', {
    eventKey,
    occurredAt,
    progress: { accuracyPercent: finishedQuota ? accuracyPercent : 0 },
  });
  await observeAchievementStage(db, event.userId, 'rhythm-control', {
    eventKey,
    occurredAt,
    progress: { goalStreak: finishedQuota ? longestGoalStreak(results) : 0 },
  });
  await observeAchievementStage(db, event.userId, 'no-warmup-needed', {
    eventKey,
    occurredAt,
    progress: { openingGoalStreak: finishedQuota ? openingGoalStreak(results) : 0 },
  });
  await observeAchievementStage(db, event.userId, 'finish-machine', {
    eventKey,
    occurredAt,
    progress: { endingGoalStreak: finishedQuota ? endingGoalStreak(results) : 0 },
  });

  let stableTrainingDays = 0;
  if (finishedQuota && accuracyPercent >= 80) {
    stableTrainingDays = await incrementTraining40Of50Streak(
      db,
      event.userId,
      event.trainingSessionId,
    );
  } else {
    await resetTraining40Of50Streak(db, event.userId, event.trainingSessionId);
  }
  await observeAchievementStage(db, event.userId, 'stable-student', {
    eventKey,
    occurredAt,
    progress: {
      days: stableTrainingDays,
      minimumAccuracyPercent: finishedQuota ? accuracyPercent : 0,
    },
  });

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

export async function evaluateDuelSettledAchievements(
  db: Queryable,
  event: { matchId: string; winnerUserId: string | null },
): Promise<void> {
  const participants = await fetchDuelParticipants(db, event.matchId);
  if (participants.length === 0) return;

  if (event.winnerUserId === null) {
    await updateDuelNonWinProgress(db, event.matchId, participants);
    return;
  }

  const ctx = await fetchDuelAchievementContext(db, event.matchId, event.winnerUserId);
  if (!ctx) return;
  if (ctx.match.settled_reason !== 'completed') {
    await updateDuelNonWinProgress(db, event.matchId, participants);
    return;
  }

  const completed = new Set<string>();
  const margin = ctx.winner.goals - ctx.loser.goals;
  const occurredAt = ctx.match.settled_at ?? new Date();
  const eventKey = `duel:${event.matchId}:settled`;
  const format = ctx.match.duel_kind === 'express_plus' ? 'mix' : ctx.match.duel_kind;
  const nonGoals = Math.max(0, ctx.winner.shots - ctx.winner.goals);

  if (margin === 1) completed.add('nervous-finish');
  if (margin === 2) completed.add('thin-edge');
  await observeAchievementStage(db, ctx.winner.userId, 'blowout', {
    eventKey,
    occurredAt,
    progress: { minimumMargin: margin },
  });
  await observeAchievementStage(db, ctx.winner.userId, 'underdog', {
    eventKey,
    occurredAt,
    progress: {
      minimumExperienceDifference: Math.max(
        0,
        ctx.loser.experienceSnapshot - ctx.winner.experienceSnapshot,
      ),
    },
  });
  await observeAchievementStage(db, ctx.winner.userId, 'cold-start', {
    eventKey,
    occurredAt,
    progress: { openingGoalStreak: openingGoalStreak(ctx.winnerResults) },
  });
  await observeAchievementStage(db, ctx.winner.userId, 'no-panic', {
    eventKey,
    occurredAt,
    progress: {
      recoveryGoalStreak: longestNoPanicRecovery(ctx.winnerResults),
      precedingNonGoals: 3,
    },
  });
  await observeAchievementStage(db, ctx.winner.userId, 'final-push', {
    eventKey,
    occurredAt,
    progress: {
      endingGoalStreak: Math.max(...ctx.winnerPeriodResults.map(endingGoalStreak), 0),
    },
  });
  if (isClassicDuel(ctx.match) && hasCleanPeriodWin(ctx)) completed.add('clean-win');
  const fastestClassicPeriod = bestClassicSpeedPeriod(ctx.periods, ctx.winner.userId);
  await observeAchievementStage(db, ctx.winner.userId, 'classic-speed', {
    eventKey,
    occurredAt,
    progress: {
      format,
      maximumDurationSeconds: fastestClassicPeriod?.durationSeconds ?? 999_999,
      accuracyPercent: fastestClassicPeriod?.accuracyPercent ?? 0,
    },
  });
  if (format === 'express') {
    await observeAchievementStage(db, ctx.winner.userId, 'express-sniper', {
      eventKey,
      occurredAt,
      progress: { format, goals: ctx.winner.goals },
    });
  }
  if (format === 'mix') {
    await observeAchievementStage(db, ctx.winner.userId, 'mix-sniper', {
      eventKey,
      occurredAt,
      progress: { format, goals: ctx.winner.goals },
    });
  }
  const noErrorAchievement =
    format === 'express'
      ? 'no-error-express'
      : format === 'mix'
        ? 'no-error-mix'
        : 'no-error-classic';
  await observeAchievementStage(db, ctx.winner.userId, noErrorAchievement, {
    eventKey,
    occurredAt,
    progress: { format, maximumNonGoals: nonGoals },
  });

  if (await updateCountProgress(db, ctx.winner.userId, 'duel_win_streak', event.matchId, true)) {
    const progress = await getAchievementProgress<CountProgress>(
      db,
      ctx.winner.userId,
      'duel_win_streak',
    );
    await observeAchievementStage(db, ctx.winner.userId, 'hunter-streak', {
      eventKey,
      occurredAt,
      progress: { wins: progress?.count ?? 0 },
    });
  }

  const isHostWin = ctx.winner.side === 'challenger';
  if (
    isHostWin &&
    (await updateCountProgress(db, ctx.winner.userId, 'duel_host_win_streak', event.matchId, true))
  ) {
    const progress = await getAchievementProgress<CountProgress>(
      db,
      ctx.winner.userId,
      'duel_host_win_streak',
    );
    await observeAchievementStage(db, ctx.winner.userId, 'dangerous-host', {
      eventKey,
      occurredAt,
      progress: { wins: progress?.count ?? 0, role: 'host' },
    });
  }
  if (
    !isHostWin &&
    (await updateCountProgress(db, ctx.winner.userId, 'duel_guest_win_streak', event.matchId, true))
  ) {
    const progress = await getAchievementProgress<CountProgress>(
      db,
      ctx.winner.userId,
      'duel_guest_win_streak',
    );
    await observeAchievementStage(db, ctx.winner.userId, 'dangerous-guest', {
      eventKey,
      occurredAt,
      progress: { wins: progress?.count ?? 0, role: 'guest' },
    });
  }

  const lastLoss = await getAchievementProgress<LastLossProgress>(
    db,
    ctx.winner.userId,
    'duel_last_loss',
  );
  if (lastLoss?.opponentUserId === ctx.loser.userId && lastLoss.matchId !== event.matchId) {
    completed.add('revenge');
  }

  const pendingTraining = await getAchievementProgress<{ trainingSessionId: string }>(
    db,
    ctx.winner.userId,
    'training_before_duel_pending',
  );
  if (pendingTraining !== null) {
    const updated = await updateCountProgress(
      db,
      ctx.winner.userId,
      'training_before_duel_wins',
      event.matchId,
      true,
    );
    const trainingWins = await getAchievementProgress<CountProgress>(
      db,
      ctx.winner.userId,
      'training_before_duel_wins',
    );
    if (updated) {
      const observed = await observeAchievementStage(
        db,
        ctx.winner.userId,
        'training-before-battle',
        {
          eventKey,
          occurredAt,
          progress: { wins: trainingWins?.count ?? 0, requiresCompletedTraining: true },
        },
      );
      if (observed.completed) {
        await deleteAchievementProgress(db, ctx.winner.userId, 'training_before_duel_pending');
        await deleteAchievementProgress(db, ctx.winner.userId, 'training_before_duel_wins');
      }
    }
  }

  await completeAchievements(db, ctx.winner.userId, [...completed], {
    source: 'duel_settled',
    matchId: event.matchId,
    winnerUserId: event.winnerUserId,
    margin,
  });

  await updateDuelPostSettleProgress(db, event.matchId, ctx);
}

export async function reconcileTournamentDuelAchievements(
  db: Queryable,
  options: { apply: boolean } = { apply: true },
): Promise<{ scanned: number; evaluated: number }> {
  const settled = await db.query<{
    id: string;
    winner_user_id: string;
    already_reconciled: boolean;
  }>(
    `select match.id,
            match.winner_user_id,
            exists (
              select 1
                from event_log event
               where event.user_id = match.winner_user_id
                 and event.type = 'tournament_duel_achievements_reconciled'
                 and event.payload->>'match_id' = match.id::text
            ) as already_reconciled
       from amateur_duel_match match
      where match.source = 'tournament'
        and match.status = 'settled'
        and match.winner_user_id is not null
      order by match.settled_at asc nulls last, match.id asc`,
  );
  let evaluated = 0;
  for (const match of settled.rows) {
    if (match.already_reconciled || !options.apply) continue;
    await evaluateDuelSettledAchievements(db, {
      matchId: match.id,
      winnerUserId: match.winner_user_id,
    });
    await appendEvent(db, match.winner_user_id, 'tournament_duel_achievements_reconciled', {
      match_id: match.id,
    });
    evaluated += 1;
  }
  return { scanned: settled.rows.length, evaluated };
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

async function fetchDuelParticipants(
  db: Queryable,
  matchId: string,
): Promise<DuelParticipantAchievement[]> {
  const { rows } = await db.query<DuelParticipantAchievementRow>(
    `select user_id, side, state, loadout_snapshot, completed_at, shots_taken, goals,
            active_duration_ms, consumed_inventory_charges, reserved_inventory_charges,
            experience_snapshot
       from amateur_duel_participant
      where match_id = $1
      order by side`,
    [matchId],
  );
  return rows.map(mapDuelParticipant);
}

async function fetchDuelAchievementContext(
  db: Queryable,
  matchId: string,
  winnerUserId: string,
): Promise<DuelAchievementContext | null> {
  const { rows } = await db.query<DuelMatchAchievementRow>(
    `select id, challenger_user_id, opponent_user_id, winner_user_id, outcome,
            duel_kind, rules_snapshot, settled_reason, settled_at
       from amateur_duel_match
      where id = $1`,
    [matchId],
  );
  const match = rows[0];
  if (!match) return null;
  const participants = await fetchDuelParticipants(db, matchId);
  const winner = participants.find((participant) => participant.userId === winnerUserId);
  const loser = participants.find((participant) => participant.userId !== winnerUserId);
  if (!winner || !loser) return null;
  const periods = await fetchDuelPeriods(db, matchId);
  const winnerResults = await fetchDuelResults(db, matchId, winnerUserId);
  const winnerPeriodResults = await fetchDuelResultsByPeriod(db, matchId, winnerUserId);
  return { match, winner, loser, participants, periods, winnerResults, winnerPeriodResults };
}

async function fetchDuelPeriods(
  db: Queryable,
  matchId: string,
): Promise<DuelPeriodAchievementRow[]> {
  const { rows } = await db.query<DuelPeriodAchievementRow>(
    `select user_id, period_number, shots_taken, goals, duration_ms
       from amateur_duel_period_log
      where match_id = $1
      order by period_number asc, user_id asc`,
    [matchId],
  );
  return rows;
}

async function fetchDuelResults(
  db: Queryable,
  matchId: string,
  userId: string,
): Promise<ShotResult[]> {
  const { rows } = await db.query<{ server_result: ShotResult }>(
    `select server_result
       from shot_session
      where mode = 'amateur_duel'
        and amateur_duel_match_id = $1
        and user_id = $2
      order by period_number asc, shot_index asc`,
    [matchId, userId],
  );
  return rows.map((row) => row.server_result);
}

async function fetchDuelResultsByPeriod(
  db: Queryable,
  matchId: string,
  userId: string,
): Promise<ShotResult[][]> {
  const { rows } = await db.query<{ period_number: number; server_result: ShotResult }>(
    `select period_number, server_result
       from shot_session
      where mode = 'amateur_duel'
        and amateur_duel_match_id = $1
        and user_id = $2
      order by period_number asc, shot_index asc`,
    [matchId, userId],
  );
  const byPeriod = new Map<number, ShotResult[]>();
  for (const row of rows) {
    const bucket = byPeriod.get(row.period_number) ?? [];
    bucket.push(row.server_result);
    byPeriod.set(row.period_number, bucket);
  }
  return [...byPeriod.entries()].sort(([a], [b]) => a - b).map(([, results]) => results);
}

function mapDuelParticipant(row: DuelParticipantAchievementRow): DuelParticipantAchievement {
  return {
    userId: row.user_id,
    side: row.side,
    state: row.state,
    loadout: parseLoadoutSnapshot(row.loadout_snapshot),
    completedAt: row.completed_at,
    shots: Number(row.shots_taken),
    goals: Number(row.goals),
    activeDurationMs: Number(row.active_duration_ms),
    consumedInventoryCharges: Number(row.consumed_inventory_charges),
    reservedInventoryCharges: Number(row.reserved_inventory_charges),
    experienceSnapshot: Number(row.experience_snapshot),
  };
}

function parseLoadoutSnapshot(value: unknown): LoadoutSnapshotLike {
  if (value === null || typeof value !== 'object') return { items: [] };
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return { items: [] };
  return {
    items: items
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item) => ({
        ...(typeof item.id === 'string' ? { id: item.id } : {}),
        ...(typeof item.kind === 'string' ? { kind: item.kind } : {}),
      })),
  };
}

function isClassicDuel(match: DuelMatchAchievementRow): boolean {
  return match.duel_kind === 'classic';
}

function hasCleanPeriodWin(ctx: DuelAchievementContext): boolean {
  const winnerPeriods = ctx.periods.filter((period) => period.user_id === ctx.winner.userId);
  const loserPeriods = ctx.periods.filter((period) => period.user_id === ctx.loser.userId);
  if (winnerPeriods.length === 0 || winnerPeriods.length !== loserPeriods.length) return false;
  return winnerPeriods.every((winnerPeriod) => {
    const loserPeriod = loserPeriods.find(
      (period) => period.period_number === winnerPeriod.period_number,
    );
    return loserPeriod !== undefined && Number(winnerPeriod.goals) > Number(loserPeriod.goals);
  });
}

function bestClassicSpeedPeriod(
  periods: DuelPeriodAchievementRow[],
  userId: string,
): { durationSeconds: number; accuracyPercent: number } | null {
  const values = periods.flatMap((period) => {
    if (period.user_id !== userId) return [];
    const shots = Number(period.shots_taken);
    if (shots <= 0 || Number(period.duration_ms) > 90_000) return [];
    return [
      {
        durationSeconds: Number(period.duration_ms) / 1_000,
        accuracyPercent: (Number(period.goals) / shots) * 100,
      },
    ];
  });
  return (
    values.sort(
      (a, b) => b.accuracyPercent - a.accuracyPercent || a.durationSeconds - b.durationSeconds,
    )[0] ?? null
  );
}

async function updateCountProgress(
  db: Queryable,
  userId: string,
  key: string,
  matchId: string,
  increment: boolean,
): Promise<boolean> {
  const progress = await getAchievementProgress<CountProgress>(db, userId, key);
  if (progress?.lastMatchId === matchId) return false;
  const count = increment ? (progress?.count ?? 0) + 1 : 0;
  await setAchievementProgress(db, userId, key, { count, lastMatchId: matchId });
  return true;
}

async function updateDuelNonWinProgress(
  db: Queryable,
  matchId: string,
  participants: DuelParticipantAchievement[],
): Promise<void> {
  for (const participant of participants) {
    await updateCountProgress(db, participant.userId, 'duel_win_streak', matchId, false);
    await updateCountProgress(
      db,
      participant.userId,
      participant.side === 'challenger' ? 'duel_host_win_streak' : 'duel_guest_win_streak',
      matchId,
      false,
    );
    await deleteAchievementProgress(db, participant.userId, 'training_before_duel_pending');
    await deleteAchievementProgress(db, participant.userId, 'training_before_duel_wins');
  }
}

async function updateDuelPostSettleProgress(
  db: Queryable,
  matchId: string,
  ctx: DuelAchievementContext,
): Promise<void> {
  await deleteAchievementProgress(db, ctx.winner.userId, 'duel_last_loss');
  await setAchievementProgress(db, ctx.loser.userId, 'duel_last_loss', {
    opponentUserId: ctx.winner.userId,
    matchId,
  });
  await deleteAchievementProgress(db, ctx.loser.userId, 'training_before_duel_pending');
  await deleteAchievementProgress(db, ctx.loser.userId, 'training_before_duel_wins');
  await updateCountProgress(db, ctx.loser.userId, 'duel_win_streak', matchId, false);
  await updateCountProgress(
    db,
    ctx.loser.userId,
    ctx.loser.side === 'challenger' ? 'duel_host_win_streak' : 'duel_guest_win_streak',
    matchId,
    false,
  );
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

async function fetchCompletedDailyAccuracyWindow(
  db: Queryable,
  event: DailyClosedAchievementEvent,
  days: number,
): Promise<{ complete: boolean; minimumAccuracyPercent: number; combinedAccuracyPercent: number }> {
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

  if (rows.length !== days) {
    return { complete: false, minimumAccuracyPercent: 0, combinedAccuracyPercent: 0 };
  }

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
    return { complete: false, minimumAccuracyPercent: 0, combinedAccuracyPercent: 0 };
  }

  const totalShots = dailyStats.reduce((sum, row) => sum + row.shots, 0);
  const totalGoals = dailyStats.reduce((sum, row) => sum + row.goals, 0);
  return {
    complete: true,
    minimumAccuracyPercent: Math.min(...dailyStats.map((row) => (row.goals / row.shots) * 100)),
    combinedAccuracyPercent: totalShots > 0 ? (totalGoals / totalShots) * 100 : 0,
  };
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
              count(distinct ss.id)::int as shots,
              count(distinct ss.id) filter (where ss.server_result = 'goal')::int as goals
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
              ts.shots_limit,
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
               where shots = shots_limit
                 and goals = shots_limit
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
