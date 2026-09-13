import { loadMigrationConfig } from '../config.js';
import { loadDotEnv } from '../env.js';
import { createPool } from '../db/pool.js';
import {
  applyRemovedAchievementReconciliation,
  assertRemovableAchievementId,
  auditRemovedAchievement,
} from './removedAchievementReconciliation.js';

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}

loadDotEnv();
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
if (apply && argv.includes('--dry-run')) throw new Error('choose --dry-run or --apply');
const rawId = valueAfter(argv, '--achievement-id');
if (!rawId) throw new Error('--achievement-id is required');
const achievementId = assertRemovableAchievementId(rawId);
const config = loadMigrationConfig();
const pool = createPool(config.DATABASE_URL);

try {
  if (!apply) {
    const report = await auditRemovedAchievement(pool, achievementId);
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', ...report }, null, 2)}\n`);
  } else {
    const hash = valueAfter(argv, '--confirm-hash');
    const backupMarker = valueAfter(argv, '--backup-marker');
    const userIds = (valueAfter(argv, '--user-ids') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!hash || !backupMarker || userIds.length === 0) {
      throw new Error('--apply requires --confirm-hash, --backup-marker and --user-ids');
    }
    const report = await applyRemovedAchievementReconciliation(pool, {
      achievementId,
      exactUserIds: userIds,
      expectedHash: hash,
      backupMarker,
    });
    process.stdout.write(`${JSON.stringify({ mode: 'apply', ...report }, null, 2)}\n`);
  }
} finally {
  await pool.end();
}
