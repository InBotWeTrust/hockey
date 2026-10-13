import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { TrainingResultModal } from '../components/TrainingHistorySection.js';
import { DailyGameStatsModal, DuelResultCompactStatsTable } from '../screens/DailyScreen.js';
import { AchievementDetailsSheet } from '../screens/profileSections.js';
import { activityActor, activityOutcome, activityText } from './activityText.js';
import { useSocial } from './SocialContext.js';
import type { ActivityEvent, ActivityParticipant } from './api.js';

export function ActivityModal({eventId,userId,onClose}:{eventId:string;userId?:string;onClose:()=>void}):JSX.Element {
 const {api,viewerId}=useSocial();
 const query=useQuery({queryKey:['social',viewerId,'event',eventId],queryFn:()=>api.event(eventId),retry:false,staleTime:0});
 if(query.isLoading||query.isError||!query.data)return <AccessibleModal title="Результат события" onClose={onClose} headerAction={<Close onClose={onClose}/>}><p role={query.isError?'alert':'status'} className="modal-copy">{query.isError?'Результат недоступен. Возможно, подписка завершена.':'Загрузка…'}</p>{query.isError&&<button className="btn btn--ghost" onClick={()=>void query.refetch()}>Повторить</button>}</AccessibleModal>;
 return <ActivityResult event={query.data} {...(userId?{userId}:{})} onClose={onClose}/>;
}
function Close({onClose}:{onClose:()=>void}):JSX.Element {return <button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={16}/></button>;}
const stats=(p:ActivityParticipant|undefined)=>p?.goals!==undefined&&p.shots!==undefined?{goals:p.goals,shots:p.shots,durationMs:p.durationMs??0}:null;
export function ActivityResult({event,userId,onClose}:{event:ActivityEvent;userId?:string;onClose:()=>void}):JSX.Element {
 const actor=activityActor(event,userId);const d=event.data;const title=`${actor.displayName} · ${activityText(event,actor)}`;
 if(event.kind==='daily'&&d.daily)return <DailyGameStatsModal stats={d.daily} totalPeriods={d.daily.periods.length} title={`${actor.displayName} · Ежедневная игра`} ariaLabel={`${actor.displayName} · Результат ежедневной игры`} closeLabel="Закрыть" onClose={onClose}/>;
 if(event.kind==='training'&&d.training)return <TrainingResultModal session={d.training} title={`${actor.displayName} · Тренировка`} onClose={onClose}/>;
 if(event.kind==='achievement'&&d.achievement)return <AchievementDetailsSheet achievement={{...d.achievement,isClaimable:false,status:'claimed'}} title={`${actor.displayName} · ${d.achievement.title}`} onClose={onClose}/>;
 const me=d.participants?.find(p=>p.userId===actor.id);const opponent=d.participants?.find(p=>p.userId!==actor.id);
 const opponentName=event.actors.find(a=>a.id===opponent?.userId)?.displayName??'Соперник';
 const outcome=activityOutcome(event,actor);
 return <AccessibleModal title={title} ariaLabel={title} onClose={onClose} headerAction={<Close onClose={onClose}/>}>
  <p className="modal-copy">{new Date(event.occurredAt).toLocaleString('ru-RU')}</p>
  {(event.kind==='duel'||event.kind==='regular')&&<>
   <div className="daily-result-modal__summary"><div><span>{outcome==='win'?'Победа':outcome==='loss'?'Поражение':'Ничья'}</span><strong>{me?.score??me?.goals??'—'} : {opponent?.score??opponent?.goals??'—'}</strong></div></div>
   <DuelResultCompactStatsTable label="Итоговый результат" meLabel={actor.displayName} me={stats(me)} opponentName={opponentName} opponent={stats(opponent)}/>
   {d.reason&&<p className="modal-copy">{reasonText(d.reason)}</p>}
  </>}
  {event.kind==='playoff'&&<>
   <p className="modal-copy">{d.tournamentTitle} · День {d.day}</p>
   {d.seriesScore&&<div className="daily-result-modal__summary"><div><span>Общий счёт серии</span><strong>{d.seriesScore.homeId===actor.id?d.seriesScore.home:d.seriesScore.away} : {d.seriesScore.homeId===actor.id?d.seriesScore.away:d.seriesScore.home}</strong></div></div>}
   <div className="duel-day-list">{d.games?.map((g,i)=><div className="duel-day-match" key={i}><span className="duel-day-match__copy"><strong>Игра {i+1}</strong><span>{g.homeId===actor.id?g.homeScore:g.awayScore}:{g.homeId===actor.id?g.awayScore:g.homeScore} · {g.outcome?reasonText(g.outcome):'Завершена'}</span></span></div>)}</div>
  </>}
  {(event.kind==='initial_course'||event.kind==='advanced_course')&&<p className="modal-copy">Пройден весь курс · {d.exercises??'все'} упражнений.</p>}
  {(event.kind==='bar_cards'||event.kind==='bar_fight')&&<>
   <p className="modal-copy">{outcome==='win'?'Победа':outcome==='loss'?'Поражение':'Ничья'}{opponent?` · Соперник: ${opponentName}`:''}{d.game?` · ${d.game}`:''}{d.surrendered?' · Сдался':''}</p>
   {d.blockedUntil&&<p className="modal-copy">Доступ в бар был закрыт до {new Date(d.blockedUntil).toLocaleString('ru-RU',{timeZone:d.timezone??'Europe/Moscow'})}.</p>}
  </>}
 </AccessibleModal>;
}
export function reasonText(reason:string):string {
 const labels:Record<string,string>={home_win:'Победа хозяев',away_win:'Победа гостей',draw:'Ничья',home_no_show:'Техническое поражение хозяев: неявка',away_no_show:'Техническое поражение гостей: неявка',both_no_show:'Неявка обоих игроков',both_incomplete:'Оба игрока не завершили матч',forfeit:'Технический результат',double_forfeit:'Техническое поражение обоих игроков',completed:'Матч завершён',quota:'Матч завершён',timeout:'Завершено по времени',opponent_forfeit:'Соперник сдался',challenger_forfeit:'Инициатор сдался'};
 return labels[reason]??'Технический результат';
}
