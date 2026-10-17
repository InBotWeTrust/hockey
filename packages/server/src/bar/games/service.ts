import { randomInt, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CHARACTER_GAME,
  barBattleship,
  createMatch,
  publicRuntime,
  command,
  type BarGameId,
  type GameCharacter,
  type BarGameSnapshot,
  type BarGameCommand,
  type BarGameLobby,
  type BarGameInvite,
} from '@hockey/game-core';
import { cardTransaction, assertFree } from '../durakService.js';
import { createPrivateOchko } from './ochkoDeck.js';
import { chooseStake, recordOchkoStars } from './ochkoEconomy.js';
import { AppError } from '../../plugins/errors.js';
import { reconcile, persist, type MatchRow } from './admission.js';
const names = {
  maria: 'Мария',
  daria: 'Дарья',
  veronika: 'Вероника',
  arsenich: 'Арсенич',
  grigory: 'Григорий',
  oleg: 'Олег',
  timofey:'Тимофей',
};
const portraits = {
  timofey:'/bar/cards/timofey-avatar-v2.webp',
  grigory: '/bar/cards/grigory-avatar-v1.webp',
  oleg: '/bar/emotions/oleg/neutral-v1.webp',
  maria: '/bar/cards/avatar-v2.webp',
  daria: '/bar/cards/daria-avatar-v2.webp',
  veronika: '/bar/cards/veronika-avatar-v1.webp',
  arsenich: '/bar/cards/arsenich-avatar-v2.webp',
};
const tx = cardTransaction;
const conflict = () =>
  new AppError('bar_game_changed', 'Состояние партии изменилось. Обновляем поле.', 409);
async function load(
  c: PoolClient,
  user: string,
  id: string,
  now: number,
  beforeReconcile?: (row: MatchRow) => void,
) {
  const { rows } = await c.query<MatchRow>(
    'select * from bar_game_matches where id=$1 for update',
    [id],
  );
  const r = rows[0];
  if (!r || (r.player_a !== user && r.player_b !== user))
    throw new AppError('not_found', 'Партия не найдена.', 404);
  beforeReconcile?.(r);
  return reconcile(c, r, now);
}
async function view(
  c: PoolClient,
  r: MatchRow,
  user: string,
  now: number,
): Promise<BarGameSnapshot> {
  const { rows } = await c.query<{ id: string; display_name: string; avatar_url: string | null }>(
    'select id,display_name,avatar_url from users where id=any($1::uuid[])',
    [[r.player_a, ...(r.player_b ? [r.player_b] : [])]],
  );
  const person = (id: string) => {
    const p = rows.find((x) => x.id === id);
    return {
      userId: id,
      displayName: p?.display_name ?? 'Игрок',
      avatarUrl: p?.avatar_url ?? null,
    };
  };
  const runtime = publicRuntime(r.data.runtime, user === r.player_a ? 0 : 1,now);
  if (r.data.ready && runtime.game.kind === 'ochko')
    runtime.game = {
      ...runtime.game,
      hands: runtime.game.hands.map((hand) => hand.map(() => -1)) as [number[], number[]],
      scores: [-1, -1],
      winner: null,
      golden: [false, false],
      done: [false, false],
    };
  return {
    id: r.id,
    kind: r.kind,
    character: r.character,
    player: user === r.player_a ? 0 : 1,
    participants: [
      person(r.player_a),
      r.player_b
        ? person(r.player_b)
        : {
            userId: r.character!,
            displayName: names[r.character!],
            avatarUrl: portraits[r.character!],
          },
    ],
    runtime,
    ...(r.data.stake ? { stake: r.data.stake } : {}),
    ready: r.data.ready,
    serverNow: now,
  };
}
async function clearAdmission(c: PoolClient, users: string[]) {
  await c.query('delete from bar_game_queue where user_id=any($1::uuid[])', [users]);
  await c.query('delete from bar_card_queue where user_id=any($1::uuid[])', [users]);
  await c.query(
    "update bar_game_invites set status='cancelled' where status='pending' and (sender_id=any($1::uuid[]) or receiver_id=any($1::uuid[]))",
    [users],
  );
  await c.query(
    "update bar_card_invites set status='cancelled' where status='pending' and (sender_id=any($1::uuid[]) or receiver_id=any($1::uuid[]))",
    [users],
  );
}
async function create(
  c: PoolClient,
  a: string,
  b: string | null,
  kind: BarGameId,
  character: GameCharacter | null,
  now: number,
  id: string = randomUUID(),
  starter: 0 | 1 = randomInt(2) as 0 | 1,
) {
  await assertFree(c, a, now);
  if (b) await assertFree(c, b, now);
  const row: MatchRow = {
    id,
    kind,
    player_a: a,
    player_b: b,
    character,
    data: {
      runtime: createMatch(kind, starter, kind === 'armwrestling' && character ? now + 3000 : now, character !== null, randomInt(0x100000000)),
      starter,
      ready: character && kind!=='battleship'
        ? null
        : { players: character?[1]:[], expiresAt: now + (kind === 'battleship' ? 90000 : 60000), startsAt: null, cancelled: false },
    },
    ended_at: null,
  };
  if (kind === 'battleship') {
    const g = row.data.runtime.game as unknown as barBattleship.State;
    g.fleets[0] = [];
    if (!character) g.fleets[1] = [];
  }
  if (kind === 'ochko' && character) row.data.runtime.game = createPrivateOchko(now);
  await c.query(
    'insert into bar_game_matches(id,kind,player_a,player_b,character,data) values($1,$2,$3,$4,$5,$6)',
    [id, kind, a, b, character, JSON.stringify(row.data)],
  );
  await clearAdmission(c, b ? [a, b] : [a]);
  return row;
}
export async function startComputer(
  pool: Pool,
  user: string,
  character: GameCharacter,
  requestId: string,
  previousId?: string,
) {
  return tx(pool, async (c, now) => {
    const existing = await c.query<MatchRow>(
      'select * from bar_game_matches where id=$1 for update',
      [requestId],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      if (r.player_a !== user || r.character !== character) throw conflict();
      return view(c, await reconcile(c, r, now), user, now);
    }
    let starter: 0 | 1 = randomInt(2) as 0 | 1;
    if (previousId) {
      const prev = await load(c, user, previousId, now);
      if (!prev.ended_at || prev.character !== character || prev.player_a !== user)
        throw conflict();
      starter = prev.data.starter === 0 ? 1 : 0;
    }
    const row = await create(
      c,
      user,
      null,
      CHARACTER_GAME[character],
      character,
      now,
      requestId,
      starter,
    );
    return view(c, row, user, now);
  });
}
export const readGame = (pool: Pool, user: string, id: string) =>
  tx(pool, async (c, now) => view(c, await load(c, user, id, now), user, now));
export const actGame = (pool: Pool, user: string, id: string, input: BarGameCommand) =>
  tx(pool, async (c, now) => {
    let storedRevision = -1;
    const row = await load(c, user, id, now, (r) => {
      storedRevision = r.data.runtime.revision;
    });
    const payload = JSON.stringify(input);
    const receipt = await c.query<{ user_id: string; payload: string }>(
      'select * from bar_game_commands where match_id=$1 and request_id=$2',
      [id, input.requestId],
    );
    if (receipt.rows[0]) {
      if (receipt.rows[0].user_id !== user || receipt.rows[0].payload !== payload) throw conflict();
      return view(c, row, user, now);
    }
    if (
      (input.revision !==
        (row.kind === 'armwrestling' ? storedRevision : row.data.runtime.revision) &&
        !(
          (row.kind === 'ochko' &&
            (input.action.type === 'ochko-hit' || input.action.type === 'ochko-stand' || input.action.type==='ochko-next' || input.action.type==='ochko-challenge')) ||
          (row.kind === 'armwrestling' && (input.action.type === 'arm-input' || (input.action.type === 'surrender'&&input.revision<=storedRevision)))
        )) ||
      row.ended_at
    )
      throw conflict();
    const player = user === row.player_a ? 0 : 1;
    if (row.kind === 'armwrestling' && (input.action.type === 'arm-input' || (input.action.type === 'surrender'&&input.revision<=storedRevision))) {
      const rate = row.data.inputRate ?? [[], []];
      rate[player] = rate[player].filter((at) => at > now - 1000);
      if (rate[player].length >= 12)
        throw new AppError('bar_input_rate', 'Слишком частые движения. Попробуй ещё раз.', 429);
      rate[player].push(now);
      row.data.inputRate = rate;
    }
    if (input.action.type === 'ready') {
      const ready = row.data.ready;
      if (!ready || ready.cancelled || ready.startsAt !== null) throw conflict();
      if (row.kind === 'battleship' && !barBattleship.validFleet((row.data.runtime.game as unknown as barBattleship.State).fleets[player])) throw new AppError('fleet_incomplete', 'Расставь все 12 кораблей', 409);
      if (!ready.players.includes(player)) ready.players.push(player);
      if (ready.players.length === 2) ready.startsAt = now + 5000;
      row.data.runtime.revision++;
    } else {
      if (row.data.ready && input.action.type !== 'surrender' && !(row.kind==='battleship'&& !row.data.ready.players.includes(player)&&row.data.ready.startsAt===null&&(input.action.type==='naval-configure'||input.action.type==='naval-shuffle'||input.action.type==='naval-deploy'))) throw conflict();
      if (input.action.type === 'surrender' && row.data.ready) {
        row.data.ready = null;
        row.data.runtime = {
          ...row.data.runtime,
          game: { ...row.data.runtime.game, winner: player === 0 ? 1 : 0 },
          reason: 'surrender',
          revision: row.data.runtime.revision + 1,
        };
      } else
        try {
          row.data.runtime = command(row.data.runtime, player, input.action, now);
        } catch {
          throw conflict();
        }
    }
    await persist(c, row, now);
    await c.query(
      'insert into bar_game_commands(match_id,request_id,user_id,payload) values($1,$2,$3,$4)',
      [id, input.requestId, user, payload],
    );
    return view(c, row, user, now);
  });
async function prune(c: PoolClient, now: number) {
  await c.query(
    'delete from bar_ochko_offers where expires_at<=$1 and not exists(select 1 from bar_game_stakes where offer_id=bar_ochko_offers.id)',
    [new Date(now)],
  );
  await c.query('delete from bar_game_queue where expires_at<=$1', [new Date(now)]);
  await c.query(
    "update bar_game_invites set status='expired' where status='pending' and expires_at<=$1",
    [new Date(now)],
  );
}
export const gameLobby = (pool: Pool, user: string) =>
  tx(pool, async (c, now): Promise<BarGameLobby> => {
    await prune(c, now);
    const active = await c.query<MatchRow>(
      'select * from bar_game_matches where ended_at is null and (player_a=$1 or player_b=$1)',
      [user],
    );
    let matchId: string | null = null;
    for (const r of active.rows) if (!(await reconcile(c, r, now)).ended_at) matchId = r.id;
    const queue = await c.query<{ kind: BarGameId; expires_at: Date }>(
      'select kind,expires_at from bar_game_queue where user_id=$1',
      [user],
    );
    const invitations = await c.query<{
      id: string;
      kind: BarGameId;
      sender_id: string;
      receiver_id: string;
      sender_name: string;
      sender_avatar_url: string | null;
      receiver_name: string;
      status: string;
      match_id: string | null;
      expires_at: Date;
    }>(
      `select i.*,s.display_name as sender_name,s.avatar_url as sender_avatar_url,r.display_name as receiver_name from bar_game_invites i join users s on s.id=i.sender_id join users r on r.id=i.receiver_id where (i.sender_id=$1 or i.receiver_id=$1) and (i.status='pending' or (i.status='accepted' and i.created_at>$2)) order by i.created_at desc limit 30`,
      [user, new Date(now - 600000)],
    );
    const invites: BarGameInvite[] = invitations.rows.map((i) => ({
      id: i.id,
      kind: i.kind,
      senderId: i.sender_id,
      receiverId: i.receiver_id,
      senderName: i.sender_name,
      senderAvatarUrl: i.sender_avatar_url,
      receiverName: i.receiver_name,
      status: i.status,
      matchId: i.match_id,
      expiresAt: i.expires_at.getTime(),
    }));
    return {
      matchId,
      searching: queue.rows[0]?.kind ?? null,
      expiresAt: queue.rows[0]?.expires_at.getTime() ?? null,
      invites,
      serverNow: now,
    };
  });
export const queueGame = (pool: Pool, user: string, kind: BarGameId, cancel = false) =>
  tx(pool, async (c, now) => {
    await prune(c, now);
    if (cancel) {
      await c.query('delete from bar_game_queue where user_id=$1', [user]);
      return { matchId: null };
    }
    await assertFree(c, user, now);
    const candidates = await c.query<{ user_id: string }>(
      'select user_id from bar_game_queue where kind=$1 and user_id<>$2 order by created_at,user_id',
      [kind, user],
    );
    for (const candidate of candidates.rows) {
      try {
        await assertFree(c, candidate.user_id, now);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 409) {
          await c.query('delete from bar_game_queue where user_id=$1', [candidate.user_id]);
          continue;
        }
        throw error;
      }
      const r = await create(c, candidate.user_id, user, kind, null, now);
      return { matchId: r.id };
    }
    await c.query('delete from bar_card_queue where user_id=$1', [user]);
    await c.query(
      'insert into bar_game_queue(user_id,kind,expires_at) values($1,$2,$3) on conflict(user_id) do update set kind=excluded.kind,expires_at=excluded.expires_at',
      [user, kind, new Date(now + 120000)],
    );
    return { matchId: null };
  });
export const searchGamePlayers = (pool: Pool, user: string, q: string) =>
  tx(pool, async (c, now) => {
    const { rows } = await c.query<{ id: string; display_name: string; avatar_url: string | null }>(
      `select id,display_name,avatar_url from users where id<>$1 and account_kind='player' and blocked_at is null and ($2='' or display_name ilike '%'||$2||'%') and not exists(select 1 from bar_game_matches m where m.ended_at is null and (m.player_a=users.id or m.player_b=users.id)) and not exists(select 1 from bar_card_room_players p where p.user_id=users.id) and not exists(select 1 from bar_card_matches m where m.ended_at is null and (m.player_a=users.id or m.player_b=users.id)) and not exists(select 1 from bar_local_card_sessions l where l.user_id=users.id and l.expires_at>$3) order by last_seen_at desc nulls last,display_name,id limit 20`,
      [user, q, new Date(now)],
    );
    return rows.map((r) => ({
      userId: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
    }));
  });
export const inviteGame = (pool: Pool, user: string, target: string, kind: BarGameId) =>
  tx(pool, async (c, now) => {
    await prune(c, now);
    if (target === user) throw new AppError('bad_request', 'Выбери другого игрока.', 400);
    const targetRow = await c.query(
      "select id from users where id=$1 and account_kind='player' and blocked_at is null",
      [target],
    );
    if (!targetRow.rows.length) throw new AppError('not_found', 'Игрок не найден.', 404);
    await assertFree(c, user, now);
    await assertFree(c, target, now);
    const duplicate = await c.query<{ id: string }>(
      "select id from bar_game_invites where sender_id=$1 and receiver_id=$2 and kind=$3 and status='pending'",
      [user, target, kind],
    );
    if (duplicate.rows[0]) return { id: duplicate.rows[0].id };
    const id = randomUUID();
    await c.query(
      'insert into bar_game_invites(id,kind,sender_id,receiver_id,expires_at) values($1,$2,$3,$4,$5)',
      [id, kind, user, target, new Date(now + 60000)],
    );
    return { id };
  });
export const respondGame = (
  pool: Pool,
  user: string,
  id: string,
  action: 'accept' | 'decline' | 'cancel',
) =>
  tx(pool, async (c, now) => {
    await prune(c, now);
    const result = await c.query<{
      id: string;
      sender_id: string;
      receiver_id: string;
      kind: BarGameId;
      status: string;
      match_id: string | null;
    }>('select * from bar_game_invites where id=$1 for update', [id]);
    const invite = result.rows[0];
    if (!invite || (action === 'cancel' ? invite.sender_id !== user : invite.receiver_id !== user))
      throw new AppError('not_found', 'Приглашение не найдено.', 404);
    if (action === 'accept' && invite.status === 'accepted') return { matchId: invite.match_id };
    if (invite.status !== 'pending')
      throw new AppError('bar_invite_expired', 'Приглашение уже недоступно.', 409);
    let matchId: string | null = null;
    if (action === 'accept') {
      const row = await create(c, invite.sender_id, invite.receiver_id, invite.kind, null, now);
      matchId = row.id;
    }
    await c.query('update bar_game_invites set status=$2,match_id=$3 where id=$1', [
      id,
      action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled',
      matchId,
    ]);
    return { matchId };
  });
export const localCards = (pool: Pool, user: string, id: string, leave = false) =>
  tx(pool, async (c, now) => {
    const existing = await c.query<{ session_id: string }>(
      'select session_id from bar_local_card_sessions where user_id=$1 and expires_at>$2',
      [user, new Date(now)],
    );
    if (leave) {
      await c.query('delete from bar_local_card_sessions where user_id=$1 and session_id=$2', [
        user,
        id,
      ]);
      return { ok: true };
    }
    if (existing.rows[0] && existing.rows[0].session_id !== id)
      throw new AppError('bar_game_busy', 'Карточная партия уже открыта.', 409);
    if (!existing.rows[0]) {
      await assertFree(c, user, now);
      await clearAdmission(c, [user]);
    }
    await c.query(
      'insert into bar_local_card_sessions(user_id,session_id,expires_at) values($1,$2,$3) on conflict(user_id) do update set session_id=excluded.session_id,expires_at=excluded.expires_at',
      [user, id, new Date(now + 120000)],
    );
    return { ok: true };
  });
export const tickGames = (pool: Pool) =>
  tx(pool, async (c, now) => {
    const { rows } = await c.query<MatchRow>(
      `select * from bar_game_matches where ended_at is null and (case when data->'ready' is not null and data->'ready'<>'null'::jsonb then coalesce((data->'ready'->>'startsAt')::bigint,(data->'ready'->>'expiresAt')::bigint) when kind in ('ochko','armwrestling') then (data->'runtime'->>'deadline')::bigint when (data->'runtime'->>'computer')::boolean and (data->'runtime'->'game'->>'turn')::int=1 then (data->'runtime'->>'animationUntil')::bigint else (data->'runtime'->>'deadline')::bigint end)<=$1 order by created_at limit 100`,
      [now],
    );
    for (const row of rows) await reconcile(c, row, now);
    await prune(c, now);
  });

export const proposeOchkoStake = (pool: Pool, user: string) =>
  tx(pool, async (c, now) => {
    const { rows } = await c.query<{ xp: number }>('select xp from users where id=$1', [user]);
    const balance = Number(rows[0]?.xp ?? 0),
      stars = chooseStake(balance, randomInt(1000000) / 1000000),
      offerId = randomUUID(),
      expiresAt = now + 300000;
    await c.query('insert into bar_ochko_offers(id,user_id,amount,expires_at)values($1,$2,$3,$4)', [
      offerId,
      user,
      stars,
      new Date(expiresAt),
    ]);
    return { offerId, stars, balance, expiresAt };
  });
export const startOchkoStake = (
  pool: Pool,
  user: string,
  input: { requestId: string; offerId: string; stars: number },
) =>
  tx(pool, async (c, now) => {
    if (!Number.isSafeInteger(input.stars) || input.stars < 1)
      throw new AppError('bar_invalid_stake', 'Укажи целое число звёзд.', 400);
    const prior = await c.query<MatchRow>('select * from bar_game_matches where id=$1', [
      input.requestId,
    ]);
    if (prior.rows[0]) {
      const row = prior.rows[0];
      if (
        row.player_a !== user ||
        row.character !== 'grigory' ||
        row.data.stake?.amount !== input.stars ||
        row.data.stakeOfferId !== input.offerId
      )
        throw conflict();
      await reconcile(c, row, now);
      return view(c, row, user, now);
    }
    const offer = await c.query(
      'select id from bar_ochko_offers where id=$1 and user_id=$2 and expires_at>$3 and not exists(select 1 from bar_game_stakes where offer_id=bar_ochko_offers.id) for update',
      [input.offerId, user, new Date(now)],
    );
    if (!offer.rows[0])
      throw new AppError('bar_offer_expired', 'Предложение устарело. Попроси новую ставку.', 409);
    const wallet = await c.query<{ xp: number }>('select xp from users where id=$1 for update', [
      user,
    ]);
    const balance = Number(wallet.rows[0]?.xp ?? 0);
    if (input.stars > balance)
      throw new AppError('bar_insufficient_stars', 'Не хватает звёзд. Измени ставку.', 409);
    if (balance + input.stars > 2147483647)
      throw new AppError(
        'bar_star_capacity',
        'Для такой ставки на балансе не хватит места под выигрыш. Укажи меньше.',
        409,
      );
    const row = await create(c, user, null, 'ochko', 'grigory', now, input.requestId);
    const debit = await c.query('update users set xp=xp-$2 where id=$1 and xp >= $2 returning xp', [
      user,
      input.stars,
    ]);
    if (!debit.rows[0])
      throw new AppError('bar_insufficient_stars', 'Не хватает звёзд. Измени ставку.', 409);
    await c.query(
      'insert into bar_game_stakes(match_id,user_id,offer_id,amount)values($1,$2,$3,$4)',
      [row.id, user, input.offerId, input.stars],
    );
    await recordOchkoStars(c, user, row.id, 'bar_ochko_stake', -input.stars, now);
    row.data.stake = { amount: input.stars, payout: null };
    row.data.stakeOfferId = input.offerId;
    await persist(c, row, now);
    return view(c, row, user, now);
  });
