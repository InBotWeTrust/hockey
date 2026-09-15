import { randomUUID } from 'node:crypto';
import { loadMigrationConfig } from '../config.js';
import { loadDotEnv } from '../env.js';
import { createPool } from '../db/pool.js';
import { runAchievementMechanicsReconciliation, type AchievementMechanicsReconciliationMode } from './achievementMechanicsReconciliation.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const mode = argument('--mode') as AchievementMechanicsReconciliationMode | undefined;
if (!mode || !['audit', 'dry-run', 'apply'].includes(mode)) {
  throw new Error('usage: achievements:mechanics:reconcile --mode audit|dry-run|apply --run-id <uuid> [--backup-marker <id>]');
}
const runId = argument('--run-id') ?? randomUUID();
const backupMarker = argument('--backup-marker');
const expectedHash = argument('--confirm-hash');
const rawUserCount = argument('--user-count');
const expectedUserCount = rawUserCount === undefined ? undefined : Number(rawUserCount);
loadDotEnv();
const pool = createPool(loadMigrationConfig().DATABASE_URL);
try {
  const report = await runAchievementMechanicsReconciliation(pool, {
    mode,
    runId,
    ...(backupMarker ? { backupMarker } : {}),
    ...(expectedHash ? { expectedHash } : {}),
    ...(expectedUserCount !== undefined ? { expectedUserCount } : {}),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await pool.end();
}
