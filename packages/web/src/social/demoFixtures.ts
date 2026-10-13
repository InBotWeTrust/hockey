import type { ActivityEvent, ActivityKind, FanHistoryItem, SocialApi, SocialPage, SocialUser } from './api.js';
import type { AchievementDto } from '../api/achievements.js';
import type { UserPublicProfileDTO } from '../chat/api.js';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const DEMO_OWNER:SocialUser={id:id(1),displayName:'Ваш профиль',avatarUrl:null};
export const DEMO_PLAYER:SocialUser={id:id(2),displayName:'Алексей Соколов',avatarUrl:null};
export const DEMO_OPPONENT:SocialUser={id:id(3),displayName:'Никита Волков',avatarUrl:null};
export const FAN_STAGES=[
 [1,'Первый болельщик',5],[10,'Группа поддержки',10],[20,'Свой сектор',15],[50,'Всё громче',30],
 [100,'Трибуна за тебя',50],[500,'Любимец трибун',140],[1000,'Целая арена',250],
] as const;
export const DEMO_SCENARIOS=[
 ['all','Все события и результаты'],['empty','Пустые списки и лента'],['subscription','Подписка и отписка'],
 ['refollow','Повторная подписка: новый период'],['pagination','Несколько страниц'],['loading','Загрузка'],
 ['error','Ошибка загрузки'],['follow-error','Ошибка подписки'],['unavailable','Недоступный результат'],
 ['push','Открытие из push'],['push-missing','Push: профиль недоступен'],['remove-error','Ошибка удаления болельщика'],
 ['privacy','История доступна только болельщику'],
] as const;
export type DemoScenario=(typeof DEMO_SCENARIOS)[number][0];
export function fanAchievements(count:number,claimed:ReadonlySet<string>):AchievementDto[] {
 return FAN_STAGES.map(([threshold,title,reward])=>({id:`fans-${threshold}`,photoUrl:`/achievements/fans-${threshold}.webp?v=20261013`,title,description:'Трибуны поддерживают тебя.',requirement:`Набрать ${threshold} ${Number(threshold)===1?'болельщика':'болельщиков'}.`,category:'fans',availability:'active',futureTag:null,rewardCurrency:0,rewardStars:reward,rewardExperience:reward,rewardTokens:0,status:claimed.has(`fans-${threshold}`)?'claimed':count>=threshold?'completed_unclaimed':'locked',isUnlocked:count>=threshold||claimed.has(`fans-${threshold}`),isClaimable:count>=threshold&&!claimed.has(`fans-${threshold}`)}));
}
export function demoProfile(user:SocialUser):UserPublicProfileDTO {
 return {id:user.id,displayName:user.displayName,avatarUrl:user.avatarUrl,competitionLevel:'amateur',stats:{shots:2000,goals:1250,accuracy:62.5,playStreakDays:9,bestPlayStreakDays:15},achievements:[],createdAt:'2026-01-01T00:00:00Z',lastSeenAt:new Date().toISOString()};
}
export function makeDemoEvents():ActivityEvent[] {
 const now=Date.now();
 const actors=[{...DEMO_PLAYER,visible:true},{...DEMO_OPPONENT,visible:true}];
 const participants=[{userId:DEMO_PLAYER.id,goals:27,shots:30,score:27,durationMs:80000},{userId:DEMO_OPPONENT.id,goals:24,shots:30,score:24,durationMs:85000}];
 const kinds:ActivityKind[]=['daily','training','initial_course','advanced_course','achievement','regular','playoff','playoff','duel','bar_fight','bar_cards','bar_cards','duel','duel','duel','bar_fight'];
 return kinds.map((kind,index)=>{
  const occurredAt=new Date(now-(index+1)*60000).toISOString();
  const event:ActivityEvent={id:id(100+index),kind,occurredAt,actors:kind==='daily'||kind==='training'||kind.includes('course')||kind==='achievement'||kind==='bar_fight'||index===10?[actors[0]!]:actors,data:{}};
  if(kind==='daily')event.data={daily:{day_date:occurredAt.slice(0,10),total_shots:90,total_goals:76,total_duration_ms:240000,periods:[1,2,3].map(p=>({period_number:p,shots_taken:30,goals:p===3?24:26,closed_reason:'quota',duration_ms:80000,ended_at:occurredAt}))}};
  if(kind==='training')event.data={training:{day_date:occurredAt.slice(0,10),selected_period:1,shots_limit:50,total_shots:50,total_goals:42,completed:true}};
  if(kind==='initial_course'||kind==='advanced_course')event.data={exercises:kind==='initial_course'?7:8};
  if(kind==='achievement')event.data={achievement:fanAchievements(1000,new Set(['fans-100']))[4]!};
  if(kind==='regular'||kind==='duel')event.data={participants,format:'express',winnerId:DEMO_PLAYER.id,outcome:'challenger_win',reason:'completed',tournamentTitle:'Кубок лиги'};
  if(kind==='playoff')event.data={seriesCompleted:index===6,seriesWinnerId:index===6?DEMO_PLAYER.id:null,roundName:'1/2 финала',day:index===6?2:1,tournamentTitle:'Кубок лиги · полуфинал',seriesScore:{home:index===6?2:1,away:1,homeId:DEMO_PLAYER.id,awayId:DEMO_OPPONENT.id},games:[{homeId:DEMO_PLAYER.id,awayId:DEMO_OPPONENT.id,homeScore:32,awayScore:29,outcome:index===6?'away_no_show':'home_win'}]};
  if(kind==='bar_fight')event.data={character:'oleg',outcome:index===15?'win':'loss',blockedUntil:index===15?null:new Date(new Date().setHours(24,0,0,0)).toISOString(),timezone:'Europe/Moscow'};
  if(kind==='bar_cards')event.data=index===10?{character:'maria',outcome:'loss',game:'Дурак'}:{participants:[{userId:DEMO_PLAYER.id,outcome:'win'},{userId:DEMO_OPPONENT.id,outcome:'loss'}],game:'Дурак'};
  if(index===12)event.data={participants,winnerId:DEMO_OPPONENT.id,outcome:'opponent_win',format:'classic',reason:'completed'};
  if(index===13)event.data={participants:participants.map(p=>({...p,score:24})),winnerId:null,outcome:'draw',format:'express_plus',reason:'completed'};
  if(index===14)event.data={participants,winnerId:DEMO_PLAYER.id,outcome:'challenger_win',format:'sniper',reason:'opponent_forfeit'};
  return event;
 });
}

export function createDemoModel(scenario:DemoScenario) {
 const now=Date.now();
 const follows=new Map<string,number>();
 if(!['empty','subscription','privacy'].includes(scenario)) {follows.set(DEMO_PLAYER.id,now-(scenario==='refollow'?5:60)*60000);follows.set(DEMO_OPPONENT.id,now-60*60000);}
 const people=new Map<string,SocialUser>();[DEMO_OWNER,DEMO_PLAYER,DEMO_OPPONENT].forEach(p=>people.set(p.id,p));
 let fans:SocialUser[]=Array.from({length:scenario==='empty'?0:scenario==='pagination'?65:3},(_,i)=>({id:id(500+i),displayName:['Михаил','Илья','Андрей'][i%3]+` ${i+1}`,avatarUrl:null}));
 fans.forEach(p=>people.set(p.id,p));
 const history:FanHistoryItem[]=fans.map((fan,i)=>({...fan,id:id(1000+i),userId:fan.id,action:i===2?'unfollow':'follow',occurredAt:new Date(now-i*60000).toISOString()}));
 let events=makeDemoEvents();
 if(scenario==='pagination')events=Array.from({length:65},(_,i)=>({...events[i%events.length]!,id:id(10000+i),occurredAt:new Date(now-i*10000).toISOString()}));
 const ownEvents=makeDemoEvents().filter(e=>e.actors.length===1).map(e=>({...e,id:id(Number(e.id.slice(-12))+2000),actors:[DEMO_OWNER]}));
 events=[...events,...ownEvents];
 let pushEnabled=true;
 const pushLog:Array<{fanId:string;occurredAt:number}>=[];
 const wait=async()=>{if(scenario==='loading')await new Promise(r=>setTimeout(r,2500));if(scenario==='error')throw new Error('Сеть недоступна');};
 const summary=(userId:string)=>({followersCount:userId===DEMO_OWNER.id?fans.length:24+(follows.has(userId)?1:0),followingCount:userId===DEMO_OWNER.id?follows.size:7,following:follows.has(userId),canFollow:userId!==DEMO_OWNER.id});
 const paged=<T,>(items:T[],cursor?:string):SocialPage<T>=>{const offset=Number(cursor??0);return {items:items.slice(offset,offset+50),nextCursor:offset+50<items.length?String(offset+50):null};};
 const accessible=(e:ActivityEvent)=>e.actors.some(a=>a.id===DEMO_OWNER.id||((follows.get(a.id)??Infinity)<=Date.parse(e.occurredAt)));
 const visible=(e:ActivityEvent)=>({...e,actors:e.actors.map(a=>({...a,visible:a.id===DEMO_OWNER.id||(follows.get(a.id)??Infinity)<=Date.parse(e.occurredAt)}))});
 const bios=new Map<string,string>([[DEMO_PLAYER.id,'Живу хоккеем. Болею за красивую игру и честную борьбу 🏒']]);
 const api:SocialApi={
  reactions:async ids=>events.filter(e=>ids.includes(e.id)&&accessible(e)).map(e=>({id:e.id,reactions:e.reactions??[]})),
  fanRating:async cursor=>paged([...people.values()].map(p=>({...p,count:summary(p.id).followersCount})).sort((a,b)=>b.count-a.count).map((p,i)=>({...p,place:i+1})),cursor),
  react:async(eventId,emoji,remove)=>{
   await wait();const event=events.find(e=>e.id===eventId);if(!event||!accessible(event))throw new Error('Событие недоступно');
   event.reactions=(event.reactions??[]).map(r=>({...r,count:r.count-(r.reactedByMe?1:0),reactedByMe:false})).filter(r=>r.count>0);
   if(!remove){const existing=event.reactions.find(r=>r.emoji===emoji);if(existing){existing.count++;existing.reactedByMe=true;}else event.reactions.push({emoji,count:1,reactedByMe:true});}
   return visible(event);
  },
  bio:async userId=>({bio:bios.get(userId)??''}),
  saveBio:async bio=>{bios.set(DEMO_OWNER.id,bio.trim());return {bio:bio.trim()};},
  summary:async id=>{await wait();return summary(id);},
  profile:async userId=>{await wait();const p=people.get(userId);if(!p)throw new Error('Профиль недоступен');return p;},
  follow:async(userId,following)=>{await wait();if(scenario==='follow-error')throw new Error('Сеть недоступна');
   if(following&&!follows.has(userId)){
    follows.set(userId,Date.now());
    events.unshift({...makeDemoEvents()[1]!,id:id(Date.now()%100000000),occurredAt:new Date(Date.now()+1).toISOString()});
   }else if(!following)follows.delete(userId);return summary(userId);
  },
  removeFan:async userId=>{await wait();if(scenario==='remove-error')throw new Error('Сеть недоступна');const p=people.get(userId);if(p&&fans.some(f=>f.id===userId)){fans=fans.filter(f=>f.id!==userId);history.unshift({...p,userId,id:id(Date.now()%100000000),action:'remove',occurredAt:new Date().toISOString()});}return summary(DEMO_OWNER.id);},
  people:async(userId,list,cursor)=>{await wait();const users=userId===DEMO_OWNER.id?(list==='fans'?fans:Array.from(follows.keys()).map(id=>people.get(id)!)):Array.from(people.values()).filter(p=>p.id!==userId);return paged(users,cursor);},
  membershipHistory:async cursor=>{await wait();return paged(history,cursor);},
  feed:async cursor=>{await wait();return paged([...events.filter(e=>e.actors.some(a=>(follows.get(a.id)??Infinity)<=Date.parse(e.occurredAt))).map(visible),...history.map(h=>({id:h.id,kind:'membership' as const,occurredAt:h.occurredAt,data:{action:h.action},actors:[{id:h.userId,displayName:h.displayName,avatarUrl:h.avatarUrl}]}))].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||b.id.localeCompare(a.id)),cursor);},
  history:async(userId,cursor)=>{await wait();if(userId!==DEMO_OWNER.id&&!follows.has(userId))throw new Error('Сначала станьте болельщиком');return paged(events.filter(e=>e.actors.some(a=>a.id===userId)&&accessible(e)).map(visible),cursor);},
  event:async eventId=>{await wait();const e=events.find(e=>e.id===eventId);if(!e||!accessible(e)||scenario==='unavailable')throw new Error('Результат недоступен');return visible(e);},
 };
 return {api,summary,events,people,pushLog,get pushEnabled(){return pushEnabled;},setPushEnabled:(enabled:boolean)=>{pushEnabled=enabled;},simulateFan:(fanId=DEMO_OPPONENT.id)=>{if(pushEnabled&&!pushLog.some(p=>p.fanId===fanId&&Date.now()-p.occurredAt<86400000))pushLog.push({fanId,occurredAt:Date.now()});}};
}
