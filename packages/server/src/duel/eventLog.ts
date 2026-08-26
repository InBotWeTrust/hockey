import type { PoolClient, Pool } from 'pg';

export type EventType =
  | 'shot_mismatch'
  | 'day_pool_created'
  | 'day_pool_closed'
  | 'period_closed'
  | 'training_session_created'
  | 'training_session_closed'
  | 'amateur_duel_challenge_created'
  | 'amateur_duel_challenge_accepted'
  | 'amateur_duel_challenge_declined'
  | 'amateur_duel_challenge_cancelled'
  | 'amateur_duel_inventory_reserved'
  | 'amateur_duel_settled'
  | 'amateur_duel_star_reward'
  | 'admin_user_updated'
  | 'admin_game_setting_updated'
  | 'admin_duel_template_created'
  | 'admin_duel_template_updated'
  | 'admin_duel_template_deleted'
  | 'admin_channel_post_updated'
  | 'admin_channel_post_deleted'
  | 'admin_chat_profile_updated'
  | 'admin_chat_avatar_updated'
  | 'admin_chat_avatar_reset'
  | 'admin_push_notification_updated'
  | 'admin_inventory_item_created'
  | 'admin_inventory_item_updated'
  | 'admin_inventory_item_deleted'
  | 'profile_avatar_uploaded'
  | 'chat_attachment_uploaded';

export async function appendEvent(
  conn: Pool | PoolClient,
  userId: string,
  type: EventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await conn.query('insert into event_log (user_id, type, payload) values ($1, $2, $3)', [
    userId,
    type,
    JSON.stringify(payload),
  ]);
}
