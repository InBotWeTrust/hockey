import path from 'node:path';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { loadDotEnv } from '../env.js';
import { createObjectStorageClient } from '../storage/objectStorage.js';
import { seedDevOnboarding } from './seedDevContent.js';

loadDotEnv();

async function main(): Promise<void> {
  if (process.env.DEPLOYMENT_ENV !== 'dev') {
    throw new Error('dev onboarding seed is allowed only when DEPLOYMENT_ENV=dev');
  }
  const config = loadConfig();
  if (
    config.OBJECT_STORAGE_ENDPOINT === undefined ||
    config.OBJECT_STORAGE_REGION === undefined ||
    config.OBJECT_STORAGE_BUCKET === undefined ||
    config.OBJECT_STORAGE_TENANT_ID === undefined ||
    config.OBJECT_STORAGE_ACCESS_KEY_ID === undefined ||
    config.OBJECT_STORAGE_SECRET_ACCESS_KEY === undefined
  ) {
    throw new Error('object storage must be fully configured for dev onboarding seed');
  }
  if (config.SYSTEM_USER_ID === undefined) {
    throw new Error('SYSTEM_USER_ID is required as the dev onboarding media owner');
  }

  const objectStorage = createObjectStorageClient({
    endpoint: config.OBJECT_STORAGE_ENDPOINT,
    region: config.OBJECT_STORAGE_REGION,
    bucket: config.OBJECT_STORAGE_BUCKET,
    tenantId: config.OBJECT_STORAGE_TENANT_ID,
    accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: config.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    ...(config.OBJECT_STORAGE_PUBLIC_BASE_URL === undefined
      ? {}
      : { publicBaseUrl: config.OBJECT_STORAGE_PUBLIC_BASE_URL }),
    maxUploadBytes: config.OBJECT_STORAGE_MAX_UPLOAD_BYTES,
  });
  const assetDirectory = path.resolve(
    process.env.ONBOARDING_SEED_ASSET_DIR ?? 'packages/server/seed-assets/onboarding',
  );
  const pool = createPool(config.DATABASE_URL);
  try {
    const result = await seedDevOnboarding({
      db: pool,
      objectStorage,
      ownerUserId: config.SYSTEM_USER_ID,
      assetDirectory,
    });
    process.stdout.write(`[onboarding:seed-dev] ${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`[onboarding:seed-dev] failed: ${message}\n`);
  process.exit(1);
});
