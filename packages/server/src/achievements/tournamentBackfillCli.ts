import { Pool } from 'pg';
import { loadMigrationConfig } from '../config.js';
import { backfillTournamentAchievements } from './tournamentBackfill.js';

function parseArguments(argv: string[]): { apply: boolean; batchSize: number } {
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run');
  if (apply === dryRun) throw new Error('pass exactly one of --dry-run or --apply');
  if (apply && process.env.TOURNAMENT_ACHIEVEMENT_BACKFILL !== '1') {
    throw new Error('TOURNAMENT_ACHIEVEMENT_BACKFILL=1 is required for --apply');
  }
  const batchIndex = argv.indexOf('--batch-size');
  const batchSize = batchIndex === -1 ? 250 : Number(argv[batchIndex + 1]);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('--batch-size must be a positive integer');
  }
  return { apply, batchSize };
}

const options = parseArguments(process.argv.slice(2));
const config = loadMigrationConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });

try {
  const report = await backfillTournamentAchievements(pool, options);
  process.stdout.write(
    `${JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', ...report })}\n`,
  );
} finally {
  await pool.end();
}
