import {useCardInvites} from './cards/cardInvites.js';
import {useGameInvites} from './games/gameInviteStore.js';
import {useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {useAuthStore} from '../auth/authStore.js';
import {respond,lobby} from './cards/onlineApi.js';
import {gameApi} from './games/api.js';
import {useBarMenuStore} from './barMenuStore.js';
export function BarMapInviteActions({id,kind,owner,incoming}:{id:string;kind:'cards'|'games';owner:string;incoming:boolean}){
 const lock=useRef(false),navigate=useNavigate(),client=useQueryClient();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function answer(action:'accept'|'decline'|'cancel'){
  if(lock.current||useAuthStore.getState().user?.id!==owner)return;
  lock.current=true;setBusy(true);setError('');
  try{
   const result=kind==='cards'?await respond(id,action):await gameApi.respond(id,action);
   if(useAuthStore.getState().user?.id!==owner)return;
   if(incoming){if(kind==='cards')useCardInvites.getState().remove(id);else useGameInvites.getState().remove(owner,id);}
   try {
   if(kind==='cards'){const state=await lobby();if(useAuthStore.getState().user?.id===owner)useBarMenuStore.getState().setCards(owner,state);}
   else {const state=await gameApi.lobby();if(useAuthStore.getState().user?.id===owner)useBarMenuStore.getState().setGames(owner,state);}
   } catch { /* A successful response must not be undone by a failed refresh. */ }
   if(useAuthStore.getState().user?.id!==owner)return;
   void client.invalidateQueries({queryKey:['bar-menu',owner]});
   if(action==='accept'){
    if('roomId' in result&&result.roomId)navigate(`/bar/cards/room/${result.roomId}`);
    else if(result.matchId)navigate(kind==='cards'?`/bar/cards/match/${result.matchId}`:`/bar/games/match/${result.matchId}`);
   }
  }catch(e){if(useAuthStore.getState().user?.id===owner)setError(e instanceof Error?e.message:'Не удалось ответить.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <div style={{width:'78%',margin:'0 auto'}}>{error&&<p role="alert">{error}</p>}<div style={{display:'grid',gridTemplateColumns:incoming?'1fr 1fr':'1fr',gap:8}}><button className="btn arena-duel-invite-action arena-duel-invite-action--decline" disabled={busy} onClick={()=>void answer(incoming?'decline':'cancel')}>{incoming?'Отклонить':'Отменить вызов'}</button>{incoming&&<button className="btn arena-duel-invite-action arena-duel-invite-action--accept" disabled={busy} onClick={()=>void answer('accept')}>Принять</button>}</div></div>;
}
