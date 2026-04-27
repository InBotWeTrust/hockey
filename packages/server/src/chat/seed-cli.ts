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

  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    let systemUserId = process.env.SYSTEM_USER_ID;
    if (!systemUserId) {
      // Fallback: pick the earliest user. `created_by` on a system channel is
      // internal metadata (never surfaced in the chat list), so any real user
      // works. Lets prod auto-seed without configuring a secret up front.
      const r = await pool.query<{ id: string }>(
        `select id from users order by created_at asc limit 1`,
      );
      if (r.rowCount === 0) {
        process.stderr.write(
          '[chat:seed] cannot seed system channel: users table is empty.\n' +
            'Have at least one user log in (e.g. via Telegram or POST /auth/dev), then re-run.\n',
        );
        process.exit(1);
      }
      systemUserId = r.rows[0]!.id;
      console.log(`[chat:seed] SYSTEM_USER_ID not set; falling back to earliest user ${systemUserId}`);
    }
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
