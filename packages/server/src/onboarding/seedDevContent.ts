import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import sharp from 'sharp';
import { getGameSettings } from '../duel/gameSettings.js';
import type { ObjectStorageClient } from '../storage/objectStorage.js';
import { assertPublishable } from './adminRoutes.js';
import type { OnboardingChainKey } from './types.js';

interface InformationalSeedStep {
  kind: 'informational';
  title: string;
  description: string;
  ctaLabel: string;
  assetName: string;
}

interface TutorialSeedStep {
  kind: 'tutorial_shot';
  title: string;
  description: string;
  ctaLabel: string;
  tutorial: {
    shooterFrequency: number;
    goalieFrequency: number;
    goalFrequency: number;
  };
}

type SeedStep = InformationalSeedStep | TutorialSeedStep;

interface LoadedAsset {
  name: string;
  body: Buffer;
  key: string;
}

interface SeedChainResult {
  changed: boolean;
  versionId: string;
  stepCount: number;
}

export interface SeedDevOnboardingResult {
  beginner: SeedChainResult;
  amateur: SeedChainResult;
  uploadedMediaCount: number;
}

export interface SeedDevOnboardingOptions {
  db: Pool;
  objectStorage: ObjectStorageClient;
  ownerUserId: string;
  assetDirectory: string;
}

const amateurSteps: SeedStep[] = [
  {
    kind: 'informational',
    title: 'Ты в любительской лиге',
    description:
      'Двор остался позади. Теперь тебе доступны новые соперники, соревнования и игровые возможности.',
    ctaLabel: 'Узнать больше',
    assetName: 'amateur-welcome.webp',
  },
  {
    kind: 'informational',
    title: 'Дуэли',
    description: 'Бросай вызов другим игрокам и проводи асинхронные матчи один на один.',
    ctaLabel: 'Далее',
    assetName: 'amateur-duels.webp',
  },
  {
    kind: 'informational',
    title: 'Турниры',
    description: 'Участвуй в индивидуальных турнирах, проходи этапы и борись за победу.',
    ctaLabel: 'Далее',
    assetName: 'amateur-tournaments.webp',
  },
  {
    kind: 'informational',
    title: 'Бонусные игры',
    description: 'Открывай дополнительные игровые режимы, выполняй их условия и получай награды.',
    ctaLabel: 'Далее',
    assetName: 'amateur-bonus-games.webp',
  },
  {
    kind: 'informational',
    title: 'Инвентарь',
    description:
      'Собирай экипировку и расходуемые предметы. Выбирай их перед любительскими матчами и используй с умом.',
    ctaLabel: 'Далее',
    assetName: 'amateur-inventory.webp',
  },
  {
    kind: 'informational',
    title: 'Не забывай тренироваться',
    description:
      'Тренировки по-прежнему доступны. Возвращайся к ним, чтобы отрабатывать момент броска.',
    ctaLabel: 'Далее',
    assetName: 'amateur-training.webp',
  },
  {
    kind: 'informational',
    title: 'Заяви о себе',
    description:
      'Новые режимы открыты. Выходи против других игроков и начинай свой путь в любительской лиге.',
    ctaLabel: 'Перейти в любители',
    assetName: 'amateur-declare-yourself.webp',
  },
];

function beginnerSteps(unlockGoalsRequired: number): SeedStep[] {
  return [
    {
      kind: 'informational',
      title: 'Всё начинается здесь',
      description:
        'Ты решил всерьёз заняться хоккеем. Пока твоя арена — обычный двор. Именно здесь начинается путь в любительскую лигу.',
      ctaLabel: 'Далее',
      assetName: 'beginner-story-example.webp',
    },
    {
      kind: 'informational',
      title: 'Поймай момент',
      description:
        'Игрок, вратарь и ворота двигаются. Следи за ними и бросай, когда путь к воротам открыт.',
      ctaLabel: 'Попробовать',
      assetName: 'beginner-gameplay-example.webp',
    },
    {
      kind: 'tutorial_shot',
      title: 'Забей первую шайбу',
      description:
        'Поймай момент и забей свою первую шайбу. После промаха можно сразу бросить ещё раз.',
      ctaLabel: 'Далее',
      tutorial: {
        shooterFrequency: 0.12,
        goalieFrequency: 0.1,
        goalFrequency: 0.08,
      },
    },
    {
      kind: 'informational',
      title: 'Играй каждый день',
      description:
        'В дневной игре тебя ждут три периода. Выходи на лёд каждый день, забивай и двигайся вперёд.',
      ctaLabel: 'Далее',
      assetName: 'beginner-daily-game.webp',
    },
    {
      kind: 'informational',
      title: 'Тренируйся',
      description:
        'Раз в 24 часа тебе доступна тренировка на 50 бросков. Выбирай модель периода и отрабатывай точность.',
      ctaLabel: 'Далее',
      assetName: 'beginner-training.webp',
    },
    {
      kind: 'informational',
      title: 'Дорога в любители',
      description: `Забей ${unlockGoalsRequired} голов в дневной игре, чтобы открыть любительскую лигу.`,
      ctaLabel: 'Далее',
      assetName: 'beginner-road-to-amateur.webp',
    },
    {
      kind: 'informational',
      title: 'Что ждёт впереди',
      description:
        'В любителях откроются дуэли, турниры, бонусные игры и инвентарь. Сначала докажи себя во дворе.',
      ctaLabel: 'Далее',
      assetName: 'beginner-amateur-preview.webp',
    },
    {
      kind: 'informational',
      title: 'Начни свой путь',
      description:
        'Первая площадка ждёт. Поймай момент, забей и сделай первый шаг к любительской лиге.',
      ctaLabel: 'Выйти на лёд',
      assetName: 'beginner-start-journey.webp',
    },
  ];
}

function assetKey(body: Buffer): string {
  const digest = createHash('sha256').update(body).digest('hex');
  return `onboarding/seed/${digest}.webp`;
}

async function loadAsset(assetDirectory: string, name: string): Promise<LoadedAsset> {
  const body = await readFile(path.join(assetDirectory, name));
  const metadata = await sharp(body, { failOn: 'warning' }).metadata();
  if (metadata.format !== 'webp' || metadata.width !== 1200 || metadata.height !== 1200) {
    throw new Error(`onboarding seed asset must be a 1200x1200 WebP: ${name}`);
  }
  return { name, body, key: assetKey(body) };
}

async function publishedVersionId(
  client: PoolClient,
  chainKey: OnboardingChainKey,
): Promise<string | null> {
  const result = await client.query<{ current_published_version_id: string | null }>(
    `select current_published_version_id
       from onboarding_chain
      where key = $1
      for update`,
    [chainKey],
  );
  const chain = result.rows[0];
  if (!chain) throw new Error(`onboarding chain is missing: ${chainKey}`);
  return chain.current_published_version_id;
}

async function seedChain(
  client: PoolClient,
  chainKey: OnboardingChainKey,
  steps: SeedStep[],
  mediaIds: ReadonlyMap<string, string>,
  objectStorage: ObjectStorageClient,
  ownerUserId: string,
): Promise<SeedChainResult> {
  const currentVersionId = await publishedVersionId(client, chainKey);
  if (currentVersionId !== null) {
    await client.query(
      `update onboarding_chain
          set enforcement_enabled = true, updated_at = now()
        where key = $1`,
      [chainKey],
    );
    return { changed: false, versionId: currentVersionId, stepCount: steps.length };
  }

  await client.query(`delete from onboarding_version where chain_key = $1 and status = 'draft'`, [
    chainKey,
  ]);
  const version = await client.query<{ id: string }>(
    `insert into onboarding_version (chain_key, status, created_by)
     values ($1, 'draft', $2)
     returning id`,
    [chainKey, ownerUserId],
  );
  const versionId = version.rows[0]!.id;
  for (const [index, step] of steps.entries()) {
    await client.query(
      `insert into onboarding_step
         (version_id, position, kind, title, description, cta_label,
          media_object_id, tutorial_config)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        versionId,
        index + 1,
        step.kind,
        step.title,
        step.description,
        step.ctaLabel,
        step.kind === 'informational' ? mediaIds.get(step.assetName) : null,
        step.kind === 'tutorial_shot' ? JSON.stringify(step.tutorial) : null,
      ],
    );
  }
  await assertPublishable(client, chainKey, versionId, objectStorage);
  await client.query(
    `update onboarding_version
        set status = 'published', published_at = now()
      where id = $1`,
    [versionId],
  );
  await client.query(
    `update onboarding_chain
        set current_published_version_id = $2,
            enforcement_enabled = true,
            updated_at = now()
      where key = $1`,
    [chainKey, versionId],
  );
  return { changed: true, versionId, stepCount: steps.length };
}

export async function seedDevOnboarding(
  options: SeedDevOnboardingOptions,
): Promise<SeedDevOnboardingResult> {
  const settings = await getGameSettings(options.db);
  const stepsByChain = {
    beginner: beginnerSteps(settings.amateur.unlockGoalsRequired),
    amateur: amateurSteps,
  } satisfies Record<OnboardingChainKey, SeedStep[]>;
  const newlyUploadedKeys: string[] = [];
  let uploadedMediaCount = 0;
  const client = await options.db.connect();
  try {
    await client.query('begin');
    const existingChains = await client.query<{
      key: OnboardingChainKey;
      current_published_version_id: string | null;
    }>(
      `select key, current_published_version_id
         from onboarding_chain
        where key in ('beginner', 'amateur')
        order by key
        for update`,
    );
    const publishedByChain = new Map(
      existingChains.rows.map((row) => [row.key, row.current_published_version_id]),
    );
    const existingBeginnerVersion = publishedByChain.get('beginner');
    const existingAmateurVersion = publishedByChain.get('amateur');
    if (existingBeginnerVersion && existingAmateurVersion) {
      await client.query(
        `update onboarding_chain
            set enforcement_enabled = true, updated_at = now()
          where key in ('beginner', 'amateur')`,
      );
      await client.query('commit');
      return {
        beginner: {
          changed: false,
          versionId: existingBeginnerVersion,
          stepCount: stepsByChain.beginner.length,
        },
        amateur: {
          changed: false,
          versionId: existingAmateurVersion,
          stepCount: stepsByChain.amateur.length,
        },
        uploadedMediaCount: 0,
      };
    }

    const requiredAssetNames = [
      ...new Set(
        Object.values(stepsByChain)
          .flat()
          .filter((step): step is InformationalSeedStep => step.kind === 'informational')
          .map((step) => step.assetName),
      ),
    ];
    const assets = await Promise.all(
      requiredAssetNames.map((name) => loadAsset(options.assetDirectory, name)),
    );
    const existingMedia = await client.query<{ id: string; object_key: string }>(
      `select id, object_key
         from media_objects
        where object_key = any($1::text[])`,
      [assets.map((asset) => asset.key)],
    );
    const mediaIds = new Map(existingMedia.rows.map((row) => [row.object_key, row.id]));
    for (const asset of assets) {
      if (mediaIds.has(asset.key)) continue;
      if (asset.body.byteLength > options.objectStorage.maxUploadBytes) {
        throw new Error(`onboarding seed asset exceeds storage limit: ${asset.name}`);
      }
      const uploaded = await options.objectStorage.uploadObject({
        key: asset.key,
        body: asset.body,
        contentType: 'image/webp',
      });
      newlyUploadedKeys.push(asset.key);
      uploadedMediaCount += 1;
      const media = await client.query<{ id: string }>(
        `insert into media_objects
           (owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
         values ($1, 'onboarding_image', $2, $3, 'image/webp', $4, $5)
         returning id`,
        [options.ownerUserId, uploaded.key, uploaded.url, asset.body.byteLength, asset.name],
      );
      mediaIds.set(asset.key, media.rows[0]!.id);
    }
    const mediaIdByName = new Map(
      assets.map((asset) => [asset.name, mediaIds.get(asset.key)!] as const),
    );

    const beginner = await seedChain(
      client,
      'beginner',
      stepsByChain.beginner,
      mediaIdByName,
      options.objectStorage,
      options.ownerUserId,
    );
    const amateur = await seedChain(
      client,
      'amateur',
      stepsByChain.amateur,
      mediaIdByName,
      options.objectStorage,
      options.ownerUserId,
    );
    await client.query('commit');
    return { beginner, amateur, uploadedMediaCount };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    await Promise.all(
      newlyUploadedKeys.map((key) =>
        options.objectStorage.deleteObject({ key }).catch(() => undefined),
      ),
    );
    throw error;
  } finally {
    client.release();
  }
}
