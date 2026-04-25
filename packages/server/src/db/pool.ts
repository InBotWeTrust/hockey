import { Pool, type PoolConfig, types as pgTypes } from 'pg';

// Postgres DATE (OID 1082) by default returns a JS Date set to UTC midnight, which
// is fragile in code that compares it to local-tz date strings. Keep the raw
// 'YYYY-MM-DD' text instead.
pgTypes.setTypeParser(1082, (value) => value);

export function createPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({ connectionString, ...overrides });
}
