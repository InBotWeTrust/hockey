import { beforeEach, expect, it } from 'vitest';
import type { ChatMessageDTO } from '../chat/api.js';
import { applyBarInviteEvent } from './inviteEvents.js';
import { useGameInvites } from './games/gameInviteStore.js';
import { useCardInvites } from './cards/cardInvites.js';
const message = {id:'m',chatId:'c',senderId:'a',senderDisplayName:'Александр',senderAvatarUrl:'/avatar.png',content:'',replyToId:null,isDeleted:false,createdAt:new Date().toISOString(),reactions:[],metadata:{type:'bar_game_invite',inviteId:'i',kind:'darts',senderId:'a',receiverId:'b',status:'pending',capacity:2,matchId:null,roomId:null,expiresAt:new Date(Date.now()+60000).toISOString()}} as ChatMessageDTO;
beforeEach(()=>{applyBarInviteEvent(message,null);useGameInvites.getState().reset('b');useCardInvites.setState({incoming:[],version:0});});
it('adds the sender avatar immediately and does not duplicate a replay',()=>{
 applyBarInviteEvent(message,'b');applyBarInviteEvent(message,'b');
 expect(useGameInvites.getState().incoming).toHaveLength(1);
 expect(useGameInvites.getState().incoming[0]?.senderAvatarUrl).toBe('/avatar.png');
});
it('prevents an older poll from restoring an answered invitation',()=>{
 applyBarInviteEvent(message,'b');const old=useGameInvites.getState();
 applyBarInviteEvent({...message,metadata:{...message.metadata,status:'declined'}},'b');
 useGameInvites.getState().replace('b',old.incoming,old.revision);
 expect(useGameInvites.getState().incoming).toHaveLength(0);
});
it('ignores messages for another account',()=>{
 applyBarInviteEvent(message,'other');expect(useGameInvites.getState().incoming).toHaveLength(0);
});
it('adds and resolves a multi-seat invitation with the same avatar',()=>{
 const card={...message,metadata:{...message.metadata,kind:'cards',capacity:6}};
 applyBarInviteEvent(card,'b');expect(useCardInvites.getState().incoming[0]).toMatchObject({sender_avatar_url:'/avatar.png',capacity:6});
 applyBarInviteEvent({...card,metadata:{...card.metadata,status:'cancelled'}},'b');expect(useCardInvites.getState().incoming).toHaveLength(0);
});

it('keeps a resolution when it arrives before the original invitation',()=>{
 applyBarInviteEvent({...message,metadata:{...message.metadata,status:'declined'}},'b');
 const late=applyBarInviteEvent(message,'b');
 expect(late.metadata).toMatchObject({status:'declined'});
 expect(useGameInvites.getState().incoming).toHaveLength(0);
});
