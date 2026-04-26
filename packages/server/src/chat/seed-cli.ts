import { loadDotEnv } from '../env.js';
import { loadMigrationConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { seedSystemChannel } from './seed.js';

loadDotEnv();

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    process.stderr.write('Usage: pnpm chat:seed "<channel name>"\n');
    process.exit(1);
  }

  const systemUserId = process.env.SYSTEM_USER_ID;
  if (!systemUserId) {
    process.stderr.write(
      'SYSTEM_USER_ID env var is required. Set it in .env to a UUID of a real user row\n' +
        '(e.g. an admin Telegram account that already logged in once).\n',
    );
    process.exit(1);
  }

  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const result = await seedSystemChannel(pool, { name, createdBy: systemUserId });
    if (result.created) {
      console.log(`[chat:seed] created system channel "${result.chat.name}" (${result.chat.id})`);
    } else {
      console.log(`[chat:seed] system channel "${result.chat.name}" already exists (${result.chat.id})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  process.stderr.write(`[chat:seed] failed: ${msg}\n`);
  process.exit(1);
});
