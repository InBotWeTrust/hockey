import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Buffer } from 'node:buffer';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { DAILY_PERIOD_SPEED_PRESETS, GAME_CORE_VERSION, GOALIES, STICKS } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import { appendEvent } from '../duel/eventLog.js';
import { listGameSettings, saveGameSetting, type GameSettingDTO } from '../duel/gameSettings.js';
import { buildProfileProgress } from '../profile/summary.js';
import { deleteChannelPost, updateChannelPostContent } from '../chat/channel.js';
import { publishMessageDeleted, publishMessageUpdated } from '../chat/events.js';
import { DEFAULT_NEWS_CHANNEL_SLUG } from '../chat/service.js';
import { createMediaObjectKey, type ObjectStorageClient } from '../storage/objectStorage.js';
import { createMediaProxyUrl } from '../storage/mediaAccess.js';
import {
  listPushNotificationTemplates,
  mapPushNotificationTemplate,
  updatePushNotificationTemplate,
  type PushNotificationTemplatePatch,
} from '../push/templates.js';
import type { PushEventType } from '../push/preferences.js';
import { PUSH_QUEUE_PROCESSING_STALE_MS } from '../push/queue.js';

type UserRole = 'player' | 'admin';
type DisplaySource = 'custom' | 'telegram' | 'vk';
type FeedbackKind = 'review' | 'suggestion' | 'question';
type AdminDashboardPeriod = '7d' | '30d' | '90d' | '365d';
type PushDeliveryStatus = 'queued' | 'processing' | 'sent' | 'partial' | 'failed' | 'skipped';

interface AdminRoutesOptions {
  objectStorage?: ObjectStorageClient;
  mediaAccessSecret: string;
}

const uuid = z.string().uuid();

interface AdminSummaryRow {
  total_users: string;
  admin_users: string;
  total_shots: string | null;
  total_goals: string | null;
  active_daily: string;
  active_training: string;
  shots_24h: string;
  goals_24h: string;
  mismatches_24h: string;
}

interface AdminPushNotificationStatsRow {
  total_users: string;
  subscribed_users: string;
  chat_new_dialog_message_users: string;
  daily_game_users: string;
  training_available_users: string;
  duel_events_users: string;
  game_news_users: string;
}

interface AdminPushDeliveryOverviewRow {
  total_deliveries: number;
  queued: number;
  processing: number;
  sent: number;
  partial: number;
  failed: number;
  skipped: number;
  due_queued: number;
  stale_processing: number;
  subscription_count: number;
  subscription_sent_count: number;
  subscription_failed_count: number;
  clicked_delivery_count: number;
  click_count: number;
  failed_24h: number;
  partial_24h: number;
  sent_24h: number;
  skipped_24h: number;
  oldest_queued_at: Date | null;
  oldest_queued_age_seconds: number;
}

interface AdminPushDeliveryStatusRow {
  status: PushDeliveryStatus;
  count: number;
}

interface AdminPushDeliveryEventRow {
  event_type: PushEventType;
  total: number;
  queued: number;
  processing: number;
  sent: number;
  partial: number;
  failed: number;
  skipped: number;
  subscription_count: number;
  subscription_sent_count: number;
  subscription_failed_count: number;
  clicked_delivery_count: number;
  click_count: number;
  last_created_at: Date | null;
  last_updated_at: Date | null;
}

interface AdminPushDeliveryRecentRow {
  id: string;
  user_id: string;
  user_display_name: string | null;
  event_type: PushEventType;
  event_key: string;
  status: PushDeliveryStatus;
  attempt_count: number;
  subscription_count: number;
  sent_count: number;
  failed_count: number;
  click_count: number;
  clicked_at: Date | null;
  last_error_message: string | null;
  next_attempt_at: Date;
  created_at: Date;
  updated_at: Date;
}

type AdminPushMonitoringAlertSeverity = 'warning' | 'danger';

interface AdminPushMonitoringAlert {
  key: string;
  severity: AdminPushMonitoringAlertSeverity;
  title: string;
  body: string;
}

interface AdminDashboardCoreRow {
  total_users: string;
  admin_users: string;
  player_users: string;
  new_today: string;
  new_7d: string;
  new_30d: string;
  new_365d: string;
  active_today: string;
  active_yesterday: string;
  active_7d: string;
  active_30d: string;
  active_365d: string;
  new_period: string;
  active_period: string;
  activated_users: string;
  paid_users_total: string;
  paid_users_30d: string;
  paid_users_period: string;
  paid_payments_30d: string;
  paid_payments_period: string;
  revenue_today: string;
  revenue_30d: string;
  revenue_period: string;
  revenue_month: string;
  revenue_quarter: string;
  revenue_year: string;
  revenue_total: string;
  shots_today: string;
  goals_today: string;
  shots_7d: string;
  goals_7d: string;
  shots_30d: string;
  goals_30d: string;
  shots_period: string;
  goals_period: string;
  shots_total: string;
  goals_total: string;
  daily_players_30d: string;
  training_players_30d: string;
  daily_players_period: string;
  training_players_period: string;
  active_daily_pools: string;
  active_training_sessions: string;
  mismatches_30d: string;
  mismatches_period: string;
  messages_today: string;
  messages_7d: string;
  messages_30d: string;
  chat_users_30d: string;
  messages_period: string;
  chat_users_period: string;
  feedback_total: string;
  feedback_unread: string;
  inventory_items: string;
}

interface AdminDashboardEngagementRow {
  avg_daily_activity_span_minutes: string | null;
}

interface AdminDashboardSeriesRow {
  day: string;
  new_users: string;
  active_users: string;
  revenue_rub: string;
  shots: string;
  goals: string;
  messages: string;
}

interface AdminUserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  active_display_name: string;
  active_avatar_url: string | null;
  display_source: DisplaySource;
  role: UserRole;
  grip: 'left' | 'right';
  level: number;
  xp: number;
  timezone: string;
  created_at: Date;
  last_seen_at: Date | null;
  blocked_at: Date | null;
  blocked_by: string | null;
  blocked_by_display_name: string | null;
  lifetime_shots_total: number;
  lifetime_goals_total: number;
  accuracy: number;
  competition_level: 'beginner' | 'amateur' | 'professional';
  tg_id: string | null;
  vk_id: string | null;
  tg_first_name: string | null;
  tg_last_name: string | null;
  tg_avatar_url: string | null;
  tg_username: string | null;
  vk_first_name: string | null;
  vk_last_name: string | null;
  vk_avatar_url: string | null;
  vk_username: string | null;
  shots_current: number;
  shots_max: number;
  shots_bonus: number;
  pucks: string;
  gold_pucks: string;
  wheel_spins: number;
  training_energy: number;
  push_subscription_count: string;
  push_chat_new_dialog_message: boolean;
  push_daily_game: boolean;
  push_training_available: boolean;
  push_duel_events: boolean;
  push_game_news: boolean;
  total_count?: string;
}

interface AdminShotModeRow {
  mode: string;
  shots: string;
  goals: string;
  last_shot_at: Date | null;
}

interface AdminEventRow {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date;
}

interface AdminMismatchRow {
  id: string;
  user_id: string;
  user_display_name: string;
  user_avatar_url: string | null;
  created_at: Date;
  mode: string;
  session_id: string | null;
  shot_session_id: string | null;
  period_number: number | null;
  shot_index: number | null;
  claimed_result: string | null;
  server_result: string | null;
  game_core_version: number | null;
  payload: unknown;
}

interface AdminMismatchSummaryRow {
  total: string;
  period_total: string;
  last_24h: string;
  users_affected: string;
}

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled';

interface AdminPaymentRow {
  id: string;
  user_id: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  inventory_item_id: string | null;
  title: string;
  amount_rub: number;
  status: PaymentStatus;
  provider: string;
  provider_payment_id: string | null;
  created_at: Date;
  paid_at: Date | null;
  total_count?: string;
}

interface AdminPaymentAnalyticsRow {
  month_revenue: string;
  quarter_revenue: string;
  year_revenue: string;
  month_count: string;
  quarter_count: string;
  year_count: string;
}

interface AdminInventoryItemRow {
  id: string;
  photo_url: string;
  title: string;
  description: string;
  price_rub: number;
  item_kind: 'bundle' | 'stick' | 'skates' | 'nutrition' | 'consumable';
  currency_price: number;
  charges_per_purchase: number;
  duel_period_cost: number;
  effect_puck_speed_delta: number;
  effect_shooter_frequency_delta: number;
  effect_goalie_frequency_delta: number;
  effect_goal_frequency_delta: number;
  effect_shot_zone_multiplier: number;
  created_at: Date;
  updated_at: Date;
  payments_count?: string;
  paid_revenue?: string;
}

interface AdminFeedbackRow {
  id: string;
  user_id: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  kind: FeedbackKind;
  rating: number | null;
  message: string;
  is_read: boolean;
  read_at: Date | null;
  read_by: string | null;
  read_by_display_name: string | null;
  created_at: Date;
  total_count?: string;
}

interface AdminFeedbackRatingStatsRow {
  rating_count: string;
  rating_average: string | null;
}

interface AdminChannelRow {
  id: string;
  name: string | null;
  description: string | null;
  channel_slug: string | null;
  avatar_url: string | null;
  created_at: Date;
}

interface AdminChannelSummaryRow {
  total_users: string;
  posts: string;
  comments: string;
  reactions: string;
  likes: string;
  view_events: string;
  views: string;
  engaged_users: string;
}

interface AdminChannelPeriodRow {
  period_start: Date;
  posts: string;
  comments: string;
  commenters: string;
  reactions: string;
  reactors: string;
  likes: string;
  view_events: string;
  views: string;
  viewers: string;
  engaged_users: string;
}

interface AdminChannelPostRow {
  id: string;
  chat_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  comment_count: string;
  commenter_count: string;
  reaction_count: string;
  reaction_user_count: string;
  like_count: string;
  view_count: string;
  viewer_count: string;
  reactions: Array<{ emoji: string; count: number | string }> | null;
}

const listUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  role: z.enum(['all', 'player', 'admin']).default('all'),
  level: z.enum(['all', 'beginner', 'amateur', 'professional']).default('all'),
  sort: z
    .enum(['name_asc', 'name_desc', 'goals_asc', 'goals_desc', 'accuracy_asc', 'accuracy_desc'])
    .default('name_asc'),
  minGoals: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  minAccuracy: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const userPatchSchema = z
  .object({
    role: z.enum(['player', 'admin']).optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    grip: z.enum(['left', 'right']).optional(),
    level: z.number().int().min(1).max(999).optional(),
    xp: z.number().int().min(0).max(2_147_483_647).optional(),
    lifetimeShotsTotal: z.number().int().min(0).max(2_147_483_647).optional(),
    lifetimeGoalsTotal: z.number().int().min(0).max(2_147_483_647).optional(),
    isBlocked: z.boolean().optional(),
    wallet: z
      .object({
        shotsCurrent: z.number().int().min(0).max(100_000).optional(),
        shotsMax: z.number().int().min(1).max(100_000).optional(),
        shotsBonus: z.number().int().min(0).max(100_000).optional(),
        pucks: z.number().int().min(0).max(9_000_000_000).optional(),
        goldPucks: z.number().int().min(0).max(9_000_000_000).optional(),
        wheelSpins: z.number().int().min(0).max(100_000).optional(),
        trainingEnergy: z.number().int().min(0).max(100_000).optional(),
      })
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.role !== undefined ||
      value.displayName !== undefined ||
      value.grip !== undefined ||
      value.level !== undefined ||
      value.xp !== undefined ||
      value.lifetimeShotsTotal !== undefined ||
      value.lifetimeGoalsTotal !== undefined ||
      value.isBlocked !== undefined ||
      (value.wallet !== undefined && Object.keys(value.wallet).length > 0),
    'no changes',
  );

const settingPatchSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const listPaymentsQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['all', 'pending', 'paid', 'failed', 'refunded', 'canceled']).default('all'),
  sort: z
    .enum(['created_desc', 'created_asc', 'amount_desc', 'amount_asc', 'user_asc', 'user_desc'])
    .default('created_desc'),
  minAmount: z.coerce.number().int().min(0).max(9_000_000_000).optional(),
  maxAmount: z.coerce.number().int().min(0).max(9_000_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const listFeedbackQuerySchema = z.object({
  kind: z.enum(['all', 'review', 'suggestion', 'question']).default('all'),
  status: z.enum(['all', 'unread', 'read']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const channelPeriodQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});

const dashboardPeriodQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', '365d']).default('30d'),
});

const mismatchQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', '365d']).default('30d'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const pushEventTypeSchema = z.enum([
  'chat.new_dialog_message',
  'daily.available',
  'daily.unlocked_after_training',
  'daily.period_ending',
  'daily.break_finished',
  'training.available',
  'duel.challenge_received',
  'duel.result_ready',
  'news.posted',
]);

const pushDeliveryStatuses = [
  'queued',
  'processing',
  'sent',
  'partial',
  'failed',
  'skipped',
] as const satisfies readonly PushDeliveryStatus[];

const PUSH_ALERT_OLDEST_QUEUED_SECONDS = 15 * 60;
const PUSH_ALERT_FAILED_24H = 10;
const PUSH_ALERT_FAILURE_RATE_PERCENT = 20;
const PUSH_ALERT_FAILURE_RATE_MIN_FINALIZED_24H = 20;

const feedbackPatchSchema = z
  .object({
    isRead: z.boolean(),
  })
  .strict();

const pushNotificationTemplatePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    body: z.string().trim().min(1).max(240).optional(),
    trigger: z.string().trim().min(1).max(500).optional(),
    clickUrl: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^\/(?!\/)/)
      .optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.trigger !== undefined ||
      value.clickUrl !== undefined ||
      value.isEnabled !== undefined,
    'no changes',
  );

const inventoryPhotoUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || value.startsWith('/') || z.string().url().safeParse(value).success,
    'invalid photo url',
  );

const inventoryItemBodySchema = z
  .object({
    photoUrl: inventoryPhotoUrlSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    priceRub: z.number().int().min(0).max(9_000_000_000).optional(),
  })
  .strict();

const createInventoryItemSchema = inventoryItemBodySchema.extend({
  title: z.string().trim().min(1).max(120),
  photoUrl: inventoryPhotoUrlSchema.default(''),
  description: z.string().trim().max(1000).default(''),
  priceRub: z.number().int().min(0).max(9_000_000_000),
});

const updateInventoryItemSchema = inventoryItemBodySchema.refine(
  (value) =>
    value.photoUrl !== undefined ||
    value.title !== undefined ||
    value.description !== undefined ||
    value.priceRub !== undefined,
  'no changes',
);

const channelPostPatchSchema = z
  .object({
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

const chatProfilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, 'no changes');

async function withTransaction<T>(
  app: { pg: { connect: () => Promise<PoolClient> } },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count * 1000) / total) / 10 : 0;
}

function ratioPercent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator * 1000) / denominator) / 10 : 0;
}

function mapPushNotificationStats(row: AdminPushNotificationStatsRow) {
  const totalUsers = Number(row.total_users);
  const subscribedUsers = Number(row.subscribed_users);
  const chatNewDialogMessage = Number(row.chat_new_dialog_message_users);
  const dailyGame = Number(row.daily_game_users);
  const trainingAvailable = Number(row.training_available_users);
  const duelEvents = Number(row.duel_events_users);
  const gameNews = Number(row.game_news_users);
  return {
    totalUsers,
    subscribed: {
      count: subscribedUsers,
      percent: percent(subscribedUsers, totalUsers),
    },
    types: {
      chatNewDialogMessage: {
        count: chatNewDialogMessage,
        percent: percent(chatNewDialogMessage, totalUsers),
      },
      dailyGame: {
        count: dailyGame,
        percent: percent(dailyGame, totalUsers),
      },
      trainingAvailable: {
        count: trainingAvailable,
        percent: percent(trainingAvailable, totalUsers),
      },
      duelEvents: {
        count: duelEvents,
        percent: percent(duelEvents, totalUsers),
      },
      gameNews: {
        count: gameNews,
        percent: percent(gameNews, totalUsers),
      },
    },
  };
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function deliveryClickRate(clicked: number, delivered: number): number {
  return ratioPercent(clicked, delivered);
}

function buildPushMonitoringAlerts(
  overview: AdminPushDeliveryOverviewRow,
): AdminPushMonitoringAlert[] {
  const alerts: AdminPushMonitoringAlert[] = [];
  if (overview.stale_processing > 0) {
    alerts.push({
      key: 'stale_processing',
      severity: 'danger',
      title: 'Есть зависшие доставки',
      body: `${overview.stale_processing} доставок в processing дольше таймаута worker-а.`,
    });
  }
  if (
    overview.due_queued > 0 &&
    overview.oldest_queued_age_seconds >= PUSH_ALERT_OLDEST_QUEUED_SECONDS
  ) {
    alerts.push({
      key: 'queue_delayed',
      severity: 'warning',
      title: 'Очередь копится',
      body: `${overview.due_queued} доставок ждут отправки, старейшая в очереди ${Math.ceil(
        overview.oldest_queued_age_seconds / 60,
      )} мин.`,
    });
  }
  if (overview.failed_24h >= PUSH_ALERT_FAILED_24H) {
    alerts.push({
      key: 'failed_24h',
      severity: 'warning',
      title: 'Много ошибок за сутки',
      body: `${overview.failed_24h} доставок завершились ошибкой за последние 24 часа.`,
    });
  }

  const finalized24h =
    overview.sent_24h + overview.partial_24h + overview.failed_24h + overview.skipped_24h;
  const failedOrPartial24h = overview.failed_24h + overview.partial_24h;
  const failureRate = ratioPercent(failedOrPartial24h, finalized24h);
  if (
    finalized24h >= PUSH_ALERT_FAILURE_RATE_MIN_FINALIZED_24H &&
    failureRate >= PUSH_ALERT_FAILURE_RATE_PERCENT
  ) {
    alerts.push({
      key: 'failure_rate_24h',
      severity: 'danger',
      title: 'Высокий процент ошибок',
      body: `${failureRate}% финализированных доставок за 24 часа завершились ошибкой или частично.`,
    });
  }

  return alerts;
}

async function fetchAdminPushMonitoring(client: Pool | PoolClient) {
  const [overviewResult, statusResult, eventResult, recentResult] = await Promise.all([
    client.query<AdminPushDeliveryOverviewRow>(
      `select count(*)::int as total_deliveries,
              count(*) filter (where status = 'queued')::int as queued,
              count(*) filter (where status = 'processing')::int as processing,
              count(*) filter (where status = 'sent')::int as sent,
              count(*) filter (where status = 'partial')::int as partial,
              count(*) filter (where status = 'failed')::int as failed,
              count(*) filter (where status = 'skipped')::int as skipped,
              count(*) filter (
                where status = 'queued'
                  and next_attempt_at <= now()
              )::int as due_queued,
              count(*) filter (
                where status = 'processing'
                  and updated_at < now() - ($1::bigint * interval '1 millisecond')
              )::int as stale_processing,
              coalesce(sum(subscription_count), 0)::int as subscription_count,
              coalesce(sum(sent_count), 0)::int as subscription_sent_count,
              coalesce(sum(failed_count), 0)::int as subscription_failed_count,
              count(*) filter (where click_count > 0)::int as clicked_delivery_count,
              coalesce(sum(click_count), 0)::int as click_count,
              count(*) filter (
                where status = 'failed'
                  and updated_at >= now() - interval '24 hours'
              )::int as failed_24h,
              count(*) filter (
                where status = 'partial'
                  and updated_at >= now() - interval '24 hours'
              )::int as partial_24h,
              count(*) filter (
                where status = 'sent'
                  and updated_at >= now() - interval '24 hours'
              )::int as sent_24h,
              count(*) filter (
                where status = 'skipped'
                  and updated_at >= now() - interval '24 hours'
              )::int as skipped_24h,
              min(created_at) filter (where status = 'queued') as oldest_queued_at,
              coalesce(
                extract(
                  epoch from (now() - min(created_at) filter (where status = 'queued'))
                )::int,
                0
              ) as oldest_queued_age_seconds
         from push_delivery_log`,
      [PUSH_QUEUE_PROCESSING_STALE_MS],
    ),
    client.query<AdminPushDeliveryStatusRow>(
      `select status::text as status,
              count(*)::int as count
         from push_delivery_log
        group by status`,
    ),
    client.query<AdminPushDeliveryEventRow>(
      `select event_type,
              count(*)::int as total,
              count(*) filter (where status = 'queued')::int as queued,
              count(*) filter (where status = 'processing')::int as processing,
              count(*) filter (where status = 'sent')::int as sent,
              count(*) filter (where status = 'partial')::int as partial,
              count(*) filter (where status = 'failed')::int as failed,
              count(*) filter (where status = 'skipped')::int as skipped,
              coalesce(sum(subscription_count), 0)::int as subscription_count,
              coalesce(sum(sent_count), 0)::int as subscription_sent_count,
              coalesce(sum(failed_count), 0)::int as subscription_failed_count,
              count(*) filter (where click_count > 0)::int as clicked_delivery_count,
              coalesce(sum(click_count), 0)::int as click_count,
              max(created_at) as last_created_at,
              max(updated_at) as last_updated_at
         from push_delivery_log
        group by event_type
        order by max(updated_at) desc nulls last, event_type asc`,
    ),
    client.query<AdminPushDeliveryRecentRow>(
      `select pdl.id::text,
              pdl.user_id::text,
              u.display_name as user_display_name,
              pdl.event_type,
              pdl.event_key,
              pdl.status::text as status,
              pdl.attempt_count,
              pdl.subscription_count,
              pdl.sent_count,
              pdl.failed_count,
              pdl.click_count,
              pdl.clicked_at,
              pdl.last_error_message,
              pdl.next_attempt_at,
              pdl.created_at,
              pdl.updated_at
         from push_delivery_log pdl
         left join users u on u.id = pdl.user_id
        order by pdl.updated_at desc, pdl.created_at desc
        limit 50`,
    ),
  ]);

  const overview = overviewResult.rows[0] ?? {
    total_deliveries: 0,
    queued: 0,
    processing: 0,
    sent: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
    due_queued: 0,
    stale_processing: 0,
    subscription_count: 0,
    subscription_sent_count: 0,
    subscription_failed_count: 0,
    clicked_delivery_count: 0,
    click_count: 0,
    failed_24h: 0,
    partial_24h: 0,
    sent_24h: 0,
    skipped_24h: 0,
    oldest_queued_at: null,
    oldest_queued_age_seconds: 0,
  };
  const deliveredDeliveries = overview.sent + overview.partial;
  const byStatus = new Map(statusResult.rows.map((row) => [row.status, row.count]));

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalDeliveries: overview.total_deliveries,
      queued: overview.queued,
      processing: overview.processing,
      sent: overview.sent,
      partial: overview.partial,
      failed: overview.failed,
      skipped: overview.skipped,
      dueQueued: overview.due_queued,
      staleProcessing: overview.stale_processing,
      subscriptionCount: overview.subscription_count,
      subscriptionSentCount: overview.subscription_sent_count,
      subscriptionFailedCount: overview.subscription_failed_count,
      clickedDeliveryCount: overview.clicked_delivery_count,
      clickCount: overview.click_count,
      failed24h: overview.failed_24h,
      partial24h: overview.partial_24h,
      sent24h: overview.sent_24h,
      skipped24h: overview.skipped_24h,
      deliveryClickRate: deliveryClickRate(overview.clicked_delivery_count, deliveredDeliveries),
      subscriptionClickRate: deliveryClickRate(
        overview.click_count,
        overview.subscription_sent_count,
      ),
      oldestQueuedAt: isoOrNull(overview.oldest_queued_at),
      oldestQueuedAgeSeconds: overview.oldest_queued_age_seconds,
    },
    alerts: buildPushMonitoringAlerts(overview),
    byStatus: pushDeliveryStatuses.map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    })),
    byEventType: eventResult.rows.map((row) => {
      const delivered = row.sent + row.partial;
      return {
        eventType: row.event_type,
        total: row.total,
        queued: row.queued,
        processing: row.processing,
        sent: row.sent,
        partial: row.partial,
        failed: row.failed,
        skipped: row.skipped,
        subscriptionCount: row.subscription_count,
        subscriptionSentCount: row.subscription_sent_count,
        subscriptionFailedCount: row.subscription_failed_count,
        clickedDeliveryCount: row.clicked_delivery_count,
        clickCount: row.click_count,
        deliveryClickRate: deliveryClickRate(row.clicked_delivery_count, delivered),
        subscriptionClickRate: deliveryClickRate(row.click_count, row.subscription_sent_count),
        lastCreatedAt: isoOrNull(row.last_created_at),
        lastUpdatedAt: isoOrNull(row.last_updated_at),
      };
    }),
    recent: recentResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userDisplayName: row.user_display_name ?? 'Игрок',
      eventType: row.event_type,
      eventKey: row.event_key,
      status: row.status,
      attemptCount: row.attempt_count,
      subscriptionCount: row.subscription_count,
      sentCount: row.sent_count,
      failedCount: row.failed_count,
      clickCount: row.click_count,
      clickedAt: isoOrNull(row.clicked_at),
      lastErrorMessage: row.last_error_message,
      nextAttemptAt: row.next_attempt_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    })),
  };
}

function rubPerUser(revenue: number, users: number): number {
  return users > 0 ? Math.round(revenue / users) : 0;
}

function mapDashboard(
  period: AdminDashboardPeriod,
  periodDays: number,
  core: AdminDashboardCoreRow,
  engagement: AdminDashboardEngagementRow,
  series: AdminDashboardSeriesRow[],
  notifications: ReturnType<typeof mapPushNotificationStats>,
) {
  const totalUsers = Number(core.total_users);
  const active7d = Number(core.active_7d);
  const active30d = Number(core.active_30d);
  const activePeriod = Number(core.active_period);
  const revenue30d = Number(core.revenue_30d);
  const revenuePeriod = Number(core.revenue_period);
  const paidUsers30d = Number(core.paid_users_30d);
  const paidUsersPeriod = Number(core.paid_users_period);
  const paidUsersTotal = Number(core.paid_users_total);
  const shots30d = Number(core.shots_30d);
  const goals30d = Number(core.goals_30d);
  const shotsPeriod = Number(core.shots_period);
  const goalsPeriod = Number(core.goals_period);
  const activeToday = Number(core.active_today);
  return {
    period,
    periodDays,
    users: {
      total: totalUsers,
      admins: Number(core.admin_users),
      players: Number(core.player_users),
      newToday: Number(core.new_today),
      new7d: Number(core.new_7d),
      new30d: Number(core.new_30d),
      new365d: Number(core.new_365d),
      newInPeriod: Number(core.new_period),
      activeToday,
      activeYesterday: Number(core.active_yesterday),
      active7d,
      active30d,
      active365d: Number(core.active_365d),
      activeInPeriod: activePeriod,
      activated: {
        count: Number(core.activated_users),
        percent: ratioPercent(Number(core.activated_users), totalUsers),
      },
    },
    payments: {
      revenueTodayRub: Number(core.revenue_today),
      revenue30dRub: revenue30d,
      revenuePeriodRub: revenuePeriod,
      revenueMonthRub: Number(core.revenue_month),
      revenueQuarterRub: Number(core.revenue_quarter),
      revenueYearRub: Number(core.revenue_year),
      revenueTotalRub: Number(core.revenue_total),
      paidUsersTotal,
      paidUsers30d,
      paidUsersPeriod,
      paidPayments30d: Number(core.paid_payments_30d),
      paidPaymentsPeriod: Number(core.paid_payments_period),
      payerConversionPercent: ratioPercent(paidUsersTotal, totalUsers),
      arpu30dRub: rubPerUser(revenue30d, totalUsers),
      arppu30dRub: rubPerUser(revenue30d, paidUsers30d),
      arpuPeriodRub: rubPerUser(revenuePeriod, totalUsers),
      arppuPeriodRub: rubPerUser(revenuePeriod, paidUsersPeriod),
    },
    game: {
      shotsToday: Number(core.shots_today),
      goalsToday: Number(core.goals_today),
      shots7d: Number(core.shots_7d),
      goals7d: Number(core.goals_7d),
      shots30d,
      goals30d,
      shotsPeriod,
      goalsPeriod,
      shotsTotal: Number(core.shots_total),
      goalsTotal: Number(core.goals_total),
      accuracy30d: ratioPercent(goals30d, shots30d),
      accuracyPeriod: ratioPercent(goalsPeriod, shotsPeriod),
      dailyPlayers30d: Number(core.daily_players_30d),
      trainingPlayers30d: Number(core.training_players_30d),
      dailyPlayersPeriod: Number(core.daily_players_period),
      trainingPlayersPeriod: Number(core.training_players_period),
      activeDailyPools: Number(core.active_daily_pools),
      activeTrainingSessions: Number(core.active_training_sessions),
      mismatches30d: Number(core.mismatches_30d),
      mismatchesPeriod: Number(core.mismatches_period),
    },
    chat: {
      messagesToday: Number(core.messages_today),
      messages7d: Number(core.messages_7d),
      messages30d: Number(core.messages_30d),
      activeUsers30d: Number(core.chat_users_30d),
      messagesPeriod: Number(core.messages_period),
      activeUsersPeriod: Number(core.chat_users_period),
    },
    feedback: {
      total: Number(core.feedback_total),
      unread: Number(core.feedback_unread),
    },
    inventory: {
      activeItems: Number(core.inventory_items),
    },
    engagement: {
      avgDailyActivitySpanMinutes: Math.round(
        Number(engagement.avg_daily_activity_span_minutes ?? 0),
      ),
      dauWauPercent: ratioPercent(activeToday, active7d),
      wauMauPercent: ratioPercent(active7d, active30d),
    },
    notifications,
    series: series.map((point) => ({
      date: point.day,
      newUsers: Number(point.new_users),
      activeUsers: Number(point.active_users),
      revenueRub: Number(point.revenue_rub),
      shots: Number(point.shots),
      goals: Number(point.goals),
      messages: Number(point.messages),
    })),
  };
}

function mapUser(row: AdminUserRow) {
  const displaySource: DisplaySource =
    row.display_source === 'vk' || row.display_source === 'custom'
      ? row.display_source
      : 'telegram';
  const pushSubscriptionCount = Number(row.push_subscription_count);
  return {
    id: row.id,
    displayName: row.active_display_name,
    avatarUrl: row.active_avatar_url,
    displaySource,
    role: row.role,
    grip: row.grip,
    level: row.level,
    xp: row.xp,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    isBlocked: row.blocked_at !== null,
    blockedAt: row.blocked_at?.toISOString() ?? null,
    blockedBy: row.blocked_by,
    blockedByDisplayName: row.blocked_by_display_name,
    lifetimeShotsTotal: row.lifetime_shots_total,
    lifetimeGoalsTotal: row.lifetime_goals_total,
    accuracy: row.accuracy,
    competitionLevel: row.competition_level,
    identities: [
      {
        source: 'custom',
        label: 'Кастом',
        displayName: row.display_name || 'Player',
        avatarUrl: row.avatar_url,
        id: row.id,
        username: null,
        linked: true,
        active: displaySource === 'custom',
      },
      {
        source: 'telegram',
        label: 'TG',
        displayName:
          [row.tg_first_name, row.tg_last_name].filter(Boolean).join(' ') ||
          row.tg_username ||
          'Telegram',
        avatarUrl: row.tg_avatar_url,
        id: row.tg_id,
        username: row.tg_username,
        linked: row.tg_id !== null,
        active: displaySource === 'telegram',
      },
      {
        source: 'vk',
        label: 'VK',
        displayName:
          [row.vk_first_name, row.vk_last_name].filter(Boolean).join(' ') ||
          row.vk_username ||
          'VK',
        avatarUrl: row.vk_avatar_url,
        id: row.vk_id,
        username: row.vk_username,
        linked: row.vk_id !== null,
        active: displaySource === 'vk',
      },
    ],
    providers: {
      telegram: row.tg_id !== null ? { id: row.tg_id, username: row.tg_username } : null,
      vk: row.vk_id !== null ? { id: row.vk_id, username: row.vk_username } : null,
    },
    wallet: {
      shotsCurrent: row.shots_current,
      shotsMax: row.shots_max,
      shotsBonus: row.shots_bonus,
      pucks: Number(row.pucks),
      goldPucks: Number(row.gold_pucks),
      wheelSpins: row.wheel_spins,
      trainingEnergy: row.training_energy,
    },
    pushNotifications: {
      subscribed: pushSubscriptionCount > 0,
      subscriptionCount: pushSubscriptionCount,
      types: {
        chatNewDialogMessage: row.push_chat_new_dialog_message,
        dailyGame: row.push_daily_game,
        trainingAvailable: row.push_training_available,
        duelEvents: row.push_duel_events,
        gameNews: row.push_game_news,
      },
    },
  };
}

function mapPayment(row: AdminPaymentRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.user_display_name ?? 'Удалённый игрок',
    userAvatarUrl: row.user_avatar_url,
    inventoryItemId: row.inventory_item_id,
    title: row.title,
    amountRub: row.amount_rub,
    status: row.status,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    createdAt: row.created_at.toISOString(),
    paidAt: row.paid_at?.toISOString() ?? null,
  };
}

function mapInventoryItem(row: AdminInventoryItemRow) {
  return {
    id: row.id,
    photoUrl: row.photo_url,
    title: row.title,
    description: row.description,
    priceRub: row.price_rub,
    itemKind: row.item_kind,
    currencyPrice: row.currency_price,
    chargesPerPurchase: row.charges_per_purchase,
    duelPeriodCost: row.duel_period_cost,
    effectPuckSpeedDelta: row.effect_puck_speed_delta,
    effectShooterFrequencyDelta: row.effect_shooter_frequency_delta,
    effectGoalieFrequencyDelta: row.effect_goalie_frequency_delta,
    effectGoalFrequencyDelta: row.effect_goal_frequency_delta,
    effectShotZoneMultiplier: row.effect_shot_zone_multiplier,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    paymentsCount: Number(row.payments_count ?? 0),
    paidRevenueRub: Number(row.paid_revenue ?? 0),
  };
}

function mapFeedback(row: AdminFeedbackRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.user_display_name ?? 'Удалённый игрок',
    userAvatarUrl: row.user_avatar_url,
    kind: row.kind,
    rating: row.rating,
    message: row.message,
    isRead: row.is_read,
    readAt: row.read_at?.toISOString() ?? null,
    readBy: row.read_by,
    readByDisplayName: row.read_by_display_name,
    createdAt: row.created_at.toISOString(),
  };
}

function channelPeriodInterval(period: '7d' | '30d' | '90d'): string {
  return (
    {
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days',
    } satisfies Record<'7d' | '30d' | '90d', string>
  )[period];
}

const adminChatAvatarContentTypes = new Set(['image/webp']);
const adminChatAvatarMaxBytes = 2 * 1024 * 1024;

function normalizeUploadContentType(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function assertAdminChatAvatarBody(body: unknown, contentType: string): Buffer {
  if (!adminChatAvatarContentTypes.has(contentType)) {
    throw new AppError('unsupported_media_type', 'chat avatar must be webp', 415);
  }
  if (!(body instanceof Buffer) || body.byteLength === 0) {
    throw new AppError('bad_request', 'empty upload body', 400);
  }
  if (body.byteLength > adminChatAvatarMaxBytes) {
    throw new AppError('payload_too_large', 'chat avatar is too large', 413);
  }
  return body;
}

function dashboardPeriodDays(period: AdminDashboardPeriod): number {
  return (
    {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '365d': 365,
    } satisfies Record<AdminDashboardPeriod, number>
  )[period];
}

function engagementRate(engagedUsers: number, totalUsers: number): number {
  if (totalUsers <= 0) return 0;
  return Math.round((engagedUsers * 10_000) / totalUsers) / 100;
}

function mapChannelPost(row: AdminChannelPostRow) {
  return {
    id: row.id,
    chatId: row.chat_id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    comments: Number(row.comment_count),
    commenters: Number(row.commenter_count),
    reactionsCount: Number(row.reaction_count),
    reactionUsers: Number(row.reaction_user_count),
    likes: Number(row.like_count),
    views: Number(row.view_count),
    viewers: Number(row.viewer_count),
    reactions: (row.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      count: Number(reaction.count),
    })),
  };
}

async function requireAdmin(app: Parameters<FastifyPluginAsync>[0], req: FastifyRequest) {
  const { rows } = await app.pg.query<{ role: UserRole }>('select role from users where id = $1', [
    req.user.id,
  ]);
  if (rows[0]?.role !== 'admin') {
    throw new AppError('forbidden', 'admin role required', 403);
  }
}

async function fetchPushNotificationStats(
  client: Pool | PoolClient,
): Promise<AdminPushNotificationStatsRow> {
  const { rows } = await client.query<AdminPushNotificationStatsRow>(
    `with subscribed as (
       select user_id, count(*)::int as subscription_count
         from push_subscriptions
        group by user_id
     ),
     prepared as (
       select u.id,
              coalesce(s.subscription_count, 0) > 0 as is_subscribed,
              coalesce(s.subscription_count, 0) > 0
                and coalesce(pref.chat_new_dialog_message, true) as chat_new_dialog_message,
              coalesce(s.subscription_count, 0) > 0
                and coalesce(pref.daily_game, true) as daily_game,
              coalesce(s.subscription_count, 0) > 0
                and coalesce(pref.training_available, true) as training_available,
              coalesce(s.subscription_count, 0) > 0
                and coalesce(pref.duel_events, true) as duel_events,
              coalesce(s.subscription_count, 0) > 0
                and coalesce(pref.game_news, true) as game_news
         from users u
         left join subscribed s on s.user_id = u.id
         left join user_push_preferences pref on pref.user_id = u.id
     )
     select count(*)::int as total_users,
            count(*) filter (where is_subscribed)::int as subscribed_users,
            count(*) filter (where chat_new_dialog_message)::int as chat_new_dialog_message_users,
            count(*) filter (where daily_game)::int as daily_game_users,
            count(*) filter (where training_available)::int as training_available_users,
            count(*) filter (where duel_events)::int as duel_events_users,
            count(*) filter (where game_news)::int as game_news_users
       from prepared`,
  );
  return (
    rows[0] ?? {
      total_users: '0',
      subscribed_users: '0',
      chat_new_dialog_message_users: '0',
      daily_game_users: '0',
      training_available_users: '0',
      duel_events_users: '0',
      game_news_users: '0',
    }
  );
}

async function fetchAdminDashboardCore(
  client: Pool | PoolClient,
  periodDays: number,
): Promise<AdminDashboardCoreRow> {
  const { rows } = await client.query<AdminDashboardCoreRow>(
    `select
       (select count(*) from users)::int as total_users,
       (select count(*) from users where role = 'admin')::int as admin_users,
       (select count(*) from users where role = 'player')::int as player_users,
       (select count(*) from users where created_at >= date_trunc('day', now()))::int as new_today,
       (select count(*) from users where created_at >= now() - interval '7 days')::int as new_7d,
       (select count(*) from users where created_at >= now() - interval '30 days')::int as new_30d,
       (select count(*) from users where created_at >= now() - interval '365 days')::int as new_365d,
       (select count(*) from users where last_seen_at >= date_trunc('day', now()))::int as active_today,
       (select count(*) from users
         where last_seen_at >= date_trunc('day', now()) - interval '1 day'
           and last_seen_at < date_trunc('day', now()))::int as active_yesterday,
       (select count(*) from users where last_seen_at >= now() - interval '7 days')::int as active_7d,
       (select count(*) from users where last_seen_at >= now() - interval '30 days')::int as active_30d,
       (select count(*) from users where last_seen_at >= now() - interval '365 days')::int as active_365d,
       (select count(*) from users
         where created_at >= now() - ($1::int * interval '1 day'))::int as new_period,
       (select count(*) from users
         where last_seen_at >= now() - ($1::int * interval '1 day'))::int as active_period,
       (select count(distinct user_id) from shot_session)::int as activated_users,
       (select count(distinct user_id) from payments where status = 'paid')::int as paid_users_total,
       (select count(distinct user_id) from payments
         where status = 'paid'
           and user_id is not null
           and coalesce(paid_at, created_at) >= now() - interval '30 days')::int as paid_users_30d,
       (select count(distinct user_id) from payments
         where status = 'paid'
           and user_id is not null
           and coalesce(paid_at, created_at) >= now() - ($1::int * interval '1 day'))::int as paid_users_period,
       (select count(*) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= now() - interval '30 days')::int as paid_payments_30d,
       (select count(*) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= now() - ($1::int * interval '1 day'))::int as paid_payments_period,
       (select coalesce(sum(amount_rub), 0) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= date_trunc('day', now()))::int as revenue_today,
       (select coalesce(sum(amount_rub), 0) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= now() - interval '30 days')::int as revenue_30d,
       (select coalesce(sum(amount_rub), 0) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= now() - ($1::int * interval '1 day'))::int as revenue_period,
       (select coalesce(sum(amount_rub), 0) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= date_trunc('month', now()))::int as revenue_month,
       (select coalesce(sum(amount_rub), 0) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= date_trunc('quarter', now()))::int as revenue_quarter,
       (select coalesce(sum(amount_rub), 0) from payments
         where status = 'paid'
           and coalesce(paid_at, created_at) >= date_trunc('year', now()))::int as revenue_year,
       (select coalesce(sum(amount_rub), 0) from payments where status = 'paid')::int as revenue_total,
       (select count(*) from shot_session where created_at >= date_trunc('day', now()))::int as shots_today,
       (select count(*) from shot_session
         where created_at >= date_trunc('day', now()) and server_result = 'goal')::int as goals_today,
       (select count(*) from shot_session where created_at >= now() - interval '7 days')::int as shots_7d,
       (select count(*) from shot_session
         where created_at >= now() - interval '7 days' and server_result = 'goal')::int as goals_7d,
       (select count(*) from shot_session where created_at >= now() - interval '30 days')::int as shots_30d,
       (select count(*) from shot_session
         where created_at >= now() - interval '30 days' and server_result = 'goal')::int as goals_30d,
       (select count(*) from shot_session
         where created_at >= now() - ($1::int * interval '1 day'))::int as shots_period,
       (select count(*) from shot_session
         where created_at >= now() - ($1::int * interval '1 day') and server_result = 'goal')::int as goals_period,
       (select count(*) from shot_session)::int as shots_total,
       (select count(*) from shot_session where server_result = 'goal')::int as goals_total,
       (select count(distinct user_id) from shot_session
         where mode = 'daily' and created_at >= now() - interval '30 days')::int as daily_players_30d,
       (select count(distinct user_id) from shot_session
         where mode = 'training' and created_at >= now() - interval '30 days')::int as training_players_30d,
       (select count(distinct user_id) from shot_session
         where mode = 'daily' and created_at >= now() - ($1::int * interval '1 day'))::int as daily_players_period,
       (select count(distinct user_id) from shot_session
         where mode = 'training' and created_at >= now() - ($1::int * interval '1 day'))::int as training_players_period,
       (select count(*) from day_pool where state <> 'closed')::int as active_daily_pools,
       (select count(*) from training_session where state = 'active')::int as active_training_sessions,
       (select count(*) from event_log
         where type = 'shot_mismatch' and created_at >= now() - interval '30 days')::int as mismatches_30d,
       (select count(*) from event_log
         where type = 'shot_mismatch' and created_at >= now() - ($1::int * interval '1 day'))::int as mismatches_period,
       (select count(*) from messages
         where is_deleted = false and created_at >= date_trunc('day', now()))::int as messages_today,
       (select count(*) from messages
         where is_deleted = false and created_at >= now() - interval '7 days')::int as messages_7d,
       (select count(*) from messages
         where is_deleted = false and created_at >= now() - interval '30 days')::int as messages_30d,
       (select count(distinct sender_id) from messages
         where is_deleted = false and created_at >= now() - interval '30 days')::int as chat_users_30d,
       (select count(*) from messages
         where is_deleted = false and created_at >= now() - ($1::int * interval '1 day'))::int as messages_period,
       (select count(distinct sender_id) from messages
         where is_deleted = false and created_at >= now() - ($1::int * interval '1 day'))::int as chat_users_period,
       (select count(*) from feedback_messages)::int as feedback_total,
       (select count(*) from feedback_messages where is_read = false)::int as feedback_unread,
       (select count(*) from admin_inventory_items where deleted_at is null)::int as inventory_items`,
    [periodDays],
  );
  return rows[0]!;
}

async function fetchAdminDashboardEngagement(
  client: Pool | PoolClient,
  periodDays: number,
): Promise<AdminDashboardEngagementRow> {
  const { rows } = await client.query<AdminDashboardEngagementRow>(
    `with activity_events as (
       select id as user_id, created_at as occurred_at from users
       union all
       select id as user_id, last_seen_at as occurred_at from users where last_seen_at is not null
       union all
       select user_id, created_at as occurred_at from shot_session
       union all
       select sender_id as user_id, created_at as occurred_at from messages where is_deleted = false
       union all
       select user_id, created_at as occurred_at from payments where user_id is not null
       union all
       select user_id, created_at as occurred_at from feedback_messages where user_id is not null
     ),
     daily_activity as (
       select user_id,
              date_trunc('day', occurred_at) as day,
              min(occurred_at) as first_at,
              max(occurred_at) as last_at,
              count(*) as events_count
         from activity_events
        where occurred_at >= now() - ($1::int * interval '1 day')
        group by user_id, date_trunc('day', occurred_at)
       having count(*) >= 2
     )
     select coalesce(avg(extract(epoch from (last_at - first_at)) / 60), 0)
              as avg_daily_activity_span_minutes
       from daily_activity`,
    [periodDays],
  );
  return rows[0] ?? { avg_daily_activity_span_minutes: '0' };
}

async function fetchAdminDashboardSeries(
  client: Pool | PoolClient,
  periodDays: number,
): Promise<AdminDashboardSeriesRow[]> {
  const { rows } = await client.query<AdminDashboardSeriesRow>(
    `with days as (
       select generate_series(
         date_trunc('day', now()) - (($1::int - 1) * interval '1 day'),
         date_trunc('day', now()),
         interval '1 day'
       )::date as day
     ),
     activity_events as (
       select id as user_id, created_at as occurred_at from users
       union all
       select id as user_id, last_seen_at as occurred_at from users where last_seen_at is not null
       union all
       select user_id, created_at as occurred_at from shot_session
       union all
       select sender_id as user_id, created_at as occurred_at from messages where is_deleted = false
       union all
       select user_id, created_at as occurred_at from payments where user_id is not null
       union all
       select user_id, created_at as occurred_at from feedback_messages where user_id is not null
     ),
     active_users as (
       select occurred_at::date as day, count(distinct user_id)::int as value
         from activity_events
        where occurred_at >= date_trunc('day', now()) - (($1::int - 1) * interval '1 day')
        group by occurred_at::date
     ),
     new_users as (
       select created_at::date as day, count(*)::int as value
         from users
        where created_at >= date_trunc('day', now()) - (($1::int - 1) * interval '1 day')
        group by created_at::date
     ),
     revenue as (
       select coalesce(paid_at, created_at)::date as day,
              coalesce(sum(amount_rub), 0)::int as value
         from payments
        where status = 'paid'
          and coalesce(paid_at, created_at) >= date_trunc('day', now()) - (($1::int - 1) * interval '1 day')
        group by coalesce(paid_at, created_at)::date
     ),
     shots as (
       select created_at::date as day,
              count(*)::int as shots,
              count(*) filter (where server_result = 'goal')::int as goals
         from shot_session
        where created_at >= date_trunc('day', now()) - (($1::int - 1) * interval '1 day')
        group by created_at::date
     ),
     messages_series as (
       select created_at::date as day, count(*)::int as value
         from messages
        where is_deleted = false
          and created_at >= date_trunc('day', now()) - (($1::int - 1) * interval '1 day')
        group by created_at::date
     )
     select to_char(d.day, 'YYYY-MM-DD') as day,
            coalesce(nu.value, 0)::int as new_users,
            coalesce(au.value, 0)::int as active_users,
            coalesce(r.value, 0)::int as revenue_rub,
            coalesce(s.shots, 0)::int as shots,
            coalesce(s.goals, 0)::int as goals,
            coalesce(ms.value, 0)::int as messages
       from days d
       left join new_users nu on nu.day = d.day
       left join active_users au on au.day = d.day
       left join revenue r on r.day = d.day
       left join shots s on s.day = d.day
       left join messages_series ms on ms.day = d.day
      order by d.day asc`,
    [periodDays],
  );
  return rows;
}

async function fetchAdminMismatchSummary(
  client: Pool | PoolClient,
  periodDays: number,
): Promise<AdminMismatchSummaryRow> {
  const { rows } = await client.query<AdminMismatchSummaryRow>(
    `select count(*)::int as total,
            count(*) filter (
              where created_at >= now() - ($1::int * interval '1 day')
            )::int as period_total,
            count(*) filter (
              where created_at >= now() - interval '24 hours'
            )::int as last_24h,
            count(distinct user_id) filter (
              where created_at >= now() - ($1::int * interval '1 day')
            )::int as users_affected
       from event_log
      where type = 'shot_mismatch'`,
    [periodDays],
  );
  return rows[0] ?? { total: '0', period_total: '0', last_24h: '0', users_affected: '0' };
}

async function fetchAdminMismatchLogs(
  client: Pool | PoolClient,
  periodDays: number,
  limit: number,
): Promise<AdminMismatchRow[]> {
  const { rows } = await client.query<AdminMismatchRow>(
    `select e.id::text,
            e.user_id::text,
            case
              when u.display_source = 'vk' then
                coalesce(nullif(concat_ws(' ', u.vk_first_name, u.vk_last_name), ''), u.vk_username, 'Player')
              when u.display_source = 'telegram' then
                coalesce(nullif(concat_ws(' ', u.tg_first_name, u.tg_last_name), ''), u.tg_username, u.display_name, 'Player')
              else coalesce(u.display_name, 'Player')
            end as user_display_name,
            case
              when u.display_source = 'vk' then u.vk_avatar_url
              when u.display_source = 'telegram' then u.tg_avatar_url
              else u.avatar_url
            end as user_avatar_url,
            e.created_at,
            coalesce(
              e.payload->>'mode',
              s.mode,
              case when e.payload ? 'training_session_id' then 'training' else 'daily' end
            ) as mode,
            coalesce(
              e.payload->>'training_session_id',
              e.payload->>'day_pool_id',
              s.training_session_id::text,
              s.day_pool_id::text
            ) as session_id,
            s.id::text as shot_session_id,
            coalesce(nullif(e.payload->>'period_number', '')::int, s.period_number)::int
              as period_number,
            coalesce(nullif(e.payload->>'shot_index', '')::int, s.shot_index)::int
              as shot_index,
            coalesce(e.payload->>'claimed_result', e.payload->>'claimed') as claimed_result,
            coalesce(e.payload->>'server_result', e.payload->>'server', s.server_result)
              as server_result,
            s.game_core_version,
            e.payload
       from event_log e
       join users u on u.id = e.user_id
       left join lateral (
         select ss.id,
                ss.mode,
                ss.day_pool_id,
                ss.training_session_id,
                ss.period_number,
                ss.shot_index,
                ss.server_result,
                ss.game_core_version,
                ss.created_at
           from shot_session ss
          where ss.user_id = e.user_id
            and ss.shot_index = nullif(e.payload->>'shot_index', '')::int
            and (
              (e.payload ? 'day_pool_id' and ss.day_pool_id::text = e.payload->>'day_pool_id')
              or (
                e.payload ? 'training_session_id'
                and ss.training_session_id::text = e.payload->>'training_session_id'
              )
            )
          order by abs(extract(epoch from (ss.created_at - e.created_at))) asc
          limit 1
       ) s on true
      where e.type = 'shot_mismatch'
        and e.created_at >= now() - ($1::int * interval '1 day')
      order by e.created_at desc
      limit $2`,
    [periodDays, limit],
  );
  return rows;
}

async function fetchAdminUser(client: Pool | PoolClient, userId: string): Promise<AdminUserRow> {
  const { rows } = await client.query<AdminUserRow>(
    `select u.id, u.display_name, u.avatar_url, u.display_source,
            u.role, u.grip, u.level, u.xp,
            case
              when u.display_source = 'vk' then
                coalesce(nullif(concat_ws(' ', u.vk_first_name, u.vk_last_name), ''), u.vk_username, 'Player')
              when u.display_source = 'telegram' then
                coalesce(nullif(concat_ws(' ', u.tg_first_name, u.tg_last_name), ''), u.tg_username, 'Player')
              else coalesce(nullif(u.display_name, ''), 'Player')
            end as active_display_name,
            case
              when u.display_source = 'vk' then u.vk_avatar_url
              when u.display_source = 'telegram' then u.tg_avatar_url
              else u.avatar_url
            end as active_avatar_url,
            u.timezone, u.created_at, u.last_seen_at,
            u.blocked_at, u.blocked_by, blocker.display_name as blocked_by_display_name,
            u.lifetime_shots_total, u.lifetime_goals_total,
            case
              when u.lifetime_shots_total > 0
                then round(u.lifetime_goals_total::numeric * 100 / u.lifetime_shots_total)::int
              else 0
            end as accuracy,
            case
              when u.level >= 3 then 'professional'
              when u.level >= 2
                or u.lifetime_goals_total >= coalesce(
                  (select (value #>> '{}')::int
                     from game_settings
                    where key = 'amateur.unlock_goals_required'),
                  1000
                ) then 'amateur'
              else 'beginner'
            end as competition_level,
            tg.provider_uid as tg_id,
            vk.provider_uid as vk_id,
            u.tg_first_name,
            u.tg_last_name,
            u.tg_avatar_url,
            u.tg_username,
            u.vk_first_name,
            u.vk_last_name,
            u.vk_avatar_url,
            u.vk_username,
            coalesce(w.shots_current, 0) as shots_current,
            coalesce(w.shots_max, 25) as shots_max,
            coalesce(w.shots_bonus, 0) as shots_bonus,
            coalesce(w.pucks, 0) as pucks,
            coalesce(w.gold_pucks, 0) as gold_pucks,
            coalesce(w.wheel_spins, 0) as wheel_spins,
            coalesce(w.training_energy, 0) as training_energy,
            coalesce(push.subscription_count, 0) as push_subscription_count,
            coalesce(push.subscription_count, 0) > 0
              and coalesce(pref.chat_new_dialog_message, true) as push_chat_new_dialog_message,
            coalesce(push.subscription_count, 0) > 0
              and coalesce(pref.daily_game, true) as push_daily_game,
            coalesce(push.subscription_count, 0) > 0
              and coalesce(pref.training_available, true) as push_training_available,
            coalesce(push.subscription_count, 0) > 0
              and coalesce(pref.duel_events, true) as push_duel_events,
            coalesce(push.subscription_count, 0) > 0
              and coalesce(pref.game_news, true) as push_game_news
       from users u
       left join user_wallet w on w.user_id = u.id
       left join users blocker on blocker.id = u.blocked_by
       left join auth_providers tg
         on tg.user_id = u.id and tg.provider = 'telegram'
       left join auth_providers vk
         on vk.user_id = u.id and vk.provider = 'vk'
       left join (
         select user_id, count(*)::int as subscription_count
           from push_subscriptions
          group by user_id
       ) push on push.user_id = u.id
       left join user_push_preferences pref on pref.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'user not found', 404);
  return row;
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  values.push(value);
  assignments.push(`${column} = $${values.length}`);
}

async function fetchAdminFeedbackById(
  client: Pool | PoolClient,
  feedbackId: string,
): Promise<AdminFeedbackRow> {
  const { rows } = await client.query<AdminFeedbackRow>(
    `select f.id,
            f.user_id,
            case
              when u.display_source = 'vk' then
                coalesce(nullif(concat_ws(' ', u.vk_first_name, u.vk_last_name), ''), u.vk_username, u.display_name)
              when u.display_source = 'telegram' then
                coalesce(nullif(concat_ws(' ', u.tg_first_name, u.tg_last_name), ''), u.tg_username, u.display_name)
              else u.display_name
            end as user_display_name,
            case
              when u.display_source = 'vk' then u.vk_avatar_url
              when u.display_source = 'telegram' then u.tg_avatar_url
              else u.avatar_url
            end as user_avatar_url,
            f.kind,
            f.rating,
            f.message,
            f.is_read,
            f.read_at,
            f.read_by,
            reader.display_name as read_by_display_name,
            f.created_at
       from feedback_messages f
       left join users u on u.id = f.user_id
       left join users reader on reader.id = f.read_by
      where f.id = $1`,
    [feedbackId],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'feedback not found', 404);
  return row;
}

export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (app, opts) => {
  app.addContentTypeParser(
    /^image\/webp$/i,
    {
      parseAs: 'buffer',
      bodyLimit: adminChatAvatarMaxBytes,
    },
    (_req, body, done) => done(null, body),
  );

  const adminPreHandlers = [
    app.authenticate,
    async (req: FastifyRequest) => requireAdmin(app, req),
  ];

  app.get('/admin/summary', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = dashboardPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid dashboard query', 400);
    }
    const period = parsed.data.period;
    const periodDays = dashboardPeriodDays(period);

    const [summary, pushStats, dashboardCore, dashboardEngagement, dashboardSeries] =
      await Promise.all([
        app.pg.query<AdminSummaryRow>(
          `select
           (select count(*) from users) as total_users,
           (select count(*) from users where role = 'admin') as admin_users,
           (select coalesce(sum(lifetime_shots_total), 0) from users) as total_shots,
           (select coalesce(sum(lifetime_goals_total), 0) from users) as total_goals,
           (select count(*) from day_pool where state <> 'closed') as active_daily,
           (select count(*) from training_session where state = 'active') as active_training,
           (select count(*) from shot_session where created_at >= now() - interval '24 hours')
             as shots_24h,
           (select count(*) from shot_session
             where created_at >= now() - interval '24 hours' and server_result = 'goal')
             as goals_24h,
           (select count(*) from event_log
             where created_at >= now() - interval '24 hours' and type = 'shot_mismatch')
             as mismatches_24h`,
        ),
        fetchPushNotificationStats(app.pg),
        fetchAdminDashboardCore(app.pg, periodDays),
        fetchAdminDashboardEngagement(app.pg, periodDays),
        fetchAdminDashboardSeries(app.pg, periodDays),
      ]);
    const rows = summary.rows;
    const row = rows[0]!;
    const notifications = mapPushNotificationStats(pushStats);
    return {
      users: {
        total: Number(row.total_users),
        admins: Number(row.admin_users),
        notifications,
      },
      lifetime: {
        shots: Number(row.total_shots ?? 0),
        goals: Number(row.total_goals ?? 0),
      },
      active: {
        daily: Number(row.active_daily),
        training: Number(row.active_training),
      },
      last24h: {
        shots: Number(row.shots_24h),
        goals: Number(row.goals_24h),
        mismatches: Number(row.mismatches_24h),
      },
      dashboard: mapDashboard(
        period,
        periodDays,
        dashboardCore,
        dashboardEngagement,
        dashboardSeries,
        notifications,
      ),
      gameCoreVersion: GAME_CORE_VERSION,
    };
  });

  app.get('/admin/mismatches', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = mismatchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid mismatch query', 400);
    }
    const period = parsed.data.period;
    const periodDays = dashboardPeriodDays(period);
    const [summary, logs] = await Promise.all([
      fetchAdminMismatchSummary(app.pg, periodDays),
      fetchAdminMismatchLogs(app.pg, periodDays, parsed.data.limit),
    ]);
    return {
      period,
      periodDays,
      total: Number(summary.total),
      periodTotal: Number(summary.period_total),
      last24h: Number(summary.last_24h),
      usersAffected: Number(summary.users_affected),
      logs: logs.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userDisplayName: row.user_display_name,
        userAvatarUrl: row.user_avatar_url,
        createdAt: row.created_at.toISOString(),
        mode: row.mode,
        sessionId: row.session_id,
        shotSessionId: row.shot_session_id,
        periodNumber: row.period_number,
        shotIndex: row.shot_index,
        claimedResult: row.claimed_result,
        serverResult: row.server_result,
        gameCoreVersion: row.game_core_version,
        payload: row.payload,
      })),
    };
  });

  app.get('/admin/notifications', { preHandler: adminPreHandlers }, async () => {
    const templates = await listPushNotificationTemplates(app.pg);
    return { notifications: templates.map(mapPushNotificationTemplate) };
  });

  app.get('/admin/push-monitoring', { preHandler: adminPreHandlers }, async () => {
    return fetchAdminPushMonitoring(app.pg);
  });

  app.patch('/admin/notifications/:key', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ key: pushEventTypeSchema }).parse(req.params);
    const body = pushNotificationTemplatePatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid notification template patch', 400);
    }
    const patch: PushNotificationTemplatePatch = {};
    if (body.data.title !== undefined) patch.title = body.data.title;
    if (body.data.body !== undefined) patch.body = body.data.body;
    if (body.data.trigger !== undefined) patch.trigger = body.data.trigger;
    if (body.data.clickUrl !== undefined) patch.clickUrl = body.data.clickUrl;
    if (body.data.isEnabled !== undefined) patch.isEnabled = body.data.isEnabled;

    const updated = await updatePushNotificationTemplate(
      app.pg,
      params.key as PushEventType,
      patch,
      req.user.id,
    );
    if (updated === null) {
      throw new AppError('not_found', 'notification template not found', 404);
    }
    await appendEvent(app.pg, req.user.id, 'admin_push_notification_updated', {
      key: params.key,
      fields: Object.keys(body.data),
    });
    const templates = await listPushNotificationTemplates(app.pg);
    const template = templates.find((item) => item.key === params.key);
    return {
      notification: mapPushNotificationTemplate(template ?? updated),
    };
  });

  app.get('/admin/game-settings', { preHandler: adminPreHandlers }, async () => {
    const settings = await listGameSettings(app.pg);
    return {
      gameCoreVersion: GAME_CORE_VERSION,
      settings,
      balance: {
        goalies: GOALIES,
        sticks: STICKS,
        dailyPeriodSpeedPresets: DAILY_PERIOD_SPEED_PRESETS,
      },
    };
  });

  app.patch('/admin/game-settings/:key', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ key: z.string().min(1) }).parse(req.params);
    const body = settingPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid setting payload', 400);
    }

    let setting: GameSettingDTO;
    try {
      setting = await saveGameSetting(app.pg, params.key, body.data.value, req.user.id);
    } catch (err) {
      throw new AppError(
        'bad_request',
        err instanceof Error ? err.message : 'invalid game setting',
        400,
      );
    }
    await appendEvent(app.pg, req.user.id, 'admin_game_setting_updated', {
      key: params.key,
      value: setting.value,
    });
    return setting;
  });

  app.get('/admin/channel/news', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = channelPeriodQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid channel query', 400);
    }
    const interval = channelPeriodInterval(parsed.data.period);

    const channel = await app.pg.query<AdminChannelRow>(
      `select id, name, description, channel_slug, avatar_url, created_at
         from chats
        where type = 'channel'
          and channel_slug = $1
          and is_active = true
        limit 1`,
      [DEFAULT_NEWS_CHANNEL_SLUG],
    );
    const channelRow = channel.rows[0] ?? null;
    const mainChat = await app.pg.query<AdminChannelRow>(
      `select id, name, description, channel_slug, avatar_url, created_at
        from chats
       where type = 'system'
          and is_active = true
        order by created_at asc
        limit 1`,
    );
    const mainChatRow = mainChat.rows[0] ?? null;
    if (channelRow === null) {
      return {
        channel: null,
        mainChat:
          mainChatRow === null
            ? null
            : {
                id: mainChatRow.id,
                name: mainChatRow.name,
                description: mainChatRow.description,
                avatarUrl: mainChatRow.avatar_url,
                createdAt: mainChatRow.created_at.toISOString(),
              },
        period: parsed.data.period,
        summary: {
          totalUsers: 0,
          posts: 0,
          comments: 0,
          reactions: 0,
          likes: 0,
          viewEvents: 0,
          views: 0,
          engagedUsers: 0,
          engagementRate: 0,
        },
        periods: [],
        posts: [],
      };
    }

    const [summary, periods, posts] = await Promise.all([
      app.pg.query<AdminChannelSummaryRow>(
        `with bounds as (
           select now() - $2::interval as since
         ),
         channel_posts as (
           select m.id
             from messages m
            where m.chat_id = $1
              and m.is_deleted = false
         ),
         engaged as (
           select v.user_id
             from channel_post_views v
             join channel_posts p on p.id = v.post_message_id
             join bounds b on v.last_viewed_at >= b.since
           union
           select c.author_id as user_id
             from channel_post_comments c
             join channel_posts p on p.id = c.post_message_id
             join bounds b on c.created_at >= b.since
            where c.is_deleted = false
           union
           select r.user_id
             from message_reactions r
             join channel_posts p on p.id = r.message_id
             join bounds b on r.created_at >= b.since
         )
         select
           (select count(*) from users where blocked_at is null) as total_users,
           (select count(*)
              from messages m, bounds b
             where m.chat_id = $1
               and m.is_deleted = false
               and m.created_at >= b.since) as posts,
           (select count(*)
              from channel_post_comments c
              join channel_posts p on p.id = c.post_message_id
              join bounds b on c.created_at >= b.since
             where c.is_deleted = false) as comments,
           (select count(*)
              from message_reactions r
              join channel_posts p on p.id = r.message_id
              join bounds b on r.created_at >= b.since) as reactions,
           (select count(*)
              from message_reactions r
              join channel_posts p on p.id = r.message_id
              join bounds b on r.created_at >= b.since
             where r.emoji = '👍') as likes,
           (select count(*)
              from channel_post_views v
              join channel_posts p on p.id = v.post_message_id
              join bounds b on v.last_viewed_at >= b.since) as view_events,
           (select coalesce(sum(v.view_count), 0)
              from channel_post_views v
              join channel_posts p on p.id = v.post_message_id
              join bounds b on v.last_viewed_at >= b.since) as views,
           (select count(*) from engaged) as engaged_users`,
        [channelRow.id, interval],
      ),
      app.pg.query<AdminChannelPeriodRow>(
        `with days as (
           select generate_series(
             date_trunc('day', now() - $2::interval),
             date_trunc('day', now()),
             interval '1 day'
           ) as period_start
         ),
         channel_posts as (
           select m.id, m.created_at
             from messages m
            where m.chat_id = $1
              and m.is_deleted = false
         )
         select
           d.period_start,
           coalesce(p.posts, 0) as posts,
           coalesce(c.comments, 0) as comments,
           coalesce(c.commenters, 0) as commenters,
           coalesce(r.reactions, 0) as reactions,
           coalesce(r.reactors, 0) as reactors,
           coalesce(r.likes, 0) as likes,
           coalesce(v.view_events, 0) as view_events,
           coalesce(v.views, 0) as views,
           coalesce(v.viewers, 0) as viewers,
           coalesce(e.engaged_users, 0) as engaged_users
         from days d
         left join lateral (
           select count(*) as posts
             from channel_posts p
            where p.created_at >= d.period_start
              and p.created_at < d.period_start + interval '1 day'
         ) p on true
         left join lateral (
           select count(*) as comments,
                  count(distinct c.author_id) as commenters
             from channel_post_comments c
             join channel_posts p on p.id = c.post_message_id
            where c.is_deleted = false
              and c.created_at >= d.period_start
              and c.created_at < d.period_start + interval '1 day'
         ) c on true
         left join lateral (
           select count(*) as reactions,
                  count(distinct r.user_id) as reactors,
                  count(*) filter (where r.emoji = '👍') as likes
             from message_reactions r
             join channel_posts p on p.id = r.message_id
            where r.created_at >= d.period_start
              and r.created_at < d.period_start + interval '1 day'
         ) r on true
         left join lateral (
           select count(*) as view_events,
                  coalesce(sum(v.view_count), 0) as views,
                  count(distinct v.user_id) as viewers
             from channel_post_views v
             join channel_posts p on p.id = v.post_message_id
            where v.last_viewed_at >= d.period_start
              and v.last_viewed_at < d.period_start + interval '1 day'
         ) v on true
         left join lateral (
           select count(distinct user_id) as engaged_users
             from (
               select v.user_id
                 from channel_post_views v
                 join channel_posts p on p.id = v.post_message_id
                where v.last_viewed_at >= d.period_start
                  and v.last_viewed_at < d.period_start + interval '1 day'
               union all
               select c.author_id as user_id
                 from channel_post_comments c
                 join channel_posts p on p.id = c.post_message_id
                where c.is_deleted = false
                  and c.created_at >= d.period_start
                  and c.created_at < d.period_start + interval '1 day'
               union all
               select r.user_id
                 from message_reactions r
                 join channel_posts p on p.id = r.message_id
                where r.created_at >= d.period_start
                  and r.created_at < d.period_start + interval '1 day'
             ) users
         ) e on true
         order by d.period_start desc`,
        [channelRow.id, interval],
      ),
      app.pg.query<AdminChannelPostRow>(
        `select m.id,
                m.chat_id,
                m.content,
                m.created_at,
                m.updated_at,
                coalesce(c.comment_count, 0) as comment_count,
                coalesce(c.commenter_count, 0) as commenter_count,
                coalesce(r.reaction_count, 0) as reaction_count,
                coalesce(r.reaction_user_count, 0) as reaction_user_count,
                coalesce(r.like_count, 0) as like_count,
                coalesce(v.view_count, 0) as view_count,
                coalesce(v.viewer_count, 0) as viewer_count,
                coalesce(r.reactions, '[]'::json) as reactions
           from messages m
           left join lateral (
             select count(*) as comment_count,
                    count(distinct author_id) as commenter_count
               from channel_post_comments c
              where c.post_message_id = m.id
                and c.is_deleted = false
           ) c on true
           left join lateral (
             select (select count(*)
                       from message_reactions
                      where message_id = m.id) as reaction_count,
                    (select count(distinct user_id)
                       from message_reactions
                      where message_id = m.id) as reaction_user_count,
                    (select count(*)
                       from message_reactions
                      where message_id = m.id
                        and emoji = '👍') as like_count,
                    coalesce(
                      (select json_agg(json_build_object('emoji', emoji, 'count', emoji_count)
                                order by emoji_count desc, emoji)
                         from (
                           select emoji, count(*) as emoji_count
                             from message_reactions
                            where message_id = m.id
                            group by emoji
                         ) by_emoji),
                      '[]'::json
                    ) as reactions
           ) r on true
           left join lateral (
             select coalesce(sum(view_count), 0) as view_count,
                    count(distinct user_id) as viewer_count
               from channel_post_views v
              where v.post_message_id = m.id
           ) v on true
          where m.chat_id = $1
            and m.is_deleted = false
          order by m.created_at desc
          limit 50`,
        [channelRow.id],
      ),
    ]);

    const summaryRow = summary.rows[0]!;
    const totalUsers = Number(summaryRow.total_users);
    const engagedUsers = Number(summaryRow.engaged_users);
    return {
      channel: {
        id: channelRow.id,
        name: channelRow.name,
        description: channelRow.description,
        slug: channelRow.channel_slug,
        avatarUrl: channelRow.avatar_url,
        createdAt: channelRow.created_at.toISOString(),
      },
      mainChat:
        mainChatRow === null
          ? null
          : {
              id: mainChatRow.id,
              name: mainChatRow.name,
              description: mainChatRow.description,
              avatarUrl: mainChatRow.avatar_url,
              createdAt: mainChatRow.created_at.toISOString(),
            },
      period: parsed.data.period,
      summary: {
        totalUsers,
        posts: Number(summaryRow.posts),
        comments: Number(summaryRow.comments),
        reactions: Number(summaryRow.reactions),
        likes: Number(summaryRow.likes),
        viewEvents: Number(summaryRow.view_events),
        views: Number(summaryRow.views),
        engagedUsers,
        engagementRate: engagementRate(engagedUsers, totalUsers),
      },
      periods: periods.rows.map((row) => {
        const rowEngagedUsers = Number(row.engaged_users);
        return {
          periodStart: row.period_start.toISOString(),
          posts: Number(row.posts),
          comments: Number(row.comments),
          commenters: Number(row.commenters),
          reactions: Number(row.reactions),
          reactors: Number(row.reactors),
          likes: Number(row.likes),
          viewEvents: Number(row.view_events),
          views: Number(row.views),
          viewers: Number(row.viewers),
          engagedUsers: rowEngagedUsers,
          engagementRate: engagementRate(rowEngagedUsers, totalUsers),
        };
      }),
      posts: posts.rows.map(mapChannelPost),
    };
  });

  app.patch('/admin/chats/:chatId/profile', { preHandler: adminPreHandlers }, async (req) => {
    const { chatId } = z.object({ chatId: z.string().uuid() }).parse(req.params);
    const body = chatProfilePatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid chat profile patch', 400);
    }
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (body.data.name !== undefined) addAssignment(assignments, values, 'name', body.data.name);
    if (body.data.description !== undefined) {
      addAssignment(assignments, values, 'description', body.data.description);
    }
    values.push(chatId, DEFAULT_NEWS_CHANNEL_SLUG);
    const { rows } = await app.pg.query<AdminChannelRow>(
      `update chats
          set ${assignments.join(', ')},
              updated_at = now()
        where id = $${values.length - 1}
          and is_active = true
          and (
            (type = 'channel' and channel_slug = $${values.length})
            or type = 'system'
          )
        returning id, name, description, channel_slug, avatar_url, created_at`,
      values,
    );
    const chat = rows[0];
    if (!chat) throw new AppError('not_found', 'chat not found', 404);
    await appendEvent(app.pg, req.user.id, 'admin_chat_profile_updated', {
      chat_id: chatId,
      fields: Object.keys(body.data),
    });
    return {
      chat: {
        id: chat.id,
        name: chat.name,
        description: chat.description,
        slug: chat.channel_slug,
        avatarUrl: chat.avatar_url,
        createdAt: chat.created_at.toISOString(),
      },
    };
  });

  app.post('/admin/chats/:chatId/avatar', { preHandler: adminPreHandlers }, async (req) => {
    if (opts.objectStorage === undefined) {
      throw new AppError('storage_not_configured', 'object storage is not configured', 503);
    }
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const chat = await app.pg.query<{ id: string }>(
      `select id
         from chats
        where id = $1
          and is_active = true
          and (
            (type = 'channel' and channel_slug = $2)
            or type = 'system'
          )
        limit 1`,
      [chatId, DEFAULT_NEWS_CHANNEL_SLUG],
    );
    if (chat.rowCount === 0) throw new AppError('not_found', 'chat not found', 404);

    const contentType = normalizeUploadContentType(req.headers['content-type']);
    const body = assertAdminChatAvatarBody(req.body, contentType);
    let uploaded;
    try {
      uploaded = await opts.objectStorage.uploadObject({
        key: createMediaObjectKey({ prefix: `chat-avatars/${chatId}`, contentType }),
        body,
        contentType,
      });
    } catch (err) {
      app.log.error({ err, chatId, userId: req.user.id }, 'admin chat avatar upload failed');
      throw new AppError('storage_upload_failed', 'Не удалось загрузить аватар', 502);
    }
    const media = await app.pg.query<{ id: string }>(
      `insert into media_objects
         (owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
       values ($1, 'chat_avatar', $2, $3, $4, $5, $6)
       returning id`,
      [
        req.user.id,
        uploaded.key,
        uploaded.url,
        uploaded.contentType,
        uploaded.size,
        `chat-avatar-${chatId}.webp`,
      ],
    );
    const mediaId = media.rows[0]?.id;
    if (mediaId === undefined) {
      throw new AppError('internal_error', 'chat avatar media was not saved', 500);
    }
    const avatarUrl = createMediaProxyUrl(opts.mediaAccessSecret, mediaId);
    await app.pg.query('update chats set avatar_url = $1, updated_at = now() where id = $2', [
      avatarUrl,
      chatId,
    ]);
    await appendEvent(app.pg, req.user.id, 'admin_chat_avatar_updated', {
      chat_id: chatId,
      key: uploaded.key,
      size: uploaded.size,
      content_type: uploaded.contentType,
    });

    return { chatId, avatarUrl };
  });

  app.delete('/admin/chats/:chatId/avatar', { preHandler: adminPreHandlers }, async (req) => {
    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    const updated = await app.pg.query<{ id: string }>(
      `update chats
          set avatar_url = null,
              updated_at = now()
        where id = $1
          and is_active = true
          and (
            (type = 'channel' and channel_slug = $2)
            or type = 'system'
          )
        returning id`,
      [chatId, DEFAULT_NEWS_CHANNEL_SLUG],
    );
    if (updated.rowCount === 0) throw new AppError('not_found', 'chat not found', 404);
    await appendEvent(app.pg, req.user.id, 'admin_chat_avatar_reset', { chat_id: chatId });
    return { chatId, avatarUrl: null };
  });

  app.patch('/admin/channel/posts/:postId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ postId: z.string().uuid() }).parse(req.params);
    const body = channelPostPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid channel post patch', 400);
    }
    const post = await updateChannelPostContent(
      app.pg,
      params.postId,
      req.user.id,
      body.data.content,
    );
    await publishMessageUpdated(app.pg, app.realtime, post.chatId, 'channel', post);
    await appendEvent(app.pg, req.user.id, 'admin_channel_post_updated', {
      post_id: params.postId,
    });
    return { post };
  });

  app.delete('/admin/channel/posts/:postId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ postId: z.string().uuid() }).parse(req.params);
    const { chatId } = await deleteChannelPost(app.pg, params.postId);
    await publishMessageDeleted(app.pg, app.realtime, chatId, 'channel', params.postId);
    await appendEvent(app.pg, req.user.id, 'admin_channel_post_deleted', {
      post_id: params.postId,
    });
    return { ok: true };
  });

  app.get('/admin/payments', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = listPaymentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid payments query', 400);
    }
    const search = parsed.data.q ?? null;
    const orderBy = {
      created_desc: 'p.created_at desc',
      created_asc: 'p.created_at asc',
      amount_desc: 'p.amount_rub desc, p.created_at desc',
      amount_asc: 'p.amount_rub asc, p.created_at desc',
      user_asc: 'lower(user_display_name) asc nulls last, p.created_at desc',
      user_desc: 'lower(user_display_name) desc nulls last, p.created_at desc',
    }[parsed.data.sort];

    const [list, analytics] = await Promise.all([
      app.pg.query<AdminPaymentRow>(
        `with prepared as (
           select p.id,
                  p.user_id,
                  case
                    when u.display_source = 'vk' then
                      coalesce(nullif(concat_ws(' ', u.vk_first_name, u.vk_last_name), ''), u.vk_username, u.display_name)
                    when u.display_source = 'telegram' then
                      coalesce(nullif(concat_ws(' ', u.tg_first_name, u.tg_last_name), ''), u.tg_username, u.display_name)
                    else u.display_name
                  end as user_display_name,
                  case
                    when u.display_source = 'vk' then u.vk_avatar_url
                    when u.display_source = 'telegram' then u.tg_avatar_url
                    else u.avatar_url
                  end as user_avatar_url,
                  p.inventory_item_id,
                  p.title,
                  p.amount_rub,
                  p.status,
                  p.provider,
                  p.provider_payment_id,
                  p.created_at,
                  p.paid_at
             from payments p
             left join users u on u.id = p.user_id
         ),
         filtered as (
           select *
             from prepared p
            where ($1::text is null
                   or user_display_name ilike '%' || $1 || '%'
                   or title ilike '%' || $1 || '%'
                   or user_id::text = $1
                   or provider_payment_id = $1)
              and ($2::text = 'all' or status = $2)
              and ($3::int is null or amount_rub >= $3)
              and ($4::int is null or amount_rub <= $4)
         )
         select *, count(*) over() as total_count
           from filtered p
          order by ${orderBy}
          limit $5 offset $6`,
        [
          search,
          parsed.data.status,
          parsed.data.minAmount ?? null,
          parsed.data.maxAmount ?? null,
          parsed.data.limit,
          parsed.data.offset,
        ],
      ),
      app.pg.query<AdminPaymentAnalyticsRow>(
        `select
           coalesce(sum(amount_rub) filter (
             where status = 'paid' and coalesce(paid_at, created_at) >= date_trunc('month', now())
           ), 0) as month_revenue,
           coalesce(sum(amount_rub) filter (
             where status = 'paid' and coalesce(paid_at, created_at) >= date_trunc('quarter', now())
           ), 0) as quarter_revenue,
           coalesce(sum(amount_rub) filter (
             where status = 'paid' and coalesce(paid_at, created_at) >= date_trunc('year', now())
           ), 0) as year_revenue,
           count(*) filter (
             where status = 'paid' and coalesce(paid_at, created_at) >= date_trunc('month', now())
           ) as month_count,
           count(*) filter (
             where status = 'paid' and coalesce(paid_at, created_at) >= date_trunc('quarter', now())
           ) as quarter_count,
           count(*) filter (
             where status = 'paid' and coalesce(paid_at, created_at) >= date_trunc('year', now())
           ) as year_count
          from payments`,
      ),
    ]);
    const analyticsRow = analytics.rows[0]!;
    return {
      payments: list.rows.map(mapPayment),
      total: list.rows.length > 0 ? Number(list.rows[0]!.total_count ?? list.rows.length) : 0,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      analytics: {
        month: {
          revenueRub: Number(analyticsRow.month_revenue),
          paidCount: Number(analyticsRow.month_count),
        },
        quarter: {
          revenueRub: Number(analyticsRow.quarter_revenue),
          paidCount: Number(analyticsRow.quarter_count),
        },
        year: {
          revenueRub: Number(analyticsRow.year_revenue),
          paidCount: Number(analyticsRow.year_count),
        },
      },
    };
  });

  app.get('/admin/feedback', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = listFeedbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid feedback query', 400);
    }

    const [list, unread, ratingStats] = await Promise.all([
      app.pg.query<AdminFeedbackRow>(
        `with prepared as (
           select f.id,
                  f.user_id,
                  case
                    when u.display_source = 'vk' then
                      coalesce(nullif(concat_ws(' ', u.vk_first_name, u.vk_last_name), ''), u.vk_username, u.display_name)
                    when u.display_source = 'telegram' then
                      coalesce(nullif(concat_ws(' ', u.tg_first_name, u.tg_last_name), ''), u.tg_username, u.display_name)
                    else u.display_name
                  end as user_display_name,
                  case
                    when u.display_source = 'vk' then u.vk_avatar_url
                    when u.display_source = 'telegram' then u.tg_avatar_url
                    else u.avatar_url
                  end as user_avatar_url,
                  f.kind,
                  f.rating,
                  f.message,
                  f.is_read,
                  f.read_at,
                  f.read_by,
                  reader.display_name as read_by_display_name,
                  f.created_at
             from feedback_messages f
             left join users u on u.id = f.user_id
             left join users reader on reader.id = f.read_by
         ),
         filtered as (
           select *
             from prepared
            where ($1::text = 'all' or kind = $1)
              and ($2::text = 'all'
                   or ($2::text = 'read' and is_read = true)
                   or ($2::text = 'unread' and is_read = false))
         )
         select *, count(*) over() as total_count
           from filtered
          order by is_read asc, created_at desc
          limit $3 offset $4`,
        [parsed.data.kind, parsed.data.status, parsed.data.limit, parsed.data.offset],
      ),
      app.pg.query<{ count: string }>(
        `select count(*)::int as count from feedback_messages where is_read = false`,
      ),
      app.pg.query<AdminFeedbackRatingStatsRow>(
        `select count(*) filter (where rating between 1 and 5)::int as rating_count,
                round((avg(rating) filter (where rating between 1 and 5))::numeric, 2)::text
                  as rating_average
           from feedback_messages`,
      ),
    ]);
    const ratingStatsRow = ratingStats.rows[0];

    return {
      feedback: list.rows.map(mapFeedback),
      total: list.rows.length > 0 ? Number(list.rows[0]!.total_count ?? list.rows.length) : 0,
      unreadCount: Number(unread.rows[0]?.count ?? 0),
      ratingStats: {
        count: Number(ratingStatsRow?.rating_count ?? 0),
        average:
          ratingStatsRow?.rating_average === null || ratingStatsRow?.rating_average === undefined
            ? null
            : Number(ratingStatsRow.rating_average),
      },
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
  });

  app.patch('/admin/feedback/:feedbackId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ feedbackId: z.string().uuid() }).parse(req.params);
    const body = feedbackPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid feedback patch', 400);
    }

    const { rowCount } = await app.pg.query(
      `update feedback_messages
          set is_read = $2::boolean,
              read_at = case when $2::boolean then now() else null end,
              read_by = case when $2::boolean then $3::uuid else null end
        where id = $1`,
      [params.feedbackId, body.data.isRead, req.user.id],
    );
    if (rowCount === 0) {
      throw new AppError('not_found', 'feedback not found', 404);
    }

    const updated = await fetchAdminFeedbackById(app.pg, params.feedbackId);
    return { feedback: mapFeedback(updated) };
  });

  app.get('/admin/inventory', { preHandler: adminPreHandlers }, async () => {
    const { rows } = await app.pg.query<AdminInventoryItemRow>(
      `select i.id,
              i.photo_url,
              i.title,
              i.description,
              i.price_rub,
              i.item_kind,
              i.currency_price,
              i.charges_per_purchase,
              i.duel_period_cost,
              i.effect_puck_speed_delta,
              i.effect_shooter_frequency_delta,
              i.effect_goalie_frequency_delta,
              i.effect_goal_frequency_delta,
              i.effect_shot_zone_multiplier,
              i.created_at,
              i.updated_at,
              count(p.id)::int as payments_count,
              coalesce(sum(p.amount_rub) filter (where p.status = 'paid'), 0)::int as paid_revenue
         from admin_inventory_items i
         left join payments p on p.inventory_item_id = i.id
        where i.deleted_at is null
        group by i.id
        order by i.created_at desc`,
    );
    return { items: rows.map(mapInventoryItem) };
  });

  app.post('/admin/inventory', { preHandler: adminPreHandlers }, async (req) => {
    const body = createInventoryItemSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid inventory item', 400);
    }
    const { rows } = await app.pg.query<AdminInventoryItemRow>(
      `insert into admin_inventory_items (photo_url, title, description, price_rub)
       values ($1, $2, $3, $4)
       returning id, photo_url, title, description, price_rub, item_kind, currency_price,
                 charges_per_purchase, duel_period_cost, effect_puck_speed_delta,
                 effect_shooter_frequency_delta, effect_goalie_frequency_delta,
                 effect_goal_frequency_delta, effect_shot_zone_multiplier,
                 created_at, updated_at`,
      [body.data.photoUrl, body.data.title, body.data.description, body.data.priceRub],
    );
    await appendEvent(app.pg, req.user.id, 'admin_inventory_item_created', {
      item_id: rows[0]!.id,
    });
    return { item: mapInventoryItem(rows[0]!) };
  });

  app.patch('/admin/inventory/:itemId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ itemId: z.string().uuid() }).parse(req.params);
    const body = updateInventoryItemSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid inventory item patch', 400);
    }
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (body.data.photoUrl !== undefined) {
      addAssignment(assignments, values, 'photo_url', body.data.photoUrl);
    }
    if (body.data.title !== undefined) {
      addAssignment(assignments, values, 'title', body.data.title);
    }
    if (body.data.description !== undefined) {
      addAssignment(assignments, values, 'description', body.data.description);
    }
    if (body.data.priceRub !== undefined) {
      addAssignment(assignments, values, 'price_rub', body.data.priceRub);
    }
    values.push(params.itemId);
    const { rows } = await app.pg.query<AdminInventoryItemRow>(
      `update admin_inventory_items
          set ${assignments.join(', ')},
              updated_at = now()
        where id = $${values.length} and deleted_at is null
      returning id, photo_url, title, description, price_rub, item_kind, currency_price,
                charges_per_purchase, duel_period_cost, effect_puck_speed_delta,
                effect_shooter_frequency_delta, effect_goalie_frequency_delta,
                effect_goal_frequency_delta, effect_shot_zone_multiplier,
                created_at, updated_at`,
      values,
    );
    if (rows.length === 0) {
      throw new AppError('not_found', 'inventory item not found', 404);
    }
    await appendEvent(app.pg, req.user.id, 'admin_inventory_item_updated', {
      item_id: params.itemId,
      fields: Object.keys(body.data),
    });
    return { item: mapInventoryItem(rows[0]!) };
  });

  app.delete('/admin/inventory/:itemId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ itemId: z.string().uuid() }).parse(req.params);
    const { rowCount } = await app.pg.query(
      `update admin_inventory_items
          set deleted_at = now(),
              updated_at = now()
        where id = $1 and deleted_at is null`,
      [params.itemId],
    );
    if (rowCount === 0) {
      throw new AppError('not_found', 'inventory item not found', 404);
    }
    await appendEvent(app.pg, req.user.id, 'admin_inventory_item_deleted', {
      item_id: params.itemId,
    });
    return { ok: true };
  });

  app.get('/admin/users', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid users query', 400);
    }
    const search = parsed.data.q ?? null;
    const orderBy = {
      name_asc: 'lower(active_display_name) asc, created_at asc',
      name_desc: 'lower(active_display_name) desc, created_at desc',
      goals_asc: 'lifetime_goals_total asc, lower(active_display_name) asc',
      goals_desc: 'lifetime_goals_total desc, lower(active_display_name) asc',
      accuracy_asc: 'accuracy asc, lower(active_display_name) asc',
      accuracy_desc: 'accuracy desc, lower(active_display_name) asc',
    }[parsed.data.sort];
    const [list, pushStats] = await Promise.all([
      app.pg.query<AdminUserRow>(
        `with filtered as (
           select *
             from (
               select u.id, u.display_name, u.avatar_url, u.display_source,
                      u.role, u.grip, u.level, u.xp,
                      case
                        when u.display_source = 'vk' then
                          coalesce(nullif(concat_ws(' ', u.vk_first_name, u.vk_last_name), ''), u.vk_username, 'Player')
                        when u.display_source = 'telegram' then
                          coalesce(nullif(concat_ws(' ', u.tg_first_name, u.tg_last_name), ''), u.tg_username, 'Player')
                        else coalesce(nullif(u.display_name, ''), 'Player')
                      end as active_display_name,
                      case
                        when u.display_source = 'vk' then u.vk_avatar_url
                        when u.display_source = 'telegram' then u.tg_avatar_url
                        else u.avatar_url
                      end as active_avatar_url,
                      u.timezone, u.created_at, u.last_seen_at,
                      u.blocked_at, u.blocked_by, blocker.display_name as blocked_by_display_name,
                      u.lifetime_shots_total, u.lifetime_goals_total,
                      case
                        when u.lifetime_shots_total > 0
                          then round(u.lifetime_goals_total::numeric * 100 / u.lifetime_shots_total)::int
                        else 0
                      end as accuracy,
                      case
                        when u.level >= 3 then 'professional'
                        when u.level >= 2
                          or u.lifetime_goals_total >= coalesce(
                            (select (value #>> '{}')::int
                               from game_settings
                              where key = 'amateur.unlock_goals_required'),
                            1000
                          ) then 'amateur'
                        else 'beginner'
                      end as competition_level,
                      tg.provider_uid as tg_id,
                      vk.provider_uid as vk_id,
                      u.tg_first_name,
                      u.tg_last_name,
                      u.tg_avatar_url,
                      u.tg_username,
                      u.vk_first_name,
                      u.vk_last_name,
                      u.vk_avatar_url,
                      u.vk_username,
                      coalesce(w.shots_current, 0) as shots_current,
                      coalesce(w.shots_max, 25) as shots_max,
                      coalesce(w.shots_bonus, 0) as shots_bonus,
                      coalesce(w.pucks, 0) as pucks,
                      coalesce(w.gold_pucks, 0) as gold_pucks,
                      coalesce(w.wheel_spins, 0) as wheel_spins,
                      coalesce(w.training_energy, 0) as training_energy,
                      coalesce(push.subscription_count, 0) as push_subscription_count,
                      coalesce(push.subscription_count, 0) > 0
                        and coalesce(pref.chat_new_dialog_message, true) as push_chat_new_dialog_message,
                      coalesce(push.subscription_count, 0) > 0
                        and coalesce(pref.daily_game, true) as push_daily_game,
                      coalesce(push.subscription_count, 0) > 0
                        and coalesce(pref.training_available, true) as push_training_available,
                      coalesce(push.subscription_count, 0) > 0
                        and coalesce(pref.duel_events, true) as push_duel_events,
                      coalesce(push.subscription_count, 0) > 0
                        and coalesce(pref.game_news, true) as push_game_news
                 from users u
                 left join user_wallet w on w.user_id = u.id
                 left join users blocker on blocker.id = u.blocked_by
                 left join auth_providers tg
                   on tg.user_id = u.id and tg.provider = 'telegram'
                 left join auth_providers vk
                   on vk.user_id = u.id and vk.provider = 'vk'
                 left join (
                   select user_id, count(*)::int as subscription_count
                     from push_subscriptions
                    group by user_id
                 ) push on push.user_id = u.id
                 left join user_push_preferences pref on pref.user_id = u.id
             ) users_with_stats
            where ($1::text is null
                   or active_display_name ilike '%' || $1 || '%'
                   or display_name ilike '%' || $1 || '%'
                   or tg_username ilike '%' || $1 || '%'
                   or vk_username ilike '%' || $1 || '%'
                   or tg_id = $1
                   or vk_id = $1)
              and ($2::text = 'all' or role = $2)
              and ($3::text = 'all' or competition_level = $3)
              and ($4::int is null or lifetime_goals_total >= $4)
              and ($5::int is null or accuracy >= $5)
         )
         select *, count(*) over() as total_count
           from filtered
          order by ${orderBy}
          limit $6 offset $7`,
        [
          search,
          parsed.data.role,
          parsed.data.level,
          parsed.data.minGoals ?? null,
          parsed.data.minAccuracy ?? null,
          parsed.data.limit,
          parsed.data.offset,
        ],
      ),
      fetchPushNotificationStats(app.pg),
    ]);
    const rows = list.rows;
    return {
      users: rows.map(mapUser),
      total: rows.length > 0 ? Number(rows[0]!.total_count ?? rows.length) : 0,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      notificationStats: mapPushNotificationStats(pushStats),
    };
  });

  app.get('/admin/users/:userId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ userId: z.string().uuid() }).parse(req.params);
    const user = await fetchAdminUser(app.pg, params.userId);
    const [profileProgress, shotModes, events, purchases] = await Promise.all([
      buildProfileProgress(app.pg, user),
      app.pg.query<AdminShotModeRow>(
        `select mode,
                count(*)::int as shots,
                count(*) filter (where server_result = 'goal')::int as goals,
                max(created_at) as last_shot_at
           from shot_session
          where user_id = $1
          group by mode
          order by mode`,
        [params.userId],
      ),
      app.pg.query<AdminEventRow>(
        `select id::text, type, payload, created_at
           from event_log
          where user_id = $1
          order by created_at desc
          limit 20`,
        [params.userId],
      ),
      app.pg.query<AdminPaymentRow>(
        `select p.id,
                p.user_id,
                null::text as user_display_name,
                null::text as user_avatar_url,
                p.inventory_item_id,
                p.title,
                p.amount_rub,
                p.status,
                p.provider,
                p.provider_payment_id,
                p.created_at,
                p.paid_at
           from payments p
          where p.user_id = $1
          order by p.created_at desc
          limit 50`,
        [params.userId],
      ),
    ]);
    const paidPurchases = purchases.rows.filter((row) => row.status === 'paid');
    return {
      user: mapUser(user),
      purchaseSummary: {
        totalRubSpent: paidPurchases.reduce((sum, row) => sum + row.amount_rub, 0),
        purchasesCount: purchases.rows.length,
      },
      purchases: purchases.rows.map((row) => ({
        id: row.id,
        title: row.title,
        amountRub: row.amount_rub,
        status: row.status,
        createdAt: row.created_at.toISOString(),
      })),
      achievements: profileProgress.achievements,
      shotModes: shotModes.rows.map((row) => ({
        mode: row.mode,
        shots: Number(row.shots),
        goals: Number(row.goals),
        lastShotAt: row.last_shot_at?.toISOString() ?? null,
      })),
      events: events.rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });

  app.patch('/admin/users/:userId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ userId: z.string().uuid() }).parse(req.params);
    const body = userPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid user patch', 400);
    }

    return withTransaction(app, async (client) => {
      await fetchAdminUser(client, params.userId);
      if (params.userId === req.user.id && body.data.role === 'player') {
        throw new AppError('conflict', 'cannot demote yourself', 409);
      }
      if (params.userId === req.user.id && body.data.isBlocked === true) {
        throw new AppError('conflict', 'cannot block yourself', 409);
      }

      const changed: string[] = [];
      const userAssignments: string[] = [];
      const userValues: unknown[] = [];
      if (body.data.role !== undefined) {
        addAssignment(userAssignments, userValues, 'role', body.data.role);
        changed.push('role');
      }
      if (body.data.displayName !== undefined) {
        addAssignment(userAssignments, userValues, 'display_name', body.data.displayName);
        changed.push('displayName');
      }
      if (body.data.grip !== undefined) {
        addAssignment(userAssignments, userValues, 'grip', body.data.grip);
        changed.push('grip');
      }
      if (body.data.level !== undefined) {
        addAssignment(userAssignments, userValues, 'level', body.data.level);
        changed.push('level');
      }
      if (body.data.xp !== undefined) {
        addAssignment(userAssignments, userValues, 'xp', body.data.xp);
        changed.push('xp');
      }
      if (body.data.lifetimeShotsTotal !== undefined) {
        addAssignment(
          userAssignments,
          userValues,
          'lifetime_shots_total',
          body.data.lifetimeShotsTotal,
        );
        changed.push('lifetimeShotsTotal');
      }
      if (body.data.lifetimeGoalsTotal !== undefined) {
        addAssignment(
          userAssignments,
          userValues,
          'lifetime_goals_total',
          body.data.lifetimeGoalsTotal,
        );
        changed.push('lifetimeGoalsTotal');
      }
      if (body.data.isBlocked !== undefined) {
        if (body.data.isBlocked) {
          userAssignments.push('blocked_at = coalesce(blocked_at, now())');
          addAssignment(userAssignments, userValues, 'blocked_by', req.user.id);
        } else {
          userAssignments.push('blocked_at = null');
          userAssignments.push('blocked_by = null');
          userAssignments.push('block_reason = null');
        }
        changed.push('isBlocked');
      }
      if (userAssignments.length > 0) {
        userValues.push(params.userId);
        await client.query(
          `update users set ${userAssignments.join(', ')} where id = $${userValues.length}`,
          userValues,
        );
      }

      const wallet = body.data.wallet;
      if (wallet !== undefined && Object.keys(wallet).length > 0) {
        await client.query('insert into user_wallet (user_id) values ($1) on conflict do nothing', [
          params.userId,
        ]);
        const walletAssignments: string[] = [];
        const walletValues: unknown[] = [];
        if (wallet.shotsCurrent !== undefined) {
          addAssignment(walletAssignments, walletValues, 'shots_current', wallet.shotsCurrent);
          changed.push('wallet.shotsCurrent');
        }
        if (wallet.shotsMax !== undefined) {
          addAssignment(walletAssignments, walletValues, 'shots_max', wallet.shotsMax);
          changed.push('wallet.shotsMax');
        }
        if (wallet.shotsBonus !== undefined) {
          addAssignment(walletAssignments, walletValues, 'shots_bonus', wallet.shotsBonus);
          changed.push('wallet.shotsBonus');
        }
        if (wallet.pucks !== undefined) {
          addAssignment(walletAssignments, walletValues, 'pucks', wallet.pucks);
          changed.push('wallet.pucks');
        }
        if (wallet.goldPucks !== undefined) {
          addAssignment(walletAssignments, walletValues, 'gold_pucks', wallet.goldPucks);
          changed.push('wallet.goldPucks');
        }
        if (wallet.wheelSpins !== undefined) {
          addAssignment(walletAssignments, walletValues, 'wheel_spins', wallet.wheelSpins);
          changed.push('wallet.wheelSpins');
        }
        if (wallet.trainingEnergy !== undefined) {
          addAssignment(walletAssignments, walletValues, 'training_energy', wallet.trainingEnergy);
          changed.push('wallet.trainingEnergy');
        }
        walletValues.push(params.userId);
        await client.query(
          `update user_wallet
              set ${walletAssignments.join(', ')}
            where user_id = $${walletValues.length}`,
          walletValues,
        );
      }

      await appendEvent(client, params.userId, 'admin_user_updated', {
        admin_user_id: req.user.id,
        fields: changed,
      });
      const updated = await fetchAdminUser(client, params.userId);
      return { user: mapUser(updated) };
    });
  });
};
