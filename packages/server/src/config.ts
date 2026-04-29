import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

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
  DAILY_SEED_SECRET: z.string().min(16),
  SYSTEM_USER_ID: z.string().uuid().optional(),
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
