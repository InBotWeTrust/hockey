import type { Pool, PoolClient } from 'pg';
import { enqueuePushDelivery } from './queue.js';
import {
  isPushEventAllowed,
  mapPushPreferencesRow,
  type PushEventType,
  type PushPreferencesRow,
} from './preferences.js';
import { renderPushNotificationPayload, type PushTemplateFallback } from './templates.js';

type Queryable = Pool | PoolClient;
type TournamentPushEvent = Extract<PushEventType, `tournament.${string}`>;

interface RecipientRow extends PushPreferencesRow {
  user_id: string;
  has_subscription: boolean;
}

function pushOverride(value: unknown): PushTemplateFallback | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const override = value as Record<string, unknown>;
  return typeof override.title === 'string' &&
    typeof override.body === 'string' &&
    typeof override.url === 'string'
    ? { title: override.title, body: override.body, url: override.url }
    : null;
}

export async function enqueueTournamentPush(
  client: Queryable,
  input: {
    userId: string;
    tournamentId?: string;
    eventType: TournamentPushEvent;
    eventKey: string;
    variables: Record<string, string | number | null | undefined>;
    fallback: { title: string; body: string; url: string };
  },
): Promise<boolean> {
  const { rows } = await client.query<RecipientRow>(
    `select u.id::text as user_id,
            exists(select 1 from push_subscriptions ps where ps.user_id = u.id) as has_subscription,
            pref.chat_new_dialog_message, pref.daily_game, pref.training_available,
            pref.duel_events, pref.tournament_events, pref.game_news
       from users u left join user_push_preferences pref on pref.user_id = u.id
      where u.id = $1`,
    [input.userId],
  );
  const recipient = rows[0];
  if (!recipient?.has_subscription) return false;
  if (!isPushEventAllowed(mapPushPreferencesRow(recipient), input.eventType)) return false;
  let override: PushTemplateFallback | null = null;
  if (input.tournamentId !== undefined) {
    const result = await client.query<{ notification_override: unknown }>(
      `select revision.rules_snapshot->'notificationOverrides'->$2 as notification_override
         from tournament
         join tournament_revision revision on revision.id = tournament.published_revision_id
        where tournament.id = $1`,
      [input.tournamentId, input.eventType],
    );
    override = pushOverride(result.rows[0]?.notification_override);
  }
  const payload = await renderPushNotificationPayload(
    client,
    input.eventType,
    input.variables,
    input.fallback,
    override,
  );
  if (!payload) return false;
  return enqueuePushDelivery(client, {
    userId: input.userId,
    eventType: input.eventType,
    eventKey: input.eventKey,
    payload: { ...payload, tag: `tournament-${input.eventKey}` },
  });
}

export async function enqueueTournamentAudiencePush(
  client: Queryable,
  input: Omit<Parameters<typeof enqueueTournamentPush>[1], 'userId'> & { tournamentId: string },
): Promise<number> {
  const { rows } = await client.query<{ user_id: string }>(
    `select user_id from tournament_participant
      where tournament_id = $1 and state in ('approved', 'withdrawn', 'removed', 'disqualified')`,
    [input.tournamentId],
  );
  let queued = 0;
  for (const row of rows) {
    if (await enqueueTournamentPush(client, { ...input, userId: row.user_id })) queued += 1;
  }
  return queued;
}
