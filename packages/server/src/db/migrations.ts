import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

export interface MigrationResult {
  applied: string[];
}

const LEDGER_DDL = `
  create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

export async function applyMigrations(pool: Pool, dir: string): Promise<MigrationResult> {
  await pool.query(LEDGER_DDL);

  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const { rows } = await pool.query<{ name: string }>('select name from _migrations');
  const alreadyApplied = new Set(rows.map((r) => r.name));

  const applied: string[] = [];
  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
      applied.push(file);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  return { applied };
}
