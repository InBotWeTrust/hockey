import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrationConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { loadDotEnv } from '../env.js';
import {
  EXISTING_USER_INVENTORY_GRANT_KEY,
  runExistingUserInventoryGrant,
} from './existingUserInventoryGrant.js';

export function parseExistingUserInventoryGrantArgs(
  args: string[],
  confirmationKey: string | undefined,
): { apply: boolean } {
  const unknown = args.find((argument) => argument !== '--apply');
  if (unknown) throw new Error(`unknown argument: ${unknown}`);
  const apply = args.includes('--apply');
  if (apply && confirmationKey !== EXISTING_USER_INVENTORY_GRANT_KEY) {
    throw new Error('apply requires the exact INVENTORY_GRANT_CONFIRM confirmation key');
  }
  return { apply };
}

export async function main(): Promise<void> {
  loadDotEnv();
  const options = parseExistingUserInventoryGrantArgs(
    process.argv.slice(2),
    process.env.INVENTORY_GRANT_CONFIRM,
  );
  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const report = await runExistingUserInventoryGrant(pool, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!options.apply && !report.alreadyApplied) {
      process.stdout.write('[inventory-grant] dry-run rolled back; pass --apply to commit\n');
    }
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    process.stderr.write(`[inventory-grant] failed: ${message}\n`);
    process.exit(1);
  });
}
