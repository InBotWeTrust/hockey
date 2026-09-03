import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { seedDevOnboarding } from '../../src/onboarding/seedDevContent.js';
import type {
  ObjectStorageClient,
  ObjectStorageGetResult,
  ObjectStorageUploadInput,
} from '../../src/storage/objectStorage.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../db/migrations');
const ASSET_NAMES = [
  'amateur-bonus-games.webp',
  'amateur-declare-yourself.webp',
  'amateur-duels.webp',
  'amateur-inventory.webp',
  'amateur-tournaments.webp',
  'amateur-training.webp',
  'amateur-welcome.webp',
  'beginner-amateur-preview.webp',
  'beginner-daily-game.webp',
  'beginner-gameplay-example.webp',
  'beginner-road-to-amateur.webp',
  'beginner-start-journey.webp',
  'beginner-story-example.webp',
  'beginner-training.webp',
] as const;

class MemoryStorage implements ObjectStorageClient {
  maxUploadBytes = 25 * 1024 * 1024;
  readonly objects = new Map<string, ObjectStorageUploadInput>();
  uploadCount = 0;

  async uploadObject(input: ObjectStorageUploadInput) {
    this.uploadCount += 1;
    this.objects.set(input.key, input);
    return {
      key: input.key,
      url: this.publicUrlForKey(input.key),
      contentType: input.contentType,
      size: input.body.byteLength,
    };
  }

  async getObject({ key }: { key: string }): Promise<ObjectStorageGetResult> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`missing object ${key}`);
    return {
      body: object.body,
      contentType: object.contentType,
      size: object.body.byteLength,
    };
  }

  async deleteObject({ key }: { key: string }): Promise<void> {
    this.objects.delete(key);
  }

  publicUrlForKey(key: string): string {
    return `https://storage.test/${key}`;
  }
}

describe.skipIf(!hasIntegrationEnv)('seedDevOnboarding', () => {
  let pool: Pool;
  let assetDirectory: string;
  let ownerUserId: string;
  let storage: MemoryStorage;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    assetDirectory = await mkdtemp(path.join(tmpdir(), 'hockey-onboarding-seed-'));
    for (const [index, name] of ASSET_NAMES.entries()) {
      const body = await sharp({
        create: {
          width: 1200,
          height: 1200,
          channels: 3,
          background: { r: 10 + index, g: 30, b: 80 },
        },
      })
        .webp({ lossless: true })
        .toBuffer();
      await writeFile(path.join(assetDirectory, name), body);
    }
  });

  afterAll(async () => {
    if (pool !== undefined) await pool.end();
    if (assetDirectory !== undefined) {
      await rm(assetDirectory, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await pool.query('truncate onboarding_chain, users, media_objects restart identity cascade');
    await pool.query(
      `insert into onboarding_chain (key, enforcement_enabled)
       values ('beginner', false), ('amateur', false)`,
    );
    const owner = await findOrCreateTelegramUser(pool, {
      providerUid: 'dev-onboarding-seed',
      displayName: 'Dev Onboarding Seed',
      timezone: 'Europe/Moscow',
    });
    ownerUserId = owner.id;
    storage = new MemoryStorage();
  });

  it('publishes the approved beginner and amateur chains with the live unlock target', async () => {
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('amateur.unlock_goals_required', '4321'::jsonb, 'test', 'test')
       on conflict (key) do update set value = excluded.value`,
    );

    const result = await seedDevOnboarding({
      db: pool,
      objectStorage: storage,
      ownerUserId,
      assetDirectory,
    });

    expect(result).toMatchObject({
      beginner: { changed: true, stepCount: 8 },
      amateur: { changed: true, stepCount: 7 },
      uploadedMediaCount: 14,
    });
    const chains = await pool.query<{
      key: string;
      enforcement_enabled: boolean;
      current_published_version_id: string;
    }>(
      `select key, enforcement_enabled, current_published_version_id
         from onboarding_chain order by key`,
    );
    expect(chains.rows).toEqual([
      expect.objectContaining({ key: 'amateur', enforcement_enabled: true }),
      expect.objectContaining({ key: 'beginner', enforcement_enabled: true }),
    ]);

    const steps = await pool.query<{
      chain_key: string;
      position: number;
      kind: string;
      title: string;
      description: string;
      cta_label: string;
      tutorial_config: unknown;
      object_key: string | null;
    }>(
      `select v.chain_key, s.position, s.kind, s.title, s.description, s.cta_label,
              s.tutorial_config, m.object_key
         from onboarding_chain c
         join onboarding_version v on v.id = c.current_published_version_id
         join onboarding_step s on s.version_id = v.id
         left join media_objects m on m.id = s.media_object_id
        order by v.chain_key, s.position`,
    );
    const beginner = steps.rows.filter((step) => step.chain_key === 'beginner');
    const amateur = steps.rows.filter((step) => step.chain_key === 'amateur');
    expect(beginner).toHaveLength(8);
    expect(amateur).toHaveLength(7);
    expect(beginner[2]).toMatchObject({
      position: 3,
      kind: 'tutorial_shot',
      title: 'Забей первую шайбу',
      object_key: null,
      tutorial_config: {
        shooterFrequency: 0.12,
        goalieFrequency: 0.1,
        goalFrequency: 0.08,
      },
    });
    expect(beginner[5]!.description).toContain('4321');
    expect(amateur.every((step) => step.kind === 'informational')).toBe(true);
    expect(steps.rows.filter((step) => step.object_key !== null)).toHaveLength(14);
  });

  it('does not upload media or create versions when the published content is unchanged', async () => {
    const first = await seedDevOnboarding({
      db: pool,
      objectStorage: storage,
      ownerUserId,
      assetDirectory,
    });
    const firstVersions = await pool.query<{ count: string }>(
      'select count(*)::text as count from onboarding_version',
    );

    const second = await seedDevOnboarding({
      db: pool,
      objectStorage: storage,
      ownerUserId,
      assetDirectory,
    });
    const secondVersions = await pool.query<{ count: string }>(
      'select count(*)::text as count from onboarding_version',
    );

    expect(first.beginner.changed).toBe(true);
    expect(second).toMatchObject({
      beginner: { changed: false, versionId: first.beginner.versionId },
      amateur: { changed: false, versionId: first.amateur.versionId },
      uploadedMediaCount: 0,
    });
    expect(storage.uploadCount).toBe(14);
    expect(secondVersions.rows[0]!.count).toBe(firstVersions.rows[0]!.count);
  });

  it('preserves versions already published by an administrator without uploading seed assets', async () => {
    const beginnerVersion = await pool.query<{ id: string }>(
      `insert into onboarding_version (chain_key, status, created_by, published_at)
       values ('beginner', 'published', $1, now()) returning id`,
      [ownerUserId],
    );
    const amateurVersion = await pool.query<{ id: string }>(
      `insert into onboarding_version (chain_key, status, created_by, published_at)
       values ('amateur', 'published', $1, now()) returning id`,
      [ownerUserId],
    );
    await pool.query(
      `update onboarding_chain
          set current_published_version_id = case key
            when 'beginner' then $1::uuid
            else $2::uuid
          end
        where key in ('beginner', 'amateur')`,
      [beginnerVersion.rows[0]!.id, amateurVersion.rows[0]!.id],
    );

    const result = await seedDevOnboarding({
      db: pool,
      objectStorage: storage,
      ownerUserId,
      assetDirectory,
    });

    expect(result).toMatchObject({
      beginner: { changed: false, versionId: beginnerVersion.rows[0]!.id },
      amateur: { changed: false, versionId: amateurVersion.rows[0]!.id },
      uploadedMediaCount: 0,
    });
    expect(storage.uploadCount).toBe(0);
    const chains = await pool.query<{ key: string; enforcement_enabled: boolean }>(
      'select key, enforcement_enabled from onboarding_chain order by key',
    );
    expect(chains.rows).toEqual([
      { key: 'amateur', enforcement_enabled: true },
      { key: 'beginner', enforcement_enabled: true },
    ]);
  });
});
