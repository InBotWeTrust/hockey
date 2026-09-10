import type { PoolClient } from 'pg';
import { getWeeklyChallengeWindow, type WeeklyChallengeWindow } from './schedule.js';

interface WeeklyChallengeSourceRow {
  id: string;
  title: string;
  description: string;
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  reward_tokens: number;
  created_by: string | null;
}

interface OverlappingLegacyChallengeRow {
  end_at: Date;
}

interface ExistingChallengeRow {
  id: string;
  is_automatic: boolean;
}

async function findExistingChallengeAtStart(
  client: PoolClient,
  startAt: Date,
): Promise<ExistingChallengeRow | undefined> {
  const { rows } = await client.query<ExistingChallengeRow>(
    `select id, is_automatic
       from weekly_challenges
      where start_at = $1
      order by is_automatic desc, created_at asc
      limit 1`,
    [startAt],
  );
  return rows[0];
}

async function moveAndAdoptTargetDraft(
  client: PoolClient,
  targetDraft: ExistingChallengeRow,
  window: WeeklyChallengeWindow,
): Promise<void> {
  await client.query(
    `update weekly_challenges
        set join_open_at = $2,
            visible_from = $2,
            start_at = $3,
            end_at = $4,
            is_automatic = true,
            is_active = false,
            join_enabled = false,
            updated_at = now()
      where id = $1 and launched_at is null`,
    [targetDraft.id, window.nextVisibleFrom, window.nextStart, window.nextEnd],
  );
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
  // Old admins could publish a future week as active. It has not launched
  // and must not occupy the single running slot or survive a pre-start disable.
  await client.query(
    `update weekly_challenges challenge
        set is_active = false, launched_at = null, updated_at = now()
      where start_at > $1
        and (is_active or launched_at >= start_at)
        and not exists (
          select 1 from weekly_challenge_reward_claims claim
           where claim.challenge_id = challenge.id
        )`,
    [now],
  );
  // Only a week whose start has arrived can provide active launch evidence.
  await client.query(
    `update weekly_challenges set launched_at = start_at
      where is_active and launched_at is null and start_at <= $1`,
    [now],
  );
  await client.query(
    `update weekly_challenges
        set is_active = false,
            updated_at = now()
      where is_active
        and end_at <= $1`,
    [now],
  );
  const enabled = settings[0]?.enabled === true;
  const { rows: missedDrafts } = await client.query<ExistingChallengeRow>(
    `select id, is_automatic from weekly_challenges
      where is_automatic and not is_active and launched_at is null
        and start_at <= $1 and (not $2::boolean or end_at <= $1)
      order by start_at desc, id for update`,
    [now, enabled],
  );
  for (const draft of missedDrafts) {
    let window = getWeeklyChallengeWindow(now);
    // Keep every draft's identity/content and avoid overwriting another
    // prepared week when recovering from several missed intervals.
    while (await findExistingChallengeAtStart(client, window.nextStart)) {
      window = getWeeklyChallengeWindow(window.nextStart);
    }
    await moveAndAdoptTargetDraft(client, draft, window);
  }
  if (enabled)
    await client.query(
      `update weekly_challenges
        set is_active = true,
            launched_at = coalesce(launched_at, $1),
            updated_at = now()
      where id = (
        select challenge.id
          from weekly_challenges challenge
         where challenge.is_automatic
           and not challenge.is_active
           and challenge.start_at <= $1
           and $1 < challenge.end_at
           and not exists (
             select 1
               from weekly_challenges active_challenge
              where active_challenge.is_active
           )
         order by challenge.start_at desc, challenge.id
         limit 1
      )`,
      [now],
    );

  const initialWindow = getWeeklyChallengeWindow(now);
  const targetDraft = await findExistingChallengeAtStart(client, initialWindow.nextStart);

  const { rows: overlaps } = await client.query<OverlappingLegacyChallengeRow>(
    `select end_at
       from weekly_challenges
      where is_active
        and not is_automatic
        and start_at < $2
        and end_at > $1
        and ($3::uuid is null or id <> $3::uuid)
      order by end_at desc
      limit 1`,
    [initialWindow.nextStart, initialWindow.nextEnd, targetDraft?.id ?? null],
  );
  const window =
    overlaps[0] === undefined ? initialWindow : getWeeklyChallengeWindow(overlaps[0].end_at);
  const delayedExisting = await findExistingChallengeAtStart(client, window.nextStart);
  if (overlaps[0] !== undefined && targetDraft !== undefined && delayedExisting === undefined) {
    await moveAndAdoptTargetDraft(client, targetDraft, window);
    return;
  }

  const existingChallenge = delayedExisting ?? targetDraft;
  if (existingChallenge !== undefined) {
    await moveAndAdoptTargetDraft(client, existingChallenge, window);
    return;
  }
  if (!enabled) return;

  const { rows: sources } = await client.query<WeeklyChallengeSourceRow>(
    `select id, title, description, reward_coins, reward_stars, reward_experience, reward_tokens, created_by
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
        reward_coins, reward_stars, reward_experience, reward_tokens, created_by)
     values ($1, $2, $3, $3, $4, $5, true, false, false, $6, $7, $8, $9, $10)
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
      source.reward_tokens,
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
