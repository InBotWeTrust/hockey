export type CaretakerKind='flood'|'scrape';
export type CaretakerVisit={start:number;end:number;kind:CaretakerKind;skipped?:boolean};
export type CaretakerSchedule={day:string;visits:CaretakerVisit[]};
export const caretakerDay=(now:number)=>{const date=new Date(now);return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;};
export function createCaretakerSchedule(now:number,random:()=>number=Math.random):CaretakerSchedule{
 const day=new Date(now);day.setHours(0,0,0,0);
 const count=random()<.5?1:2;
 const first: CaretakerKind=random()<.5?'flood':'scrape';
 const visits=Array.from({length:count},(_,index)=>{
  const startHour=count===1?6:6+index*8;
  const windowHours=count===1?16:8;
  const start=new Date(day);start.setHours(startHour);start.setMinutes(Math.floor(random()*(windowHours*60-6)));
  return {start:start.getTime(),end:start.getTime()+(3+random()*2)*60_000,kind:index===0?first:first==='flood'?'scrape':'flood'};
 });
 return {day:caretakerDay(now),visits};
}
export const activeCaretakerVisit=(schedule:CaretakerSchedule,now:number)=>schedule.visits.find(visit=>!visit.skipped&&visit.start<=now&&now<visit.end)??null;
export const caretakerBlocked=(daily:string|undefined,training:string|undefined)=>!daily||!training||daily==='period_active'||daily==='break_active'||training==='active';
