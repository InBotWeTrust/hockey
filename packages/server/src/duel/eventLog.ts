import type { PoolClient, Pool } from 'pg';

export type EventType =
  | 'shot_mismatch'
  | 'daily_shot_rejected'
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
  | 'weekly_challenge_joined'
  | 'weekly_challenge_reward_claimed'
  | 'admin_user_updated'
  | 'admin_achievement_updated'
  | 'admin_game_setting_updated'
  | 'admin_duel_template_created'
  | 'admin_duel_template_updated'
  | 'admin_duel_template_deleted'
  | 'admin_channel_post_updated'
  | 'admin_channel_post_deleted'
  | 'admin_chat_profile_updated'
  | 'admin_chat_avatar_updated'
  | 'admin_chat_avatar_reset'
  | 'admin_official_dialog_message_sent'
  | 'admin_official_dialog_updated'
  | 'admin_official_dialog_attachment_uploaded'
  | 'admin_official_account_avatar_updated'
  | 'admin_tournament_rewards_updated'
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
  createdAt?: Date,
): Promise<void> {
  await conn.query(
    `insert into event_log (user_id, type, payload, created_at)
     values ($1, $2, $3, coalesce($4::timestamptz, now()))`,
    [userId, type, JSON.stringify(payload), createdAt ?? null],
  );
}
