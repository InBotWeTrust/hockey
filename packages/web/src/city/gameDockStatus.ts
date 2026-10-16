import type {ArenaEntry} from '../screens/DailyScreen.js';
export type GameDockStatus={label:string|null;urgent:boolean};
export function gameDockStatus(entries:ArenaEntry[]):GameDockStatus{
 const urgent=entries.some(entry=>entry.attention);
 const active=entries.filter(entry=>entry.dockState==='active'||entry.dockState==='break').sort((a,b)=>(a.deadlineAt??Infinity)-(b.deadlineAt??Infinity));
 for(const entry of active){
  const timer=entry.scoreboard?.props as {timer?:string}|undefined;
  if(timer?.timer&&/^\d+:\d{2}(?::\d{2})?$/.test(timer.timer))return {label:timer.timer,urgent};
 }
 return {label:entries.some(entry=>entry.dockState==='ready'||entry.dockState==='active')?'Играть':null,urgent};
}
