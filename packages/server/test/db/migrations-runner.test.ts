import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('migration transaction modes', () => {
  it('runs explicitly non-transactional migrations without BEGIN', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-migration-runner-'));
    tempDirs.push(dir);
    await fs.writeFile(
      path.join(dir, '001_concurrent_index.sql'),
      [
        '-- hockey:migration-mode non-transactional',
        'create index concurrently example_idx on example (id);',
        '-- hockey:migration-statement',
        'create index concurrently another_idx on example (name);',
      ].join('\n'),
    );

    const queries: string[] = [];
    let inTransaction = false;
    const client = {
      async query(text: string) {
        queries.push(text);
        if (text === 'begin') inTransaction = true;
        if (text === 'commit' || text === 'rollback') inTransaction = false;
        if (inTransaction && text.includes('create index concurrently')) {
          throw new Error('CREATE INDEX CONCURRENTLY cannot run inside a transaction block');
        }
        if ((text.match(/create index concurrently/g) ?? []).length > 1) {
          throw new Error('concurrent index statements must use separate query messages');
        }
        return { rows: [] } as unknown as QueryResult;
      },
      release() {},
    } as unknown as PoolClient;
    const pool = {
      async query(text: string) {
        queries.push(text);
        return text.includes('select name from _migrations')
          ? ({ rows: [] } as unknown as QueryResult)
          : ({ rows: [] } as unknown as QueryResult);
      },
      async connect() {
        return client;
      },
    } as unknown as Pool;

    await expect(applyMigrations(pool, dir)).resolves.toEqual({
      applied: ['001_concurrent_index.sql'],
    });
    expect(queries).not.toContain('begin');
    expect(queries).not.toContain('commit');
    expect(queries.filter((query) => query.includes('create index concurrently'))).toHaveLength(2);
  });
});
