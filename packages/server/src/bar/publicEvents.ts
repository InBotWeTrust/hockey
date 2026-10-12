import type {Pool} from 'pg';
import {z} from 'zod';
export const publicEventQuerySchema=z.object({
 playerName:z.string().trim().max(80),
 kind:z.enum(['any','durak','fight']),
 character:z.enum(['any','maria','daria','grigory','arsenich','veronika','oleg','timofey','igor']),
 days:z.number().int().min(1).max(90),
}).strict();
export type PublicEventQuery=z.infer<typeof publicEventQuerySchema>;
interface Row {id:string;display_name:string;kind:'fight'|'durak';character_id:string;outcome:'win'|'loss'|'draw';ended_at:Date|string;surrendered?:boolean;caught_cheats?:number}
export class SqlPublicBarEvents {
 constructor(private readonly pool:Pool){}
 async find(query:PublicEventQuery){
  const args=publicEventQuerySchema.parse(query);
  let player:string|null=null;
  if(args.playerName){
   const matches=await this.pool.query<{id:string;display_name:string}>(
    `select id,display_name from users where lower(btrim(display_name))=lower($1) order by id limit 2`,[args.playerName]);
   if(matches.rows.length>1)return {ambiguous:true,events:[],instruction:'Несколько игроков с таким именем. Уточни, о ком речь; не выбирай произвольно.'};
   if(!matches.rows.length)return {ambiguous:false,events:[],days:args.days,hasMore:false};
   player=matches.rows[0]!.id;
  }
  const parameters=[player,args.character,args.days];
  const results:Row[]=[];
  if(args.kind!=='durak'&&(args.character==='any'||args.character==='oleg')){
   const fights=await this.pool.query<Row>(`select f.id,u.display_name,'fight' as kind,'oleg' as character_id,
    f.outcome,f.ended_at
    from bar_oleg_fights f join users u on u.id=f.user_id
    where f.status='resolved' and f.outcome in ('win','loss','draw') and f.ended_at>=now()-($3::integer*interval '1 day')
     and ($1::uuid is null or f.user_id=$1) and ($2::text='any' or $2='oleg')
    order by f.ended_at desc,f.id desc limit 6`,parameters);
   results.push(...fights.rows);
  }
  if(args.kind!=='fight'){
   const cards=await this.pool.query<Row>(`select h.id,u.display_name,'durak' as kind,h.character_id,h.result as outcome,
    h.ended_at,h.surrendered,h.caught_cheats
    from bar_computer_card_history h join users u on u.id=h.user_id
    where h.ended_at>=now()-($3::integer*interval '1 day') and ($1::uuid is null or h.user_id=$1)
     and ($2::text='any' or h.character_id=$2)
    order by h.ended_at desc,h.id desc limit 6`,parameters);
   results.push(...cards.rows);
  }
  const selected=results.sort((a,b)=>new Date(b.ended_at).getTime()-new Date(a.ended_at).getTime()||b.id.localeCompare(a.id)).slice(0,5);
  return {ambiguous:false,days:args.days,hasMore:results.length>5,events:selected.map(row=>({
   eventId:row.id,playerName:row.display_name.slice(0,80),kind:row.kind,character:row.character_id,
   winner:row.outcome==='draw'?'draw':row.outcome==='win'?'player':row.character_id,
   endedAt:new Date(row.ended_at).toISOString(),provenance:row.kind==='fight'?'server':'client',
   ...(row.kind==='durak'?{surrendered:row.surrendered===true,caughtCharacterCheats:row.caught_cheats??0}:{}),
  }))};
 }
}
