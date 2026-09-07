import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export const GAMEPLAY_RECOVERY_MINUTES = 60;
export const GAMEPLAY_RECOVERY_MS = 3_600_000;

export type GameplayAction =
  | 'start_training'
  | 'start_daily_period'
  | 'start_ordinary_duel'
  | 'ordinary_duel_shot'
  | 'start_classic'
  | 'continue_classic';

export type GameplayLockReason = 'recent_gameplay' | 'scheduled_tournament' | 'active_classic';

export interface GameplayLockState {
  blocked: boolean;
  reason: GameplayLockReason | null;
  endsAt: Date | null;
  tournamentStartsAt?: Date | null;
}

export interface GameplayLockInput {
  userId: string;
  action: GameplayAction;
  now: Date;
  recoveryMs?: number;
}

type RecoveryMode = 'training' | 'daily' | 'amateur_duel';

const NO_GAMEPLAY_LOCK: GameplayLockState = {
  blocked: false,
  reason: null,
  endsAt: null,
};

function scheduledTournamentLock(startsAt: Date, now: Date): GameplayLockState {
  const lockStartsAt = startsAt.getTime() - GAMEPLAY_RECOVERY_MS;
  return {
    blocked: now.getTime() >= lockStartsAt,
    reason: now.getTime() >= lockStartsAt ? 'scheduled_tournament' : null,
    endsAt: null,
    tournamentStartsAt: startsAt,
  };
}

function throwGameplayLock(state: GameplayLockState): never {
  const until = state.endsAt === null ? '' : ` until ${state.endsAt.toISOString()}`;
  throw new AppError('conflict', `gameplay is locked${until}`, 409, {
    gameplayLock: state,
  });
}

function recoveryModesForAction(action: GameplayAction): readonly RecoveryMode[] {
  switch (action) {
    case 'start_training':
      return ['daily'];
    case 'start_daily_period':
      return ['training'];
    case 'start_classic':
      return ['training', 'daily', 'amateur_duel'];
    case 'start_ordinary_duel':
    case 'ordinary_duel_shot':
    case 'continue_classic':
      return [];
  }
}

export async function lockUserGameplay(client: PoolClient, userId: string): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtext('gameplay:' || $1))", [userId]);
}

async function getNearestScheduledTournamentBlocks(
  client: PoolClient,
  userIds: string[],
  now: Date,
): Promise<Map<string, GameplayLockState>> {
  const { rows } = await client.query<{ user_id: string; starts_at: Date }>(
    `select candidate.user_id, min(candidate.starts_at) as starts_at
       from (
         select participant.user_id, fixture.scheduled_starts_at as starts_at
           from tournament_fixture fixture
           join tournament tournament on tournament.id = fixture.tournament_id
           join tournament_participant participant
             on participant.id in (fixture.home_participant_id, fixture.away_participant_id)
            and participant.user_id = any($1::uuid[])
            and participant.state = 'approved'
          where tournament.status = 'regular'
            and tournament.regular_source = 'head_to_head'
            and fixture.scheduled_starts_at is not null
            and fixture.status in ('scheduled', 'open', 'active', 'paused')
         union all
         select participant.user_id, game_day.first_game_starts_at as starts_at
           from tournament_fixture_attempt attempt
           join tournament_round_game_day game_day on game_day.id = attempt.round_game_day_id
           join tournament_fixture fixture on fixture.id = attempt.fixture_id
           join tournament tournament on tournament.id = fixture.tournament_id
           join tournament_participant participant
             on participant.id in (fixture.home_participant_id, fixture.away_participant_id)
            and participant.user_id = any($1::uuid[])
            and participant.state = 'approved'
           left join tournament_playoff_series series on series.id = fixture.series_id
          where tournament.status = 'playoff'
            and game_day.status in ('scheduled', 'open')
            and fixture.status in ('conditional', 'scheduled', 'open', 'active', 'paused')
            and attempt.status in (
              'pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision'
            )
            and (series.id is null or series.status in ('pending', 'scheduled', 'active', 'paused'))
       ) candidate
      group by candidate.user_id`,
    [userIds],
  );
  return new Map(rows.map((row) => [row.user_id, scheduledTournamentLock(row.starts_at, now)]));
}

export async function getNearestScheduledTournamentBlock(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<GameplayLockState> {
  return (
    (await getNearestScheduledTournamentBlocks(client, [userId], now)).get(userId) ??
    NO_GAMEPLAY_LOCK
  );
}

async function getActiveClassicTournamentUsers(
  client: PoolClient,
  userIds: string[],
): Promise<Set<string>> {
  const { rows } = await client.query<{ user_id: string }>(
    `select distinct participant.user_id
         from tournament_classic_session session
         join tournament_participant participant on participant.id = session.participant_id
         join tournament tournament on tournament.id = session.tournament_id
         join tournament_matchday matchday on matchday.id = session.matchday_id
        where participant.user_id = any($1::uuid[])
          and participant.state = 'approved'
          and tournament.regular_source = 'classic'
          and tournament.status = 'regular'
          and matchday.status <> 'cancelled'
          and session.state not in ('closed', 'expired')
          and exists(
            select 1
              from shot_session shot
             where shot.mode = 'tournament_classic'
               and shot.tournament_classic_session_id = session.id
          )`,
    [userIds],
  );
  return new Set(rows.map((row) => row.user_id));
}

const ACTIVE_CLASSIC_LOCK: GameplayLockState = {
  blocked: true,
  reason: 'active_classic',
  endsAt: null,
};

export async function getActiveClassicTournamentLock(
  client: PoolClient,
  userId: string,
): Promise<GameplayLockState> {
  return (await getActiveClassicTournamentUsers(client, [userId])).has(userId)
    ? ACTIVE_CLASSIC_LOCK
    : NO_GAMEPLAY_LOCK;
}

export async function getTournamentGameplayLockStates(
  client: PoolClient,
  userIds: string[],
  now: Date,
): Promise<Map<string, GameplayLockState>> {
  if (userIds.length === 0) return new Map();
  const scheduled = await getNearestScheduledTournamentBlocks(client, userIds, now);
  const activeClassic = await getActiveClassicTournamentUsers(client, userIds);
  return new Map(
    userIds.map((userId) => {
      const state = scheduled.get(userId) ?? NO_GAMEPLAY_LOCK;
      return [
        userId,
        state.blocked ? state : activeClassic.has(userId) ? ACTIVE_CLASSIC_LOCK : state,
      ];
    }),
  );
}

export async function getTournamentGameplayLockState(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<GameplayLockState> {
  const scheduled = await getNearestScheduledTournamentBlock(client, userId, now);
  if (scheduled.blocked) return scheduled;
  const activeClassic = await getActiveClassicTournamentLock(client, userId);
  return activeClassic.blocked ? activeClassic : scheduled;
}

export async function assertTournamentGameplayAllowed(
  client: PoolClient,
  userId: string,
  now: Date,
): Promise<void> {
  const state = await getTournamentGameplayLockState(client, userId, now);
  if (state.blocked) throwGameplayLock(state);
}

export async function getSafeSegmentStartLockState(
  client: PoolClient,
  input: { userId: string; now: Date; maxSegmentDurationMs: number },
): Promise<GameplayLockState> {
  const state = await getNearestScheduledTournamentBlock(client, input.userId, input.now);
  return getSafeSegmentStartLockFromState(state, input.now, input.maxSegmentDurationMs);
}

export function getSafeSegmentStartLockFromState(
  state: GameplayLockState,
  now: Date,
  maxSegmentDurationMs: number,
): GameplayLockState {
  if (state.blocked) return state;
  if (state.tournamentStartsAt === undefined || state.tournamentStartsAt === null)
    return NO_GAMEPLAY_LOCK;
  const lockStartsAt = state.tournamentStartsAt.getTime() - GAMEPLAY_RECOVERY_MS;
  if (now.getTime() + Math.max(0, maxSegmentDurationMs) < lockStartsAt) return NO_GAMEPLAY_LOCK;
  return {
    blocked: true,
    reason: 'scheduled_tournament',
    endsAt: null,
    tournamentStartsAt: state.tournamentStartsAt,
  };
}

export async function assertSafeSegmentStart(
  client: PoolClient,
  input: { userId: string; now: Date; maxSegmentDurationMs: number },
): Promise<void> {
  const state = await getSafeSegmentStartLockState(client, input);
  if (state.blocked) throwGameplayLock(state);
}

export async function getGameplayLockState(
  client: PoolClient,
  input: GameplayLockInput,
): Promise<GameplayLockState> {
  const tournamentLock = await getTournamentGameplayLockState(client, input.userId, input.now);
  if (tournamentLock.blocked) return tournamentLock;

  const recoveryMs = input.recoveryMs ?? GAMEPLAY_RECOVERY_MS;
  const recoveryModes = recoveryModesForAction(input.action);
  if (recoveryMs <= 0 || recoveryModes.length === 0) return tournamentLock;

  const { rows } = await client.query<{ last_activity_at: Date | null }>(
    `select max(ss.created_at) as last_activity_at
       from shot_session ss
       left join amateur_duel_match m on m.id = ss.amateur_duel_match_id
      where ss.user_id = $1
        and (
          ss.mode in ('training', 'daily')
          or (ss.mode = 'amateur_duel' and m.source <> 'tournament')
        )
        and ss.mode = any($2::text[])`,
    [input.userId, recoveryModes],
  );
  const lastActivityAt = rows[0]?.last_activity_at ?? null;
  if (lastActivityAt === null) return tournamentLock;

  const endsAt = new Date(lastActivityAt.getTime() + recoveryMs);
  if (endsAt.getTime() <= input.now.getTime()) return tournamentLock;

  return {
    blocked: true,
    reason: 'recent_gameplay',
    endsAt,
  };
}

export async function assertGameplayActionAllowed(
  client: PoolClient,
  input: GameplayLockInput,
): Promise<void> {
  const state = await getGameplayLockState(client, input);
  if (!state.blocked) return;
  throwGameplayLock(state);
}
