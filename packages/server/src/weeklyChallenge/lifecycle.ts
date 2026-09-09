import type { PoolClient } from 'pg';
import { getWeeklyChallengeWindow } from './schedule.js';

interface WeeklyChallengeSourceRow {
  id: string;
  title: string;
  description: string;
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  created_by: string | null;
}

export async function reconcileWeeklyChallengeLifecycle(
  client: PoolClient,
  now = new Date(),
): Promise<void> {
  const { rows: settings } = await client.query<{ enabled: boolean }>(
    `select enabled
       from weekly_challenge_settings
      where id = true
      for update`,
  );
  if (settings[0]?.enabled !== true) return;

  const window = getWeeklyChallengeWindow(now);
  const existing = await client.query<{ id: string }>(
    `select id
       from weekly_challenges
      where is_automatic
        and start_at = $1
      limit 1`,
    [window.nextStart],
  );
  if (existing.rowCount !== 0) return;

  const { rows: sources } = await client.query<WeeklyChallengeSourceRow>(
    `select id, title, description, reward_coins, reward_stars, reward_experience, created_by
       from weekly_challenges
      where start_at < $1
      order by start_at desc, created_at desc
      limit 1`,
    [window.nextStart],
  );
  const source = sources[0];
  if (!source) return;

  const created = await client.query<{ id: string }>(
    `insert into weekly_challenges
       (title, description, join_open_at, visible_from, start_at, end_at,
        is_automatic, is_active, join_enabled,
        reward_coins, reward_stars, reward_experience, created_by)
     values ($1, $2, $3, $3, $4, $5, true, false, false, $6, $7, $8, $9)
     on conflict (start_at) where is_automatic do nothing
     returning id`,
    [
      source.title,
      source.description,
      window.nextVisibleFrom,
      window.nextStart,
      window.nextEnd,
      source.reward_coins,
      source.reward_stars,
      source.reward_experience,
      source.created_by,
    ],
  );
  const nextChallenge = created.rows[0];
  if (!nextChallenge) return;

  await client.query(
    `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
     select $1, type, title, target, sort_order
       from weekly_challenge_tasks
      where challenge_id = $2
      order by sort_order, created_at`,
    [nextChallenge.id, source.id],
  );
}
