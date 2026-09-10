import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrationConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { loadDotEnv } from '../env.js';
import { runProductionEconomyRebase } from './productionEconomyRebase.js';

export function parseProductionEconomyRebaseArgs(
  args: string[],
  nodeEnv: string | undefined,
): { apply: boolean } {
  if (nodeEnv !== 'production') {
    throw new Error('production economy rebase requires NODE_ENV=production');
  }
  const unknown = args.find((argument) => argument !== '--apply');
  if (unknown) throw new Error(`unknown argument: ${unknown}`);
  return { apply: args.includes('--apply') };
}

export async function main(): Promise<void> {
  loadDotEnv();
  const options = parseProductionEconomyRebaseArgs(process.argv.slice(2), process.env.NODE_ENV);
  const config = loadMigrationConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    const report = await runProductionEconomyRebase(pool, options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!options.apply && !report.alreadyApplied) {
      process.stdout.write(
        '[production-economy-rebase] dry-run rolled back; pass --apply to commit\n',
      );
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
    process.stderr.write(`[production-economy-rebase] failed: ${message}\n`);
    process.exit(1);
  });
}
