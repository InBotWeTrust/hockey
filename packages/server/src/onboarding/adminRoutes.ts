import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import sharp from 'sharp';
import { z } from 'zod';
import { createAdminPreHandlers } from '../admin/guards.js';
import { AppError } from '../plugins/errors.js';
import { createMediaProxyUrl } from '../storage/mediaAccess.js';
import {
  createMediaObjectKey,
  type ObjectStorageClient,
  type ObjectStorageUploadResult,
} from '../storage/objectStorage.js';
import { startTutorialSession, submitTutorialShot } from './service.js';
import {
  onboardingTutorialConfigSchema,
  type OnboardingChainKey,
  type OnboardingStepDTO,
} from './types.js';

interface OnboardingAdminRoutesOptions {
  objectStorage?: ObjectStorageClient;
  mediaAccessSecret: string;
  tutorialSeedSecret: string;
}

type Queryable = Pool | PoolClient;

interface ChainRow {
  key: OnboardingChainKey;
  current_published_version_id: string | null;
  enforcement_enabled: boolean;
}

interface VersionRow {
  id: string;
  status: 'draft' | 'published';
  created_at: Date;
  published_at: Date | null;
}

interface StepRow {
  id: string;
  version_id: string;
  position: number;
  kind: 'informational' | 'tutorial_shot';
  title: string;
  description: string;
  cta_label: string;
  media_object_id: string | null;
  tutorial_config: unknown;
  created_at: Date;
  updated_at: Date;
}

interface MediaRow {
  id: string;
  object_key: string;
  purpose: string;
  content_type: string;
  size_bytes: number;
}

interface DraftContext {
  versionId: string;
  clonedFromVersionId: string | null;
  created: boolean;
}

const chainParamsSchema = z.object({ chainKey: z.enum(['beginner', 'amateur']) }).strict();
const stepParamsSchema = z
  .object({
    chainKey: z.enum(['beginner', 'amateur']),
    stepId: z.string().uuid(),
  })
  .strict();
const previewRunParamsSchema = z.object({ runId: z.string().uuid() }).strict();
const statsQuerySchema = z
  .object({
    chain: z.enum(['beginner', 'amateur']).optional(),
    versionId: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.from).getTime() <= new Date(value.to).getTime(),
    'from must not be after to',
  );
const reorderSchema = z.object({ stepIds: z.array(z.string().uuid()).max(100) }).strict();
const tutorialShotSchema = z
  .object({
    shotIndex: z.number().int().positive(),
    input: z
      .object({
        tapTime: z.number().finite().nonnegative(),
        shooterTapTime: z.number().finite().nonnegative(),
      })
      .strict(),
    claimedResult: z.enum(['goal', 'save', 'miss']),
  })
  .strict();

const stepInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('informational'),
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(1000),
      ctaLabel: z.string().trim().min(1).max(40),
      mediaObjectId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tutorial_shot'),
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(1000),
      ctaLabel: z.string().trim().min(1).max(40),
      tutorial: onboardingTutorialConfigSchema,
    })
    .strict(),
]);

function badRequest(message: string): AppError {
  return new AppError('bad_request', message, 400);
}

function publishInvalid(message: string): AppError {
  return new AppError('onboarding_publish_invalid', message, 409);
}

function parse<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  message: string,
): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest(message);
  return result.data;
}

async function withTransaction<T>(
  app: FastifyInstance,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockChain(client: PoolClient, chainKey: OnboardingChainKey): Promise<ChainRow> {
  const { rows } = await client.query<ChainRow>(
    `select key, current_published_version_id, enforcement_enabled
       from onboarding_chain
      where key = $1
      for update`,
    [chainKey],
  );
  const chain = rows[0];
  if (!chain) throw new AppError('not_found', 'onboarding chain not found', 404);
  return chain;
}

async function loadVersion(
  db: Queryable,
  versionId: string,
  mediaAccessSecret: string,
): Promise<{
  id: string;
  status: 'draft' | 'published';
  createdAt: string;
  publishedAt: string | null;
  steps: Array<
    | (Omit<Extract<OnboardingStepDTO, { kind: 'informational' }>, 'imageUrl'> & {
        mediaObjectId: string;
        imageUrl: string;
      })
    | Extract<OnboardingStepDTO, { kind: 'tutorial_shot' }>
  >;
} | null> {
  const versions = await db.query<VersionRow>(
    `select id, status, created_at, published_at
       from onboarding_version
      where id = $1`,
    [versionId],
  );
  const version = versions.rows[0];
  if (!version) return null;
  const { rows } = await db.query<StepRow>(
    `select id, version_id, position, kind, title, description, cta_label,
            media_object_id, tutorial_config, created_at, updated_at
       from onboarding_step
      where version_id = $1
      order by position, id`,
    [versionId],
  );
  return {
    id: version.id,
    status: version.status,
    createdAt: version.created_at.toISOString(),
    publishedAt: version.published_at?.toISOString() ?? null,
    steps: rows.map((row) => {
      const common = {
        id: row.id,
        position: Number(row.position),
        title: row.title,
        description: row.description,
        ctaLabel: row.cta_label,
      };
      if (row.kind === 'informational') {
        if (row.media_object_id === null) {
          throw publishInvalid('informational step has no image');
        }
        return {
          ...common,
          kind: 'informational' as const,
          mediaObjectId: row.media_object_id,
          imageUrl: createMediaProxyUrl(mediaAccessSecret, row.media_object_id),
        };
      }
      return {
        ...common,
        kind: 'tutorial_shot' as const,
        tutorial: onboardingTutorialConfigSchema.parse(row.tutorial_config),
      };
    }),
  };
}

async function loadAdminChain(
  db: Queryable,
  chainKey: OnboardingChainKey,
  mediaAccessSecret: string,
) {
  const chainResult = await db.query<ChainRow>(
    `select key, current_published_version_id, enforcement_enabled
       from onboarding_chain
      where key = $1`,
    [chainKey],
  );
  const chain = chainResult.rows[0];
  if (!chain) throw new AppError('not_found', 'onboarding chain not found', 404);
  const drafts = await db.query<{ id: string }>(
    `select id from onboarding_version
      where chain_key = $1 and status = 'draft'
      limit 1`,
    [chainKey],
  );
  return {
    chainKey: chain.key,
    enforcementEnabled: chain.enforcement_enabled,
    published:
      chain.current_published_version_id === null
        ? null
        : await loadVersion(db, chain.current_published_version_id, mediaAccessSecret),
    draft:
      drafts.rows[0] === undefined
        ? null
        : await loadVersion(db, drafts.rows[0].id, mediaAccessSecret),
  };
}

async function ensureDraft(
  client: PoolClient,
  chain: ChainRow,
  administratorId: string,
): Promise<DraftContext> {
  const existing = await client.query<{ id: string }>(
    `select id from onboarding_version
      where chain_key = $1 and status = 'draft'
      for update`,
    [chain.key],
  );
  if (existing.rows[0]) {
    return { versionId: existing.rows[0].id, clonedFromVersionId: null, created: false };
  }

  const inserted = await client.query<{ id: string }>(
    `insert into onboarding_version (chain_key, status, created_by)
     values ($1, 'draft', $2)
     returning id`,
    [chain.key, administratorId],
  );
  const versionId = inserted.rows[0]!.id;
  if (chain.current_published_version_id !== null) {
    await client.query(
      `insert into onboarding_step
         (version_id, position, kind, title, description, cta_label,
          media_object_id, tutorial_config, created_at, updated_at)
       select $1, position, kind, title, description, cta_label,
              media_object_id, tutorial_config, now(), now()
         from onboarding_step
        where version_id = $2
        order by position`,
      [versionId, chain.current_published_version_id],
    );
  }
  return {
    versionId,
    clonedFromVersionId: chain.current_published_version_id,
    created: true,
  };
}

async function clearPreviewRuns(client: PoolClient, versionId: string): Promise<void> {
  await client.query(`delete from onboarding_run where version_id = $1 and source = 'preview'`, [
    versionId,
  ]);
}

async function resolveDraftStep(
  client: PoolClient,
  draft: DraftContext,
  requestedStepId: string,
): Promise<StepRow> {
  const direct = await client.query<StepRow>(
    `select id, version_id, position, kind, title, description, cta_label,
            media_object_id, tutorial_config, created_at, updated_at
       from onboarding_step
      where id = $1 and version_id = $2
      for update`,
    [requestedStepId, draft.versionId],
  );
  if (direct.rows[0]) return direct.rows[0];

  if (draft.created && draft.clonedFromVersionId !== null) {
    const cloned = await client.query<StepRow>(
      `select target.id, target.version_id, target.position, target.kind, target.title,
              target.description, target.cta_label, target.media_object_id,
              target.tutorial_config, target.created_at, target.updated_at
         from onboarding_step source
         join onboarding_step target
           on target.version_id = $3 and target.position = source.position
        where source.id = $1 and source.version_id = $2
        for update of target`,
      [requestedStepId, draft.clonedFromVersionId, draft.versionId],
    );
    if (cloned.rows[0]) return cloned.rows[0];
  }

  throw new AppError('not_found', 'onboarding draft step not found', 404);
}

async function shiftRight(
  client: PoolClient,
  versionId: string,
  fromPosition: number,
): Promise<void> {
  const { rows } = await client.query<{ id: string; position: number }>(
    `select id, position from onboarding_step
      where version_id = $1 and position >= $2
      order by position desc
      for update`,
    [versionId, fromPosition],
  );
  if (rows.some((row) => Number(row.position) >= 100)) {
    throw new AppError('onboarding_step_limit', 'onboarding chain is limited to 100 steps', 409);
  }
  for (const row of rows) {
    await client.query('update onboarding_step set position = $2 where id = $1', [
      row.id,
      Number(row.position) + 1,
    ]);
  }
}

async function compactAfter(
  client: PoolClient,
  versionId: string,
  deletedPosition: number,
): Promise<void> {
  const { rows } = await client.query<{ id: string; position: number }>(
    `select id, position from onboarding_step
      where version_id = $1 and position > $2
      order by position
      for update`,
    [versionId, deletedPosition],
  );
  for (const row of rows) {
    await client.query('update onboarding_step set position = $2 where id = $1', [
      row.id,
      Number(row.position) - 1,
    ]);
  }
}

async function rewriteOrder(
  client: PoolClient,
  versionId: string,
  orderedStepIds: string[],
): Promise<void> {
  const { rows } = await client.query<StepRow>(
    `select id, version_id, position, kind, title, description, cta_label,
            media_object_id, tutorial_config, created_at, updated_at
       from onboarding_step
      where version_id = $1
      order by position, id
      for update`,
    [versionId],
  );
  const currentIds = rows.map((row) => row.id);
  const uniqueInput = new Set(orderedStepIds);
  if (
    uniqueInput.size !== orderedStepIds.length ||
    orderedStepIds.length !== currentIds.length ||
    currentIds.some((id) => !uniqueInput.has(id))
  ) {
    throw new AppError(
      'onboarding_order_invalid',
      'reorder must include every current step exactly once',
      409,
    );
  }

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const idToPosition = new Map(rows.map((row) => [row.id, Number(row.position)]));
  const positionToId = new Map(rows.map((row) => [Number(row.position), row.id]));
  const temporaryPosition = Array.from({ length: 100 }, (_, index) => index + 1).find(
    (position) => !positionToId.has(position),
  );

  for (const [index, desiredId] of orderedStepIds.entries()) {
    const desiredPosition = index + 1;
    const currentPosition = idToPosition.get(desiredId)!;
    if (currentPosition === desiredPosition) continue;
    const occupantId = positionToId.get(desiredPosition);

    if (temporaryPosition !== undefined) {
      await client.query('update onboarding_step set position = $2 where id = $1', [
        desiredId,
        temporaryPosition,
      ]);
      positionToId.delete(currentPosition);
      positionToId.set(temporaryPosition, desiredId);
      if (occupantId !== undefined) {
        await client.query('update onboarding_step set position = $2 where id = $1', [
          occupantId,
          currentPosition,
        ]);
        positionToId.delete(desiredPosition);
        positionToId.set(currentPosition, occupantId);
        idToPosition.set(occupantId, currentPosition);
      }
      await client.query('update onboarding_step set position = $2 where id = $1', [
        desiredId,
        desiredPosition,
      ]);
      positionToId.delete(temporaryPosition);
    } else {
      const desiredRow = rowById.get(desiredId)!;
      await client.query('delete from onboarding_step where id = $1', [desiredId]);
      positionToId.delete(currentPosition);
      if (occupantId !== undefined) {
        await client.query('update onboarding_step set position = $2 where id = $1', [
          occupantId,
          currentPosition,
        ]);
        positionToId.delete(desiredPosition);
        positionToId.set(currentPosition, occupantId);
        idToPosition.set(occupantId, currentPosition);
      }
      await client.query(
        `insert into onboarding_step
           (id, version_id, position, kind, title, description, cta_label,
            media_object_id, tutorial_config, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())`,
        [
          desiredRow.id,
          desiredRow.version_id,
          desiredPosition,
          desiredRow.kind,
          desiredRow.title,
          desiredRow.description,
          desiredRow.cta_label,
          desiredRow.media_object_id,
          desiredRow.tutorial_config === null ? null : JSON.stringify(desiredRow.tutorial_config),
          desiredRow.created_at,
        ],
      );
    }
    positionToId.set(desiredPosition, desiredId);
    idToPosition.set(desiredId, desiredPosition);
  }
}

async function mapClonedOrderIds(
  client: PoolClient,
  draft: DraftContext,
  requestedStepIds: string[],
): Promise<string[]> {
  if (!draft.created || draft.clonedFromVersionId === null || requestedStepIds.length === 0) {
    return requestedStepIds;
  }
  const sourceSteps = await client.query<{ id: string; position: number }>(
    `select id, position
       from onboarding_step
      where version_id = $1 and id = any($2::uuid[])`,
    [draft.clonedFromVersionId, requestedStepIds],
  );
  if (sourceSteps.rows.length !== requestedStepIds.length) return requestedStepIds;
  const sourcePositionById = new Map(sourceSteps.rows.map((row) => [row.id, Number(row.position)]));
  const draftSteps = await client.query<{ id: string; position: number }>(
    `select id, position
       from onboarding_step
      where version_id = $1`,
    [draft.versionId],
  );
  const draftIdByPosition = new Map(draftSteps.rows.map((row) => [Number(row.position), row.id]));
  return requestedStepIds.map(
    (id) => draftIdByPosition.get(sourcePositionById.get(id) ?? -1) ?? id,
  );
}

async function assertPublishable(
  client: PoolClient,
  chainKey: OnboardingChainKey,
  versionId: string,
  objectStorage: ObjectStorageClient | undefined,
): Promise<void> {
  const { rows } = await client.query<StepRow>(
    `select id, version_id, position, kind, title, description, cta_label,
            media_object_id, tutorial_config, created_at, updated_at
       from onboarding_step
      where version_id = $1
      order by position, id
      for update`,
    [versionId],
  );
  if (rows.length === 0) throw publishInvalid('onboarding chain is empty');
  if (rows.some((row, index) => Number(row.position) !== index + 1)) {
    throw publishInvalid('onboarding step positions must be unique and contiguous');
  }

  const tutorials = rows.filter((row) => row.kind === 'tutorial_shot');
  if (chainKey === 'beginner' && tutorials.length !== 1) {
    throw publishInvalid('beginner onboarding must contain exactly one tutorial step');
  }
  if (chainKey === 'amateur' && tutorials.length !== 0) {
    throw publishInvalid('amateur onboarding cannot contain a tutorial step');
  }

  const mediaIds: string[] = [];
  for (const row of rows) {
    if (
      row.title.trim().length === 0 ||
      row.description.trim().length === 0 ||
      row.cta_label.trim().length === 0
    ) {
      throw publishInvalid('onboarding step has a missing required field');
    }
    if (row.kind === 'informational') {
      if (row.media_object_id === null || row.tutorial_config !== null) {
        throw publishInvalid('informational step has no image');
      }
      mediaIds.push(row.media_object_id);
    } else if (
      row.media_object_id !== null ||
      !onboardingTutorialConfigSchema.safeParse(row.tutorial_config).success
    ) {
      throw publishInvalid('tutorial step has invalid speed configuration');
    }
  }

  if (mediaIds.length === 0) return;
  if (objectStorage === undefined) {
    throw publishInvalid('onboarding media storage is unavailable');
  }
  const mediaResult = await client.query<MediaRow>(
    `select id, object_key, purpose, content_type, size_bytes
       from media_objects
      where id = any($1::uuid[])`,
    [mediaIds],
  );
  const mediaById = new Map(mediaResult.rows.map((row) => [row.id, row]));
  for (const mediaId of mediaIds) {
    const media = mediaById.get(mediaId);
    if (
      media === undefined ||
      media.purpose !== 'onboarding_image' ||
      media.content_type !== 'image/webp' ||
      Number(media.size_bytes) <= 0
    ) {
      throw publishInvalid('onboarding step references invalid media');
    }
    try {
      const object = await objectStorage.getObject({ key: media.object_key });
      if (object.body.byteLength === 0 || object.size <= 0 || object.contentType !== 'image/webp') {
        throw new Error('stored onboarding image is invalid');
      }
    } catch {
      throw publishInvalid('onboarding media is unavailable in object storage');
    }
  }
}

function publicPreview(
  chainKey: OnboardingChainKey,
  version: NonNullable<Awaited<ReturnType<typeof loadVersion>>>,
) {
  const steps: OnboardingStepDTO[] = version.steps.map((step) => {
    if (step.kind === 'informational') {
      return {
        id: step.id,
        position: step.position,
        kind: step.kind,
        title: step.title,
        description: step.description,
        ctaLabel: step.ctaLabel,
        imageUrl: step.imageUrl,
      };
    }
    return step;
  });
  return { preview: true as const, chain: chainKey, versionId: version.id, steps };
}

function normalizedContentType(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function cleanFileName(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const cleaned = (raw ?? '')
    .replace(/[^\w\u0400-\u04ff ._()-]/g, '')
    .trim()
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : 'onboarding.webp';
}

const ONBOARDING_IMAGE_MIN_WIDTH = 800;
const ONBOARDING_IMAGE_MIN_HEIGHT = 1200;

async function readWebpUpload(
  body: unknown,
  contentType: string,
  maxBytes: number,
): Promise<Buffer> {
  if (contentType !== 'image/webp') {
    throw new AppError('unsupported_media_type', 'onboarding image must be WebP', 415);
  }
  if (!(body instanceof Buffer) || body.byteLength === 0) {
    throw badRequest('empty upload body');
  }
  if (body.byteLength > maxBytes) {
    throw new AppError('payload_too_large', 'onboarding image is too large', 413);
  }
  let width: number | undefined;
  let height: number | undefined;
  try {
    const image = sharp(body, { failOn: 'warning', limitInputPixels: 16_777_216 });
    const metadata = await image.metadata();
    if (metadata.format !== 'webp') throw new Error('not WebP');
    await image.raw().toBuffer();
    width = metadata.width;
    height = metadata.height;
  } catch {
    throw new AppError('invalid_webp', 'invalid WebP body', 415);
  }
  if (
    width === undefined ||
    height === undefined ||
    width < ONBOARDING_IMAGE_MIN_WIDTH ||
    height < ONBOARDING_IMAGE_MIN_HEIGHT ||
    width * 3 !== height * 2
  ) {
    throw new AppError(
      'invalid_image_dimensions',
      'onboarding image must be portrait 2:3 and at least 800x1200 pixels',
      422,
    );
  }
  return body;
}

async function cleanupUpload(
  app: FastifyInstance,
  storage: ObjectStorageClient,
  uploaded: ObjectStorageUploadResult,
): Promise<void> {
  try {
    await storage.deleteObject({ key: uploaded.key });
  } catch (error) {
    app.log.error({ err: error, key: uploaded.key }, 'onboarding media rollback delete failed');
  }
}

export const onboardingAdminRoutes: FastifyPluginAsync<OnboardingAdminRoutesOptions> = async (
  app,
  options,
) => {
  app.addContentTypeParser(
    /^image\/webp$/i,
    {
      parseAs: 'buffer',
      bodyLimit: options.objectStorage?.maxUploadBytes ?? 25 * 1024 * 1024,
    },
    (_request, body, done) => done(null, body),
  );
  const adminPreHandlers = createAdminPreHandlers(app);

  app.get('/admin/onboarding/stats', { preHandler: adminPreHandlers }, async (request) => {
    const query = parse(statsQuerySchema, request.query, 'invalid onboarding statistics query');
    const filters = [
      query.chain ?? null,
      query.versionId ?? null,
      query.from ?? null,
      query.to ?? null,
    ];
    const summary = await app.pg.query<{
      started_users: string;
      completed_users: string;
      completed_runs: string;
      average_completion_seconds: string | null;
      total_runs: string;
      tutorial_goals: string;
      average_attempts_to_goal: string | null;
      first_attempt_goals: string;
      max_attempts: number | null;
    }>(
      `with filtered_runs as (
         select run.*
           from onboarding_run run
          where run.source = 'natural'
            and ($1::text is null or run.chain_key = $1)
            and ($2::uuid is null or run.version_id = $2)
            and ($3::timestamptz is null or run.started_at >= $3)
            and ($4::timestamptz is null or run.started_at <= $4)
       ), tutorial_goals as (
         select event.run_id, event.attempt_number
           from onboarding_event event
           join filtered_runs run on run.id = event.run_id
          where event.kind = 'tutorial_goal'
       )
       select count(distinct run.user_id)::text as started_users,
              count(distinct run.user_id) filter (where run.completed_at is not null)::text
                as completed_users,
              count(*) filter (where run.completed_at is not null)::text as completed_runs,
              avg(extract(epoch from (run.completed_at - run.started_at)))
                filter (where run.completed_at is not null)::text as average_completion_seconds,
              count(*)::text as total_runs,
              (select count(*)::text from tutorial_goals) as tutorial_goals,
              (select avg(attempt_number)::text from tutorial_goals)
                as average_attempts_to_goal,
              (select count(*)::text from tutorial_goals where attempt_number = 1)
                as first_attempt_goals,
              (select max(attempt_number) from tutorial_goals) as max_attempts
         from filtered_runs run`,
      filters,
    );
    const stepRows = await app.pg.query<{
      step_id: string;
      position: number;
      title: string;
      reached_users: string;
      drop_off_users: string;
    }>(
      `with filtered_runs as (
         select run.*
           from onboarding_run run
          where run.source = 'natural'
            and ($1::text is null or run.chain_key = $1)
            and ($2::uuid is null or run.version_id = $2)
            and ($3::timestamptz is null or run.started_at >= $3)
            and ($4::timestamptz is null or run.started_at <= $4)
       ), reached as (
         select event.step_id, count(distinct event.user_id)::text as reached_users
           from onboarding_event event
           join filtered_runs run on run.id = event.run_id
          where event.kind = 'step_viewed'
          group by event.step_id
       ), last_reached as (
         select distinct on (event.run_id)
                event.run_id, event.user_id, event.step_id
           from onboarding_event event
           join filtered_runs run on run.id = event.run_id
           join onboarding_step step on step.id = event.step_id
          where event.kind = 'step_viewed'
            and run.completed_at is null
            and run.started_at <= now() - interval '30 minutes'
          order by event.run_id, event.created_at desc, step.position desc
       ), drop_off as (
         select step_id, count(distinct user_id)::text as drop_off_users
           from last_reached
          group by step_id
       )
       select step.id as step_id, step.position, step.title,
              coalesce(reached.reached_users, '0') as reached_users,
              coalesce(drop_off.drop_off_users, '0') as drop_off_users
         from onboarding_step step
         join onboarding_version version on version.id = step.version_id
         left join reached on reached.step_id = step.id
         left join drop_off on drop_off.step_id = step.id
        where ($1::text is null or version.chain_key = $1)
          and ($2::uuid is null or version.id = $2)
        order by version.created_at, step.position, step.id`,
      filters,
    );
    const row = summary.rows[0]!;
    const startedUsers = Number(row.started_users);
    const completedUsers = Number(row.completed_users);
    const tutorialGoals = Number(row.tutorial_goals);
    return {
      startedUsers,
      completedUsers,
      completionRate: startedUsers === 0 ? 0 : (completedUsers * 100) / startedUsers,
      averageCompletionSeconds:
        row.average_completion_seconds === null ? null : Number(row.average_completion_seconds),
      repeatStarts: Number(row.total_runs) - startedUsers,
      tutorial: {
        averageAttemptsToGoal:
          row.average_attempts_to_goal === null ? null : Number(row.average_attempts_to_goal),
        firstAttemptGoalRate:
          tutorialGoals === 0 ? null : (Number(row.first_attempt_goals) * 100) / tutorialGoals,
        maxAttempts: row.max_attempts === null ? null : Number(row.max_attempts),
      },
      steps: stepRows.rows.map((step) => ({
        stepId: step.step_id,
        position: Number(step.position),
        title: step.title,
        reachedUsers: Number(step.reached_users),
        dropOffUsers: Number(step.drop_off_users),
      })),
    };
  });

  app.get(
    '/admin/onboarding/chains/:chainKey',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { chainKey } = parse(chainParamsSchema, request.params, 'invalid onboarding chain');
      return { chain: await loadAdminChain(app.pg, chainKey, options.mediaAccessSecret) };
    },
  );

  app.post(
    '/admin/onboarding/chains/:chainKey/steps',
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const { chainKey } = parse(chainParamsSchema, request.params, 'invalid onboarding chain');
      const input = parse(stepInputSchema, request.body, 'invalid onboarding step');
      const chain = await withTransaction(app, async (client) => {
        const lockedChain = await lockChain(client, chainKey);
        const draft = await ensureDraft(client, lockedChain, request.user.id);
        await clearPreviewRuns(client, draft.versionId);
        const positions = await client.query<{ next_position: number }>(
          `select coalesce(max(position), 0)::int + 1 as next_position
             from onboarding_step
            where version_id = $1`,
          [draft.versionId],
        );
        const position = positions.rows[0]!.next_position;
        if (position > 100) {
          throw new AppError(
            'onboarding_step_limit',
            'onboarding chain is limited to 100 steps',
            409,
          );
        }
        await client.query(
          `insert into onboarding_step
             (version_id, position, kind, title, description, cta_label,
              media_object_id, tutorial_config)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            draft.versionId,
            position,
            input.kind,
            input.title,
            input.description,
            input.ctaLabel,
            input.kind === 'informational' ? input.mediaObjectId : null,
            input.kind === 'tutorial_shot' ? JSON.stringify(input.tutorial) : null,
          ],
        );
        return loadAdminChain(client, chainKey, options.mediaAccessSecret);
      });
      reply.code(201);
      return { chain };
    },
  );

  app.patch(
    '/admin/onboarding/chains/:chainKey/steps/:stepId',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { chainKey, stepId } = parse(
        stepParamsSchema,
        request.params,
        'invalid onboarding step id',
      );
      const input = parse(stepInputSchema, request.body, 'invalid onboarding step');
      const chain = await withTransaction(app, async (client) => {
        const lockedChain = await lockChain(client, chainKey);
        const draft = await ensureDraft(client, lockedChain, request.user.id);
        const step = await resolveDraftStep(client, draft, stepId);
        await clearPreviewRuns(client, draft.versionId);
        await client.query(
          `update onboarding_step
              set kind = $2, title = $3, description = $4, cta_label = $5,
                  media_object_id = $6, tutorial_config = $7::jsonb, updated_at = now()
            where id = $1`,
          [
            step.id,
            input.kind,
            input.title,
            input.description,
            input.ctaLabel,
            input.kind === 'informational' ? input.mediaObjectId : null,
            input.kind === 'tutorial_shot' ? JSON.stringify(input.tutorial) : null,
          ],
        );
        return loadAdminChain(client, chainKey, options.mediaAccessSecret);
      });
      return { chain };
    },
  );

  app.post(
    '/admin/onboarding/chains/:chainKey/steps/:stepId/duplicate',
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const { chainKey, stepId } = parse(
        stepParamsSchema,
        request.params,
        'invalid onboarding step id',
      );
      const chain = await withTransaction(app, async (client) => {
        const lockedChain = await lockChain(client, chainKey);
        const draft = await ensureDraft(client, lockedChain, request.user.id);
        const step = await resolveDraftStep(client, draft, stepId);
        await clearPreviewRuns(client, draft.versionId);
        await shiftRight(client, draft.versionId, Number(step.position) + 1);
        await client.query(
          `insert into onboarding_step
             (version_id, position, kind, title, description, cta_label,
              media_object_id, tutorial_config)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            draft.versionId,
            Number(step.position) + 1,
            step.kind,
            step.title,
            step.description,
            step.cta_label,
            step.media_object_id,
            step.tutorial_config === null ? null : JSON.stringify(step.tutorial_config),
          ],
        );
        return loadAdminChain(client, chainKey, options.mediaAccessSecret);
      });
      reply.code(201);
      return { chain };
    },
  );

  app.delete(
    '/admin/onboarding/chains/:chainKey/steps/:stepId',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { chainKey, stepId } = parse(
        stepParamsSchema,
        request.params,
        'invalid onboarding step id',
      );
      const chain = await withTransaction(app, async (client) => {
        const lockedChain = await lockChain(client, chainKey);
        const draft = await ensureDraft(client, lockedChain, request.user.id);
        const step = await resolveDraftStep(client, draft, stepId);
        await clearPreviewRuns(client, draft.versionId);
        await client.query('delete from onboarding_step where id = $1', [step.id]);
        await compactAfter(client, draft.versionId, Number(step.position));
        return loadAdminChain(client, chainKey, options.mediaAccessSecret);
      });
      return { chain };
    },
  );

  app.post(
    '/admin/onboarding/chains/:chainKey/reorder',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { chainKey } = parse(chainParamsSchema, request.params, 'invalid onboarding chain');
      const { stepIds } = parse(reorderSchema, request.body, 'invalid onboarding reorder');
      const chain = await withTransaction(app, async (client) => {
        const lockedChain = await lockChain(client, chainKey);
        const draft = await ensureDraft(client, lockedChain, request.user.id);
        await clearPreviewRuns(client, draft.versionId);
        const draftStepIds = await mapClonedOrderIds(client, draft, stepIds);
        await rewriteOrder(client, draft.versionId, draftStepIds);
        return loadAdminChain(client, chainKey, options.mediaAccessSecret);
      });
      return { chain };
    },
  );

  app.post(
    '/admin/onboarding/chains/:chainKey/publish',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { chainKey } = parse(chainParamsSchema, request.params, 'invalid onboarding chain');
      const chain = await withTransaction(app, async (client) => {
        await lockChain(client, chainKey);
        const drafts = await client.query<{ id: string }>(
          `select id from onboarding_version
            where chain_key = $1 and status = 'draft'
            for update`,
          [chainKey],
        );
        const draft = drafts.rows[0];
        if (!draft) throw publishInvalid('onboarding chain has no draft');
        await assertPublishable(client, chainKey, draft.id, options.objectStorage);
        await client.query(
          `update onboarding_version
              set status = 'published', published_at = now()
            where id = $1 and status = 'draft'`,
          [draft.id],
        );
        await client.query(
          `update onboarding_chain
              set current_published_version_id = $2,
                  enforcement_enabled = true,
                  updated_at = now()
            where key = $1`,
          [chainKey, draft.id],
        );
        return loadAdminChain(client, chainKey, options.mediaAccessSecret);
      });
      return { chain };
    },
  );

  app.get(
    '/admin/onboarding/chains/:chainKey/preview',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { chainKey } = parse(chainParamsSchema, request.params, 'invalid onboarding chain');
      const chain = await loadAdminChain(app.pg, chainKey, options.mediaAccessSecret);
      const version = chain.draft ?? chain.published;
      if (version === null) {
        throw new AppError('onboarding_preview_unavailable', 'onboarding preview is empty', 409);
      }
      return publicPreview(chainKey, version);
    },
  );

  app.post(
    '/admin/onboarding/chains/:chainKey/preview/tutorial/start',
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const { chainKey } = parse(chainParamsSchema, request.params, 'invalid onboarding chain');
      const result = await withTransaction(app, async (client) => {
        const chain = await lockChain(client, chainKey);
        const drafts = await client.query<{ id: string }>(
          `select id from onboarding_version
            where chain_key = $1 and status = 'draft'
            limit 1`,
          [chainKey],
        );
        const versionId = drafts.rows[0]?.id ?? chain.current_published_version_id;
        if (versionId === null) {
          throw new AppError('onboarding_preview_unavailable', 'onboarding preview is empty', 409);
        }
        const inserted = await client.query<{ id: string }>(
          `insert into onboarding_run
             (user_id, chain_key, version_id, client_session_id, source)
           values ($1, $2, $3, $4, 'preview')
           returning id`,
          [request.user.id, chainKey, versionId, randomUUID()],
        );
        const runId = inserted.rows[0]!.id;
        const session = await startTutorialSession(
          client,
          {
            id: runId,
            userId: request.user.id,
            chainKey,
            versionId,
            tutorialState: null,
          },
          options.tutorialSeedSecret,
        );
        return { runId, ...session };
      });
      reply.code(201);
      return result;
    },
  );

  app.post(
    '/admin/onboarding/preview/runs/:runId/tutorial/shot',
    { preHandler: adminPreHandlers },
    async (request) => {
      const { runId } = parse(
        previewRunParamsSchema,
        request.params,
        'invalid onboarding preview run',
      );
      const input = parse(tutorialShotSchema, request.body, 'invalid onboarding tutorial shot');
      return withTransaction(app, async (client) => {
        const runs = await client.query<{
          id: string;
          user_id: string;
          chain_key: OnboardingChainKey;
          version_id: string;
          tutorial_state: unknown;
        }>(
          `select id, user_id, chain_key, version_id, tutorial_state
             from onboarding_run
            where id = $1 and user_id = $2 and source = 'preview'
            for update`,
          [runId, request.user.id],
        );
        const run = runs.rows[0];
        if (!run) throw new AppError('not_found', 'onboarding preview run not found', 404);
        return submitTutorialShot(
          client,
          {
            id: run.id,
            userId: run.user_id,
            chainKey: run.chain_key,
            versionId: run.version_id,
            tutorialState: run.tutorial_state,
          },
          input,
        );
      });
    },
  );

  app.post('/admin/onboarding/media', { preHandler: adminPreHandlers }, async (request, reply) => {
    if (options.objectStorage === undefined) {
      throw new AppError('storage_not_configured', 'object storage is not configured', 503);
    }
    const contentType = normalizedContentType(request.headers['content-type']);
    const body = await readWebpUpload(
      request.body,
      contentType,
      options.objectStorage.maxUploadBytes,
    );
    const originalName = cleanFileName(request.headers['x-file-name']);
    const key = createMediaObjectKey({ prefix: 'onboarding', contentType });
    let uploaded: ObjectStorageUploadResult;
    try {
      uploaded = await options.objectStorage.uploadObject({ key, body, contentType });
    } catch (error) {
      app.log.error({ err: error, key }, 'onboarding media upload failed');
      throw new AppError('storage_upload_failed', 'Не удалось загрузить изображение', 502);
    }

    try {
      const saved = await app.pg.query<{
        id: string;
        object_key: string;
        content_type: string;
        size_bytes: number;
        original_name: string;
        created_at: Date;
      }>(
        `insert into media_objects
             (owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
           values ($1, 'onboarding_image', $2, $3, 'image/webp', $4, $5)
           returning id, object_key, content_type, size_bytes, original_name, created_at`,
        [request.user.id, uploaded.key, uploaded.url, body.byteLength, originalName],
      );
      const row = saved.rows[0];
      if (!row) throw new Error('onboarding media row was not returned');
      reply.code(201);
      return {
        media: {
          id: row.id,
          url: createMediaProxyUrl(options.mediaAccessSecret, row.id),
          key: row.object_key,
          contentType: row.content_type,
          size: Number(row.size_bytes),
          originalName: row.original_name,
          createdAt: row.created_at.toISOString(),
        },
      };
    } catch (error) {
      await cleanupUpload(app, options.objectStorage, uploaded);
      throw error;
    }
  });
};
