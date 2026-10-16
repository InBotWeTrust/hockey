import type { PoolClient } from 'pg';
import type { MatchRow } from './admission.js';
import { AppError } from '../../plugins/errors.js';
export function chooseStake(balance: number, sample: number): number {
  if (!Number.isSafeInteger(balance) || balance < 1)
    throw new AppError('bar_no_stars', 'Для игры нужна хотя бы одна звезда.', 409);
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new Error('Invalid random sample');
  return 1 + Math.floor(sample * Math.min(30, balance));
}
export function ochkoPayout(amount: number, winner: 0 | 1 | 'draw' | 'technical'): number {
  return winner === 0 ? amount * 2 : winner === 'draw' || winner === 'technical' ? amount : 0;
}
export async function settleOchko(c: PoolClient, row: MatchRow, now: number): Promise<void> {
  if (row.kind !== 'ochko' || row.data.runtime.game.winner === null) return;
  const winner =
    row.data.runtime.reason === 'technical' ? 'technical' : row.data.runtime.game.winner;
  const multiplier = winner === 0 ? 2 : winner === 'draw' || winner === 'technical' ? 1 : 0;
  const { rows } = await c.query<{ user_id: string; amount: string }>(
    'update bar_game_stakes set payout=amount*$2,settled_at=$3 where match_id=$1 and settled_at is null returning user_id,amount',
    [row.id, multiplier, new Date(now)],
  );
  if (!rows[0]) return;
  const amount = Number(rows[0].amount),
    payout = ochkoPayout(amount, winner);
  if (payout) {
    await c.query('update users set xp=xp+$2 where id=$1', [rows[0].user_id, payout]);
    await recordOchkoStars(c, rows[0].user_id, row.id,
      multiplier === 2 ? 'bar_ochko_payout' : 'bar_ochko_refund', payout, now);
  }
  row.data.stake = { amount, payout };
}

export async function recordOchkoStars(
  c: PoolClient, userId: string, matchId: string,
  reason: 'bar_ochko_stake' | 'bar_ochko_payout' | 'bar_ochko_refund',
  stars: number, now: number,
): Promise<void> {
  await c.query(
    `insert into currency_ledger
      (user_id,reason,available_delta,reserved_delta,balance_after,reserved_after,metadata,created_at)
     values ($1,$2,0,0,
       coalesce((select balance from user_currency_account where user_id=$1),0),
       coalesce((select reserved_balance from user_currency_account where user_id=$1),0),
       $3::jsonb,$4)`,
    [userId,reason,JSON.stringify({stars,bar_game_match_id:matchId,game:'ochko'}),new Date(now)],
  );
}
