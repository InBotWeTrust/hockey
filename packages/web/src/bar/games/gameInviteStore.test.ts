import {afterEach,expect,it} from 'vitest';
import {incomingGameInvites,useGameInvites} from './gameInviteStore.js';
const invite={id:'i',kind:'darts' as const,senderId:'a',receiverId:'b',senderName:'A',receiverName:'B',status:'pending',matchId:null,expiresAt:10000};
afterEach(()=>useGameInvites.getState().reset(null));
it('counts only distinct live incoming invitations of every game kind',()=>{
 const kinds=['darts','billiards','checkers','ochko','armwrestling','battleship'] as const;
 const live=kinds.map(kind=>({...invite,id:kind,kind}));
 expect(incomingGameInvites([...live,...live,{...invite,id:'expired',expiresAt:1000},{...invite,id:'outgoing',receiverId:'a'},{...invite,id:'accepted',status:'accepted'},{...invite,id:'declined',status:'declined'}],'b',1000)).toHaveLength(6);
});
it('rejects stale poll revisions and previous-account writes',()=>{
 const store=useGameInvites.getState;store().reset('b');
 const revision=store().revision;
 store().replace('b',[{...invite,expiresAt:Date.now()+10000}],revision);
 store().remove('b','i');store().replace('b',[invite],revision);
 expect(store().incoming).toHaveLength(0);
 store().reset('c');store().replace('b',[invite],store().revision);
 expect(store().owner).toBe('c');expect(store().incoming).toHaveLength(0);
});
