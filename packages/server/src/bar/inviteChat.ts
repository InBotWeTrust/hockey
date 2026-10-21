import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import type { BarGameId } from '@hockey/game-core';
import { findOrCreateDM, sendMessage } from '../chat/service.js';
import { toChatMessageDTO } from '../chat/dto.js';
import type { ChatEvent, ChatMessageDTO, MessageRow } from '../chat/types.js';
import type { EventPublisher } from '../chat/events.js';
import { invalidateUnreadCache } from '../chat/cache.js';

export const barGameLabels = { darts: 'Дартс', checkers: 'Шашки', billiards: 'Бильярд', ochko: 'Очко', armwrestling: 'Армрестлинг', battleship: 'Морской бой', cards: 'Карты' };
export type BarInviteInput = { id: string; senderId: string; receiverId: string; kind: BarGameId | 'cards'; capacity: number; capacities?: number[]; expiresAt: Date; roomId: string | null };
type Delivery = { users: string[]; event: ChatEvent };
const contexts = new WeakMap<Pool, { publisher: EventPublisher; redis: Pick<Redis, 'del'> }>();
const deliveries = new WeakMap<PoolClient, Delivery[]>();
export function configureBarInviteChat(pool: Pool, publisher: EventPublisher, redis: Pick<Redis, 'del'>) {
  contexts.set(pool, { publisher, redis });
}
function queue(client: PoolClient, users: string[], message: ChatMessageDTO, updated = false) {
  const pending = deliveries.get(client) ?? [];
  pending.push({ users, event: { type: updated ? 'message:updated' : 'message:new', chatId: message.chatId, message } });
  deliveries.set(client, pending);
}
export function discardBarInviteMessages(client: PoolClient) { deliveries.delete(client); }
export async function publishBarInviteMessages(pool: Pool, client: PoolClient) {
  const pending = deliveries.get(client) ?? [];
  deliveries.delete(client);
  const context = contexts.get(pool);
  if (!context) return;
  // Durable writes have committed. A failed Redis operation must not fail the action.
  await Promise.allSettled(pending.flatMap(({ users, event }) => users.flatMap(user => [
    invalidateUnreadCache(context.redis as Redis, user),
    context.publisher.publish(`chat:user:${user}`, event),
  ])));
}
export async function createBarInviteMessage(pool: Pool, client: PoolClient, invite: BarInviteInput) {
  const dm = await findOrCreateDM(pool, invite.senderId, invite.receiverId, client);
  const metadata = { type: 'bar_game_invite', inviteId: invite.id, kind: invite.kind, senderId: invite.senderId, receiverId: invite.receiverId, capacity: invite.capacity, capacities: invite.capacities ?? [invite.capacity], expiresAt: invite.expiresAt.toISOString(), roomId: invite.roomId, matchId: null, status: 'pending' };
  const formats = invite.capacities ?? [invite.capacity];
  const formatLabel = formats.length > 1 ? `${formats.join(' / ')} игроков` : `${invite.capacity} ${invite.capacity < 5 ? 'игрока' : 'игроков'}`;
  const content = `Приглашение: ${barGameLabels[invite.kind]} · ${formatLabel}\nОтветить до ${invite.expiresAt.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })} МСК`;
  const message = await sendMessage(pool, { chatId: dm.chatId, senderId: invite.senderId, content, metadata }, client);
  queue(client, [invite.senderId, invite.receiverId], message);
}
export async function syncBarInviteMessages(pool: Pool, client: PoolClient) {
  const pending = await client.query<MessageRow & { invite_status: string; invite_match_id: string | null }>(`
    select m.*,coalesce(c.status,g.status,'cancelled') as invite_status,coalesce(c.match_id,g.match_id) as invite_match_id
    from messages m
    left join bar_card_invites c on m.metadata->>'kind'='cards' and c.id=(m.metadata->>'inviteId')::uuid
    left join bar_game_invites g on m.metadata->>'kind'<>'cards' and g.id=(m.metadata->>'inviteId')::uuid
    where m.metadata->>'type'='bar_game_invite' and m.metadata->>'status'='pending'
      and coalesce(c.status,g.status,'cancelled')<>'pending'
    for update of m`);
  for (const row of pending.rows) {
    const meta = row.metadata!;
    const status = row.invite_status;
    if (status === 'pending') continue;
    const metadata = { ...meta, status, matchId: row.invite_match_id };
    const updated = await client.query<MessageRow>(`with updated as (
      update messages set metadata=$2::jsonb,updated_at=clock_timestamp() where id=$1 returning *
    ) select updated.*,u.display_name as sender_display_name,u.avatar_url as sender_avatar_url from updated join users u on u.id=updated.sender_id`, [row.id, JSON.stringify(metadata)]);
    const users = [String(meta.senderId), String(meta.receiverId)];
    queue(client, users, toChatMessageDTO(updated.rows[0]!), true);
    if (status === 'expired') continue;
    const content = status === 'accepted' ? `Приглашение принято: ${barGameLabels[meta.kind as keyof typeof barGameLabels]}.` : status === 'declined' ? `Приглашение отклонено: ${barGameLabels[meta.kind as keyof typeof barGameLabels]}.` : `Приглашение отменено: ${barGameLabels[meta.kind as keyof typeof barGameLabels]}.`;
    const senderId = status === 'cancelled' ? users[0]! : users[1]!;
    const notice = await sendMessage(pool, { chatId: row.chat_id, senderId, content, metadata: { ...metadata, type: 'bar_game_invite_status' } }, client);
    queue(client, users, notice);
  }
}
