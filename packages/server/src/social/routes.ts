import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { changeFollow, getFanSummary, page, parseCursor } from './service.js';
import { EMOJI_WHITELIST } from '../chat/whitelist.js';

const userParams = z.object({userId:z.string().uuid()});
const querySchema = z.object({cursor:z.string().max(500).optional()});
const authorizedActivity = `exists(select 1 from social_activity_actor actor
  left join user_follows f on f.player_id=actor.user_id and f.follower_id=$1
  where actor.activity_id=e.id and (actor.user_id=$1 or (f.created_at<=e.occurred_at)))`;
const feedActivityAccess = `exists(select 1 from social_activity_actor a join user_follows f on f.player_id=a.user_id
  where a.activity_id=e.id and f.follower_id=$1 and f.created_at<=e.occurred_at)`;
const unreadEvent = (alias:string, published:string) => `${published} > (select social_feed_read_until from users where id=$1)
  and not exists(select 1 from social_feed_read r where r.user_id=$1 and r.event_id=${alias}.id)`;

export const socialRoutes: FastifyPluginAsync = async app => {
  const userId = (params: unknown) => { const parsed=userParams.safeParse(params); if(!parsed.success) throw new AppError('bad_request','Неверный игрок',400); return parsed.data.userId; };
  const cursor = (query: unknown) => { const parsed=querySchema.safeParse(query); if(!parsed.success) throw new AppError('bad_request','Неверная страница',400); return parseCursor(parsed.data.cursor); };
  const auth={preHandler:[app.authenticate]};
  async function unreadStatus(viewer:string) {
    return (await app.pg.query(`with unread as (
      select e.id from social_activity e where ${feedActivityAccess} and ${unreadEvent('e','e.published_at')}
      union all select h.id from fan_membership_history h where h.player_id=$1 and ${unreadEvent('h','h.occurred_at')}
    ) select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "asOf",
      count(*)::int as "unreadCount",count(*)>0 as "hasUnread" from unread`,[viewer])).rows[0];
  }
  app.get('/social/feed/unread',auth,req=>unreadStatus(req.user.id));
  app.post('/social/feed/read',auth,async req=>{
    const body=z.union([
      z.object({through:z.string().datetime({offset:true})}).strict(),
      z.object({ids:z.array(z.string().uuid()).min(1).max(50)}).strict(),
    ]).safeParse(req.body);
    if(!body.success)throw new AppError('bad_request','Неверные события',400);
    const viewer=req.user.id;
    if('through' in body.data) {
      const result=await app.pg.query(`update users set social_feed_read_until=greatest(social_feed_read_until,$2::timestamptz)
        where id=$1 and $2::timestamptz<=clock_timestamp() returning id`,[viewer,body.data.through]);
      if(!result.rowCount)throw new AppError('bad_request','Неверная дата прочтения',400);
    } else {
      const allowed=await app.pg.query(`select e.id from social_activity e where e.id=any($2::uuid[]) and ${feedActivityAccess}
        union select h.id from fan_membership_history h where h.player_id=$1 and h.id=any($2::uuid[])`,[viewer,body.data.ids]);
      if(allowed.rowCount!==new Set(body.data.ids).size)throw new AppError('not_found','Событие недоступно',404);
      await app.pg.query(`insert into social_feed_read(user_id,event_id) select $1,unnest($2::uuid[]) on conflict do nothing`,[viewer,body.data.ids]);
    }
    return unreadStatus(viewer);
  });
  app.get('/social/fans/rating',auth,async req=>{
    const raw=querySchema.safeParse(req.query);if(!raw.success)throw new AppError('bad_request','Неверная страница',400);
    let cursorValue:{count:number;id:string;registered:string}|null=null;
    if(raw.data.cursor){try{cursorValue=z.object({count:z.number().int().nonnegative(),id:z.string().uuid(),registered:z.string()}).parse(JSON.parse(Buffer.from(raw.data.cursor,'base64url').toString()));}catch{throw new AppError('bad_request','Неверная страница',400);}}
    const rows=await app.pg.query(`with ranked as (
      select u.id,u.display_name as "displayName",u.avatar_url as "avatarUrl",count(f.follower_id)::int as count,
       to_char(u.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as registered,
       row_number() over(order by count(f.follower_id) desc,u.created_at,u.id)::int as place
      from users u left join user_follows f on f.player_id=u.id where u.account_kind='player'
      group by u.id
    ) select * from ranked where $1::int is null or count<$1 or (count=$1 and (registered,id)>($3::text,$2::uuid))
      order by count desc,registered,id limit 51`,[cursorValue?.count??null,cursorValue?.id??null,cursorValue?.registered??null]);
    const items=rows.rows.slice(0,50);const last=items.at(-1);
    const current=items.find(row=>row.id===req.user.id)??(await app.pg.query(`with counts as (
      select u.id,u.display_name as "displayName",u.avatar_url as "avatarUrl",u.created_at,count(f.follower_id)::int as count
      from users u left join user_follows f on f.player_id=u.id where u.account_kind='player' group by u.id
    ), ranked as (select *,row_number() over(order by count desc,created_at,id)::int as place from counts)
    select id,"displayName","avatarUrl",count,place from ranked where id=$1`,[req.user.id])).rows[0];
    return {items,currentUser:current??null,nextCursor:rows.rows.length>50&&last?Buffer.from(JSON.stringify({count:last.count,id:last.id,registered:last.registered})).toString('base64url'):null};
  });
  app.get('/users/:userId/bio',auth,async req=>{
    const result=await app.pg.query('select bio from users where id=$1',[userId(req.params)]);
    if(!result.rows[0])throw new AppError('not_found','Профиль недоступен',404);
    return result.rows[0];
  });
  app.put('/me/bio',auth,async req=>{
    const body=z.object({bio:z.string().refine(value=>Array.from(value).length<=160)}).strict().safeParse(req.body);
    if(!body.success)throw new AppError('bad_request','Описание должно содержать не больше 160 символов',400);
    const result=await app.pg.query('update users set bio=$2 where id=$1 returning bio',[req.user.id,body.data.bio.trim()]);
    return result.rows[0];
  });
  app.get('/users/:userId/fans/summary',auth,req=>getFanSummary(app.pg,req.user.id,userId(req.params)));
  app.put('/users/:userId/fan',auth,req=>changeFollow(app.pg,req.user.id,userId(req.params),true));
  app.delete('/users/:userId/fan',auth,req=>changeFollow(app.pg,req.user.id,userId(req.params),false));
  app.delete('/me/fans/:userId',auth,async req=>{
    await changeFollow(app.pg,userId(req.params),req.user.id,false,true);
    return getFanSummary(app.pg,req.user.id,req.user.id);
  });
  for(const direction of ['fans','following'] as const) app.get(`/users/:userId/${direction}`,auth,async req=>{
    const player=userId(req.params), c=cursor(req.query);
    await getFanSummary(app.pg,req.user.id,player);
    const owner=direction==='fans'?'player_id':'follower_id', other=direction==='fans'?'follower_id':'player_id';
    const rows=await app.pg.query(`select u.id,u.display_name as "displayName",u.avatar_url as "avatarUrl",to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt"
      from user_follows f join users u on u.id=f.${other} where f.${owner}=$1
      and ($2::timestamptz is null or (f.created_at,u.id)<($2::timestamptz,$3::uuid))
      order by f.created_at desc,u.id desc limit 51`,[player,c?.time??null,c?.id??null]);
    return page(rows.rows);
  });
  app.get('/me/fan-history',auth,async req=>{
    const c=cursor(req.query); const rows=await app.pg.query(`select h.id,h.action,to_char(h.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",u.id as "userId",u.display_name as "displayName",u.avatar_url as "avatarUrl"
      from fan_membership_history h join users u on u.id=h.follower_id where h.player_id=$1
      and ($2::timestamptz is null or (h.occurred_at,h.id)<($2::timestamptz,$3::uuid)) order by h.occurred_at desc,h.id desc limit 51`,[req.user.id,c?.time??null,c?.id??null]);
    return page(rows.rows);
  });
  async function activity(viewer:string,c:ReturnType<typeof parseCursor>,player:string|null,event:string|null,feedOnly=false) {
    // Never expose a subscribed opponent's pre-follow result through a followed participant.
    const rows=await app.pg.query(`select e.id,e.kind,to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",e.data,
      (${unreadEvent('e','e.published_at')}) as unread,
      coalesce((select jsonb_agg(groups) from (select emoji,count(*)::int as count,bool_or(user_id=$1) as "reactedByMe" from social_activity_reaction where activity_id=e.id group by emoji order by emoji) groups),'[]'::jsonb) reactions,
      (select jsonb_agg(jsonb_build_object('id',u.id,'displayName',u.display_name,'avatarUrl',u.avatar_url,'visible',
         u.id=$1 or exists(select 1 from user_follows f where f.follower_id=$1 and f.player_id=u.id and f.created_at<=e.occurred_at)) order by u.id)
       from social_activity_actor a join users u on u.id=a.user_id where a.activity_id=e.id) actors
      from social_activity e where ${authorizedActivity}
      and (not $6::boolean or exists(select 1 from social_activity_actor a join user_follows f on f.player_id=a.user_id
        where a.activity_id=e.id and f.follower_id=$1 and f.created_at<=e.occurred_at))
      and ($4::uuid is null or exists(select 1 from social_activity_actor a left join user_follows f on f.player_id=a.user_id and f.follower_id=$1
        where a.activity_id=e.id and a.user_id=$4 and (a.user_id=$1 or f.created_at<=e.occurred_at)))
      and ($5::uuid is null or e.id=$5)
      and ($2::timestamptz is null or (e.occurred_at,e.id)<($2::timestamptz,$3::uuid))
      order by e.occurred_at desc,e.id desc limit 51`,[viewer,c?.time??null,c?.id??null,player,event,feedOnly]);
    return rows.rows;
  }
  app.get('/social/feed',auth,async req=> {
    const c=cursor(req.query);
    const games=await activity(req.user.id,c,null,null,true);
    const history=await app.pg.query(`select h.id,'membership' as kind,(${unreadEvent('h','h.occurred_at')}) as unread,
      to_char(h.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt",
      jsonb_build_object('action',h.action) as data,
      jsonb_build_array(jsonb_build_object('id',u.id,'displayName',u.display_name,'avatarUrl',u.avatar_url,'visible',true)) as actors
      from fan_membership_history h join users u on u.id=h.follower_id where h.player_id=$1
      and ($2::timestamptz is null or (h.occurred_at,h.id)<($2::timestamptz,$3::uuid))
      order by h.occurred_at desc,h.id desc limit 51`,[req.user.id,c?.time??null,c?.id??null]);
    return page([...games,...history.rows].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||b.id.localeCompare(a.id)));
  });
  app.post('/social/reactions',auth,async req=>{
    const body=z.object({ids:z.array(z.string().uuid()).max(50)}).strict().safeParse(req.body);
    if(!body.success)throw new AppError('bad_request','Неверные события',400);
    const result=await app.pg.query(`select e.id,coalesce((select jsonb_agg(groups) from
      (select emoji,count(*)::int as count,bool_or(user_id=$1) as "reactedByMe" from social_activity_reaction where activity_id=e.id group by emoji order by emoji) groups),'[]'::jsonb) as reactions
      from social_activity e where e.id=any($2::uuid[]) and ${authorizedActivity}`,[req.user.id,body.data.ids]);
    return result.rows;
  });
  app.get('/users/:userId/activity',auth,async req=>{
    const player=userId(req.params); await getFanSummary(app.pg,req.user.id,player);
    if(player!==req.user.id && !(await getFanSummary(app.pg,req.user.id,player)).following) throw new AppError('forbidden','Сначала станьте болельщиком игрока',403);
    return page(await activity(req.user.id,cursor(req.query),player,null));
  });
  app.get('/social/events/:eventId',auth,async req=>{
    const parsed=z.object({eventId:z.string().uuid()}).safeParse(req.params);
    if(!parsed.success) throw new AppError('bad_request','Неверное событие',400);
    const row=(await activity(req.user.id,null,null,parsed.data.eventId))[0];
    if(!row) throw new AppError('not_found','Результат недоступен',404);
    return row;
  });
  for(const method of ['PUT','DELETE'] as const) app.route({method,url:'/social/events/:eventId/reaction',...auth,handler:async req=>{
    const params=z.object({eventId:z.string().uuid()}).safeParse(req.params);
    const body=z.object({emoji:z.enum(EMOJI_WHITELIST)}).strict().safeParse(req.body);
    if(!params.success||!body.success)throw new AppError('bad_request','Неверная реакция',400);
    const id=params.data.eventId,viewer=req.user.id;
    const connection=await app.pg.connect();
    try {
      await connection.query('begin');
      // Serialize changes from the same viewer with membership changes.
      await connection.query('select id from users where id=$1 for update',[viewer]);
      const allowed=await connection.query(`select e.id from social_activity e where e.id=$2 and ${authorizedActivity}`,[viewer,id]);
      if(!allowed.rows.length)throw new AppError('not_found','Событие недоступно',404);
      if(method==='PUT')await connection.query(`insert into social_activity_reaction(activity_id,user_id,emoji) values($1,$2,$3) on conflict(activity_id,user_id) do update set emoji=excluded.emoji`,[id,viewer,body.data.emoji]);
      else await connection.query('delete from social_activity_reaction where activity_id=$1 and user_id=$2 and emoji=$3',[id,viewer,body.data.emoji]);
      await connection.query('commit');
    }catch(error){await connection.query('rollback');throw error;}finally{connection.release();}
    return (await activity(viewer,null,null,id))[0];
  }});
};
