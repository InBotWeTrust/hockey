import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export interface StageObservation {
  eventKey: string;
  occurredAt: Date;
  progress: Record<string, number | string | boolean>;
  context?: Record<string, unknown>;
}

interface ActiveStageRow {
  stage_number: number;
  opened_at: Date;
  completed_at: Date | null;
  target: Record<string, number | string | boolean>;
}

function isPool(db: Queryable): db is Pool {
  return 'connect' in db && typeof db.connect === 'function';
}

async function inTransaction<T>(db: Queryable, work: (client: PoolClient) => Promise<T>) {
  if (!isPool(db)) return work(db);
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function satisfiesTarget(
  progress: Record<string, number | string | boolean>,
  target: Record<string, number | string | boolean>,
): boolean {
  return Object.entries(target).every(([key, expected]) => {
    const actual = progress[key];
    if (actual === undefined || typeof actual !== typeof expected) return false;
    if (typeof expected !== 'number' || typeof actual !== 'number') return actual === expected;
    return key.startsWith('maximum') ? actual <= expected : actual >= expected;
  });
}

export async function openFirstAchievementStages(
  db: Queryable,
  userId: string,
  openedAt: Date,
): Promise<void> {
  await db.query(
    `insert into user_achievement_stages
       (user_id, achievement_id, stage_number, opened_at)
     select $1, stage.achievement_id, stage.stage_number, $2
       from achievement_stages stage
       join achievements achievement on achievement.id = stage.achievement_id
      where stage.stage_number = 1
        and stage.is_enabled
        and achievement.availability = 'active'
        and not exists (
          select 1
            from user_achievement_stages existing
           where existing.user_id = $1
             and existing.achievement_id = stage.achievement_id
        )
     on conflict (user_id, achievement_id, stage_number) do nothing`,
    [userId, openedAt],
  );
}

export async function observeAchievementStage(
  db: Queryable,
  userId: string,
  achievementId: string,
  observation: StageObservation,
): Promise<{ completed: boolean; stageNumber: number | null }> {
  return inTransaction(db, async (client) => {
    const current = await client.query<ActiveStageRow>(
      `select user_stage.stage_number, user_stage.opened_at, user_stage.completed_at,
              stage.target
         from user_achievement_stages user_stage
         join achievement_stages stage
           on stage.achievement_id = user_stage.achievement_id
          and stage.stage_number = user_stage.stage_number
        where user_stage.user_id = $1
          and user_stage.achievement_id = $2
          and user_stage.claimed_at is null
          and stage.is_enabled
        order by user_stage.stage_number desc
        limit 1
        for update of user_stage`,
      [userId, achievementId],
    );
    const active = current.rows[0];
    if (active === undefined) return { completed: false, stageNumber: null };
    if (active.completed_at !== null || observation.occurredAt < active.opened_at) {
      return { completed: false, stageNumber: active.stage_number };
    }

    const event = await client.query(
      `insert into achievement_stage_events
         (user_id, achievement_id, event_key, stage_number, occurred_at)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, achievement_id, event_key) do nothing
       returning event_key`,
      [userId, achievementId, observation.eventKey, active.stage_number, observation.occurredAt],
    );
    if (event.rowCount === 0) return { completed: false, stageNumber: active.stage_number };

    const completed = satisfiesTarget(observation.progress, active.target);
    await client.query(
      `update user_achievement_stages
          set progress = $4::jsonb,
              completed_at = case when $5 then $6 else completed_at end,
              completion_context = case when $5 then $7::jsonb else completion_context end
        where user_id = $1 and achievement_id = $2 and stage_number = $3`,
      [
        userId,
        achievementId,
        active.stage_number,
        JSON.stringify(observation.progress),
        completed,
        observation.occurredAt,
        JSON.stringify(observation.context ?? {}),
      ],
    );

    return { completed, stageNumber: active.stage_number };
  });
}
