import type { ActivityEvent, SocialUser } from './api.js';
const CHARACTERS:Record<string,{name:string;won:string;lost:string}>={maria:{name:'Мария',won:'Марии',lost:'Марии'},daria:{name:'Дарья',won:'Дарьи',lost:'Дарье'},grigory:{name:'Григорий',won:'Григория',lost:'Григорию'},arsenich:{name:'Арсенич',won:'Арсенича',lost:'Арсеничу'},timofey:{name:'Тимофей',won:'Тимофея',lost:'Тимофею'},oleg:{name:'Олег',won:'Олега',lost:'Олегу'}};
export function activityActor(event:ActivityEvent,userId?:string):SocialUser {
 return event.actors.find(a=>a.id===userId)??event.actors.find(a=>a.visible)??event.actors[0]??{id:'',displayName:'Игрок',avatarUrl:null};
}
export function activityOutcome(event:ActivityEvent,actor:SocialUser):'win'|'loss'|'draw' {
 const personal=event.data.participants?.find(p=>p.userId===actor.id)?.outcome;
 if(personal)return personal;
 if(event.data.outcome==='draw'||event.data.outcome==='double_loss'||event.data.outcome==='double_forfeit')return 'draw';
 if(event.data.character)return event.data.outcome==='win'?'win':event.data.outcome==='draw'?'draw':'loss';
 return event.data.winnerId===actor.id?'win':'loss';
}
export function activityText(event:ActivityEvent,actor=activityActor(event)):string {
 const d=event.data;const result=activityOutcome(event,actor);const character=d.character?CHARACTERS[d.character]:undefined;
 switch(event.kind) {
  case 'membership':return d.action==='follow'?'Стал вашим болельщиком':d.action==='remove'?'Вы удалили игрока из болельщиков':'Перестал болеть за вас';
  case 'daily':return `Завершил ежедневную игру${d.daily?` · ${d.daily.total_goals} из ${d.daily.total_shots}`:''}`;
  case 'training':return `Завершил тренировку${d.training?` · ${d.training.total_goals} из ${d.training.total_shots}`:''}`;
  case 'initial_course':return 'Завершил все начальные упражнения';
  case 'advanced_course':return 'Завершил все продвинутые упражнения';
  case 'achievement':return `Получил награду за достижение «${d.achievement?.title??'Достижение'}»`;
  case 'regular':return `Завершил матч регулярки · ${d.tournamentTitle??'Турнир'}`;
  case 'playoff': {
   const score=d.seriesScore?`${d.seriesScore.homeId===actor.id?d.seriesScore.home:d.seriesScore.away}:${d.seriesScore.homeId===actor.id?d.seriesScore.away:d.seriesScore.home}`:null;
   if(!d.seriesCompleted||!d.seriesWinnerId)return `Завершил дневную серию${score?` · счёт ${score}`:''}`;
   const won=d.seriesWinnerId===actor.id;
   const round=(d.roundName??'').toLowerCase();
   const stage=d.seriesKind==='third_place'?'матче за 3-е место':round.includes('1/4')||round.includes('четверть')?'1/4 финала':round.includes('1/2')||round.includes('полуфинал')?'1/2 финала':round.includes('финал')?'финале':null;
   return `${stage?`${won?'Победил':'Проиграл'} в ${stage}`:won?'Выиграл серию':'Проиграл серию'}${score?` · счёт ${score}`:''}`;
  }
  case 'duel':return `Завершил дуэль · ${d.format?({express:'Экспресс',express_plus:'Микс',classic:'Классика',sniper:'Снайпер',marathon:'Марафон'}[d.format]):'Дуэль'} · ${result==='win'?'победа':result==='loss'?'поражение':'ничья'}`;
  case 'bar_fight':return `Подрался с Олегом в баре · ${result==='win'?'победа':result==='loss'?'поражение':'ничья'}`;
  case 'bar_cards':return character?(result==='win'?`Выиграл у ${character.won} в карты в баре`:result==='loss'?`Проиграл ${character.lost} в карты в баре`:`Сыграл вничью с ${character.name} в карты в баре`):`Сыграл в ${d.game??'карты'} в баре · ${result==='win'?'победа':result==='loss'?'поражение':'ничья'}`;
 }
}
