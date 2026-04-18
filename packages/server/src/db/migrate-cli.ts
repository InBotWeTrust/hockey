import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { loadDotEnv } from '../env.js';
import { createPool } from './pool.js';
import { applyMigrations } from './migrations.js';

loadDotEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const result = await applyMigrations(pool, MIGRATIONS_DIR);
    if (result.applied.length === 0) {
      console.log('[migrate] up to date');
    } else {
      console.log(`[migrate] applied: ${result.applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  process.stderr.write(`[migrate] failed: ${msg}\n`);
  process.exit(1);
});
