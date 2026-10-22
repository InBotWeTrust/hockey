import type {ArenaEntry} from '../screens/DailyScreen.js';
function isPendingEvent(entry:ArenaEntry):boolean {
 return (entry.kind==='duel'||entry.kind==='classic')&&entry.dockState!==undefined&&entry.dockState!=='done';
}
function eventPriority(a:ArenaEntry,b:ArenaEntry):number {
 return Number(Boolean(b.attention))-Number(Boolean(a.attention))||((a.deadlineAt??Infinity)-(b.deadlineAt??Infinity)||0);
}
export function prioritizeGameEntries(entries:ArenaEntry[]):ArenaEntry[]{
 return [...entries].sort((a,b)=>{
  const aEvent=isPendingEvent(a),bEvent=isPendingEvent(b);
  return Number(bEvent)-Number(aEvent)||(aEvent&&bEvent?eventPriority(a,b):0);
 });
}
export function gameNotifications(entries:ArenaEntry[]):{count:number;urgent:boolean;pulsing:boolean;firstIndex:number|null}{
 const unfinished=entries.map((entry,index)=>({entry,index})).filter(({entry})=>entry.dockState!==undefined&&entry.dockState!=='done');
 const events=unfinished.filter(({entry})=>isPendingEvent(entry)).sort((a,b)=>eventPriority(a.entry,b.entry));
 return {count:unfinished.length,urgent:events.length>0,pulsing:events.some(({entry})=>entry.inProgress===true),firstIndex:events[0]?.index??unfinished[0]?.index??null};
}
