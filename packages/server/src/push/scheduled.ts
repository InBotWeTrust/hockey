import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { trainingDailyCooldownMs } from '../duel/trainingCooldown.js';
import type { PushEventType } from './preferences.js';
import { enqueuePushDelivery, processPushDeliveryQueue } from './queue.js';
import { resolvePushVapidOptions, type PushVapidOptions, type WebPushPayload } from './service.js';
import {
  renderPushNotificationPayload,
  type PushTemplateFallback,
  type PushTemplateVariables,
} from './templates.js';

export const DAILY_AVAILABLE_LOCAL_HOUR = 9;
export const TRAINING_AVAILABLE_LOCAL_HOUR = 9;
export const DAILY_PERIOD_ENDING_LEAD_MS = 5 * 60 * 1000;
export const SCHEDULED_PUSH_LATE_WINDOW_MS = 30 * 60 * 1000;
export const PUSH_SCHEDULER_LOCK_NAMESPACE = 5_042_026;
export const PUSH_SCHEDULER_LOCK_KEY = 1;

type Queryable = Pool | PoolClient;

interface ScheduledPushSubscriptionRow {
  subscription_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  event_key: string;
  local_date: string;
  day_pool_id: string | null;
  period_number: number | null;
  event_due_at: Date | null;
  training_shot_id: string | null;
}

interface ScheduledPushTarget {
  eventType: PushEventType;
  eventKey: string;
  userId: string;
  subscriptions: ScheduledPushSubscriptionRow[];
  variables: PushTemplateVariables;
  fallback: PushTemplateFallback;
  tag: string;
}

export interface ScheduledPushEventResult {
  eventType: PushEventType;
  targets: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

export interface ScheduledPushRunResult {
  enabled: boolean;
  events: ScheduledPushEventResult[];
}

export interface RunScheduledPushesOptions extends PushVapidOptions {
  now?: Date;
  dailyAvailableLocalHour?: number;
  trainingAvailableLocalHour?: number;
  dailyPeriodEndingLeadMs?: number;
  lateWindowMs?: number;
  workerBatchSize?: number;
  workerConcurrency?: number;
  processQueue?: boolean;
}

function makeEmptyResult(eventType: PushEventType): ScheduledPushEventResult {
  return { eventType, targets: 0, claimed: 0, sent: 0, skipped: 0, failed: 0, retried: 0 };
}

function collectTargets(
  eventType: PushEventType,
  rows: ScheduledPushSubscriptionRow[],
  buildTarget: (row: ScheduledPushSubscriptionRow) => Omit<
    ScheduledPushTarget,
    'eventType' | 'eventKey' | 'userId' | 'subscriptions'
  >,
): ScheduledPushTarget[] {
  const targets = new Map<string, ScheduledPushTarget>();
  for (const row of rows) {
    const key = `${row.user_id}:${row.event_key}`;
    let target = targets.get(key);
    if (!target) {
      target = {
        eventType,
        eventKey: row.event_key,
        userId: row.user_id,
        subscriptions: [],
        ...buildTarget(row),
      };
      targets.set(key, target);
    }
    target.subscriptions.push(row);
  }
  return [...targets.values()];
}

async function enqueueTarget(
  pool: Queryable,
  target: ScheduledPushTarget,
): Promise<{ queued: boolean; skipped: boolean }> {
  const rendered = await renderPushNotificationPayload(
    pool,
    target.eventType,
    target.variables,
    target.fallback,
  );
  if (rendered === null) return { queued: false, skipped: true };

  const payload: WebPushPayload = {
    title: rendered.title,
    body: rendered.body,
    url: rendered.url,
    tag: target.tag,
  };
  const queued = await enqueuePushDelivery(pool, {
    userId: target.userId,
    eventType: target.eventType,
    eventKey: target.eventKey,
    payload,
  });
  return { queued, skipped: !queued };
}

async function enqueueTargets(
  pool: Queryable,
  eventType: PushEventType,
  targets: ScheduledPushTarget[],
): Promise<ScheduledPushEventResult> {
  const result = makeEmptyResult(eventType);
  result.targets = targets.length;

  for (const target of targets) {
    const queued = await enqueueTarget(pool, target);
    if (queued.skipped) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;
  }

  return result;
}

async function fetchDailyAvailableRows(
  pool: Queryable,
  now: Date,
  localHour: number,
  trainingCooldownMs: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with candidates as (
       select u.id as user_id,
              to_char(($1::timestamptz at time zone u.timezone)::date, 'YYYY-MM-DD') as local_date
         from users u
         left join user_push_preferences pref on pref.user_id = u.id
        where coalesce(pref.daily_game, true)
          and extract(hour from ($1::timestamptz at time zone u.timezone))::int = $2
          and not exists (
            select 1
              from day_pool dp
             where dp.user_id = u.id
               and dp.day_date = ($1::timestamptz at time zone u.timezone)::date
          )
          and not exists (
            select 1
              from shot_session ss
             where ss.user_id = u.id
               and ss.mode = 'training'
               and ss.created_at > $1::timestamptz - ($3::bigint * interval '1 millisecond')
          )
     )
     select ps.id as subscription_id,
            ps.user_id,
            ps.endpoint,
            ps.p256dh,
            ps.auth,
            'daily:' || c.local_date as event_key,
            c.local_date,
            null::uuid as day_pool_id,
            null::int as period_number,
            null::timestamptz as event_due_at,
            null::uuid as training_shot_id
       from candidates c
       join push_subscriptions ps on ps.user_id = c.user_id
      where not exists (
        select 1
          from push_delivery_log pdl
         where pdl.user_id = c.user_id
           and pdl.event_type = 'daily.available'
           and pdl.event_key = 'daily:' || c.local_date
      )
        and not exists (
          select 1
            from push_delivery_log pdl
           where pdl.user_id = c.user_id
             and pdl.event_type = 'daily.unlocked_after_training'
             and pdl.event_key like 'daily-training-unlock:' || c.local_date || ':%'
        )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), localHour, trainingCooldownMs],
  );
  return rows;
}

async function fetchDailyUnlockedAfterTrainingRows(
  pool: Queryable,
  now: Date,
  cooldownMs: number,
  lateWindowMs: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with latest_training_shots as (
       select distinct on (ss.user_id)
              ss.user_id,
              ss.id as training_shot_id,
              ss.created_at as last_training_shot_at,
              ss.created_at + ($2::bigint * interval '1 millisecond') as event_due_at
         from shot_session ss
        where ss.mode = 'training'
        order by ss.user_id, ss.created_at desc, ss.id desc
     ),
     candidates as (
       select u.id as user_id,
              lts.training_shot_id,
              lts.event_due_at,
              to_char(($1::timestamptz at time zone u.timezone)::date, 'YYYY-MM-DD') as local_date
         from users u
         join latest_training_shots lts on lts.user_id = u.id
         left join user_push_preferences pref on pref.user_id = u.id
        where coalesce(pref.daily_game, true)
          and lts.event_due_at <= $1::timestamptz
          and lts.event_due_at > $1::timestamptz - ($3::bigint * interval '1 millisecond')
          and not exists (
            select 1
              from day_pool dp
             where dp.user_id = u.id
               and dp.day_date = ($1::timestamptz at time zone u.timezone)::date
          )
     )
     select ps.id as subscription_id,
            ps.user_id,
            ps.endpoint,
            ps.p256dh,
            ps.auth,
            'daily-training-unlock:' || c.local_date || ':' || c.training_shot_id::text
              as event_key,
            c.local_date,
            null::uuid as day_pool_id,
            null::int as period_number,
            c.event_due_at,
            c.training_shot_id
       from candidates c
       join push_subscriptions ps on ps.user_id = c.user_id
      where not exists (
        select 1
          from push_delivery_log pdl
         where pdl.user_id = c.user_id
           and pdl.event_type = 'daily.unlocked_after_training'
           and pdl.event_key =
             'daily-training-unlock:' || c.local_date || ':' || c.training_shot_id::text
      )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), cooldownMs, lateWindowMs],
  );
  return rows;
}

async function fetchDailyPeriodEndingRows(
  pool: Queryable,
  now: Date,
  periodDurationMs: number,
  leadMs: number,
  shotsPerPeriod: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with active_periods as (
       select dp.id as day_pool_id,
              dp.user_id,
              dp.current_period as period_number,
              to_char(dp.day_date, 'YYYY-MM-DD') as local_date,
              dp.period_started_at + ($2::bigint * interval '1 millisecond') as event_due_at
         from day_pool dp
         join users u on u.id = dp.user_id
         left join user_push_preferences pref on pref.user_id = dp.user_id
        where coalesce(pref.daily_game, true)
          and dp.state = 'period_active'
          and dp.period_started_at is not null
          and dp.day_date = ($1::timestamptz at time zone u.timezone)::date
          and dp.period_started_at + ($2::bigint * interval '1 millisecond') > $1::timestamptz
          and dp.period_started_at + (($2::bigint - $3::bigint) * interval '1 millisecond')
                <= $1::timestamptz
     ),
     with_shots as (
       select ap.*,
              coalesce(shots.shots_taken, 0) as shots_taken
         from active_periods ap
         left join lateral (
           select count(*)::int as shots_taken
             from shot_session ss
            where ss.mode = 'daily'
              and ss.day_pool_id = ap.day_pool_id
              and ss.period_number = ap.period_number
         ) shots on true
     )
     select ps.id as subscription_id,
            ps.user_id,
            ps.endpoint,
            ps.p256dh,
            ps.auth,
            ws.day_pool_id::text || ':period:' || ws.period_number::text || ':ending' as event_key,
            ws.local_date,
            ws.day_pool_id,
            ws.period_number,
            ws.event_due_at,
            null::uuid as training_shot_id
       from with_shots ws
       join push_subscriptions ps on ps.user_id = ws.user_id
      where ws.shots_taken < $4
        and not exists (
          select 1
            from push_delivery_log pdl
           where pdl.user_id = ws.user_id
             and pdl.event_type = 'daily.period_ending'
             and pdl.event_key =
               ws.day_pool_id::text || ':period:' || ws.period_number::text || ':ending'
        )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), periodDurationMs, leadMs, shotsPerPeriod],
  );
  return rows;
}

async function fetchDailyBreakFinishedRows(
  pool: Queryable,
  now: Date,
  breakDurationMs: number,
  lateWindowMs: number,
  totalPeriods: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with finished_breaks as (
       select dp.id as day_pool_id,
              dp.user_id,
              dp.current_period as period_number,
              to_char(dp.day_date, 'YYYY-MM-DD') as local_date,
              dp.break_started_at + ($2::bigint * interval '1 millisecond') as event_due_at
         from day_pool dp
         join users u on u.id = dp.user_id
         left join user_push_preferences pref on pref.user_id = dp.user_id
        where coalesce(pref.daily_game, true)
          and dp.state = 'break_active'
          and dp.break_started_at is not null
          and dp.current_period < $4
          and dp.day_date = ($1::timestamptz at time zone u.timezone)::date
          and dp.break_started_at + ($2::bigint * interval '1 millisecond') <= $1::timestamptz
          and dp.break_started_at + ($2::bigint * interval '1 millisecond')
                > $1::timestamptz - ($3::bigint * interval '1 millisecond')
     )
     select ps.id as subscription_id,
            ps.user_id,
            ps.endpoint,
            ps.p256dh,
            ps.auth,
            fb.day_pool_id::text || ':period:' || fb.period_number::text || ':break_finished'
              as event_key,
            fb.local_date,
            fb.day_pool_id,
            fb.period_number,
            fb.event_due_at,
            null::uuid as training_shot_id
       from finished_breaks fb
       join push_subscriptions ps on ps.user_id = fb.user_id
      where not exists (
        select 1
          from push_delivery_log pdl
         where pdl.user_id = fb.user_id
           and pdl.event_type = 'daily.break_finished'
           and pdl.event_key =
             fb.day_pool_id::text || ':period:' || fb.period_number::text || ':break_finished'
      )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), breakDurationMs, lateWindowMs, totalPeriods],
  );
  return rows;
}

async function fetchTrainingAvailableRows(
  pool: Queryable,
  now: Date,
  localHour: number,
  totalPeriods: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with candidates as (
       select u.id as user_id,
              to_char(($1::timestamptz at time zone u.timezone)::date, 'YYYY-MM-DD') as local_date
         from users u
         left join user_push_preferences pref on pref.user_id = u.id
        where coalesce(pref.training_available, true)
          and extract(hour from ($1::timestamptz at time zone u.timezone))::int = $2
          and not exists (
            select 1
              from training_session ts
             where ts.user_id = u.id
               and ts.day_date = ($1::timestamptz at time zone u.timezone)::date
          )
          and not exists (
            select 1
              from day_pool dp
             where dp.user_id = u.id
               and dp.day_date = ($1::timestamptz at time zone u.timezone)::date
               and (
                 dp.state in ('period_active', 'break_active')
                 or (dp.state = 'idle'
                     and dp.current_period > 0
                     and dp.current_period < $3)
               )
          )
     )
     select ps.id as subscription_id,
            ps.user_id,
            ps.endpoint,
            ps.p256dh,
            ps.auth,
            'training:' || c.local_date as event_key,
            c.local_date,
            null::uuid as day_pool_id,
            null::int as period_number,
            null::timestamptz as event_due_at,
            null::uuid as training_shot_id
       from candidates c
       join push_subscriptions ps on ps.user_id = c.user_id
      where not exists (
        select 1
          from push_delivery_log pdl
         where pdl.user_id = c.user_id
           and pdl.event_type = 'training.available'
           and pdl.event_key = 'training:' || c.local_date
      )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), localHour, totalPeriods],
  );
  return rows;
}

async function tryAcquireSchedulerLock(client: PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ locked: boolean }>(
    `select pg_try_advisory_xact_lock($1::int, $2::int) as locked`,
    [PUSH_SCHEDULER_LOCK_NAMESPACE, PUSH_SCHEDULER_LOCK_KEY],
  );
  return rows[0]?.locked === true;
}

async function schedulePushDeliveries(
  client: PoolClient,
  options: RunScheduledPushesOptions,
  now: Date,
): Promise<ScheduledPushEventResult[]> {
  const settings = await getGameSettings(client);
  const dailyAvailableHour = options.dailyAvailableLocalHour ?? DAILY_AVAILABLE_LOCAL_HOUR;
  const trainingAvailableHour =
    options.trainingAvailableLocalHour ?? TRAINING_AVAILABLE_LOCAL_HOUR;
  const periodEndingLeadMs = options.dailyPeriodEndingLeadMs ?? DAILY_PERIOD_ENDING_LEAD_MS;
  const lateWindowMs = options.lateWindowMs ?? SCHEDULED_PUSH_LATE_WINDOW_MS;
  const trainingCooldownMs = trainingDailyCooldownMs(settings.training.dailyCooldownMinutes);

  const dailyAvailableRows = await fetchDailyAvailableRows(
    client,
    now,
    dailyAvailableHour,
    trainingCooldownMs,
  );
  const dailyUnlockedAfterTrainingRows = await fetchDailyUnlockedAfterTrainingRows(
    client,
    now,
    trainingCooldownMs,
    lateWindowMs,
  );
  const periodEndingRows = await fetchDailyPeriodEndingRows(
    client,
    now,
    settings.daily.periodDurationMs,
    periodEndingLeadMs,
    settings.daily.shotsPerPeriod,
  );
  const breakFinishedRows = await fetchDailyBreakFinishedRows(
    client,
    now,
    settings.daily.breakDurationMs,
    lateWindowMs,
    settings.daily.totalPeriods,
  );
  const trainingAvailableRows = await fetchTrainingAvailableRows(
    client,
    now,
    trainingAvailableHour,
    settings.daily.totalPeriods,
  );

  const dailyAvailableTargets = collectTargets('daily.available', dailyAvailableRows, (row) => ({
    variables: { localDate: row.local_date },
    fallback: {
      title: 'Ежедневная игра доступна',
      body: 'Новый игровой день уже открыт.',
      url: '/?view=hub',
    },
    tag: `ultimate-hockey-daily-available-${row.local_date}`,
  }));

  const dailyUnlockedAfterTrainingTargets = collectTargets(
    'daily.unlocked_after_training',
    dailyUnlockedAfterTrainingRows,
    (row) => ({
      variables: {
        localDate: row.local_date,
        trainingShotId: row.training_shot_id,
      },
      fallback: {
        title: 'Ежедневная игра открыта',
        body: 'Восстановление после тренировки завершено.',
        url: '/?view=hub',
      },
      tag: `ultimate-hockey-daily-training-unlock-${row.local_date}`,
    }),
  );

  const periodEndingTargets = collectTargets('daily.period_ending', periodEndingRows, (row) => ({
    variables: {
      localDate: row.local_date,
      periodNumber: row.period_number,
      minutesLeft: Math.round(periodEndingLeadMs / 60000),
    },
    fallback: {
      title: 'Период скоро закончится',
      body: 'Осталось 5 минут на броски.',
      url: '/?view=daily',
    },
    tag: `ultimate-hockey-period-ending-${row.day_pool_id}-${row.period_number}`,
  }));

  const breakFinishedTargets = collectTargets('daily.break_finished', breakFinishedRows, (row) => ({
    variables: {
      localDate: row.local_date,
      periodNumber: row.period_number,
      nextPeriodNumber: (row.period_number ?? 0) + 1,
    },
    fallback: {
      title: 'Перерыв окончен',
      body: 'Следующий период можно начинать.',
      url: '/?view=hub',
    },
    tag: `ultimate-hockey-break-finished-${row.day_pool_id}-${row.period_number}`,
  }));

  const trainingAvailableTargets = collectTargets(
    'training.available',
    trainingAvailableRows,
    (row) => ({
      variables: { localDate: row.local_date },
      fallback: {
        title: 'Тренировка доступна',
        body: 'Можно снова потренироваться.',
        url: '/?view=training',
      },
      tag: `ultimate-hockey-training-available-${row.local_date}`,
    }),
  );

  return [
    await enqueueTargets(client, 'daily.available', dailyAvailableTargets),
    await enqueueTargets(
      client,
      'daily.unlocked_after_training',
      dailyUnlockedAfterTrainingTargets,
    ),
    await enqueueTargets(client, 'daily.period_ending', periodEndingTargets),
    await enqueueTargets(client, 'daily.break_finished', breakFinishedTargets),
    await enqueueTargets(client, 'training.available', trainingAvailableTargets),
  ];
}

function mergeQueueEvents(
  events: ScheduledPushEventResult[],
  queueEvents: Array<{
    eventType: PushEventType;
    sent: number;
    failed: number;
    skipped: number;
    retried: number;
  }>,
): void {
  for (const queueEvent of queueEvents) {
    let event = events.find((item) => item.eventType === queueEvent.eventType);
    if (!event) {
      event = makeEmptyResult(queueEvent.eventType);
      events.push(event);
    }
    event.sent += queueEvent.sent;
    event.failed += queueEvent.failed;
    event.skipped += queueEvent.skipped;
    event.retried += queueEvent.retried;
  }
}

export async function runScheduledPushes(
  pool: Pool,
  options: RunScheduledPushesOptions,
): Promise<ScheduledPushRunResult> {
  const config = resolvePushVapidOptions(options);
  if (config === null) return { enabled: false, events: [] };

  const now = options.now ?? new Date();
  const events: ScheduledPushEventResult[] = [];
  const client = await pool.connect();
  try {
    await client.query('begin');
    const locked = await tryAcquireSchedulerLock(client);
    if (locked) {
      events.push(...(await schedulePushDeliveries(client, options, now)));
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  if (options.processQueue !== false) {
    const queue = await processPushDeliveryQueue(pool, {
      ...options,
      ...(options.workerBatchSize !== undefined ? { batchSize: options.workerBatchSize } : {}),
      ...(options.workerConcurrency !== undefined ? { concurrency: options.workerConcurrency } : {}),
    });
    mergeQueueEvents(events, queue.events);
  }

  return { enabled: true, events };
}
