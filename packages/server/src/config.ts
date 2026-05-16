import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === undefined) return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

const objectStorageKeys = [
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_TENANT_ID',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
] as const;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z.string().min(16),
    REFRESH_SECRET: z.string().min(16),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    VK_APP_ID: optionalNonEmptyString,
    ACCOUNT_RECOVERY_TELEGRAM_PROVIDER_UIDS: optionalNonEmptyString,
    DAILY_SEED_SECRET: z.string().min(16),
    SYSTEM_USER_ID: z.string().uuid().optional(),
    PUSH_VAPID_PUBLIC_KEY: optionalNonEmptyString,
    PUSH_VAPID_PRIVATE_KEY: optionalNonEmptyString,
    PUSH_VAPID_SUBJECT: optionalNonEmptyString,
    PUSH_SCHEDULER_ENABLED: optionalBoolean,
    PUSH_WORKER_ENABLED: optionalBoolean,
    PUSH_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(25).default(5),
    PUSH_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    OBJECT_STORAGE_ENDPOINT: optionalNonEmptyString,
    OBJECT_STORAGE_REGION: optionalNonEmptyString,
    OBJECT_STORAGE_BUCKET: optionalNonEmptyString,
    OBJECT_STORAGE_TENANT_ID: optionalNonEmptyString,
    OBJECT_STORAGE_ACCESS_KEY_ID: optionalNonEmptyString,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: optionalNonEmptyString,
    OBJECT_STORAGE_PUBLIC_BASE_URL: optionalNonEmptyString,
    OBJECT_STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().min(1).default(25 * 1024 * 1024),
  })
  .superRefine((value, ctx) => {
    const configuredKeys = objectStorageKeys.filter((key) => value[key] !== undefined);
    if (configuredKeys.length === 0 || configuredKeys.length === objectStorageKeys.length) return;

    for (const key of objectStorageKeys) {
      if (value[key] !== undefined) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'object storage config is incomplete',
      });
    }
  });

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}

const migrationSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export type MigrationConfig = z.infer<typeof migrationSchema>;

export function loadMigrationConfig(env: NodeJS.ProcessEnv = process.env): MigrationConfig {
  return migrationSchema.parse(env);
}
