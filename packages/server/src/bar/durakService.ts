import {BAR_INVITATION_MS} from './invitationDeadline.js';
import { createBarInviteMessage, syncBarInviteMessages, publishBarInviteMessages, discardBarInviteMessages } from './inviteChat.js';
import { assertNewGamesFree } from './games/admission.js';
import { randomUUID, randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { durak } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import { projectGame } from './durakState.js';
import { currentRoom, acceptRoomInvite, tickCardRooms } from './durakRooms.js';
import { admitVisitorGame } from './visitorService.js';
import { createDurakAchievementTelemetry, observeDurakGameTransition, qualifiersForDurakPlayer, type DurakAchievementTelemetry } from './durakAchievementAdapter.js';
import { observeBarFeats, recordBarGameResult } from '../achievements/barProgress.js';
type Match = {
  id: string;
  player_a: string;
  player_b: string;
  state: durak.Game & {
    readiness?: { ready: string[]; expiresAt: number; startsAt: number | null; cancelled: boolean };
    telemetry?: DurakAchievementTelemetry;
  };
  deadline_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
};
type MariaMatch = { id:string; user_id:string; state:{ game: durak.Game; telemetry: DurakAchievementTelemetry }; deadline_at:Date|null; ended_at:Date|null; started_at:Date };
export async function cardTransaction<T>(
  pool: Pool,
  run: (client: PoolClient, now: number) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // All admission paths and actions share one short lock in this initial implementation.
    await client.query('select pg_advisory_xact_lock(196, 1)');
    const now = Date.now();
    await client.query('delete from bar_card_queue where expires_at <= $1', [new Date(now)]);
    await client.query(
      "update bar_card_invites set status='expired' where status='pending' and expires_at <= $1",
      [new Date(now)],
    );
    const result = await run(client, now);
    await syncBarInviteMessages(pool, client);
    await client.query('commit');
    await publishBarInviteMessages(pool, client);
    return result;
  } catch (error) {
    discardBarInviteMessages(client);
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
async function save(
  client: PoolClient,
  match: Match,
  game: durak.Game,
  deadline: number,
  now: number,
) {
  await client.query(
    'update bar_card_matches set state=$2, deadline_at=$3, ended_at=$4 where id=$1',
    [
      match.id,
      JSON.stringify(game),
      game.result === null ? new Date(deadline) : null,
      game.result === null ? null : new Date(now),
    ],
  );
  return {
    ...match,
    state: game,
    deadline_at: game.result === null ? new Date(deadline) : null,
    ended_at: game.result === null ? null : new Date(now),
  };
}
async function publishCardProgress(client:PoolClient,match:Match,game:Match['state'],now:number,eligible=true) {
  if(!game.telemetry)return;
  for(const p of [0,1] as const)await observeBarFeats(client,p===0?match.player_a:match.player_b,`${match.id}:${game.revision}:${p}`,new Date(now),game.telemetry.participated[p]?qualifiersForDurakPlayer(game.telemetry,p,eligible&&game.result===p):{},'online');
  if(game.result!==null)await recordBarGameResult(client,{eventId:match.id,game:'durak',startedAt:match.created_at,occurredAt:new Date(now),mode:'online',eligible,participants:([0,1] as const).map(p=>({userId:p===0?match.player_a:match.player_b,opponentId:p===0?match.player_b:match.player_a,won:game.result===p,eligible:game.telemetry!.participated[p]===true,outcome:game.result==='draw'?'draw':game.result===p?'win':'loss',qualifiers:qualifiersForDurakPlayer(game.telemetry!,p,eligible&&game.result===p)}))});
}
async function reconcile(client: PoolClient, match: Match, now: number): Promise<Match> {
  if (match.ended_at || !match.deadline_at) return match;
  const readiness = match.state.readiness;
  if (readiness) {
    if (readiness.startsAt !== null && now >= readiness.startsAt) {
      const game = { ...match.state };
      delete game.readiness;
      match = await save(
        client,
        match,
        { ...game, revision: game.revision + 1 },
        readiness.startsAt + durak.turnDuration(match.state),
        now,
      );
    } else if (readiness.startsAt === null && now >= readiness.expiresAt) {
      readiness.cancelled = true;
      match.state.revision++;
      await client.query(
        'update bar_card_matches set state=$2,deadline_at=null,ended_at=$3 where id=$1',
        [match.id, JSON.stringify(match.state), new Date(now)],
      );
      return { ...match, ended_at: new Date(now), deadline_at: null };
    } else return match;
  }
  if (!match.deadline_at) return match;
  let game=match.state,deadline=match.deadline_at.getTime();
  for(let i=0;game.result===null&&deadline<=now&&i<1000;i++) {
    const player=durak.activePlayer(game),action=durak.timeoutAction(game,player);
    if(!action)break;
    const next=durak.applyAction(game,player,action) as Match['state'];
    if(next===game)break;
    if(game.telemetry)next.telemetry=observeDurakGameTransition(game.telemetry,game,next,player,action);
    await publishCardProgress(client,match,next,now);
    game=next;deadline+=durak.turnDuration(game);
  }
  return game===match.state?match:save(client,match,game,deadline,now);
}
async function active(client: PoolClient, user: string, now: number) {
  const { rows } = await client.query<Match>(
    'select * from bar_card_matches where ended_at is null and (player_a=$1 or player_b=$1)',
    [user],
  );
  for (const row of rows) {
    const current = await reconcile(client, row, now);
    if (!current.ended_at) return current;
  }
  return null;
}
export async function assertFree(client: PoolClient, user: string, now: number) {
  const maria=await client.query<MariaMatch>('select * from bar_maria_matches where user_id=$1 and ended_at is null',[user]);
  if(maria.rows[0]&&!(await reconcileMaria(client,maria.rows[0],now)).ended_at)throw new AppError('card_busy','Сначала заверши текущую партию.',409);
  await assertNewGamesFree(client,user,now);
  const room = await currentRoom(client, user, now);
  if (room)
    throw new AppError('card_busy', 'Сначала покинь текущий стол.', 409, { roomId: room.id });
  const match = await active(client, user, now);
  if (match)
    throw new AppError('card_busy', 'Сначала заверши текущую партию.', 409, { matchId: match.id });
}
async function create(client: PoolClient, a: string, b: string, now: number) {
  await assertFree(client, a, now);
  await assertFree(client, b, now);
  await clearNewGameWaiting(client,[a,b]);
  const id = randomUUID();
  const game = durak.createGame(() => randomInt(0, 0x100000000) / 0x100000000);
  await client.query(
    'insert into bar_card_matches(id,player_a,player_b,state,deadline_at) values($1,$2,$3,$4,$5)',
    [
      id,
      a,
      b,
      JSON.stringify({
        ...game,
        telemetry: createDurakAchievementTelemetry(game),
        readiness: { ready: [], expiresAt: now + 60000, startsAt: null, cancelled: false },
      }),
      new Date(now + 60000),
    ],
  );
  await client.query('delete from bar_card_queue where user_id=any($1::uuid[])', [[a, b]]);
  await client.query(
    "update bar_card_invites set status='cancelled' where status='pending' and (sender_id=any($1::uuid[]) or receiver_id=any($1::uuid[]))",
    [[a, b]],
  );
  return id;
}
export async function cardLobby(pool: Pool, user: string) {
  return cardTransaction(pool, async (client, now) => {
    const match = await active(client, user, now);
    const room = await currentRoom(client, user, now);
    const queue = await client.query<{ expires_at: Date }>(
      'select expires_at from bar_card_queue where user_id=$1',
      [user],
    );
    const invites = await client.query(
      `select i.id,i.sender_id,i.receiver_id,i.expires_at,i.status,i.match_id,i.room_id,
      (select (data->>'capacity')::int from bar_card_rooms where id=i.room_id) as capacity,
      (select data->'formats' from bar_card_rooms where id=i.room_id) as capacities,
      s.display_name as sender_name,s.avatar_url as sender_avatar_url,r.display_name as receiver_name
      from bar_card_invites i join users s on s.id=i.sender_id join users r on r.id=i.receiver_id
      where (i.sender_id=$1 or i.receiver_id=$1) and (i.status='pending' or (i.status='accepted' and i.created_at > $2))
      order by i.created_at desc limit 30`,
      [user, new Date(now - 600_000)],
    );
    return {
      matchId: match?.id ?? null,
      roomId: room?.id ?? null,
      searching: queue.rowCount! > 0,
      searchExpiresAt: queue.rows[0]?.expires_at.toISOString() ?? null,
      serverNow: now,
      invites: invites.rows,
    };
  });
}
export async function queueCards(pool: Pool, user: string, cancel = false) {
  return cardTransaction(pool, async (client, now) => {
    if (cancel) {
      await client.query('delete from bar_card_queue where user_id=$1', [user]);
      return { matchId: null };
    }
    const existing = await active(client, user, now);
    if (existing) return { matchId: existing.id };
    await assertFree(client, user, now);
    const ownInvite = await client.query(
      "select id from bar_card_invites where (sender_id=$1 or receiver_id=$1) and status='pending'",
      [user],
    );
    if (ownInvite.rowCount)
      throw new AppError('card_waiting', 'Отмени текущий вызов перед поиском.', 409);
    const others = await client.query<{ user_id: string }>(
      'select user_id from bar_card_queue where user_id<>$1 order by created_at',
      [user],
    );
    for (const other of others.rows) {
      if (await active(client, other.user_id, now)) {
        await client.query('delete from bar_card_queue where user_id=$1', [other.user_id]);
        continue;
      }
      return { matchId: await create(client, other.user_id, user, now) };
    }
    await client.query(
      'insert into bar_card_queue(user_id,expires_at) values($1,$2) on conflict(user_id) do nothing',
      [user, new Date(now + 120_000)],
    );
    return { matchId: null };
  });
}
export async function inviteCards(pool: Pool, user: string, receiver: string) {
  return cardTransaction(pool, async (client, now) => {
    if (user === receiver) throw new AppError('card_self', 'Нельзя вызвать себя.', 400);
    const target = await client.query(
      "select id from users where id=$1 and account_kind='player' and blocked_at is null",
      [receiver],
    );
    if (!target.rowCount) throw new AppError('not_found', 'Игрок не найден.', 404);
    await assertFree(client, user, now);
    await assertFree(client, receiver, now);
    const pending = await client.query<{ id: string; receiver_id: string }>(
      "select id,receiver_id from bar_card_invites where sender_id=$1 and status='pending'",
      [user],
    );
    if (pending.rows[0]) {
      if (pending.rows[0].receiver_id === receiver) return { id: pending.rows[0].id };
      throw new AppError('card_waiting', 'Отмени текущий вызов.', 409);
    }
    const queue = await client.query('select user_id from bar_card_queue where user_id=$1', [user]);
    if (queue.rowCount) throw new AppError('card_waiting', 'Останови поиск перед вызовом.', 409);
    const waiting = await client.query(
      "select id from bar_card_invites where (sender_id=any($1::uuid[]) or receiver_id=any($1::uuid[])) and status='pending'",
      [[user, receiver]],
    );
    if (waiting.rowCount) throw new AppError('card_waiting', 'Сначала закрой текущий вызов.', 409);
    const targetQueue = await client.query('select user_id from bar_card_queue where user_id=$1', [
      receiver,
    ]);
    if (targetQueue.rowCount)
      throw new AppError('card_waiting', 'Соперник уже в поиске игры.', 409);
    const id = randomUUID();
    await client.query(
      'insert into bar_card_invites(id,sender_id,receiver_id,expires_at) values($1,$2,$3,$4)',
      [id, user, receiver, new Date(now + BAR_INVITATION_MS)],
    );
    await createBarInviteMessage(pool, client, { id, senderId: user, receiverId: receiver, kind: 'cards', capacity: 2, expiresAt: new Date(now + BAR_INVITATION_MS), roomId: null });
    return { id };
  });
}
export async function respondCards(
  pool: Pool,
  user: string,
  id: string,
  action: 'accept' | 'decline' | 'cancel',
) {
  return cardTransaction(pool, async (client, now) => {
    const result = await client.query<{
      sender_id: string;
      receiver_id: string;
      status: string;
      match_id: string | null;
      room_id: string | null;
    }>('select * from bar_card_invites where id=$1 for update', [id]);
    const invite = result.rows[0];
    if (!invite || ![invite.sender_id, invite.receiver_id].includes(user))
      throw new AppError('not_found', 'Вызов не найден.', 404);
    if (action === 'cancel' ? user !== invite.sender_id : user !== invite.receiver_id)
      throw new AppError('forbidden', 'Это действие недоступно.', 403);
    if ((invite.status === 'accepted' && action === 'accept') || (invite.status === 'declined' && action === 'decline') || (invite.status === 'cancelled' && action === 'cancel'))
      return { matchId: invite.match_id, roomId: invite.room_id };
    if (invite.status !== 'pending')
      throw new AppError('card_invite_expired', 'Вызов уже закрыт.', 409);
    const matchId =
      action === 'accept' && !invite.room_id
        ? await create(client, invite.sender_id, invite.receiver_id, now)
        : null;
    const roomId =
      action === 'accept' && invite.room_id
        ? await acceptRoomInvite(client, user, invite.room_id, now)
        : null;
    await client.query('update bar_card_invites set status=$2,match_id=$3 where id=$1', [
      id,
      action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled',
      matchId,
    ]);
    return { matchId, roomId };
  });
}
export async function getCardMatch(
  pool: Pool,
  user: string,
  id: string,
  command?: { revision: number; action: durak.Action | 'surrender' | 'ready' },
) {
  return cardTransaction(pool, async (client, now) => {
    const result = await client.query<Match>('select * from bar_card_matches where id=$1', [id]);
    let match = result.rows[0];
    if (!match || ![match.player_a, match.player_b].includes(user))
      throw new AppError('not_found', 'Партия не найдена.', 404);
    match = await reconcile(client, match, now);
    const player: durak.Player = match.player_a === user ? 0 : 1;
    if (command && !match.ended_at && match.state.readiness) {
      if (command.action !== 'ready')
        throw new AppError('card_not_started', 'Подтвердите готовность.', 409);
      const readiness = match.state.readiness;
      if (!readiness.ready.includes(user) && readiness.startsAt === null) {
        readiness.ready.push(user);
        if (readiness.ready.length === 2) readiness.startsAt = now + 5000;
        match.state.revision++;
        match.deadline_at = new Date(readiness.startsAt ?? readiness.expiresAt);
        await client.query('update bar_card_matches set state=$2,deadline_at=$3 where id=$1', [
          id,
          JSON.stringify(match.state),
          match.deadline_at,
        ]);
      }
    } else if (command && command.action === 'ready') {
      // A repeated ready request after the countdown must never become a move.
    } else if (
      command &&
      command.action !== 'ready' &&
      !match.ended_at &&
      command.revision === match.state.revision
    ) {
      const game =
        command.action === 'surrender'
          ? {
              ...match.state,
              phase: 'ended' as const,
              result: durak.other(player),
              revision: match.state.revision + 1,
            }
          : durak.applyAction(match.state, player, command.action);
      if (game === match.state)
        throw new AppError('card_invalid_move', 'Этой картой сейчас нельзя ходить.', 400);
      const telemetry = match.state.telemetry;
      if(telemetry) {
        telemetry.participated[player]=true;
        if(command.action!=='surrender')observeDurakGameTransition(telemetry,match.state,game,player,command.action);
        (game as Match['state']).telemetry=telemetry;
      }
      await publishCardProgress(client,match,game,now,command.action!=='surrender');
      match = await save(client, match, game, now + durak.turnDuration(game), now);
    }
    const opponent = await client.query<{ display_name: string; avatar_url: string | null }>(
      'select display_name,avatar_url from users where id=$1',
      [player === 0 ? match.player_b : match.player_a],
    );
    return {
      id,
      ...projectGame(match.state, player),
      ...(match.state.readiness
        ? {
            hand: [],
            opponentCount: 0,
            deckCount: 0,
            table: [],
            readiness: {
              ...match.state.readiness,
              selfReady: match.state.readiness.ready.includes(user),
              opponentReady: match.state.readiness.ready.includes(
                player === 0 ? match.player_b : match.player_a,
              ),
              ready: undefined,
            },
          }
        : {}),
      deadline: match.deadline_at?.getTime() ?? null,
      serverNow: now,
      opponent: {
        displayName: opponent.rows[0]!.display_name,
        avatarUrl: opponent.rows[0]!.avatar_url,
      },
    };
  });
}
export async function tickCardMatches(pool: Pool) {
  await cardTransaction(pool, async (client, now) => {
    const due = await client.query<Match>(
      'select * from bar_card_matches where ended_at is null and deadline_at<=$1 order by deadline_at limit 50',
      [new Date(now)],
    );
    for (const match of due.rows) await reconcile(client, match, now);
    const maria=await client.query<MariaMatch>('select * from bar_maria_matches where ended_at is null and deadline_at<=$1 limit 50',[new Date(now)]);
    for(const row of maria.rows)await reconcileMaria(client,row,now);
    await tickCardRooms(client, now);
  });
}

function mariaView(row: MariaMatch, now: number) {
  return { id: row.id, ...projectGame(row.state.game, 0), deadline: row.deadline_at?.getTime() ?? null, serverNow: now,
    opponent: { displayName: 'Мария', avatarUrl: '/bar/cards/avatar-v2.webp' } };
}
function mariaDuration(game:durak.Game) {return durak.activePlayer(game)===1?900:durak.turnDuration(game);}
function mariaAction(game:durak.Game):durak.Action|undefined {
  const actions=durak.legalActions(game,1),cards=[...game.hands[1]].sort(durak.cardOrder(game.trump));
  for(const c of cards){const a=actions.find(a=>(a.type==='beat'||a.type==='play')&&a.cardId===c.id);if(a)return a;}
  return actions.find(a=>a.type==='finish'||a.type==='take');
}
async function saveMariaHistory(client:PoolClient,row:MariaMatch,now:number,surrendered=false) {
  if(row.state.game.result===null)return;
  const result=row.state.game.result==='draw'?'draw':row.state.game.result===0?'win':'loss';
  await client.query(`insert into bar_computer_card_history(id,user_id,character_id,result,started_at,ended_at,surrendered,caught_cheats,provenance)
    values($1,$2,'maria',$3,$4,$5,$6,0,'server') on conflict(id) do nothing`,[row.id,row.user_id,result,row.started_at,new Date(now),surrendered]);
  await client.query(`update bar_visitor_receipts set payload=jsonb_build_object('finished',true) where user_id=$1 and id=$2 and kind='game' and character_id='maria'`,[row.user_id,row.id]);
}
async function saveMaria(client: PoolClient, row: MariaMatch, now: number,surrendered=false) {
  const ended = row.state.game.result !== null;
  row.deadline_at = ended ? null : new Date(now + mariaDuration(row.state.game));
  row.ended_at = ended ? new Date(now) : null;
  await client.query('update bar_maria_matches set state=$2,deadline_at=$3,ended_at=$4 where id=$1', [row.id, JSON.stringify(row.state), row.deadline_at, row.ended_at]);
  if(ended)await saveMariaHistory(client,row,now,surrendered);
}
async function reconcileMaria(client: PoolClient, row: MariaMatch, now: number) {
  if (row.ended_at || !row.deadline_at) return row;
  let game = row.state.game;
  let deadline = row.deadline_at.getTime();
  for (let i=0;i<100 && game.result === null && deadline <= now;i++) {
    const actor = durak.activePlayer(game);
    const action = actor===1?mariaAction(game):durak.timeoutAction(game, actor);
    if (!action) break;
    const next = durak.applyAction(game, actor, action);
    observeDurakGameTransition(row.state.telemetry, game, next, actor, action);
    game = next; deadline += mariaDuration(game);
    await observeBarFeats(client,row.user_id,`${row.id}:${next.revision}`,new Date(now),row.state.telemetry.participated[0]?qualifiersForDurakPlayer(row.state.telemetry,0,next.result===0):{},'character');
  }
  if (game !== row.state.game) {
    row.state.game = game; row.deadline_at = game.result === null ? new Date(deadline) : null; row.ended_at = game.result === null ? null : new Date(now);
    await client.query('update bar_maria_matches set state=$2,deadline_at=$3,ended_at=$4 where id=$1',[row.id,JSON.stringify(row.state),row.deadline_at,row.ended_at]);
    if(game.result!==null)await saveMariaHistory(client,row,now);
    if (game.result !== null) await recordBarGameResult(client,{eventId:row.id,game:'durak',occurredAt:new Date(now),startedAt:row.started_at,mode:'character',eligible:row.state.telemetry.participated[0]===true,participants:[{userId:row.user_id,opponentId:'maria',won:game.result===0,outcome:game.result==='draw'?'draw':game.result===0?'win':'loss',qualifiers:qualifiersForDurakPlayer(row.state.telemetry,0,row.state.game.result===0)}]});
  }
  return row;
}
export async function startMariaMatch(pool: Pool, user: string) {
  return cardTransaction(pool, async (client, now) => {
    const activeMaria = await client.query<MariaMatch>('select * from bar_maria_matches where user_id=$1 and ended_at is null', [user]);
    if (activeMaria.rows[0]) return mariaView(await reconcileMaria(client, activeMaria.rows[0]!, now), now);
    await assertFree(client, user, now);
    const id = randomUUID();
    await admitVisitorGame(client, user, 'maria', id, now);
    const game = durak.createGame(() => randomInt(0, 0x100000000) / 0x100000000);
    const state = { game, telemetry: createDurakAchievementTelemetry(game) };
    const deadline = new Date(now + mariaDuration(game));
    await client.query('insert into bar_maria_matches(id,user_id,state,deadline_at) values($1,$2,$3,$4)',[id,user,JSON.stringify(state),deadline]);
    return mariaView({id,user_id:user,state,deadline_at:deadline,ended_at:null,started_at:new Date(now)}, now);
  });
}
export async function getMariaMatch(pool: Pool, user: string, id: string, command?: {revision:number; action:durak.Action|'surrender'}) {
  return cardTransaction(pool, async (client, now) => {
    const result = await client.query<MariaMatch>('select * from bar_maria_matches where id=$1 and user_id=$2 for update',[id,user]);
    let row=result.rows[0]; if(!row) throw new AppError('not_found','Партия не найдена.',404);
    row=await reconcileMaria(client,row,now);
    if(command && !row.ended_at && command.revision===row.state.game.revision) {
      const before=row.state.game;
      row.state.telemetry.participated[0]=true;
      const next=command.action==='surrender'?{...before,phase:'ended' as const,result:1 as const,revision:before.revision+1}:durak.applyAction(before,0,command.action);
      if(next===before) throw new AppError('card_invalid_move','Этой картой сейчас нельзя ходить.',400);
      if(command.action!=='surrender')observeDurakGameTransition(row.state.telemetry,before,next,0,command.action);
      row.state.game=next; await saveMaria(client,row,now,command.action==='surrender');
      await observeBarFeats(client,user,`${row.id}:${next.revision}`,new Date(now),qualifiersForDurakPlayer(row.state.telemetry,0,row.state.game.result===0),'character');
      if(next.result !== null) await recordBarGameResult(client,{eventId:row.id,game:'durak',occurredAt:new Date(now),startedAt:row.started_at,mode:'character',eligible:row.state.telemetry.participated[0]===true,participants:[{userId:user,opponentId:'maria',won:next.result===0,eligible:command.action!=='surrender',outcome:next.result==='draw'?'draw':next.result===0?'win':'loss',qualifiers:qualifiersForDurakPlayer(row.state.telemetry,0,row.state.game.result===0)}]});
    }
    return mariaView(row,now);
  });
}

export async function clearNewGameWaiting(client:PoolClient,users:string[]){
 await client.query('delete from bar_game_queue where user_id=any($1::uuid[])',[users]);
 await client.query("update bar_game_invites set status='cancelled' where status='pending' and (sender_id=any($1::uuid[]) or receiver_id=any($1::uuid[]))",[users]);
}
