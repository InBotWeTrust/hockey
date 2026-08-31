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

const NON_TRANSACTIONAL_DIRECTIVE = /^\s*--\s*hockey:migration-mode\s+non-transactional\s*$/m;
const NON_TRANSACTIONAL_STATEMENT_SEPARATOR = /^\s*--\s*hockey:migration-statement\s*$/m;

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
    const runsInTransaction = !NON_TRANSACTIONAL_DIRECTIVE.test(sql);
    const statements = runsInTransaction
      ? [sql]
      : sql.split(NON_TRANSACTIONAL_STATEMENT_SEPARATOR).filter((statement) => statement.trim());
    const client = await pool.connect();
    try {
      if (runsInTransaction) await client.query('begin');
      for (const statement of statements) await client.query(statement);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      if (runsInTransaction) await client.query('commit');
      applied.push(file);
    } catch (err) {
      if (runsInTransaction) await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  return { applied };
}
