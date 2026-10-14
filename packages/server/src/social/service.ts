import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { observeFanAchievement } from '../achievements/fanStages.js';
import { enqueuePushDelivery } from '../push/queue.js';
import { renderPushNotificationPayload } from '../push/templates.js';

type Db = Pool | PoolClient;
export async function getFanSummary(db: Db, viewerId: string, playerId: string) {
  const result = await db.query<{ followers_count: number; following_count: number; following: boolean; account_kind: string }>(
    `select account_kind, (select count(*)::int from user_follows where player_id=u.id) followers_count,
     (select count(*)::int from user_follows where follower_id=u.id) following_count,
     exists(select 1 from user_follows where follower_id=$1 and player_id=u.id) following
     from users u where id=$2`, [viewerId, playerId]);
  const row = result.rows[0];
  if (!row) throw new AppError('not_found', 'Игрок не найден', 404);
  return { followersCount: row.followers_count, followingCount: row.following_count, following: row.following, canFollow: viewerId !== playerId && row.account_kind === 'player' };
}

export async function changeFollow(pool: Pool, followerId: string, playerId: string, follow: boolean, removedByOwner=false) {
  if (followerId === playerId) throw new AppError('bad_request', 'Нельзя стать своим болельщиком', 400);
  const db = await pool.connect();
  try {
    await db.query('begin');
    // Serialize count/milestone updates, including simultaneous changes from different fans.
    const users = await db.query<{ id: string; account_kind: string; display_name: string }>('select id,account_kind,display_name from users where id=any($1::uuid[]) order by id for update', [[followerId, playerId]]);
    const player = users.rows.find(u => u.id === playerId);
    const follower = users.rows.find(u => u.id === followerId);
    if (!player || !follower) throw new AppError('not_found', 'Игрок не найден', 404);
    if (player.account_kind !== 'player' || follower.account_kind !== 'player') throw new AppError('bad_request', 'Подписка доступна только между игроками', 400);
    const changed = follow
      ? await db.query('insert into user_follows(follower_id,player_id) values($1,$2) on conflict do nothing returning created_at', [followerId,playerId])
      : await db.query('delete from user_follows where follower_id=$1 and player_id=$2 returning created_at', [followerId,playerId]);
    const summary = await getFanSummary(db,followerId,playerId);
    if (changed.rowCount) {
      const history = await db.query<{ id: string }>('insert into fan_membership_history(player_id,follower_id,action) values($1,$2,$3) returning id', [playerId,followerId,follow ? 'follow':removedByOwner?'remove':'unfollow']);
      if (follow) {
        await observeFanAchievement(db,playerId);
        const allowed = await db.query(`select 1 from users u left join user_push_preferences p on p.user_id=u.id
          where u.id=$1 and coalesce(p.new_fans,true) and
          (exists(select 1 from push_subscriptions where user_id=u.id) or exists(select 1 from android_push_installations where user_id=u.id))`,[playerId]);
        if (allowed.rowCount) {
          const payload = await renderPushNotificationPayload(db,'social.new_fan', {fanName:follower.display_name,fanId:followerId}, {title:'Новый болельщик',body:`${follower.display_name} теперь болеет за вас`,url:`/profile?social=fans&fanId=${followerId}`});
          if (payload) {
            const slot = await db.query(`insert into fan_push_cooldown(follower_id,player_id,last_queued_at) values($1,$2,clock_timestamp())
              on conflict(follower_id,player_id) do update set last_queued_at=excluded.last_queued_at
              where fan_push_cooldown.last_queued_at<=clock_timestamp()-interval '24 hours' returning 1`,[followerId,playerId]);
            if(slot.rowCount) await enqueuePushDelivery(db,{userId:playerId,eventType:'social.new_fan',eventKey:`social:fan:${history.rows[0]!.id}`,payload:{...payload,tag:`fan-${followerId}`}});
          }
        }
      }
    }
    await db.query('commit'); return summary;
  } catch(error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}

export function parseCursor(value: string | undefined): { time: string; id: string } | null {
  if (!value) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(value,'base64url').toString());
    if (typeof data !== 'object' || data === null) throw Error();
    const cursor = data as Record<string,unknown>;
    if(typeof cursor.time !== 'string' || !Number.isFinite(Date.parse(cursor.time)) || typeof cursor.id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(cursor.id)) throw Error();
    return { time:cursor.time, id:cursor.id };
  } catch { throw new AppError('bad_request','Неверная страница списка',400); }
}
export function page<T extends { id: string; occurredAt: string }>(rows: T[]) {
  const items = rows.slice(0,50); const last = items.at(-1);
  return { items, nextCursor:rows.length>50 && last ? Buffer.from(JSON.stringify({time:last.occurredAt,id:last.id})).toString('base64url'):null };
}
