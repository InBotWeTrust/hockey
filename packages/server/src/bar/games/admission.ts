import type { PoolClient } from 'pg';
import {
  advance,
  createMatch,
  type Runtime,
  type GameReady,
  type BarGameId,
  type GameCharacter,
} from '@hockey/game-core';
import { AppError } from '../../plugins/errors.js';
export interface MatchData {
  runtime: Runtime;
  ready: GameReady | null;
  starter: 0 | 1;
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
  const ended = row.data.runtime.game.winner !== null || row.data.ready?.cancelled;
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
      row.data.runtime = createMatch(row.kind, row.data.starter, ready.startsAt, false, prior.seed);
      row.data.runtime.revision = prior.revision + 1;
      row.data.ready = null;
    } else if (ready.startsAt === null && now >= ready.expiresAt) {
      ready.cancelled = true;
      await persist(client, row, now);
      return row;
    } else return row;
  }
  const before = row.data.runtime;
  row.data.runtime = advance(before, now);
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
