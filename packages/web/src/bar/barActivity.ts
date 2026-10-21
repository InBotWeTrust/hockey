import {useEffect,useState} from 'react';
import type {BarGameLobby,BarOccupantId,GameCharacter} from '@hockey/game-core';
import {useAuthStore} from '../auth/authStore.js';
import {lobby} from './cards/onlineApi.js';
import {gameApi} from './games/api.js';
export type BarActivity = Partial<Record<BarOccupantId,number>>;
export function cardActivityCount(state:{matchId:string|null;roomId?:string|null;searching:boolean;invites:{receiver_id:string;status:string;expires_at:string}[]},user:string,now:number) {
 return state.invites.filter(i=>i.receiver_id===user&&i.status==='pending'&&Date.parse(i.expires_at)>now).length+Number(!!(state.matchId||state.roomId));
}
export function gameActivityCounts(state:BarGameLobby,user:string,character:GameCharacter|null):BarActivity {
 const online=state.invites.filter(i=>i.receiverId===user&&i.status==='pending'&&i.expiresAt>state.serverNow).length+Number(!!state.matchId&&!character);
 return character&&state.matchId?{online,[character]:1}:{online};
}
export function useBarActivity(includeInvites=true):BarActivity {
 const user=useAuthStore(s=>s.user?.id);
 const [value,setValue]=useState<{owner:string;counts:BarActivity}|null>(null);
 useEffect(()=>{
  if(!user)return;
  let alive=true,reading=false;
  let cards=0,games:BarActivity={};
  const refresh=async()=>{
   if(reading||document.hidden)return;
   reading=true;
   try {
    const [c,g]=await Promise.allSettled([lobby(),gameApi.lobby()]);
    if(c.status==='fulfilled')cards=cardActivityCount(includeInvites?c.value:{...c.value,invites:[]},user,c.value.serverNow??Date.now());
    if(g.status==='fulfilled'){
     const state=includeInvites?g.value:{...g.value,invites:[]};
     if(state.matchId){
      try {const match=await gameApi.read(state.matchId);games=gameActivityCounts(state,user,match.character);}catch{/* Retain known activity until the next poll. */}
     }else games=gameActivityCounts(state,user,null);
    }
    if(alive)setValue({owner:user,counts:{...games,online:cards+(games.online??0)}});
   }finally{reading=false;}
  };
  void refresh();
  const timer=setInterval(()=>void refresh(),3000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[user,includeInvites]);
 if(import.meta.env.DEV && location.pathname.endsWith('/durak-preview.html') && new URLSearchParams(location.search).get('bar-activity')==='demo')return {online:2,veronika:1};
 return value && value.owner===user?value.counts:{};
}
