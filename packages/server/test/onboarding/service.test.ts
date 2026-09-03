import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getRequiredOnboarding,
  loadPublishedVersion,
  startOnboardingRun,
} from '../../src/onboarding/service.js';
import type { OnboardingChainKey } from '../../src/onboarding/types.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const MEDIA_SECRET = 'onboarding-media-secret';

interface PublishedStep {
  position: number;
  kind: 'informational' | 'tutorial_shot';
}

describe.skipIf(!hasIntegrationEnv)('onboarding applicability service', () => {
  let pool: Pool;
  let userSequence = 0;
  let mediaOwnerId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users restart identity cascade');
    userSequence = 0;
    mediaOwnerId = randomUUID();
    await pool.query(
      `insert into users (id, display_name, timezone)
       values ($1, 'Onboarding media owner', 'Europe/Moscow')`,
      [mediaOwnerId],
    );
    await pool.query(`insert into onboarding_chain (key) values ('beginner'), ('amateur')`);
  });

  async function createUser({
    beginnerDone = false,
    amateurDone = false,
    level = 'beginner',
  }: {
    beginnerDone?: boolean;
    amateurDone?: boolean;
    level?: 'beginner' | 'amateur';
  }) {
    userSequence += 1;
    const id = randomUUID();
    const { rows } = await pool.query<{ id: string }>(
      `insert into users
         (id, display_name, timezone, level, beginner_onboarding_completed, amateur_onboarding_completed)
       values ($1, $2, 'Europe/Moscow', $3, $4, $5)
       returning id`,
      [
        id,
        `Onboarding player ${userSequence}`,
        level === 'amateur' ? 2 : 1,
        beginnerDone,
        amateurDone,
      ],
    );
    return rows[0]!.id;
  }

  async function publishChain(
    chain: OnboardingChainKey,
    steps: PublishedStep[] = [{ position: 1, kind: 'informational' }],
  ): Promise<{ versionId: string; mediaIds: string[] }> {
    const version = await pool.query<{ id: string }>(
      `insert into onboarding_version (chain_key, status, published_at)
       values ($1, 'published', now())
       returning id`,
      [chain],
    );
    const versionId = version.rows[0]!.id;
    const mediaIds: string[] = [];

    for (const step of steps) {
      if (step.kind === 'informational') {
        const media = await pool.query<{ id: string }>(
          `insert into media_objects
             (owner_user_id, purpose, object_key, url, content_type, size_bytes)
           values ($1, 'onboarding_image', $2, $3, 'image/webp', 1)
           returning id`,
          [
            mediaOwnerId,
            `onboarding-${chain}-${step.position}`,
            `/onboarding-${chain}-${step.position}.webp`,
          ],
        );
        const mediaId = media.rows[0]!.id;
        mediaIds.push(mediaId);
        await pool.query(
          `insert into onboarding_step
             (version_id, position, kind, title, description, cta_label, media_object_id)
           values ($1, $2, 'informational', $3, $4, 'Далее', $5)`,
          [
            versionId,
            step.position,
            `${chain} info ${step.position}`,
            `Описание ${step.position}`,
            mediaId,
          ],
        );
      } else {
        await pool.query(
          `insert into onboarding_step
             (version_id, position, kind, title, description, cta_label, tutorial_config)
           values ($1, $2, 'tutorial_shot', $3, $4, 'Бросить', $5::jsonb)`,
          [
            versionId,
            step.position,
            `${chain} tutorial ${step.position}`,
            `Тренировка ${step.position}`,
            JSON.stringify({ shooterFrequency: 0.5, goalieFrequency: 0.6, goalFrequency: 0.7 }),
          ],
        );
      }
    }

    await pool.query(
      `update onboarding_chain
          set enforcement_enabled = true, current_published_version_id = $2
        where key = $1`,
      [chain, versionId],
    );
    return { versionId, mediaIds };
  }

  it.each([
    [{ beginnerDone: false, amateurDone: false, level: 'beginner' }, 'beginner'],
    [{ beginnerDone: true, amateurDone: false, level: 'beginner' }, null],
    [{ beginnerDone: true, amateurDone: false, level: 'amateur' }, 'amateur'],
    [{ beginnerDone: false, amateurDone: false, level: 'amateur' }, 'beginner'],
    [{ beginnerDone: true, amateurDone: true, level: 'amateur' }, null],
  ] as const)('selects the required chain', async (input, expected) => {
    await publishChain('beginner');
    await publishChain('amateur');
    const userId = await createUser(input);

    const result = await getRequiredOnboarding(pool, userId, MEDIA_SECRET);

    expect(result.required?.chain ?? null).toBe(expected);
  });

  it('does not let a draft beginner pointer suppress a published amateur chain', async () => {
    const { versionId: beginnerVersionId } = await publishChain('beginner');
    await publishChain('amateur');
    const userId = await createUser({ level: 'amateur' });
    await pool.query(`update onboarding_version set status = 'draft' where id = $1`, [
      beginnerVersionId,
    ]);

    const result = await getRequiredOnboarding(pool, userId, MEDIA_SECRET);

    expect(result.required?.chain).toBe('amateur');
  });

  it.each([
    ['not-a-number', 300],
    ['1.9', 1],
    ['1000001', 1_000_000],
  ])(
    'uses normalized game settings for amateur applicability: %s',
    async (unlockGoalsRequired, lifetimeGoals) => {
      await publishChain('amateur');
      const userId = await createUser({ beginnerDone: true });
      await pool.query(`update users set lifetime_goals_total = $2 where id = $1`, [
        userId,
        lifetimeGoals,
      ]);
      await pool.query(
        `insert into game_settings (key, value, label, description)
         values ($1, to_jsonb($2::text), 'Голов для любителей', 'Fixture threshold')
         on conflict (key) do update set value = excluded.value`,
        ['amateur.unlock_goals_required', unlockGoalsRequired],
      );

      const result = await getRequiredOnboarding(pool, userId, MEDIA_SECRET);

      expect(result.required?.chain).toBe('amateur');
    },
  );

  it('returns no required chain when enforcement is disabled or no version is published', async () => {
    const userId = await createUser({});
    await publishChain('beginner');
    await pool.query(
      `update onboarding_chain set enforcement_enabled = false where key = 'beginner'`,
    );

    await expect(getRequiredOnboarding(pool, userId, MEDIA_SECRET)).resolves.toEqual({
      required: null,
    });

    await pool.query(
      `update onboarding_chain
          set enforcement_enabled = true, current_published_version_id = null
        where key = 'beginner'`,
    );
    await expect(getRequiredOnboarding(pool, userId, MEDIA_SECRET)).resolves.toEqual({
      required: null,
    });
  });

  it('loads ordered published steps and signs informational media URLs', async () => {
    const { versionId, mediaIds } = await publishChain('beginner', [
      { position: 2, kind: 'informational' },
      { position: 1, kind: 'tutorial_shot' },
    ]);

    const published = await loadPublishedVersion(pool, 'beginner', MEDIA_SECRET);

    expect(published).toMatchObject({
      versionId,
      steps: [
        {
          position: 1,
          kind: 'tutorial_shot',
          tutorial: { shooterFrequency: 0.5, goalieFrequency: 0.6, goalFrequency: 0.7 },
        },
        { position: 2, kind: 'informational' },
      ],
    });
    const information = published?.steps[1];
    expect(information?.kind).toBe('informational');
    if (information?.kind === 'informational') {
      expect(information.imageUrl).toMatch(
        new RegExp(`^/api/media/${mediaIds[0]}\\?t=[A-Za-z0-9_-]+$`),
      );
    }
  });

  it('starts the required chain with admin-reset source after a later reset', async () => {
    const { versionId } = await publishChain('beginner');
    const userId = await createUser({});
    const first = await startOnboardingRun(
      pool,
      userId,
      'beginner',
      '00000000-0000-4060-8060-000000000001',
      MEDIA_SECRET,
    );
    const firstRun = await pool.query<{ source: string }>(
      'select source from onboarding_run where id = $1',
      [first.runId],
    );
    expect(firstRun.rows[0]?.source).toBe('natural');
    await pool.query(
      `update onboarding_run set completed_at = '2026-09-02T10:00:00.000Z' where id = $1`,
      [first.runId],
    );
    await pool.query(
      `update users set beginner_onboarding_reset_at = '2026-09-02T11:00:00.000Z' where id = $1`,
      [userId],
    );

    const second = await startOnboardingRun(
      pool,
      userId,
      'beginner',
      '00000000-0000-4060-8060-000000000002',
      MEDIA_SECRET,
    );
    const run = await pool.query<{ source: string; version_id: string }>(
      'select source, version_id from onboarding_run where id = $1',
      [second.runId],
    );

    expect(second.required).toMatchObject({ chain: 'beginner', versionId });
    expect(run.rows[0]).toEqual({ source: 'admin_reset', version_id: versionId });
  });
});
