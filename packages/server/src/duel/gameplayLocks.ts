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

export async function getGameplayLockState(
  client: PoolClient,
  input: GameplayLockInput,
): Promise<GameplayLockState> {
  const recoveryMs = input.recoveryMs ?? GAMEPLAY_RECOVERY_MS;
  const recoveryModes = recoveryModesForAction(input.action);
  if (recoveryMs <= 0 || recoveryModes.length === 0) return NO_GAMEPLAY_LOCK;

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
  if (lastActivityAt === null) return NO_GAMEPLAY_LOCK;

  const endsAt = new Date(lastActivityAt.getTime() + recoveryMs);
  if (endsAt.getTime() <= input.now.getTime()) return NO_GAMEPLAY_LOCK;

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

  const until = state.endsAt === null ? '' : ` until ${state.endsAt.toISOString()}`;
  throw new AppError('conflict', `gameplay is locked${until}`, 409, { gameplayLock: state });
}
