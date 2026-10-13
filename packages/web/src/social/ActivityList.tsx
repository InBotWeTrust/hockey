import { Fragment, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CheckCheck, Plus, Minus } from 'lucide-react';
import './social.css';
import { HistoryDayHeading, historyDayKey } from './HistoryDayHeading.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { useSocial } from './SocialContext.js';
import { useSocialPage } from './useSocialPage.js';
import { activityActor, activityOutcome, activityText } from './activityText.js';
import { ActivityModal } from './ActivityModal.js';
import { ActivityReactions } from './ActivityReactions.js';
import { LoadMoreOnScroll } from './LoadMoreOnScroll.js';
import { SocialUserPreview } from './SocialProfile.js';
import type { SocialUser } from './api.js';
import { useFeedReadState } from './useFeedReadState.js';
export function ActivityList({userId}:{userId?:string}):JSX.Element {
 const {api,viewerId}=useSocial(); const [eventId,setEventId]=useState<string|null>(null); const [player,setPlayer]=useState<SocialUser|null>(null);
 const listRef=useRef<HTMLElement|null>(null);
 const feedRead=useFeedReadState(!userId);
 const markRead=(id:string,unread?:boolean)=>{if(!userId&&unread&&!feedRead.read.isPending)feedRead.read.mutate({ids:[id]});};
 const reactions=useQuery({queryKey:['social',viewerId,'visible-reactions',userId??'feed'],queryFn:()=>{
  const ids=Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-social-event]')??[]).filter(element=>{const rect=element.getBoundingClientRect();return rect.height>0&&rect.bottom>0&&rect.top<window.innerHeight;}).map(element=>element.dataset.socialEvent!).slice(0,50);
  return ids.length?api.reactions(ids):Promise.resolve([]);
 },enabled:Boolean(viewerId&&api.reactions),refetchInterval:5000});
 const rows=useSocialPage(['activity',userId??'feed'],c=>userId?api.history(userId,c):api.feed(c));
 return <section ref={listRef} style={{marginTop:12}} aria-label={userId?'Игровая история':'Лента игровых событий'}>
  {!userId&&<div className="social-feed-tools"><span className="section-label">Непрочитанные · {feedRead.status.data?.unreadCount??'—'}</span><button className="icon-btn" aria-label="Прочитать всё" title="Прочитать всё" disabled={feedRead.read.isPending||!feedRead.status.data?.hasUnread} onClick={()=>feedRead.read.mutate({through:feedRead.status.data!.asOf})}><CheckCheck size={16} aria-hidden="true"/></button></div>}
  {feedRead.read.isError&&<p className="social-error-state" role="alert">Не удалось отметить события прочитанными. Попробуйте ещё раз.</p>}
  {rows.isLoading?<p className="modal-copy">Загрузка…</p>:rows.isError?<p className="social-error-state" role="alert">Не удалось загрузить события: <button className="social-retry-link" onClick={()=>void rows.refetch()}>повторить</button></p>:<div className={rows.items.length?'glass social-history-list':undefined}>
   {!rows.items.length&&<p className="modal-copy">Пока нет событий. Станьте болельщиком игрока, чтобы видеть его новые результаты.</p>}
   {rows.items.map((event,index)=>{const actor=activityActor(event,userId);const previous=rows.items[index-1];return <Fragment key={event.id}>
    {(!previous||historyDayKey(event.occurredAt)!==historyDayKey(previous.occurredAt))&&<HistoryDayHeading iso={event.occurredAt}/>}
    <article className="social-feed-event" {...(event.kind!=='membership'?{'data-social-event':event.id}:{})}>
    {!userId&&<button className="social-feed-avatar" aria-label={`Профиль: ${actor.displayName}`} onClick={()=>setPlayer(actor)}><UserAvatar avatarUrl={actor.avatarUrl} name={actor.displayName} size={32}/></button>}
    <div className="social-feed-content">
    <div className="social-feed-heading">{!userId&&<button className="profile-social-count social-feed-name" onClick={()=>setPlayer(actor)}>{actor.displayName}</button>}<span className="social-feed-time-group"><time className="social-feed-time" dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time>{!userId&&event.unread&&<span className="segmented-tabs__attention social-feed-unread" role="status" aria-label="Новое событие"/>}</span></div>
    {event.kind==='membership'?<button type="button" className="social-feed-result" onClick={()=>markRead(event.id,event.unread)}>{event.data.action==='follow'?<Plus size={12} className="social-membership-icon social-membership-icon--follow"/>:<Minus size={12} className="social-membership-icon social-membership-icon--unfollow"/>} {activityText(event,actor)}</button>:<ActivityReactions event={{...event,reactions:reactions.data?.find(r=>r.id===event.id)?.reactions??event.reactions??[]}} label={`Посмотреть событие: ${activityText(event,actor)}`} onOpen={()=>{markRead(event.id,event.unread);setEventId(event.id);}}>
     {(['duel','bar_fight','bar_cards'].includes(event.kind))&&<span aria-hidden="true" className={`social-feed-outcome social-feed-outcome--${activityOutcome(event,actor)}`}/>}
     {event.kind==='playoff'&&event.data.seriesCompleted&&event.data.seriesWinnerId&&<span aria-hidden="true" className={`social-feed-outcome social-feed-outcome--${event.data.seriesWinnerId===actor.id?'win':'loss'}`}/>}
     {event.kind==='achievement'&&<Check aria-hidden="true" className="social-feed-check" size={12}/>}{activityText(event,actor)}
    </ActivityReactions>}
    </div>
   </article></Fragment>;})}
  </div>}
  <LoadMoreOnScroll hasMore={rows.hasNextPage} loading={rows.isFetching} error={rows.isFetchNextPageError} load={rows.fetchNextPage}/>
  {eventId&&<ActivityModal eventId={eventId} {...(userId?{userId}:{})} onClose={()=>setEventId(null)}/>}
  {player&&<SocialUserPreview user={player} onClose={()=>setPlayer(null)}/>}
 </section>;
}
