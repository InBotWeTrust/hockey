import { Pool } from 'pg';
import { createDevAccessCode } from './devAccessCode.js';
import { loadMigrationConfig } from '../config.js';
import { loadDotEnv } from '../env.js';

loadDotEnv();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1];
  return undefined;
}

async function main(): Promise<void> {
  const displayName = arg('name');
  if (!displayName) {
    throw new Error(
      'Usage: pnpm --filter @hockey/server access-code:create -- --name "Name" [--tg-id 123] [--role admin]',
    );
  }

  const role = arg('role') === 'admin' ? 'admin' : 'player';
  const telegramProviderUid = arg('tg-id');
  const label = arg('label') ?? displayName;
  const code = arg('code');
  const config = loadMigrationConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  try {
    const result = await createDevAccessCode(pool, {
      label,
      displayName,
      role,
      ...(telegramProviderUid !== undefined ? { telegramProviderUid } : {}),
      ...(code !== undefined ? { code } : {}),
    });
    process.stdout.write(
      [
        `Created dev access code: ${result.code}`,
        `id: ${result.id}`,
        `name: ${displayName}`,
        `role: ${role}`,
        ...(telegramProviderUid !== undefined ? [`tg_id: ${telegramProviderUid}`] : []),
      ].join('\n') + '\n',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
