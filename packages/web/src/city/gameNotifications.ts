import type {ArenaEntry} from '../screens/DailyScreen.js';
function isPendingEvent(entry:ArenaEntry):boolean {
 return (entry.kind==='duel'||entry.kind==='classic'||entry.kind==='bar')&&entry.dockState!==undefined&&entry.dockState!=='done';
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
export function viewedGameIds(entries:ArenaEntry[],pathname:string,search:string):Set<string>{
 const params=new URLSearchParams(search);
 let id:string|null=null;
 const bar=pathname.match(/^\/bar\/(games\/match|cards\/match|cards\/room)\/([^/]+)$/);
 if(bar){
  try {id=`${bar[1]==='games/match'?'bar-game':bar[1]==='cards/match'?'bar-cards':'bar-room'}-${decodeURIComponent(bar[2]!)}`;}
  catch { /* Invalid route encodings must not break global navigation. */ }
 }
 if(pathname==='/bar/cards/maria'||pathname.startsWith('/bar/cards/computer/'))id='bar-local-cards';
 if(pathname==='/'&&params.get('view')==='classic')id=`classic-${params.get('tournament')}`;
 const match=pathname==='/'&&params.get('view')==='amateur'&&params.get('play')==='1'?params.get('match'):null;
 return new Set(entries.filter(entry=>entry.inProgress&&(entry.id===id||!!match&&(entry.id===`duel-${match}`||entry.matchId===match))).map(entry=>entry.id));
}
export function gameNotifications(entries:ArenaEntry[],viewed:ReadonlySet<string>=new Set()):{count:number;urgent:boolean;pulsing:boolean;firstIndex:number|null}{
 const unfinished=entries.map((entry,index)=>({entry,index})).filter(({entry})=>entry.dockState!==undefined&&entry.dockState!=='done');
 const events=unfinished.filter(({entry})=>isPendingEvent(entry)&&!viewed.has(entry.id)).sort((a,b)=>eventPriority(a.entry,b.entry));
 return {count:unfinished.length,urgent:events.length>0,pulsing:events.some(({entry})=>entry.inProgress===true),firstIndex:events[0]?.index??unfinished[0]?.index??null};
}
