import { assertNewGamesFree } from './games/admission.js';
import { randomUUID, randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { durak } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import { advanceDeadline, projectGame } from './durakState.js';
import { currentRoom, acceptRoomInvite, tickCardRooms } from './durakRooms.js';
type Match = {
  id: string;
  player_a: string;
  player_b: string;
  state: durak.Game & {
    readiness?: { ready: string[]; expiresAt: number; startsAt: number | null; cancelled: boolean };
  };
  deadline_at: Date | null;
  ended_at: Date | null;
};
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
    await client.query('commit');
    return result;
  } catch (error) {
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
  const next = advanceDeadline(match.state, match.deadline_at.getTime(), now);
  return next.game === match.state ? match : save(client, match, next.game, next.deadline, now);
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
      [id, user, receiver, new Date(now + 600_000)],
    );
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
    }>('select * from bar_card_invites where id=$1', [id]);
    const invite = result.rows[0];
    if (!invite || ![invite.sender_id, invite.receiver_id].includes(user))
      throw new AppError('not_found', 'Вызов не найден.', 404);
    if (action === 'cancel' ? user !== invite.sender_id : user !== invite.receiver_id)
      throw new AppError('forbidden', 'Это действие недоступно.', 403);
    if (invite.status === 'accepted' && action === 'accept')
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
    await tickCardRooms(client, now);
  });
}

export async function clearNewGameWaiting(client:PoolClient,users:string[]){
 await client.query('delete from bar_game_queue where user_id=any($1::uuid[])',[users]);
 await client.query("update bar_game_invites set status='cancelled' where status='pending' and (sender_id=any($1::uuid[]) or receiver_id=any($1::uuid[]))",[users]);
}
