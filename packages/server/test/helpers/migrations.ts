import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { applyMigrations, type MigrationResult } from '../../src/db/migrations.js';

export async function applyMigrationsThrough(
  pool: Pool,
  migrationsDir: string,
  lastMigration: string,
): Promise<MigrationResult> {
  const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migrations-through-'));
  try {
    const names = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql') && name.localeCompare(lastMigration) <= 0)
      .sort((left, right) => left.localeCompare(right));
    await Promise.all(
      names.map((name) => fs.copyFile(path.join(migrationsDir, name), path.join(isolatedDir, name))),
    );
    return await applyMigrations(pool, isolatedDir);
  } finally {
    await fs.rm(isolatedDir, { recursive: true, force: true });
  }
}
