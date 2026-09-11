import { Pool } from 'pg';
import { loadMigrationConfig } from '../config.js';
import { runMonthlyRatingAchievementAudit } from './monthlyRatingAchievementAudit.js';

function parseArguments(argv: string[]): { apply: boolean } {
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run');
  if (apply && dryRun) throw new Error('pass at most one of --dry-run or --apply');
  if (apply && process.env.MONTHLY_RATING_ACHIEVEMENT_AUDIT !== '1') {
    throw new Error('MONTHLY_RATING_ACHIEVEMENT_AUDIT=1 is required for --apply');
  }
  return { apply };
}

const options = parseArguments(process.argv.slice(2));
const config = loadMigrationConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });

try {
  const report = await runMonthlyRatingAchievementAudit(pool, options);
  process.stdout.write(`${JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', ...report })}\n`);
} finally {
  await pool.end();
}
