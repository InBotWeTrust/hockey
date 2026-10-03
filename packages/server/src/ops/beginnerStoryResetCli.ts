import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrationConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { loadDotEnv } from '../env.js';
import {
  RESET_KEY,
  resetBeginnerStory,
} from './beginnerStoryReset.js';

export function parseBeginnerStoryResetArgs(
  args: string[],
  confirmationKey: string | undefined,
): { apply: boolean } {
  const unknown = args.find((argument) => argument !== '--apply');
  if (unknown) throw new Error(`unknown argument: ${unknown}`);
  const apply = args.includes('--apply');
  if (apply && confirmationKey !== RESET_KEY) {
    throw new Error('apply requires the exact BEGINNER_STORY_RESET_CONFIRM confirmation key');
  }
  return { apply };
}

export async function main(): Promise<void> {
  loadDotEnv();
  const options = parseBeginnerStoryResetArgs(
    process.argv.slice(2),
    process.env.BEGINNER_STORY_RESET_CONFIRM,
  );
  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const report = await resetBeginnerStory(pool, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!options.apply && !report.alreadyApplied) {
      process.stdout.write('[beginner-story-reset] dry-run rolled back; pass --apply to commit\n');
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
    process.stderr.write(`[beginner-story-reset] failed: ${message}\n`);
    process.exit(1);
  });
}
