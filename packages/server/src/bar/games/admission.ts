import type { PoolClient } from 'pg';
import { createPrivateOchko } from './ochkoDeck.js';
import {
  advance,
  barBattleship,
  createMatch,
  type Runtime,
  type GameReady,
  type BarGameId,
  type GameCharacter,
} from '@hockey/game-core';
import { settleOchko } from './ochkoEconomy.js';
import { AppError } from '../../plugins/errors.js';
export interface MatchData {
  runtime: Runtime;
  ready: GameReady | null;
  starter: 0 | 1;
  stake?: { amount: number; payout: number | null };
  stakeOfferId?: string;
  inputRate?: [number[], number[]];
}
export interface MatchRow {
  id: string;
  kind: BarGameId;
  player_a: string;
  player_b: string | null;
  character: GameCharacter | null;
  data: MatchData;
  ended_at: Date | null;
}
export async function persist(client: PoolClient, row: MatchRow, now: number) {
  const ended = row.data.ready ? row.data.ready.cancelled : row.data.runtime.game.winner !== null;
  if (ended) await settleOchko(client, row, now);
  await client.query('update bar_game_matches set data=$2,ended_at=$3 where id=$1', [
    row.id,
    JSON.stringify(row.data),
    ended ? new Date(now) : null,
  ]);
  row.ended_at = ended ? new Date(now) : null;
}
export async function reconcile(client: PoolClient, row: MatchRow, now: number): Promise<MatchRow> {
  if (row.ended_at) return row;
  const ready = row.data.ready;
  if (ready) {
    if (ready.startsAt !== null && now >= ready.startsAt) {
      const prior = row.data.runtime;
      row.data.runtime = createMatch(row.kind, row.data.starter, ready.startsAt, row.character!==null, prior.seed,prior.engineVersion);
      if (row.kind === 'ochko') row.data.runtime.game = createPrivateOchko(ready.startsAt,prior.engineVersion,row.character!==null);
      if(row.kind==='battleship')row.data.runtime.game=barBattleship.start(prior.game as unknown as barBattleship.State) as unknown as typeof prior.game;
      row.data.runtime.revision = prior.revision + 1;
      row.data.ready = null;
    } else if (ready.startsAt === null && now >= ready.expiresAt) {
      ready.cancelled = true;
      await persist(client, row, now);
      return row;
    } else return row;
  }
  const before = row.data.runtime;
  try {
    row.data.runtime = advance(before, now);
  } catch (error) {
    if (
      row.kind !== 'ochko' ||
      !row.data.stake ||
      !(error instanceof Error) ||
      error.message !== 'Unsupported game version'
    )
      throw error;
    row.data.runtime = {
      ...before,
      game: { ...before.game, winner: 'draw' },
      reason: 'technical',
      animationUntil: now,
      revision: before.revision + 1,
    };
  }
  if (row.data.runtime !== before || ready) await persist(client, row, now);
  return row;
}
export async function assertNewGamesFree(client: PoolClient, user: string, now: number) {
  const { rows } = await client.query<MatchRow>(
    'select * from bar_game_matches where ended_at is null and (player_a=$1 or player_b=$1)',
    [user],
  );
  for (const r of rows) {
    const row = await reconcile(client, r, now);
    if (!row.ended_at)
      throw new AppError('bar_game_busy', 'Сначала заверши текущую партию.', 409, {
        matchId: row.id,
      });
  }
  const local = await client.query(
    'select session_id from bar_local_card_sessions where user_id=$1 and expires_at>$2',
    [user, new Date(now)],
  );
  if (local.rows.length)
    throw new AppError('bar_game_busy', 'Сначала заверши текущую партию в карты.', 409);
}
