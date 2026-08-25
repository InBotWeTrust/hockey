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
export const TOURNAMENT_FIXTURE_DEADLINE_LEAD_MS = 30 * 60 * 1000;
export const TOURNAMENT_NOTIFICATION_MAX_LEAD_MS = 24 * 60 * 60 * 1000;
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
  tournament_title?: string | null;
  fixture_id?: string | null;
  reminder_offset_ms?: number | null;
  window_ends_at?: Date | null;
  notification_override?: unknown;
}

interface ScheduledPushTarget {
  eventType: PushEventType;
  eventKey: string;
  userId: string;
  subscriptions: ScheduledPushSubscriptionRow[];
  variables: PushTemplateVariables;
  fallback: PushTemplateFallback;
  tag: string;
  templateOverride?: PushTemplateFallback;
}

function scheduledTemplateOverride(value: unknown): PushTemplateFallback | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const override = value as Record<string, unknown>;
  return typeof override.title === 'string' &&
    typeof override.body === 'string' &&
    typeof override.url === 'string'
    ? { title: override.title, body: override.body, url: override.url }
    : null;
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
  buildTarget: (
    row: ScheduledPushSubscriptionRow,
  ) => Omit<ScheduledPushTarget, 'eventType' | 'eventKey' | 'userId' | 'subscriptions'>,
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
    target.templateOverride,
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

async function fetchTournamentLiveSoonRows(
  pool: Queryable,
  now: Date,
  lateWindowMs: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with reminder_rules as (
       select t.id as tournament_id, t.title as tournament_title,
              r.rules_snapshot->'notificationOverrides'->'tournament.live_soon'
                as notification_override,
              case
                when jsonb_typeof(r.rules_snapshot->'notificationReminderOffsetsMs') = 'array'
                  then r.rules_snapshot->'notificationReminderOffsetsMs'
                else '[3600000]'::jsonb
              end as reminder_offsets
         from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.status in ('regular', 'playoff')
     ), reminder_offsets as (
       select rr.tournament_id, rr.tournament_title, rr.notification_override,
              case
                when jsonb_typeof(reminder_rule.value) = 'number'
                  and reminder_rule.value #>> '{}' ~ '^(0|[1-9][0-9]{0,7})$'
                  then (reminder_rule.value #>> '{}')::bigint
              end as reminder_offset_ms
         from reminder_rules rr
         cross join lateral jsonb_array_elements(rr.reminder_offsets) as reminder_rule(value)
     ), valid_reminder_offsets as (
       select tournament_id, tournament_title, notification_override, reminder_offset_ms
         from reminder_offsets
        where reminder_offset_ms between 0 and $3::bigint
     ),
     candidates as (
       select f.id as fixture_id, f.scheduled_starts_at, ro.tournament_title,
              ro.notification_override,
              ro.reminder_offset_ms,
              participant.user_id
         from tournament_fixture f
         join valid_reminder_offsets ro on ro.tournament_id = f.tournament_id
         cross join lateral (
           values (f.home_participant_id), (f.away_participant_id)
         ) as side(participant_id)
         join tournament_participant participant on participant.id = side.participant_id
         left join user_push_preferences pref on pref.user_id = participant.user_id
        where f.status in ('scheduled', 'open', 'active')
          and participant.state = 'approved'
          and coalesce(pref.tournament_events, true)
          and f.scheduled_starts_at - (ro.reminder_offset_ms * interval '1 millisecond')
                <= $1::timestamptz
          and f.scheduled_starts_at - (ro.reminder_offset_ms * interval '1 millisecond')
                > $1::timestamptz - ($2::bigint * interval '1 millisecond')
     )
     select ps.id as subscription_id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth,
            c.fixture_id::text || ':live-soon:' ||
              ((extract(epoch from c.scheduled_starts_at) * 1000)::bigint)::text || ':' ||
              c.reminder_offset_ms::text as event_key,
            ''::text as local_date, null::uuid as day_pool_id, null::int as period_number,
            null::timestamptz as event_due_at, null::uuid as training_shot_id,
            c.tournament_title, c.fixture_id, c.reminder_offset_ms,
            c.notification_override
       from candidates c
       join push_subscriptions ps on ps.user_id = c.user_id
      where not exists (
         select 1 from push_delivery_log pdl
         where pdl.user_id = c.user_id
           and pdl.event_type = 'tournament.live_soon'
           and pdl.event_key = c.fixture_id::text || ':live-soon:' ||
             ((extract(epoch from c.scheduled_starts_at) * 1000)::bigint)::text || ':' ||
             c.reminder_offset_ms::text
      )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), lateWindowMs, TOURNAMENT_NOTIFICATION_MAX_LEAD_MS],
  );
  return rows;
}

async function fetchTournamentFixtureOpenedRows(
  pool: Queryable,
  now: Date,
  lateWindowMs: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with candidates as (
       select f.id as fixture_id, f.scheduled_starts_at, t.title as tournament_title,
              revision.rules_snapshot->'notificationOverrides'->'tournament.fixture_opened'
                as notification_override,
              participant.user_id
         from tournament_fixture f
         join tournament t on t.id = f.tournament_id
         join tournament_revision revision on revision.id = t.published_revision_id
         cross join lateral (
           values (f.home_participant_id), (f.away_participant_id)
         ) as side(participant_id)
         join tournament_participant participant on participant.id = side.participant_id
         left join user_push_preferences pref on pref.user_id = participant.user_id
        where t.status in ('regular', 'playoff')
          and f.status in ('scheduled', 'open', 'active')
          and participant.state = 'approved'
          and coalesce(pref.tournament_events, true)
          and f.scheduled_starts_at <= $1::timestamptz
          and f.scheduled_starts_at > $1::timestamptz - ($2::bigint * interval '1 millisecond')
          and f.window_ends_at > $1::timestamptz
     )
     select ps.id as subscription_id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth,
            c.fixture_id::text || ':opened:' ||
              ((extract(epoch from c.scheduled_starts_at) * 1000)::bigint)::text as event_key,
            ''::text as local_date, null::uuid as day_pool_id, null::int as period_number,
            null::timestamptz as event_due_at, null::uuid as training_shot_id,
            c.tournament_title, c.fixture_id, c.notification_override
       from candidates c
       join push_subscriptions ps on ps.user_id = c.user_id
      where not exists (
        select 1 from push_delivery_log pdl
         where pdl.user_id = c.user_id
           and pdl.event_type = 'tournament.fixture_opened'
           and pdl.event_key = c.fixture_id::text || ':opened:' ||
             ((extract(epoch from c.scheduled_starts_at) * 1000)::bigint)::text
      )
      order by ps.user_id, ps.updated_at desc`,
    [now.toISOString(), lateWindowMs],
  );
  return rows;
}

async function fetchTournamentFixtureDeadlineRows(
  pool: Queryable,
  now: Date,
  lateWindowMs: number,
): Promise<ScheduledPushSubscriptionRow[]> {
  const { rows } = await pool.query<ScheduledPushSubscriptionRow>(
    `with deadline_rule_candidates as (
       select f.id as fixture_id, t.title as tournament_title, f.window_ends_at,
              r.rules_snapshot->'notificationOverrides'->'tournament.fixture_deadline'
                as notification_override,
              participant.user_id,
              case
                when jsonb_typeof(r.rules_snapshot->'notificationDeadlineLeadMs') = 'number'
                  and r.rules_snapshot->>'notificationDeadlineLeadMs'
                        ~ '^(0|[1-9][0-9]{0,7})$'
                  then (r.rules_snapshot->>'notificationDeadlineLeadMs')::bigint
                else $3::bigint
              end as deadline_lead_ms
         from tournament_fixture f
         join tournament t on t.id = f.tournament_id
         join tournament_revision r on r.id = t.published_revision_id
         cross join lateral (
           values (f.home_participant_id), (f.away_participant_id)
         ) as side(participant_id)
         join tournament_participant participant on participant.id = side.participant_id
         left join user_push_preferences pref on pref.user_id = participant.user_id
        where t.status in ('regular', 'playoff')
          and f.status in ('scheduled', 'open', 'active')
          and participant.state = 'approved'
          and coalesce(pref.tournament_events, true)
          and f.window_ends_at > $1::timestamptz
     ), candidates as (
       select fixture_id, tournament_title, window_ends_at, user_id,
              notification_override,
              coalesce(
                case
                  when deadline_lead_ms between 0 and $4::bigint then deadline_lead_ms
                end,
                $3::bigint
              ) as deadline_lead_ms
         from deadline_rule_candidates
     ), due as (
       select *, window_ends_at - (deadline_lead_ms * interval '1 millisecond') as event_due_at
         from candidates
     )
     select ps.id as subscription_id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth,
            d.fixture_id::text || ':deadline:' ||
              ((extract(epoch from d.window_ends_at) * 1000)::bigint)::text || ':' ||
              d.deadline_lead_ms::text as event_key,
            ''::text as local_date, null::uuid as day_pool_id, null::int as period_number,
            d.event_due_at, null::uuid as training_shot_id,
            d.tournament_title, d.fixture_id, d.window_ends_at, d.notification_override
       from due d
       join push_subscriptions ps on ps.user_id = d.user_id
      where d.event_due_at <= $1::timestamptz
        and d.event_due_at > $1::timestamptz - ($2::bigint * interval '1 millisecond')
        and not exists (
          select 1 from push_delivery_log pdl
           where pdl.user_id = d.user_id
             and pdl.event_type = 'tournament.fixture_deadline'
             and pdl.event_key = d.fixture_id::text || ':deadline:' ||
               ((extract(epoch from d.window_ends_at) * 1000)::bigint)::text || ':' ||
               d.deadline_lead_ms::text
        )
      order by ps.user_id, ps.updated_at desc`,
    [
      now.toISOString(),
      lateWindowMs,
      TOURNAMENT_FIXTURE_DEADLINE_LEAD_MS,
      TOURNAMENT_NOTIFICATION_MAX_LEAD_MS,
    ],
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
  const trainingAvailableHour = options.trainingAvailableLocalHour ?? TRAINING_AVAILABLE_LOCAL_HOUR;
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
  const tournamentLiveSoonRows = await fetchTournamentLiveSoonRows(client, now, lateWindowMs);
  const tournamentFixtureOpenedRows = await fetchTournamentFixtureOpenedRows(
    client,
    now,
    lateWindowMs,
  );
  const tournamentFixtureDeadlineRows = await fetchTournamentFixtureDeadlineRows(
    client,
    now,
    lateWindowMs,
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

  const tournamentLiveSoonTargets = collectTargets(
    'tournament.live_soon',
    tournamentLiveSoonRows,
    (row) => {
      const templateOverride = scheduledTemplateOverride(row.notification_override);
      return {
        variables: {
          tournamentTitle: row.tournament_title,
          fixtureId: row.fixture_id,
          minutes: Math.round(Number(row.reminder_offset_ms ?? 0) / 60_000),
        },
        fallback: {
          title: 'Скоро турнирный матч',
          body: `${row.tournament_title ?? 'Турнир'}: согласованное время игры приближается.`,
          url: '/?view=amateur&section=tournaments',
        },
        tag: `ultimate-hockey-tournament-live-${row.fixture_id}-${row.reminder_offset_ms}`,
        ...(templateOverride === null ? {} : { templateOverride }),
      };
    },
  );

  const tournamentFixtureOpenedTargets = collectTargets(
    'tournament.fixture_opened',
    tournamentFixtureOpenedRows,
    (row) => {
      const templateOverride = scheduledTemplateOverride(row.notification_override);
      return {
        variables: { tournamentTitle: row.tournament_title, fixtureId: row.fixture_id },
        fallback: {
          title: 'Матч открыт',
          body: `Можно начинать игру в турнире ${row.tournament_title ?? ''}.`.trim(),
          url: '/?view=amateur&section=tournaments',
        },
        tag: `ultimate-hockey-tournament-opened-${row.fixture_id}`,
        ...(templateOverride === null ? {} : { templateOverride }),
      };
    },
  );

  const tournamentFixtureDeadlineTargets = collectTargets(
    'tournament.fixture_deadline',
    tournamentFixtureDeadlineRows,
    (row) => {
      const templateOverride = scheduledTemplateOverride(row.notification_override);
      return {
        variables: {
          tournamentTitle: row.tournament_title,
          fixtureId: row.fixture_id,
          deadline: row.window_ends_at?.toISOString() ?? '',
        },
        fallback: {
          title: 'Матч скоро закроется',
          body: `Завершите игру до ${row.window_ends_at?.toISOString() ?? 'конца окна'}.`,
          url: '/?view=amateur&section=tournaments',
        },
        tag: `ultimate-hockey-tournament-deadline-${row.fixture_id}`,
        ...(templateOverride === null ? {} : { templateOverride }),
      };
    },
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
    await enqueueTargets(client, 'tournament.fixture_opened', tournamentFixtureOpenedTargets),
    await enqueueTargets(client, 'tournament.live_soon', tournamentLiveSoonTargets),
    await enqueueTargets(client, 'tournament.fixture_deadline', tournamentFixtureDeadlineTargets),
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
      ...(options.workerConcurrency !== undefined
        ? { concurrency: options.workerConcurrency }
        : {}),
    });
    mergeQueueEvents(events, queue.events);
  }

  return { enabled: true, events };
}
