import { Buffer } from 'node:buffer';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { PoolClient } from 'pg';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { createMediaProxyUrl } from '../storage/mediaAccess.js';
import {
  createMediaObjectKey,
  type ObjectStorageClient,
  type ObjectStorageUploadResult,
} from '../storage/objectStorage.js';
import { lockBonusGameCatalogForMutation } from './service.js';
import {
  parseBonusPeriodRules,
  type BonusGameAccessType,
  type BonusGameStatus,
  type BonusPeriodRule,
} from './types.js';

const uuid = z.string().uuid();
const mediaKinds = ['arena', 'thumbnail', 'goalkeeper_ready', 'goalkeeper_save'] as const;
type BonusMediaKind = (typeof mediaKinds)[number];
type BonusMediaReferenceField = 'arena' | 'goalkeeper_ready' | 'goalkeeper_save';
const BONUS_MEDIA_MAX_PIXELS = 2048 * 2048;

const approvedStaticMediaSlugs = [
  'beach',
  'ski-resort',
  'cyberpunk-yard',
  'abandoned-waterpark',
  'pirate-bay',
  'north-pole',
  'desert',
  'volcanic-ice',
  'castle',
  'space',
] as const;

const approvedStaticMediaPaths = {
  arena: new Set(approvedStaticMediaSlugs.map((slug) => `/bonus-games/arenas/${slug}.webp`)),
  goalkeeper_ready: new Set(
    approvedStaticMediaSlugs.map((slug) => `/bonus-games/goalkeepers/${slug}-ready.webp`),
  ),
  goalkeeper_save: new Set(
    approvedStaticMediaSlugs.map((slug) => `/bonus-games/goalkeepers/${slug}-save.webp`),
  ),
} satisfies Record<BonusMediaReferenceField, ReadonlySet<string>>;

const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const title = z.string().trim().min(1).max(120);
const mediaUrl = z.string().trim().max(2048);
const statusSchema = z.enum(['draft', 'active', 'archived']);
const accessTypeSchema = z.enum(['free', 'paid']);

const arenaCreateSchema = z
  .object({
    slug,
    title,
    artworkUrl: mediaUrl.default(''),
    thumbnailUrl: mediaUrl.default(''),
    status: z.enum(['active', 'archived']).default('active'),
    isSelectable: z.boolean().default(true),
  })
  .strict();

const arenaPatchSchema = z
  .object({
    slug: slug.optional(),
    title: title.optional(),
    artworkUrl: mediaUrl.optional(),
    thumbnailUrl: mediaUrl.optional(),
    status: z.enum(['active', 'archived']).optional(),
    isSelectable: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'no changes');

const definitionFields = {
  slug,
  title,
  description: z.string().trim().max(2_000),
  sortOrder: z.number().int().min(1).max(10_000),
  status: statusSchema,
  accessType: accessTypeSchema,
  unlockPriceStars: z.number().int().min(0).max(10_000_000),
  targetGoals: z.number().int().min(1).max(1_000_000),
  totalPeriods: z.number().int().min(1).max(9),
  breakDurationMs: z.number().int().min(0).max(10_800_000),
  periods: z.unknown(),
  rewardCoins: z.number().int().min(0).max(10_000_000),
  rewardStars: z.number().int().min(0).max(10_000_000),
  rewardExperience: z.number().int().min(0).max(10_000_000),
  goalkeeperReadyUrl: mediaUrl,
  goalkeeperSaveUrl: mediaUrl,
};

const createGameSchema = z
  .object({
    ...definitionFields,
    description: definitionFields.description.default(''),
    status: definitionFields.status.default('draft'),
    accessType: definitionFields.accessType.default('free'),
    unlockPriceStars: definitionFields.unlockPriceStars.default(0),
    breakDurationMs: definitionFields.breakDurationMs.default(0),
    rewardCoins: definitionFields.rewardCoins.default(0),
    rewardStars: definitionFields.rewardStars.default(0),
    rewardExperience: definitionFields.rewardExperience.default(0),
    goalkeeperReadyUrl: definitionFields.goalkeeperReadyUrl.default(''),
    goalkeeperSaveUrl: definitionFields.goalkeeperSaveUrl.default(''),
    arenaThemeId: uuid.optional(),
    arena: arenaCreateSchema.optional(),
  })
  .strict()
  .refine(
    (value) => (value.arenaThemeId === undefined) !== (value.arena === undefined),
    'exactly one arena source is required',
  );

const patchGameSchema = z
  .object({
    slug: definitionFields.slug.optional(),
    title: definitionFields.title.optional(),
    description: definitionFields.description.optional(),
    sortOrder: definitionFields.sortOrder.optional(),
    status: definitionFields.status.optional(),
    accessType: definitionFields.accessType.optional(),
    unlockPriceStars: definitionFields.unlockPriceStars.optional(),
    targetGoals: definitionFields.targetGoals.optional(),
    totalPeriods: definitionFields.totalPeriods.optional(),
    breakDurationMs: definitionFields.breakDurationMs.optional(),
    periods: definitionFields.periods.optional(),
    rewardCoins: definitionFields.rewardCoins.optional(),
    rewardStars: definitionFields.rewardStars.optional(),
    rewardExperience: definitionFields.rewardExperience.optional(),
    goalkeeperReadyUrl: definitionFields.goalkeeperReadyUrl.optional(),
    goalkeeperSaveUrl: definitionFields.goalkeeperSaveUrl.optional(),
    arenaThemeId: uuid.optional(),
    arena: arenaPatchSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'no changes')
  .refine(
    (value) => value.arenaThemeId === undefined || value.arena === undefined,
    'arenaThemeId and arena cannot be changed together',
  );

const reorderSchema = z
  .object({
    gameIds: z.array(uuid).max(1_000),
  })
  .strict()
  .refine((value) => new Set(value.gameIds).size === value.gameIds.length, 'duplicate game id');

const gameParamsSchema = z.object({ gameId: uuid }).strict();
const mediaParamsSchema = z.object({ kind: z.enum(mediaKinds) }).strict();

type CreateGameInput = z.infer<typeof createGameSchema>;
type PatchGameInput = z.infer<typeof patchGameSchema>;
type ArenaCreateInput = z.infer<typeof arenaCreateSchema>;
type ArenaPatchInput = z.infer<typeof arenaPatchSchema>;

interface ArenaRow {
  id: string;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
  status: 'active' | 'archived';
  is_selectable: boolean;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

interface AdminGameRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
  status: BonusGameStatus;
  access_type: BonusGameAccessType;
  unlock_price_stars: number;
  target_goals: number;
  total_periods: number;
  break_duration_ms: number;
  period_rules: BonusPeriodRule[];
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  arena_theme_id: string;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  revision: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
  arena_slug: string;
  arena_title: string;
  arena_artwork_url: string;
  arena_thumbnail_url: string;
  arena_status: 'active' | 'archived';
  arena_is_selectable: boolean;
}

interface MutableDefinition {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  status: BonusGameStatus;
  accessType: BonusGameAccessType;
  unlockPriceStars: number;
  targetGoals: number;
  totalPeriods: number;
  breakDurationMs: number;
  periods: BonusPeriodRule[];
  rewardCoins: number;
  rewardStars: number;
  rewardExperience: number;
  arenaThemeId: string;
  goalkeeperReadyUrl: string;
  goalkeeperSaveUrl: string;
}

interface MediaObjectRow {
  id: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  original_name: string;
  created_at: Date;
}

export interface BonusGameAdminRouteOptions {
  preHandlers: preHandlerHookHandler[];
  objectStorage?: ObjectStorageClient;
  mediaAccessSecret: string;
}

function badRequest(message: string): AppError {
  return new AppError('bad_request', message, 400);
}

function incompleteDefinition(): AppError {
  return new AppError('bonus_game_incomplete', 'bonus game definition is incomplete', 409);
}

function invalidOrder(): AppError {
  return new AppError('bonus_game_order_invalid', 'active bonus game order is invalid', 409);
}

function sharedArenaConflict(): AppError {
  return new AppError(
    'bonus_game_arena_shared',
    'arena theme is shared by another bonus game',
    409,
  );
}

function parseBody<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  message: string,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest(message);
  return parsed.data;
}

function parsePeriods(
  value: unknown,
  totalPeriods: number,
  targetGoals: number,
  activation: boolean,
): BonusPeriodRule[] {
  try {
    return parseBonusPeriodRules(value, totalPeriods, targetGoals);
  } catch {
    throw activation ? incompleteDefinition() : badRequest('invalid bonus game period rules');
  }
}

async function withCatalogMutation<T>(
  app: FastifyInstance,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    await lockBonusGameCatalogForMutation(client);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const adminGameSelect = `
  select game.*,
         arena.slug as arena_slug,
         arena.title as arena_title,
         arena.artwork_url as arena_artwork_url,
         arena.thumbnail_url as arena_thumbnail_url,
         arena.status as arena_status,
         arena.is_selectable as arena_is_selectable
    from bonus_game game
    join arena_theme arena on arena.id = game.arena_theme_id
`;

function mapGame(row: AdminGameRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sortOrder: Number(row.sort_order),
    status: row.status,
    accessType: row.access_type,
    unlockPriceStars: Number(row.unlock_price_stars),
    targetGoals: Number(row.target_goals),
    totalPeriods: Number(row.total_periods),
    breakDurationMs: Number(row.break_duration_ms),
    periods: row.period_rules,
    rewardCoins: Number(row.reward_coins),
    rewardStars: Number(row.reward_stars),
    rewardExperience: Number(row.reward_experience),
    goalkeeperReadyUrl: row.goalkeeper_ready_url,
    goalkeeperSaveUrl: row.goalkeeper_save_url,
    revision: Number(row.revision),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
    arena: {
      id: row.arena_theme_id,
      slug: row.arena_slug,
      title: row.arena_title,
      artworkUrl: row.arena_artwork_url,
      thumbnailUrl: row.arena_thumbnail_url,
      status: row.arena_status,
      isSelectable: row.arena_is_selectable,
    },
  };
}

async function listGames(db: FastifyInstance['pg'] | PoolClient) {
  const { rows } = await db.query<AdminGameRow>(
    `${adminGameSelect}
      order by case game.status when 'active' then 0 when 'draft' then 1 else 2 end,
               game.sort_order, game.created_at, game.id`,
  );
  return rows.map(mapGame);
}

async function fetchGame(db: FastifyInstance['pg'] | PoolClient, gameId: string) {
  const { rows } = await db.query<AdminGameRow>(`${adminGameSelect} where game.id = $1`, [gameId]);
  const game = rows[0];
  if (game === undefined) throw new AppError('not_found', 'bonus game not found', 404);
  return mapGame(game);
}

async function lockGame(client: PoolClient, gameId: string): Promise<AdminGameRow> {
  const gameResult = await client.query<AdminGameRow>(
    'select * from bonus_game where id = $1 for update',
    [gameId],
  );
  const game = gameResult.rows[0];
  if (game === undefined) throw new AppError('not_found', 'bonus game not found', 404);

  const arena = await getArena(client, game.arena_theme_id, true);
  return {
    ...game,
    arena_slug: arena.slug,
    arena_title: arena.title,
    arena_artwork_url: arena.artwork_url,
    arena_thumbnail_url: arena.thumbnail_url,
    arena_status: arena.status,
    arena_is_selectable: arena.is_selectable,
  };
}

async function getArena(client: PoolClient, arenaId: string, lock: boolean): Promise<ArenaRow> {
  const { rows } = await client.query<ArenaRow>(
    `select * from arena_theme where id = $1${lock ? ' for update' : ''}`,
    [arenaId],
  );
  const arena = rows[0];
  if (arena === undefined) throw new AppError('not_found', 'arena theme not found', 404);
  return arena;
}

async function createArena(client: PoolClient, input: ArenaCreateInput): Promise<ArenaRow> {
  const { rows } = await client.query<ArenaRow>(
    `insert into arena_theme
       (slug, title, artwork_url, thumbnail_url, status, is_selectable, archived_at)
     values ($1, $2, $3, $4, $5, $6,
             case when $5::text = 'archived' then now() else null end)
     returning *`,
    [
      input.slug,
      input.title,
      input.artworkUrl,
      input.thumbnailUrl,
      input.status,
      input.isSelectable,
    ],
  );
  return rows[0]!;
}

async function patchArena(
  client: PoolClient,
  arena: ArenaRow,
  input: ArenaPatchInput,
): Promise<ArenaRow> {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (input.slug !== undefined) add('slug', input.slug);
  if (input.title !== undefined) add('title', input.title);
  if (input.artworkUrl !== undefined) add('artwork_url', input.artworkUrl);
  if (input.thumbnailUrl !== undefined) add('thumbnail_url', input.thumbnailUrl);
  if (input.status !== undefined) add('status', input.status);
  if (input.isSelectable !== undefined) add('is_selectable', input.isSelectable);
  if (input.status === 'archived' && arena.status !== 'archived')
    assignments.push('archived_at = now()');
  if (input.status === 'active' && arena.status === 'archived')
    assignments.push('archived_at = null');
  assignments.push('updated_at = now()');
  values.push(arena.id);

  const { rows } = await client.query<ArenaRow>(
    `update arena_theme set ${assignments.join(', ')} where id = $${values.length} returning *`,
    values,
  );
  return rows[0]!;
}

async function assertArenaIsExclusive(
  client: PoolClient,
  arenaId: string,
  gameId: string,
): Promise<void> {
  const shared = await client.query<{ shared: boolean }>(
    `select exists (
       select 1
         from bonus_game
        where arena_theme_id = $1
          and id <> $2
     ) as shared`,
    [arenaId, gameId],
  );
  if (shared.rows[0]?.shared === true) throw sharedArenaConflict();
}

function toDefinition(row: AdminGameRow, periods: BonusPeriodRule[]): MutableDefinition {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sortOrder: Number(row.sort_order),
    status: row.status,
    accessType: row.access_type,
    unlockPriceStars: Number(row.unlock_price_stars),
    targetGoals: Number(row.target_goals),
    totalPeriods: Number(row.total_periods),
    breakDurationMs: Number(row.break_duration_ms),
    periods,
    rewardCoins: Number(row.reward_coins),
    rewardStars: Number(row.reward_stars),
    rewardExperience: Number(row.reward_experience),
    arenaThemeId: row.arena_theme_id,
    goalkeeperReadyUrl: row.goalkeeper_ready_url,
    goalkeeperSaveUrl: row.goalkeeper_save_url,
  };
}

function applyPatch(
  current: MutableDefinition,
  input: PatchGameInput,
  arenaThemeId: string,
  activation: boolean,
): MutableDefinition {
  const totalPeriods = input.totalPeriods ?? current.totalPeriods;
  const targetGoals = input.targetGoals ?? current.targetGoals;
  const periods = parsePeriods(
    input.periods ?? current.periods,
    totalPeriods,
    targetGoals,
    activation,
  );
  return {
    ...current,
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.accessType !== undefined ? { accessType: input.accessType } : {}),
    ...(input.unlockPriceStars !== undefined ? { unlockPriceStars: input.unlockPriceStars } : {}),
    targetGoals,
    totalPeriods,
    ...(input.breakDurationMs !== undefined ? { breakDurationMs: input.breakDurationMs } : {}),
    periods,
    ...(input.rewardCoins !== undefined ? { rewardCoins: input.rewardCoins } : {}),
    ...(input.rewardStars !== undefined ? { rewardStars: input.rewardStars } : {}),
    ...(input.rewardExperience !== undefined ? { rewardExperience: input.rewardExperience } : {}),
    arenaThemeId,
    ...(input.goalkeeperReadyUrl !== undefined
      ? { goalkeeperReadyUrl: input.goalkeeperReadyUrl }
      : {}),
    ...(input.goalkeeperSaveUrl !== undefined
      ? { goalkeeperSaveUrl: input.goalkeeperSaveUrl }
      : {}),
  };
}

function revisionFingerprint(definition: MutableDefinition, arena: ArenaRow): string {
  return JSON.stringify({
    accessType: definition.accessType,
    unlockPriceStars: definition.unlockPriceStars,
    targetGoals: definition.targetGoals,
    totalPeriods: definition.totalPeriods,
    breakDurationMs: definition.breakDurationMs,
    periods: definition.periods,
    rewardCoins: definition.rewardCoins,
    rewardStars: definition.rewardStars,
    rewardExperience: definition.rewardExperience,
    arena: {
      id: definition.arenaThemeId,
      slug: arena.slug,
      title: arena.title,
      artworkUrl: arena.artwork_url,
      thumbnailUrl: arena.thumbnail_url,
    },
    goalkeeperReadyUrl: definition.goalkeeperReadyUrl,
    goalkeeperSaveUrl: definition.goalkeeperSaveUrl,
  });
}

function isCommittedStaticMediaPath(value: string, field: BonusMediaReferenceField): boolean {
  return approvedStaticMediaPaths[field].has(value);
}

async function isValidMediaReference(
  client: PoolClient,
  value: string,
  mediaAccessSecret: string,
  field: BonusMediaReferenceField,
): Promise<boolean> {
  if (isCommittedStaticMediaPath(value, field)) return true;

  const match = /^\/api\/media\/([0-9a-f-]{36})\?t=([A-Za-z0-9_-]+)$/i.exec(value);
  const mediaId = match?.[1];
  if (
    mediaId === undefined ||
    !uuid.safeParse(mediaId).success ||
    value !== createMediaProxyUrl(mediaAccessSecret, mediaId)
  ) {
    return false;
  }
  const media = await client.query<{ id: string }>(
    `select id from media_objects
      where id = $1
        and purpose = 'bonus_game_media'
        and content_type = 'image/webp'
        and size_bytes > 0`,
    [mediaId],
  );
  return media.rowCount === 1;
}

async function assertActiveDefinitionComplete(
  client: PoolClient,
  definition: MutableDefinition,
  arena: ArenaRow,
  mediaAccessSecret: string,
): Promise<void> {
  if (
    arena.status !== 'active' ||
    !arena.is_selectable ||
    (definition.accessType === 'free' && definition.unlockPriceStars !== 0) ||
    (definition.accessType === 'paid' && definition.unlockPriceStars < 1)
  ) {
    throw incompleteDefinition();
  }

  parsePeriods(definition.periods, definition.totalPeriods, definition.targetGoals, true);
  const mediaReferences: Array<[string, BonusMediaReferenceField]> = [
    [arena.artwork_url, 'arena'],
    [arena.thumbnail_url, 'arena'],
    [definition.goalkeeperReadyUrl, 'goalkeeper_ready'],
    [definition.goalkeeperSaveUrl, 'goalkeeper_save'],
  ];
  for (const [reference, field] of mediaReferences) {
    if (!(await isValidMediaReference(client, reference, mediaAccessSecret, field))) {
      throw incompleteDefinition();
    }
  }

  const activeOrders = await client.query<{ sort_order: number }>(
    `select sort_order from bonus_game
      where status = 'active' and id <> $1
      order by sort_order`,
    [definition.id],
  );
  const proposed = [
    ...activeOrders.rows.map((row) => Number(row.sort_order)),
    definition.sortOrder,
  ].sort((left, right) => left - right);
  if (proposed.some((order, index) => order !== index + 1)) throw incompleteDefinition();
}

async function writeActiveOrder(client: PoolClient, gameIds: string[]): Promise<void> {
  if (gameIds.length === 0) return;
  await client.query(
    `update bonus_game
        set sort_order = sort_order + 1000000,
            updated_at = now()
      where status = 'active'`,
  );
  for (const [index, gameId] of gameIds.entries()) {
    await client.query(
      `update bonus_game set sort_order = $2, updated_at = now()
        where id = $1 and status = 'active'`,
      [gameId, index + 1],
    );
  }
}

async function compactActiveOrder(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `select id from bonus_game where status = 'active' order by sort_order, id for update`,
  );
  await writeActiveOrder(
    client,
    rows.map((row) => row.id),
  );
}

async function createGame(
  client: PoolClient,
  input: CreateGameInput,
  adminUserId: string,
  mediaAccessSecret: string,
) {
  const periods = parsePeriods(
    input.periods,
    input.totalPeriods,
    input.targetGoals,
    input.status === 'active',
  );
  const arena =
    input.arena !== undefined
      ? await createArena(client, input.arena)
      : await getArena(client, input.arenaThemeId!, true);

  const definition: MutableDefinition = {
    id: '00000000-0000-4000-8000-000000000000',
    slug: input.slug,
    title: input.title,
    description: input.description,
    sortOrder: input.sortOrder,
    status: input.status,
    accessType: input.accessType,
    unlockPriceStars: input.unlockPriceStars,
    targetGoals: input.targetGoals,
    totalPeriods: input.totalPeriods,
    breakDurationMs: input.breakDurationMs,
    periods,
    rewardCoins: input.rewardCoins,
    rewardStars: input.rewardStars,
    rewardExperience: input.rewardExperience,
    arenaThemeId: arena.id,
    goalkeeperReadyUrl: input.goalkeeperReadyUrl,
    goalkeeperSaveUrl: input.goalkeeperSaveUrl,
  };
  if (definition.status === 'active') {
    await assertActiveDefinitionComplete(client, definition, arena, mediaAccessSecret);
  }

  const { rows } = await client.query<{ id: string }>(
    `insert into bonus_game
       (slug, title, description, sort_order, status, access_type, unlock_price_stars,
        target_goals, total_periods, break_duration_ms, period_rules,
        reward_coins, reward_stars, reward_experience, arena_theme_id,
        goalkeeper_ready_url, goalkeeper_save_url, created_by, archived_at)
     values ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11::jsonb,
             $12, $13, $14, $15, $16, $17, $18,
             case when $5::text = 'archived' then now() else null end)
     returning id`,
    [
      definition.slug,
      definition.title,
      definition.description,
      definition.sortOrder,
      definition.status,
      definition.accessType,
      definition.unlockPriceStars,
      definition.targetGoals,
      definition.totalPeriods,
      definition.breakDurationMs,
      JSON.stringify(definition.periods),
      definition.rewardCoins,
      definition.rewardStars,
      definition.rewardExperience,
      definition.arenaThemeId,
      definition.goalkeeperReadyUrl,
      definition.goalkeeperSaveUrl,
      adminUserId,
    ],
  );
  return fetchGame(client, rows[0]!.id);
}

async function patchGame(
  client: PoolClient,
  gameId: string,
  input: PatchGameInput,
  mediaAccessSecret: string,
) {
  const currentRow = await lockGame(client, gameId);
  const currentArena = await getArena(client, currentRow.arena_theme_id, false);
  const activation = input.status === 'active' || currentRow.status === 'active';
  const currentPeriods = parsePeriods(
    currentRow.period_rules,
    Number(currentRow.total_periods),
    Number(currentRow.target_goals),
    activation,
  );
  const currentDefinition = toDefinition(currentRow, currentPeriods);

  let nextArena = currentArena;
  let nextArenaThemeId = currentArena.id;
  if (input.arenaThemeId !== undefined && input.arenaThemeId !== currentArena.id) {
    nextArena = await getArena(client, input.arenaThemeId, true);
    nextArenaThemeId = nextArena.id;
  } else if (input.arena !== undefined) {
    await assertArenaIsExclusive(client, currentArena.id, gameId);
    nextArena = await patchArena(client, currentArena, input.arena);
  }

  const nextDefinition = applyPatch(currentDefinition, input, nextArenaThemeId, activation);
  if (
    currentDefinition.status === 'active' &&
    nextDefinition.status === 'active' &&
    currentDefinition.sortOrder !== nextDefinition.sortOrder
  ) {
    throw invalidOrder();
  }
  if (nextDefinition.status === 'active') {
    await assertActiveDefinitionComplete(client, nextDefinition, nextArena, mediaAccessSecret);
  }

  const revisionChanged =
    revisionFingerprint(currentDefinition, currentArena) !==
    revisionFingerprint(nextDefinition, nextArena);
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (input.slug !== undefined) add('slug', nextDefinition.slug);
  if (input.title !== undefined) add('title', nextDefinition.title);
  if (input.description !== undefined) add('description', nextDefinition.description);
  if (input.sortOrder !== undefined) add('sort_order', nextDefinition.sortOrder);
  if (input.status !== undefined) add('status', nextDefinition.status);
  if (input.accessType !== undefined) add('access_type', nextDefinition.accessType);
  if (input.unlockPriceStars !== undefined) {
    add('unlock_price_stars', nextDefinition.unlockPriceStars);
  }
  if (input.targetGoals !== undefined) add('target_goals', nextDefinition.targetGoals);
  if (input.totalPeriods !== undefined) add('total_periods', nextDefinition.totalPeriods);
  if (input.breakDurationMs !== undefined) {
    add('break_duration_ms', nextDefinition.breakDurationMs);
  }
  if (input.periods !== undefined) add('period_rules', JSON.stringify(nextDefinition.periods));
  if (input.rewardCoins !== undefined) add('reward_coins', nextDefinition.rewardCoins);
  if (input.rewardStars !== undefined) add('reward_stars', nextDefinition.rewardStars);
  if (input.rewardExperience !== undefined) {
    add('reward_experience', nextDefinition.rewardExperience);
  }
  if (nextArenaThemeId !== currentArena.id) add('arena_theme_id', nextArenaThemeId);
  if (input.goalkeeperReadyUrl !== undefined) {
    add('goalkeeper_ready_url', nextDefinition.goalkeeperReadyUrl);
  }
  if (input.goalkeeperSaveUrl !== undefined) {
    add('goalkeeper_save_url', nextDefinition.goalkeeperSaveUrl);
  }
  if (revisionChanged) assignments.push('revision = revision + 1');
  if (nextDefinition.status === 'archived' && currentDefinition.status !== 'archived') {
    assignments.push('archived_at = now()');
  } else if (nextDefinition.status !== 'archived' && currentDefinition.status === 'archived') {
    assignments.push('archived_at = null');
  }
  assignments.push('updated_at = now()');
  values.push(gameId);
  await client.query(
    `update bonus_game set ${assignments.join(', ')} where id = $${values.length}`,
    values,
  );

  if (currentDefinition.status === 'active' && nextDefinition.status !== 'active') {
    await compactActiveOrder(client);
  }
  return fetchGame(client, gameId);
}

async function archiveGame(client: PoolClient, gameId: string) {
  const current = await lockGame(client, gameId);
  if (current.status !== 'archived') {
    await client.query(
      `update bonus_game
          set status = 'archived', archived_at = now(), updated_at = now()
        where id = $1`,
      [gameId],
    );
    if (current.status === 'active') await compactActiveOrder(client);
  }
  return fetchGame(client, gameId);
}

function normalizeContentType(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function cleanFileName(value: string | string[] | undefined, kind: BonusMediaKind): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const cleaned = (raw ?? '')
    .replace(/[^\w\u0400-\u04ff ._()-]/g, '')
    .trim()
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : `${kind}.webp`;
}

async function isDecodableWebp(body: Buffer): Promise<boolean> {
  try {
    const image = sharp(body, {
      failOn: 'warning',
      limitInputPixels: BONUS_MEDIA_MAX_PIXELS,
    });
    const metadata = await image.metadata();
    if (metadata.format !== 'webp') return false;
    await image.raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}

async function uploadBody(body: unknown, contentType: string, maxBytes: number): Promise<Buffer> {
  if (contentType !== 'image/webp') {
    throw new AppError('unsupported_media_type', 'bonus game media must be WebP', 415);
  }
  if (!(body instanceof Buffer) || body.byteLength === 0) {
    throw badRequest('empty upload body');
  }
  if (body.byteLength > maxBytes) {
    throw new AppError('payload_too_large', 'bonus game media is too large', 413);
  }
  if (!(await isDecodableWebp(body))) {
    throw new AppError('invalid_webp', 'invalid WebP body', 415);
  }
  return body;
}

const mediaPrefix: Record<BonusMediaKind, string> = {
  arena: 'arena',
  thumbnail: 'thumbnail',
  goalkeeper_ready: 'goalkeeper-ready',
  goalkeeper_save: 'goalkeeper-save',
};

async function cleanupUpload(
  app: FastifyInstance,
  storage: ObjectStorageClient,
  uploaded: ObjectStorageUploadResult,
): Promise<void> {
  try {
    await storage.deleteObject({ key: uploaded.key });
  } catch (error) {
    app.log.error({ err: error, key: uploaded.key }, 'bonus media rollback delete failed');
  }
}

export async function registerBonusGameAdminRoutes(
  app: FastifyInstance,
  options: BonusGameAdminRouteOptions,
): Promise<void> {
  app.get('/admin/bonus-games', { preHandler: options.preHandlers }, async () => ({
    games: await listGames(app.pg),
  }));

  app.post('/admin/bonus-games', { preHandler: options.preHandlers }, async (request, reply) => {
    const input = parseBody(createGameSchema, request.body, 'invalid bonus game payload');
    const game = await withCatalogMutation(app, (client) =>
      createGame(client, input, request.user.id, options.mediaAccessSecret),
    );
    reply.code(201);
    return { game };
  });

  app.post('/admin/bonus-games/reorder', { preHandler: options.preHandlers }, async (request) => {
    const input = parseBody(reorderSchema, request.body, 'invalid bonus game reorder payload');
    const games = await withCatalogMutation(app, async (client) => {
      const active = await client.query<{ id: string }>(
        `select id from bonus_game where status = 'active' order by sort_order, id for update`,
      );
      const activeIds = active.rows.map((row) => row.id);
      if (
        activeIds.length !== input.gameIds.length ||
        activeIds.some((id) => !input.gameIds.includes(id))
      ) {
        throw invalidOrder();
      }
      await writeActiveOrder(client, input.gameIds);
      return listGames(client);
    });
    return { games };
  });

  app.post(
    '/admin/bonus-games/media/:kind',
    { preHandler: options.preHandlers },
    async (request, reply) => {
      if (options.objectStorage === undefined) {
        throw new AppError('storage_not_configured', 'object storage is not configured', 503);
      }
      const { kind } = parseBody(mediaParamsSchema, request.params, 'invalid bonus media kind');
      const contentType = normalizeContentType(request.headers['content-type']);
      const body = await uploadBody(
        request.body,
        contentType,
        options.objectStorage.maxUploadBytes,
      );
      const originalName = cleanFileName(request.headers['x-file-name'], kind);
      const key = createMediaObjectKey({
        prefix: `bonus-games/${mediaPrefix[kind]}`,
        contentType,
      });

      let uploaded: ObjectStorageUploadResult;
      try {
        uploaded = await options.objectStorage.uploadObject({ key, body, contentType });
      } catch (error) {
        app.log.error({ err: error, key, kind }, 'bonus media upload failed');
        throw new AppError('storage_upload_failed', 'Не удалось загрузить медиа', 502);
      }

      let row: MediaObjectRow;
      try {
        const saved = await app.pg.query<MediaObjectRow>(
          `insert into media_objects
             (owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
           values ($1, 'bonus_game_media', $2, $3, 'image/webp', $4, $5)
           returning id, object_key, content_type, size_bytes, original_name, created_at`,
          [request.user.id, uploaded.key, uploaded.url, body.byteLength, originalName],
        );
        const savedRow = saved.rows[0];
        if (savedRow === undefined) throw new Error('bonus media row was not returned');
        row = savedRow;
      } catch (error) {
        await cleanupUpload(app, options.objectStorage, uploaded);
        throw error;
      }

      reply.code(201);
      return {
        media: {
          id: row.id,
          url: createMediaProxyUrl(options.mediaAccessSecret, row.id),
          kind,
          key: row.object_key,
          contentType: row.content_type,
          size: Number(row.size_bytes),
          originalName: row.original_name,
          createdAt: row.created_at.toISOString(),
        },
      };
    },
  );

  app.patch('/admin/bonus-games/:gameId', { preHandler: options.preHandlers }, async (request) => {
    const { gameId } = parseBody(gameParamsSchema, request.params, 'invalid bonus game id');
    const input = parseBody(patchGameSchema, request.body, 'invalid bonus game patch');
    const game = await withCatalogMutation(app, (client) =>
      patchGame(client, gameId, input, options.mediaAccessSecret),
    );
    return { game };
  });

  app.delete('/admin/bonus-games/:gameId', { preHandler: options.preHandlers }, async (request) => {
    const { gameId } = parseBody(gameParamsSchema, request.params, 'invalid bonus game id');
    const game = await withCatalogMutation(app, (client) => archiveGame(client, gameId));
    return { game };
  });
}
