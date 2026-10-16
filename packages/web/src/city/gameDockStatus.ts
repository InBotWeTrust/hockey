import type {ArenaEntry} from '../screens/DailyScreen.js';
export type GameDockStatus={label:string|null;urgent:boolean};
function timerFor(entry:ArenaEntry):string|null{
 const scoreboard=entry.scoreboard?.props as {timer?:string;timerLabel?:string}|undefined;
 const value=entry.dockTimer??scoreboard?.timer;
 return scoreboard?.timerLabel!=='Счёт'&&value&&/\d+:\d{2}/.test(value)?value:null;
}
export function gameDockStatus(entries:ArenaEntry[]):GameDockStatus{
 const urgent=entries.some(entry=>entry.attention);
 const events=entries.filter(entry=>(entry.kind==='duel'||entry.kind==='classic')&&entry.dockState!=='done').sort((a,b)=>(a.deadlineAt??Infinity)-(b.deadlineAt??Infinity));
 for(const entry of events){const timer=timerFor(entry);if(timer)return {label:timer,urgent};}
 const available=entries.filter(entry=>entry.dockState==='ready'||entry.dockState==='active'||entry.dockState==='break');
 const ordered=[...available.filter(entry=>entry.dockState==='active'||entry.dockState==='break'),...available.filter(entry=>entry.dockState==='ready')];
 for(const entry of ordered){const timer=timerFor(entry);if(timer)return {label:timer,urgent};}
 return {label:null,urgent};
}
