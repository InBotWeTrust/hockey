import type { PoolClient } from 'pg';
import { observeCareerExperience } from '../achievements/service.js';

export async function grantCompletionReward(client: PoolClient, userId: string, mode: 'daily' | 'training', sessionId: string, requiredShots: number): Promise<void> {
  const column = mode === 'daily' ? 'day_pool_id' : 'training_session_id';
  const amount = mode === 'daily' ? 2 : 1;
  const inserted = await client.query(
    `insert into session_completion_reward (mode, session_id, user_id, stars, experience)
     select $1, $2, $3, $4, $4
      where (select count(*) from shot_session where ${column} = $2 and mode = $1) >= $5
     on conflict do nothing returning session_id`,
    [mode, sessionId, userId, amount, requiredShots],
  );
  if (!inserted.rows.length) return;
  const result = await client.query<{ experience: number }>(
    'update users set xp = xp + $2, experience = experience + $2 where id = $1 returning experience',
    [userId, amount],
  );
  // Keep balance updates and bank history in the same transaction.
  await client.query('insert into user_currency_account (user_id) values ($1) on conflict do nothing', [userId]);
  await client.query(
    `insert into currency_ledger
      (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     select user_id, $2, 0, 0, balance, reserved_balance, $3::jsonb
       from user_currency_account where user_id = $1`,
    [userId, `${mode}_completion_reward`, JSON.stringify({ session_id: sessionId, stars: amount, experience: amount })],
  );
  await observeCareerExperience(client, userId, {
    eventKey: `session-completion:${mode}:${sessionId}`,
    occurredAt: new Date(),
    lifetimeTotal: Number(result.rows[0]!.experience),
  });
}

export async function readCompletionReward(client: PoolClient, mode: 'daily' | 'training', sessionId: string): Promise<{ stars: number; experience: number } | null> {
  const result = await client.query<{ stars: number; experience: number }>(
    'select stars, experience from session_completion_reward where mode = $1 and session_id = $2', [mode, sessionId],
  );
  return result.rows[0] ?? null;
}
