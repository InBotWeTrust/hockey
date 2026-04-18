import { Pool, type PoolConfig } from 'pg';

export function createPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({ connectionString, ...overrides });
}
