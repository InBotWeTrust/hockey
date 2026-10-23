import {createDefaultBarLayout,type BarGameLobby,type BarGameSnapshot} from '@hockey/game-core';
import type {ArenaEntry} from '../screens/DailyScreen.js';
import type {Lobby,OnlineSnapshot} from './cards/onlineApi.js';
import type {RoomView} from './cards/roomApi.js';
import {barLobbyPath} from './barLobbyNavigation.js';
const labels:Record<string,string>={darts:'Дартс',billiards:'Бильярд',armwrestling:'Армрестлинг',ochko:'Очко',checkers:'Шашки',battleship:'Морской бой'};
export function barMenuEntries(owner:string,cards:Lobby|null,games:BarGameLobby|null,room:RoomView|undefined,match:BarGameSnapshot|undefined,open:(path:string)=>void,now=Date.now(),localCards=false,cardMatch?:OnlineSnapshot):ArenaEntry[]{
 const entries:ArenaEntry[]=[];
 const add=(id:string,title:string,path:string,started:boolean,subtitle:string,deadlineAt?:number,opponent?:{displayName:string;avatarUrl?:string|null})=>entries.push({id,kind:'bar',dockState:started?'active':'ready',inProgress:started,attention:true,eyebrow:title==='Карточный стол'?'Карты':title,title:opponent?.displayName??title,...(opponent?{opponentName:opponent.displayName,opponentAvatarUrl:opponent.avatarUrl??null}:{}),subtitle,meta:'',ctaLabel:'Вернуться',onEnter:()=>open(path),...(deadlineAt?{deadlineAt}:{})});
 if(localCards){const maria=createDefaultBarLayout().profiles.maria;add('bar-local-cards','Карты','/bar/cards/computer/maria',true,'Сохранённая партия',undefined,{displayName:maria.name,avatarUrl:maria.avatar});}
 if(cards?.roomId && room?.status!=='ended'){
  const others=room?.seats?.filter(seat=>seat.userId!==owner)??[];
  const invited=room?.invitations?.[0];
  const opponent=others.length?{displayName:others.map(seat=>seat.displayName).join(', '),avatarUrl:others[0]!.avatarUrl}:invited;
  add(`bar-room-${cards.roomId}`,'Карточный стол',`/bar/cards/room/${cards.roomId}`,room?.status==='playing',room?.pending.length?'Ждём ответ на приглашение':'Стол сохранён',undefined,opponent);
 }
 else if(cards?.matchId&&cardMatch?.result==null&&!cardMatch?.readiness?.cancelled){
  const started=!!cardMatch&&(!cardMatch.readiness||cardMatch.readiness.startsAt!==null&&cardMatch.readiness.startsAt<=now);
  add(`bar-cards-${cards.matchId}`,'Карты',`/bar/cards/match/${cards.matchId}`,started,started?'Партия продолжается':'Подтвердите готовность',undefined,cardMatch?.opponent);
 }
 if(games?.matchId && match?.runtime.game.winner==null && !match?.ready?.cancelled){
  const started=!!match&&(!match.ready||match.ready.startsAt!==null&&match.ready.startsAt<=now);
  add(`bar-game-${games.matchId}`,labels[match?.kind??'']??'Барная игра',`/bar/games/match/${games.matchId}`,started,started?'Партия продолжается':'Подтвердите готовность',undefined,match?.participants?.[match.player===0?1:0]);
 }
 if(games?.searching&&!games.matchId)add(`bar-search-${games.searching}`,labels[games.searching]??'Барная игра',barLobbyPath(games.searching),false,'Ищем соперника',games.expiresAt??undefined);
 for(const i of cards?.invites??[])if(!cards?.roomId&&!cards?.matchId&&i.sender_id===owner&&i.status==='pending'&&Date.parse(i.expires_at)>now)add(`bar-card-invite-${i.id}`,'Карты',barLobbyPath('cards'),false,`Ждём ответа: ${i.receiver_name}`,Date.parse(i.expires_at));
 for(const i of games?.invites??[])if(!games?.matchId&&i.senderId===owner&&i.status==='pending'&&i.expiresAt>now)add(`bar-invite-${i.id}`,labels[i.kind]??'Барная игра',barLobbyPath(i.kind),false,`Ждём ответа: ${i.receiverName}`,i.expiresAt);
 return entries;
}
