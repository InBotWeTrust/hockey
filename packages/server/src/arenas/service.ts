import type { PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import type {
  ArenaSnapshot,
  MatchmakingVenuePolicy,
  Queryable,
  ResolvedDuelVenue,
  UserArenaDTO,
  UserArenaListResponse,
} from './types.js';

interface ArenaRow {
  id: string;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
  is_selectable: boolean;
}

function toSnapshot(row: ArenaRow): ArenaSnapshot {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    artworkUrl: row.artwork_url,
    thumbnailUrl: row.thumbnail_url,
  };
}

export function toUserArenaDTO(arena: ArenaSnapshot, selectionId: string | null): UserArenaDTO {
  return {
    id: arena.id,
    selection_id: selectionId,
    slug: arena.slug,
    title: arena.title,
    artwork_url: arena.artworkUrl,
    thumbnail_url: arena.thumbnailUrl,
  };
}

async function fetchDefaultArena(db: Queryable): Promise<ArenaSnapshot> {
  const { rows } = await db.query<ArenaRow>(
    `select id, slug, title, artwork_url, thumbnail_url, is_selectable
       from arena_theme
      where slug = 'default'
      limit 1`,
  );
  const row = rows[0];
  if (row === undefined) {
    throw new AppError('arena_unavailable', 'home arena is unavailable', 503);
  }
  return toSnapshot(row);
}

export async function resolveEffectiveArena(db: Queryable, userId: string): Promise<ArenaSnapshot> {
  const { rows } = await db.query<ArenaRow>(
    `select a.id, a.slug, a.title, a.artwork_url, a.thumbnail_url, a.is_selectable
       from users u
       join user_arena_unlock au
         on au.user_id = u.id and au.arena_theme_id = u.home_arena_theme_id
       join arena_theme a on a.id = au.arena_theme_id
      where u.id = $1 and a.is_selectable
      limit 1`,
    [userId],
  );
  const selected = rows[0];
  return selected === undefined ? fetchDefaultArena(db) : toSnapshot(selected);
}

export async function listUserArenas(
  db: Queryable,
  userId: string,
): Promise<UserArenaListResponse> {
  const [available, selected] = await Promise.all([
    db.query<ArenaRow & { selection_id: string | null }>(
      `select available.id,
              available.slug,
              available.title,
              available.artwork_url,
              available.thumbnail_url,
              available.is_selectable,
              available.selection_id
         from (
           select a.id, a.slug, a.title, a.artwork_url, a.thumbnail_url,
                  a.is_selectable, null::uuid as selection_id,
                  0 as group_order, null::timestamptz as unlocked_at
             from arena_theme a
            where a.slug = 'default'
           union all
           select a.id, a.slug, a.title, a.artwork_url, a.thumbnail_url,
                  a.is_selectable, a.id as selection_id,
                  1 as group_order, au.unlocked_at
             from user_arena_unlock au
             join arena_theme a on a.id = au.arena_theme_id
            where au.user_id = $1
              and a.is_selectable
              and a.slug <> 'default'
         ) available
        order by available.group_order, available.unlocked_at, available.id`,
      [userId],
    ),
    resolveEffectiveArena(db, userId),
  ]);

  if (!available.rows.some((arena) => arena.slug === 'default')) {
    throw new AppError('arena_unavailable', 'home arena is unavailable', 503);
  }

  return {
    arenas: available.rows.map((arena) => toUserArenaDTO(toSnapshot(arena), arena.selection_id)),
    selected_arena: toUserArenaDTO(selected, selected.slug === 'default' ? null : selected.id),
  };
}

export async function selectHomeArena(
  client: PoolClient,
  userId: string,
  arenaThemeId: string | null,
): Promise<ArenaSnapshot> {
  if (arenaThemeId === null) {
    const arena = await fetchDefaultArena(client);
    await client.query('update users set home_arena_theme_id = null where id = $1', [userId]);
    return arena;
  }

  const { rows } = await client.query<ArenaRow>(
    `select a.id, a.slug, a.title, a.artwork_url, a.thumbnail_url, a.is_selectable
       from user_arena_unlock au
       join arena_theme a on a.id = au.arena_theme_id
      where au.user_id = $1 and au.arena_theme_id = $2
      for share of au, a`,
    [userId, arenaThemeId],
  );
  const arena = rows[0];
  if (arena === undefined) {
    throw new AppError('arena_not_owned', 'arena is not owned', 403);
  }
  if (!arena.is_selectable) {
    throw new AppError('arena_not_selectable', 'arena is not selectable', 409);
  }

  await client.query('update users set home_arena_theme_id = $1 where id = $2', [
    arenaThemeId,
    userId,
  ]);
  return toSnapshot(arena);
}

function assertRandomUnit(randomUnit: number): void {
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit > 1) {
    throw new Error('randomUnit must be between 0 and 1');
  }
}

function resolvedVenue(
  policy: MatchmakingVenuePolicy | 'direct_challenge',
  homeUserId: string | null,
  arena: ArenaSnapshot,
): ResolvedDuelVenue {
  return {
    policy,
    homeUserId,
    arenaThemeId: arena.id,
    arena,
  };
}

export async function resolveDuelVenue(
  client: PoolClient,
  input: {
    source: 'challenge' | 'matchmaking' | 'tournament';
    policy: MatchmakingVenuePolicy;
    challengerUserId: string;
    opponentUserId: string;
    randomUnit: number;
  },
): Promise<ResolvedDuelVenue> {
  if (input.source === 'challenge' || input.source === 'tournament') {
    const arena = await resolveEffectiveArena(client, input.challengerUserId);
    return resolvedVenue('direct_challenge', input.challengerUserId, arena);
  }

  if (input.policy === 'neutral_default') {
    const arena = await fetchDefaultArena(client);
    return resolvedVenue(input.policy, null, arena);
  }

  assertRandomUnit(input.randomUnit);

  if (input.policy === 'random_participant_home') {
    const homeUserId = input.randomUnit < 0.5 ? input.challengerUserId : input.opponentUserId;
    const arena = await resolveEffectiveArena(client, homeUserId);
    return resolvedVenue(input.policy, homeUserId, arena);
  }

  const challengerArena = await resolveEffectiveArena(client, input.challengerUserId);
  const opponentArena = await resolveEffectiveArena(client, input.opponentUserId);
  const { rows } = await client.query<ArenaRow>(
    `select id, slug, title, artwork_url, thumbnail_url, is_selectable
       from arena_theme
      where status = 'active'
        and is_selectable
        and not (id = any($1::uuid[]))
      order by created_at, id`,
    [[challengerArena.id, opponentArena.id]],
  );
  const selected =
    rows.length === 0
      ? await fetchDefaultArena(client)
      : toSnapshot(rows[Math.min(rows.length - 1, Math.floor(input.randomUnit * rows.length))]!);
  return resolvedVenue(input.policy, null, selected);
}
