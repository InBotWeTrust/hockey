import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import {
  grantStatAchievements,
  observeCareerActivityStreak,
  observeCareerGoal,
} from '../../achievements/service.js';
import { openFirstAchievementStages } from '../../achievements/stageProgress.js';
import { reconcileReferralQualification } from '../../referrals/service.js';

interface Progress {
  lifetimeShots: number;
  lifetimeGoals: number;
  level: number;
  goal: boolean;
}
export async function enqueueDuelShotProgress(
  client: PoolClient,
  input: {
    eventKey: string;
    matchId: string;
    userId: string;
    occurredAt: Date;
    progress: Progress;
  },
): Promise<void> {
  await client.query(
    `insert into duel_shot_progress(event_key,match_id,user_id,occurred_at,payload)
    values($1,$2,$3,$4,$5) on conflict(event_key) do nothing`,
    [input.eventKey, input.matchId, input.userId, input.occurredAt, JSON.stringify(input.progress)],
  );
}

// Deferred progress must never compete with a live duel for either player's row.
// The hard match deadline also makes abandoned games eligible without a browser poll.
export async function drainDuelShotProgress(pool: Pool): Promise<boolean> {
  const client = await pool.connect();
  let eventKey: string | undefined;
  try {
    await client.query('begin');
    await client.query("set local lock_timeout='100ms'");
    const { rows } = await client.query<{
      event_key: string;
      user_id: string;
      occurred_at: Date;
      payload: Progress;
    }>(`
      select job.* from duel_shot_progress job
      where job.retry_at<=now()
        and not exists (
          select 1 from amateur_duel_match m join amateur_duel_participant p on p.match_id=m.id
          where (m.challenger_user_id=job.user_id or m.opponent_user_id=job.user_id)
            and m.status='active' and m.ends_at>now() and p.state='period_active'
        )
        and not exists (select 1 from duel_shot_progress earlier
          where earlier.user_id=job.user_id and (earlier.occurred_at,earlier.event_key)<(job.occurred_at,job.event_key))
      order by job.occurred_at,job.event_key limit 1 for update of job skip locked`);
    const job = rows[0];
    if (!job) {
      await client.query('commit');
      return false;
    }
    eventKey = job.event_key;
    const gate = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_xact_lock(hashtext('gameplay:' || $1)) as locked",
      [job.user_id],
    );
    if (!gate.rows[0]?.locked) {
      await client.query('rollback');
      return false;
    }
    // Starting a period takes the same gameplay gate; recheck after acquiring it.
    const live = await client.query(
      `select 1 from amateur_duel_match m
      join amateur_duel_participant p on p.match_id=m.id
      where (m.challenger_user_id=$1 or m.opponent_user_id=$1)
        and m.status='active' and m.ends_at>now() and p.state='period_active' limit 1`,
      [job.user_id],
    );
    if (live.rowCount) {
      await client.query('rollback');
      return false;
    }
    const batch = await client.query<{
      event_key: string;
      occurred_at: Date;
      payload: Progress;
    }>(
      `select event_key,occurred_at,payload from duel_shot_progress where user_id=$1
      order by occurred_at,event_key limit 256 for update`,
      [job.user_id],
    );
    const first = batch.rows[0]!;
    const latest = batch.rows.reduce((a, b) =>
      a.payload.lifetimeShots > b.payload.lifetimeShots ? a : b,
    );
    const goals = batch.rows.filter((row) => row.payload.goal);
    const lastGoal = goals.length
      ? goals.reduce((a, b) => (a.payload.lifetimeGoals > b.payload.lifetimeGoals ? a : b))
      : null;
    // These achievements observe monotonic totals, not per-shot increments.
    // Open stages at the first event so a later miss cannot hide an earlier goal.
    await openFirstAchievementStages(client, job.user_id, first.occurred_at);
    await observeCareerActivityStreak(client, job.user_id, batch.rows.at(-1)!.occurred_at);
    await grantStatAchievements(client, job.user_id, latest.payload);
    await reconcileReferralQualification(client, job.user_id);
    if (lastGoal)
      await observeCareerGoal(client, job.user_id, {
        eventKey: lastGoal.event_key,
        occurredAt: lastGoal.occurred_at,
        mode: 'amateur_duel',
        lifetimeTotal: lastGoal.payload.lifetimeGoals,
      });
    await client.query('delete from duel_shot_progress where event_key=any($1::text[])', [
      batch.rows.map((row) => row.event_key),
    ]);
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    if (eventKey)
      await client.query(
        "update duel_shot_progress set retry_at=now()+interval '10 seconds' where event_key=$1",
        [eventKey],
      );
    throw error;
  } finally {
    client.release();
  }
}

export function startDuelShotProgressWorker(app: FastifyInstance): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      pending = run();
    }, delay);
    timer.unref();
  };
  const run = async () => {
    let processed = false;
    try {
      processed = await drainDuelShotProgress(app.pg);
    } catch (error) {
      app.log.error({ err: error }, 'duel progress processing failed');
    }
    schedule(processed ? 50 : 2000);
  };
  schedule(2000);
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
  };
}
