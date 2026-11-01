import type {ArenaEntry} from './GameHub.js';
export type MapGameGroupId='daily'|'training'|'duel'|'tournament'|'bar';
export function mapGameGroups(entries:ArenaEntry[],now=Date.now()) {
 const order:MapGameGroupId[]=['daily','training','duel','tournament','bar'];
 return order.flatMap(id=>{
  const rows=entries.filter(e=>{
   if(e.mapExpiresAt!==undefined&&e.mapExpiresAt<=now)return false;
   const group=e.mapGroup??(e.kind==='classic'||e.id.startsWith('playoff-')?'tournament':e.kind);
   return group===id;
  });
  if(!rows.length)return [];
  // Stable carousel order; deadline priority only selects the initial card and rail label.
  const priority=[...rows].sort((a,b)=>(a.dockState==='done'?1:0)-(b.dockState==='done'?1:0)||(a.deadlineAt??Infinity)-(b.deadlineAt??Infinity));
  return [{id,entries:rows,first:priority[0]!,done:rows.every(e=>e.mapDone??e.dockState==='done')}];
 });
}
