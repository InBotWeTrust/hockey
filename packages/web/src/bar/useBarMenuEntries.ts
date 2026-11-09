import {createElement,useEffect,useState} from 'react';
import {BarMapInviteActions} from './BarMapInviteActions.js';
import {useCardInvites,incomingInvites} from './cards/cardInvites.js';
import {useGameInvites,incomingGameInvites} from './games/gameInviteStore.js';
import type {ArenaEntry} from '../city/GameHub.js';
import {snapshot} from './cards/onlineApi.js';
import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {useAuthStore} from '../auth/authStore.js';
import {useBarMenuStore} from './barMenuStore.js';
import {readRoom} from './cards/roomApi.js';
import {gameApi} from './games/api.js';
import {barMenuEntries} from './barMenuEntries.js';
export function useBarMenuEntries(){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const cardIncoming=useCardInvites(s=>s.incoming);
 const gameIncoming=useGameInvites(s=>s.incoming);
 const gameOwner=useGameInvites(s=>s.owner);
 const owner=useAuthStore(s=>s.user?.id),navigate=useNavigate();
 const cards=useBarMenuStore(s=>s.cards),games=useBarMenuStore(s=>s.games);
 const cardData=cards?.owner===owner?cards?.data:null,gameData=games?.owner===owner?games?.data:null;
 const roomId=cardData?.roomId,matchId=gameData?.matchId,cardMatchId=cardData?.matchId;
 const cardMatch=useQuery({queryKey:['bar-menu',owner,'card-match',cardMatchId],queryFn:()=>snapshot(cardMatchId!),enabled:!!owner&&!!cardMatchId&&!roomId,refetchInterval:5000,retry:false});
 const room=useQuery({queryKey:['bar-menu',owner,'room',roomId],queryFn:()=>readRoom(roomId!),enabled:!!owner&&!!roomId,refetchInterval:5000,retry:false});
 const match=useQuery({queryKey:['bar-menu',owner,'match',matchId],queryFn:()=>gameApi.read(matchId!),enabled:!!owner&&!!matchId,refetchInterval:5000,retry:false});
 let localCards=false;
 if(owner)try{const saved=JSON.parse(sessionStorage.getItem(`bar-maria-game:${owner}`)??'null');localCards=!!saved&&saved.result===null&&Array.isArray(saved.hands);}catch{/* Corrupt or unavailable local saves are ignored. */}
 if(!owner)return [];

 const entries=barMenuEntries(owner,cardData??null,gameData??null,room.data,match.data,navigate,now,localCards,cardMatch.data);
 const labels:Record<string,string>={darts:'Дартс',billiards:'Бильярд',armwrestling:'Армрестлинг',ochko:'Очко',checkers:'Шашки',battleship:'Морской бой'};
 const add=(id:string,kind:'cards'|'games',label:string,name:string,avatar:string|null|undefined,expires:number,incoming:boolean)=>{
 const entryId=kind==='cards'?`bar-card-invite-${id}`:`bar-invite-${id}`;
 const previous=entries.findIndex(e=>e.id===entryId);if(previous>=0)entries.splice(previous,1);
 entries.push({id:entryId,kind:'bar',eyebrow:label,title:name,opponentName:name,opponentAvatarUrl:avatar??null,subtitle:incoming?'Вас вызывают на игру':'Ждём ответ соперника',meta:'',dockState:'ready',attention:incoming,deadlineAt:expires,mapExpiresAt:expires,ctaLabel:'',onEnter:()=>{},secondaryActions:createElement(BarMapInviteActions,{id,kind,owner,incoming})} satisfies ArenaEntry);
 const added=entries.at(-1)!;
 added.mapLabel=`${incoming?'Ответ':'Ждём'} ${Math.floor(Math.max(0,expires-now)/60000)}:${String(Math.floor(Math.max(0,expires-now)/1000)%60).padStart(2,'0')}`;
 added.meta=added.mapLabel;
 };
 for(const i of incomingInvites(cardIncoming,owner,now))add(i.id,'cards','Карты',i.sender_name,i.sender_avatar_url,Date.parse(i.expires_at),true);
 for(const i of gameOwner===owner?incomingGameInvites(gameIncoming,owner,now):[])add(i.id,'games',labels[i.kind]??'Бар',i.senderName,i.senderAvatarUrl,i.expiresAt,true);
 for(const i of cardData?.invites??[])if(i.sender_id===owner&&i.status==='pending'&&Date.parse(i.expires_at)>now)add(i.id,'cards','Карты',i.receiver_name,null,Date.parse(i.expires_at),false);
 for(const i of gameData?.invites??[])if(i.senderId===owner&&i.status==='pending'&&i.expiresAt>now)add(i.id,'games',labels[i.kind]??'Бар',i.receiverName,null,i.expiresAt,false);
 return entries;

}
