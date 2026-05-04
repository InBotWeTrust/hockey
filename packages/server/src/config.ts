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

const schema = z.object({
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
