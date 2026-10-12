import { randomInt, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { type durak, durakTable } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import { assertFree, cardTransaction } from './durakService.js';

type Room = {
  seats: string[];
  capacity: number;
  formats?: number[];
  owner: string;
  status: 'waiting' | 'confirming' | 'countdown' | 'playing' | 'ended';
  readyUntil?: number | null;
  searchUntil: number | null;
  countdownAt: number | null;
  proposed: boolean;
  ready: string[];
  revision: number;
  game: durakTable.TableGame | null;
  deadline: number | null;
  redirect?: string;
};
export type RoomCommand =
  | { type: 'leave' | 'renew' | 'pause' | 'propose' | 'ready' }
  | { type: 'move'; action: durakTable.TableAction };
export type RoomView = {
  id: string;
  owner: string;
  capacity: number;
  formats: number[];
  status: Room['status'];
  searchUntil: number | null;
  countdownAt: number | null;
  proposed: boolean;
  ready: string[];
  readyUntil: number | null;
  revision: number;
  serverNow: number;
  seats: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    count: number;
    status: string;
  }[];
  pending: string[];
  invitations: { id: string; userId: string; displayName: string; avatarUrl: string | null }[];
  left?: boolean;
  game: null | {
    player: number;
    hand: durak.Card[];
    deckCount: number;
    trump: durak.Suit;
    trumpCard: durak.Card;
    attacker: number;
    defender: number;
    turn: number;
    table: durak.Pair[];
    phase: durakTable.TableGame['phase'];
    taking: boolean;
    deadline: number | null;
    actions: durakTable.TableAction[];
    result: string | null;
  };
};
const random = () => randomInt(0, 0x100000000) / 0x100000000;
const roomFormats = (room: Room) => room.formats ?? [room.capacity];
function compatibleFormats(room: Room, formats: number[], seats: number) {
  return roomFormats(room).filter((n) => formats.includes(n) && n >= seats);
}
function setFormats(room: Room, formats: number[]) {
  room.formats = formats;
  room.capacity = formats.includes(room.seats.length) ? room.seats.length : Math.max(...formats);
}
async function save(client: PoolClient, id: string, data: Room, now: number) {
  await client.query('update bar_card_rooms set data=$2,ended_at=$3 where id=$1', [
    id,
    JSON.stringify(data),
    data.status === 'ended' ? new Date(now) : null,
  ]);
  if (data.status === 'ended') {
    await client.query('delete from bar_card_room_players where room_id=$1', [id]);
    await client.query(
      "update bar_card_invites set status='cancelled' where room_id=$1 and status='pending'",
      [id],
    );
  } else if (data.game) {
    const inactive = data.seats.filter((_, i) => data.game!.status[i] !== 'playing');
    if (inactive.length)
      await client.query(
        'delete from bar_card_room_players where room_id=$1 and user_id=any($2::uuid[])',
        [id, inactive],
      );
  }
}
export async function reconcileRoom(
  client: PoolClient,
  id: string,
  data: Room,
  now: number,
): Promise<Room> {
  let dirty = false;
  if (data.status === 'confirming' && data.readyUntil != null && now >= data.readyUntil) {
    data.status = 'ended';
    data.readyUntil = null;
    data.revision++;
    dirty = true;
  }
  if (data.status === 'countdown' && data.countdownAt !== null && data.countdownAt <= now) {
    data.game = durakTable.createTable(data.seats.length, random);
    data.deadline = data.countdownAt + durakTable.turnDuration(data.game);
    data.status = 'playing';
    data.searchUntil = null;
    data.revision++;
    dirty = true;
    await client.query(
      "update bar_card_invites set status='cancelled' where room_id=$1 and status='pending'",
      [id],
    );
  }
  for (let i = 0; i < 1000 && data.status === 'playing' && data.deadline! <= now; i++) {
    const action = durakTable.timeout(data.game!);
    if (!action) break;
    data.game = durakTable.apply(data.game!, data.game!.turn, action);
    data.deadline! += durakTable.turnDuration(data.game);
    data.revision++;
    dirty = true;
    if (data.game.phase === 'ended') {
      data.status = 'ended';
      data.deadline = null;
    }
  }
  if (dirty) await save(client, id, data, now);
  return data;
}
async function load(client: PoolClient, id: string, now: number) {
  const row = await client.query<{ data: Room }>('select data from bar_card_rooms where id=$1', [
    id,
  ]);
  if (!row.rows[0]) throw new AppError('not_found', 'Стол не найден.', 404);
  return reconcileRoom(client, id, row.rows[0].data, now);
}
async function resolveRoomId(client: PoolClient, user: string, id: string): Promise<string> {
  for (let i = 0; i < 64; i++) {
    const row = await client.query<{ data: Room }>('select data from bar_card_rooms where id=$1', [
      id,
    ]);
    const data = row.rows[0]?.data;
    if (!data || !data.seats.includes(user))
      throw new AppError('not_found', 'Стол не найден.', 404);
    if (!data.redirect) return id;
    id = data.redirect;
  }
  throw new AppError('card_redirect', 'Обнови страницу стола.', 409);
}
async function matchSearchingRooms(client: PoolClient, now: number) {
  const rows = await client.query<{ id: string; data: Room }>(
    "select r.id,r.data from bar_card_rooms r where ended_at is null and data->>'status'='waiting' and (data->>'searchUntil')::bigint>$1 and not exists(select 1 from bar_card_invites i where i.room_id=r.id and i.status='pending') order by created_at,id",
    [now],
  );
  for (let i = 0; i < rows.rows.length; i++) {
    const target = rows.rows[i]!;
    if (target.data.status !== 'waiting' || target.data.proposed) continue;
    for (let j = i + 1; j < rows.rows.length; j++) {
      const source = rows.rows[j]!;
      const formats = compatibleFormats(
        target.data,
        roomFormats(source.data),
        target.data.seats.length + source.data.seats.length,
      );
      if (source.data.status !== 'waiting' || source.data.proposed || !formats.length) continue;
      target.data.seats.push(...source.data.seats);
      setFormats(target.data, formats);
      target.data.ready = [];
      target.data.revision++;
      await client.query('update bar_card_room_players set room_id=$1 where room_id=$2', [
        target.id,
        source.id,
      ]);
      source.data.status = 'ended';
      source.data.redirect = target.id;
      source.data.revision++;
      await save(client, source.id, source.data, now);
      if (target.data.seats.length === target.data.capacity) startCountdown(target.data, now);
      await save(client, target.id, target.data, now);
      if (target.data.seats.length === target.data.capacity) break;
    }
  }
}
export async function currentRoom(client: PoolClient, user: string, now: number) {
  const rows = await client.query<{ id: string; data: Room }>(
    'select r.id,r.data from bar_card_room_players p join bar_card_rooms r on r.id=p.room_id where p.user_id=$1',
    [user],
  );
  const row = rows.rows[0];
  if (!row) return null;
  const data = await reconcileRoom(client, row.id, row.data, now);
  if (
    data.status === 'ended' ||
    (data.game && data.game.status[data.seats.indexOf(user)] !== 'playing')
  )
    return null;
  return { id: row.id, data };
}
async function view(
  client: PoolClient,
  user: string,
  id: string,
  data: Room,
  now: number,
): Promise<RoomView> {
  const rows = await client.query<{ id: string; display_name: string; avatar_url: string | null }>(
    'select id,display_name,avatar_url from users where id=any($1::uuid[])',
    [data.seats],
  );
  const player = data.seats.indexOf(user);
  const g = data.game;
  const invited = await client.query<{ id: string; receiver_id: string; display_name: string; avatar_url: string | null }>(
    "select i.id,i.receiver_id,u.display_name,u.avatar_url from bar_card_invites i join users u on u.id=i.receiver_id where i.room_id=$1 and i.status='pending' order by i.created_at",
    [id],
  );
  return {
    id,
    owner: data.owner,
    capacity: data.capacity,
    formats: roomFormats(data),
    status: data.status,
    searchUntil: data.searchUntil,
    countdownAt: data.countdownAt,
    proposed: data.proposed,
    ready: data.ready,
    readyUntil: data.readyUntil ?? null,
    revision: data.revision,
    serverNow: now,
    seats: data.seats.map((userId, index) => ({
      userId,
      displayName: rows.rows.find((r) => r.id === userId)!.display_name,
      avatarUrl: rows.rows.find((r) => r.id === userId)!.avatar_url,
      count: g?.hands[index]?.length ?? 0,
      status: g?.status[index] ?? 'waiting',
    })),
    pending: invited.rows.map((i) => i.receiver_id),
    invitations: invited.rows.map((i) => ({
      id: i.id,
      userId: i.receiver_id,
      displayName: i.display_name,
      avatarUrl: i.avatar_url,
    })),
    game: g
      ? {
          player,
          hand: g.hands[player]!,
          deckCount: g.deck.length,
          trump: g.trump,
          trumpCard: g.trumpCard,
          attacker: g.attacker,
          defender: g.defender,
          turn: g.turn,
          table: g.table,
          phase: g.phase,
          taking: g.taking,
          deadline: data.deadline,
          actions: durakTable.legal(g, player),
          result: g.status[player] === 'playing' ? null : g.status[player]!,
        }
      : null,
  };
}
export function startCountdown(data: Room, now: number) {
  if (!data.seats.every((p) => data.ready.includes(p))) {
    data.status = 'confirming';
    data.readyUntil = now + 60000;
    data.searchUntil = null;
    data.countdownAt = null;
    return;
  }
  data.readyUntil = null;
  data.capacity = data.seats.length;
  data.formats = [data.capacity];
  data.status = 'countdown';
  data.countdownAt = now + 5000;
  data.searchUntil = null;
}
export async function joinCardRoom(
  pool: Pool,
  user: string,
  selected: number | number[],
  searching = true,
) {
  return cardTransaction(pool, async (client, now) => {
    const formats = [...new Set(Array.isArray(selected) ? selected : [selected])].sort(
      (a, b) => a - b,
    );
    if (
      !formats.length ||
      formats.some((n) => !Number.isInteger(n) || n < 2 || n > 6) ||
      (!searching && formats.length !== 1)
    )
      throw new AppError('card_format', 'Выбери от 2 до 6 игроков.', 400);
    const capacity = Math.max(...formats);
    const own = await currentRoom(client, user, now);
    if (own) {
      if (
        own.data.status === 'playing' ||
        !compatibleFormats(own.data, formats, own.data.seats.length).length
      )
        throw new AppError('card_busy', 'Ты уже за другим столом.', 409);
      return { roomId: own.id };
    }
    await assertFree(client, user, now);
    const pending = await client.query(
      "select id from bar_card_invites where (sender_id=$1 or receiver_id=$1) and status='pending'",
      [user],
    );
    if (pending.rowCount) throw new AppError('card_waiting', 'Сначала ответь на приглашение.', 409);
    const queued = await client.query('select user_id from bar_card_queue where user_id=$1', [
      user,
    ]);
    if (queued.rowCount) throw new AppError('card_waiting', 'Сначала останови текущий поиск.', 409);
    if (searching) {
      const candidates = await client.query<{ id: string; data: Room }>(
        "select id,data from bar_card_rooms where ended_at is null and data->>'status'='waiting' order by created_at,id",
      );
      for (const row of candidates.rows) {
        const r = row.data;
        const reserved = await client.query(
          "select id from bar_card_invites where room_id=$1 and status='pending'",
          [row.id],
        );
        const common = compatibleFormats(r, formats, r.seats.length + reserved.rowCount! + 1);
        if (r.proposed || r.searchUntil === null || r.searchUntil <= now || !common.length)
          continue;
        r.seats.push(user);
        setFormats(r, common);
        r.ready = [];
        r.revision++;
        await client.query('insert into bar_card_room_players(user_id,room_id) values($1,$2)', [
          user,
          row.id,
        ]);
        if (r.seats.length === r.capacity) startCountdown(r, now);
        await save(client, row.id, r, now);
        return { roomId: row.id };
      }
    }
    const id = randomUUID();
    const data: Room = {
      seats: [user],
      capacity,
      formats,
      owner: user,
      status: 'waiting',
      searchUntil: searching ? now + 120000 : null,
      countdownAt: null,
      proposed: false,
      ready: [],
      revision: 0,
      game: null,
      deadline: null,
    };
    await client.query('insert into bar_card_rooms(id,data) values($1,$2)', [
      id,
      JSON.stringify(data),
    ]);
    await client.query('insert into bar_card_room_players(user_id,room_id) values($1,$2)', [
      user,
      id,
    ]);
    return { roomId: id };
  });
}
export async function readCardRoom(pool: Pool, user: string, id: string) {
  return cardTransaction(pool, async (client, now) => {
    id = await resolveRoomId(client, user, id);
    const data = await load(client, id, now);
    if (!data.seats.includes(user)) throw new AppError('not_found', 'Стол не найден.', 404);
    return view(client, user, id, data, now);
  });
}
export async function commandCardRoom(
  pool: Pool,
  user: string,
  id: string,
  revision: number,
  command: RoomCommand,
) {
  return cardTransaction(pool, async (client, now) => {
    id = await resolveRoomId(client, user, id);
    const data = await load(client, id, now);
    if (!data.seats.includes(user)) throw new AppError('not_found', 'Стол не найден.', 404);
    if (revision !== data.revision || data.status === 'ended')
      return view(client, user, id, data, now);
    if (command.type === 'move') {
      if (!data.game || data.status !== 'playing')
        throw new AppError('card_not_started', 'Партия ещё не началась.', 409);
      const next = durakTable.apply(data.game, data.seats.indexOf(user), command.action);
      if (next === data.game)
        throw new AppError('card_invalid_move', 'Сейчас этот ход недоступен.', 400);
      data.game = next;
      data.deadline = now + durakTable.turnDuration(next);
      if (next.phase === 'ended') {
        data.status = 'ended';
        data.deadline = null;
      }
    } else if (command.type === 'leave') {
      if (data.capacity === 2 && (data.status === 'confirming' || data.status === 'countdown')) {
        data.status = 'ended';
        data.readyUntil = null;
        data.countdownAt = null;
        data.revision++;
        await save(client, id, data, now);
        return { ...(await view(client, user, id, data, now)), left: true };
      }
      if (data.game) {
        const next = durakTable.surrender(data.game, data.seats.indexOf(user));
        if (next === data.game) return view(client, user, id, data, now);
        const previousTurn = data.game.turn;
        const previousPhase = data.game.phase;
        data.game = next;
        if (next.turn !== previousTurn || next.phase !== previousPhase)
          data.deadline = now + durakTable.turnDuration(next);
        if (next.phase === 'ended') {
          data.status = 'ended';
          data.deadline = null;
        }
      } else {
        data.seats = data.seats.filter((p) => p !== user);
        data.ready = [];
        data.proposed = false;
        data.countdownAt = null;
        data.readyUntil = null;
        data.status = data.seats.length ? 'waiting' : 'ended';
        data.owner = data.seats[0] ?? user;
        await client.query('delete from bar_card_room_players where user_id=$1 and room_id=$2', [
          user,
          id,
        ]);
        await client.query(
          "update bar_card_invites set status='cancelled' where room_id=$1 and sender_id=$2 and status='pending'",
          [id, user],
        );
        data.revision++;
        await save(client, id, data, now);
        return { ...(await view(client, user, id, data, now)), left: true };
      }
    } else {
      if (data.status === 'confirming' && command.type === 'ready') {
        if (!data.ready.includes(user)) data.ready.push(user);
        if (data.seats.every((p) => data.ready.includes(p))) startCountdown(data, now);
        data.revision++;
        await save(client, id, data, now);
        return view(client, user, id, data, now);
      }
      if (data.status !== 'waiting')
        throw new AppError('card_not_waiting', 'Стол уже готов к игре.', 409);
      if (command.type !== 'ready' && data.owner !== user)
        throw new AppError('forbidden', 'Это действие доступно создателю стола.', 403);
      if (command.type === 'pause') {
        data.searchUntil = null;
      } else if (command.type === 'renew') {
        data.searchUntil = now + 120000;
        data.ready = [];
        data.proposed = false;
      } else if (command.type === 'propose') {
        if (data.searchUntil !== null && data.searchUntil > now)
          throw new AppError('card_searching', 'Дождись окончания поиска.', 409);
        if (data.seats.length < 2)
          throw new AppError('card_seats', 'Нужны хотя бы два игрока.', 409);
        data.proposed = true;
        data.ready = [user];
        startCountdown(data, now);
        await client.query(
          "update bar_card_invites set status='cancelled' where room_id=$1 and status='pending'",
          [id],
        );
      } else {
        if (!data.proposed) throw new AppError('card_consent', 'Предложение ещё не создано.', 409);
        if (!data.ready.includes(user)) data.ready.push(user);
      }
      if (data.proposed && data.seats.every((p) => data.ready.includes(p)))
        startCountdown(data, now);
    }
    data.revision++;
    await save(client, id, data, now);
    if (command.type === 'renew') {
      await matchSearchingRooms(client, now);
      id = await resolveRoomId(client, user, id);
      return view(client, user, id, await load(client, id, now), now);
    }
    return view(client, user, id, data, now);
  });
}
export async function inviteToRoom(pool: Pool, user: string, id: string, target: string) {
  return cardTransaction(pool, async (client, now) => {
    const data = await load(client, id, now);
    if (data.owner !== user || !data.seats.includes(user))
      throw new AppError('forbidden', 'Приглашать может создатель стола.', 403);
    if (data.status !== 'waiting' || data.proposed)
      throw new AppError('card_not_waiting', 'Стол уже готов к игре.', 409);
    if (data.seats.includes(target)) throw new AppError('card_self', 'Игрок уже за столом.', 400);
    const existing = await client.query<{ id: string }>(
      "select id from bar_card_invites where room_id=$1 and receiver_id=$2 and status='pending'",
      [id, target],
    );
    if (existing.rows[0]) return { id: existing.rows[0].id };
    await assertFree(client, target, now);
    const valid = await client.query(
      "select id from users where id=$1 and account_kind='player' and blocked_at is null",
      [target],
    );
    if (!valid.rowCount) throw new AppError('not_found', 'Игрок не найден.', 404);
    const pending = await client.query(
      "select id from bar_card_invites where (sender_id=$1 or receiver_id=$1) and status='pending'",
      [target],
    );
    const queue = await client.query('select user_id from bar_card_queue where user_id=$1', [
      target,
    ]);
    if (pending.rowCount || queue.rowCount)
      throw new AppError('card_waiting', 'Игрок уже ожидает другую партию.', 409);
    const reserved = await client.query(
      "select id from bar_card_invites where room_id=$1 and status='pending'",
      [id],
    );
    if (data.seats.length + reserved.rowCount! >= data.capacity)
      throw new AppError('card_full', 'Свободных мест нет.', 409);
    const inviteId = randomUUID();
    data.formats = [data.capacity];
    data.revision++;
    await save(client, id, data, now);
    await client.query(
      'insert into bar_card_invites(id,sender_id,receiver_id,room_id,expires_at) values($1,$2,$3,$4,$5)',
      [inviteId, user, target, id, new Date(now + 120000)],
    );
    return { id: inviteId };
  });
}
export async function acceptRoomInvite(client: PoolClient, user: string, id: string, now: number) {
  const data = await load(client, id, now);
  if (data.seats.includes(user)) return id;
  if (data.status !== 'waiting' || data.proposed || data.seats.length >= data.capacity)
    throw new AppError('card_full', 'Стол уже заполнен.', 409);
  await assertFree(client, user, now);
  data.seats.push(user);
  data.ready = [];
  data.revision++;
  await client.query('insert into bar_card_room_players(user_id,room_id) values($1,$2)', [
    user,
    id,
  ]);
  if (data.seats.length === data.capacity) startCountdown(data, now);
  await save(client, id, data, now);
  return id;
}
export async function tickCardRooms(client: PoolClient, now: number) {
  await matchSearchingRooms(client, now);
  const rows = await client.query<{ id: string; data: Room }>(
    "select id,data from bar_card_rooms where ended_at is null and ((data->>'status'='confirming' and (data->>'readyUntil')::bigint <= $1) or (data->>'status'='countdown' and (data->>'countdownAt')::bigint <= $1) or (data->>'status'='playing' and (data->>'deadline')::bigint <= $1)) order by created_at limit 100",
    [now],
  );
  for (const row of rows.rows) await reconcileRoom(client, row.id, row.data, now);
}
