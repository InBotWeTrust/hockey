import type { Pool, PoolClient } from 'pg';
import { enqueuePushDelivery } from './queue.js';
import {
  isPushEventAllowed,
  mapPushPreferencesRow,
  type PushEventType,
  type PushPreferencesRow,
} from './preferences.js';
import { renderPushNotificationPayload } from './templates.js';

type Queryable = Pool | PoolClient;
type TournamentPushEvent = Extract<PushEventType, `tournament.${string}`>;

interface RecipientRow extends PushPreferencesRow {
  user_id: string;
  has_subscription: boolean;
}

export async function enqueueTournamentPush(
  client: Queryable,
  input: {
    userId: string;
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
  const payload = await renderPushNotificationPayload(
    client,
    input.eventType,
    input.variables,
    input.fallback,
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
