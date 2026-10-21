import type { ChatMessageDTO } from '../chat/api.js';
import { parseBarInvite, type BarInviteMetadata } from '../chat/components/BarInviteActions.js';
import { incomingGameInvites, useGameInvites } from './games/gameInviteStore.js';
import { incomingInvites, useCardInvites } from './cards/cardInvites.js';
let owner: string | null = null;
const resolved = new Map<string, BarInviteMetadata>();
export function applyBarInviteEvent(message: ChatMessageDTO, userId: string | null): ChatMessageDTO {
  if (owner !== userId) { resolved.clear(); owner = userId; }
  let invite = parseBarInvite(message.metadata);
  if (!invite || !userId || ![invite.receiverId, invite.senderId].includes(userId)) return message;
  // A resolution may arrive before the original message on another connection.
  // Once resolved, a delayed pending event must never reopen the invitation.
  const terminal = resolved.get(invite.inviteId);
  if (terminal && invite.status === 'pending') {
    invite = terminal;
    message = { ...message, metadata: terminal };
  }
  if (invite.status !== 'pending') resolved.set(invite.inviteId, invite);
  for (const [id, value] of resolved) {
    if (Date.parse(value.expiresAt) + 600000 < Date.now() || resolved.size > 1000) resolved.delete(id);
  }
  if (invite.receiverId !== userId) return message;
  if (invite.kind === 'cards') {
    useCardInvites.setState(state => ({
      version: state.version + 1,
      incoming: incomingInvites([
        {id:invite.inviteId,sender_id:invite.senderId,receiver_id:invite.receiverId,sender_name:message.senderDisplayName ?? 'Игрок',sender_avatar_url:message.senderAvatarUrl,receiver_name:'',status:invite.status,match_id:invite.matchId,room_id:invite.roomId,capacity:invite.capacity,...(invite.capacities?{capacities:invite.capacities}:{}),expires_at:invite.expiresAt},
        ...state.incoming.filter(i=>i.id!==invite.inviteId),
      ], userId),
    }));
  } else {
    const kind = invite.kind;
    useGameInvites.setState(state=> state.owner !== userId ? state : ({revision:state.revision+1,incoming:incomingGameInvites([
      {id:invite.inviteId,kind,senderId:invite.senderId,receiverId:invite.receiverId,senderName:message.senderDisplayName ?? 'Игрок',senderAvatarUrl:message.senderAvatarUrl,receiverName:'',status:invite.status,matchId:invite.matchId,expiresAt:Date.parse(invite.expiresAt)},
      ...state.incoming.filter(i=>i.id!==invite.inviteId),
    ],userId)}));
  }
  return message;
}
