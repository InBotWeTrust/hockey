import { loadMigrationConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { loadDotEnv } from '../env.js';

loadDotEnv();

async function main(): Promise<void> {
  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const achievements = await pool.query(
      `delete from user_achievements
        where achievement_id <> $1
           or claimed_at is null`,
      ['amateur-ticket'],
    );
    const progress = await pool.query(`delete from achievement_progress`);
    console.log(`Reset dev achievements: ${achievements.rowCount ?? 0} rows`);
    console.log(`Reset dev achievement progress: ${progress.rowCount ?? 0} rows`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  process.stderr.write(`[reset-dev-achievements] failed: ${msg}\n`);
  process.exit(1);
});
