import type { Pool } from 'pg';

export interface BlockedWriterLockState {
  pid: number;
  query: string;
  accountWriteLockHeld: boolean;
}

export async function waitForBlockedWriter(
  pool: Pool,
  blockerPid: number,
  preferredQuery: RegExp,
): Promise<BlockedWriterLockState> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const { rows } = await pool.query<{
      pid: number;
      query: string;
      account_write_lock_held: boolean;
    }>(
      `select activity.pid,
              activity.query,
              exists (
                select 1
                  from pg_locks account_lock
                 where account_lock.pid = activity.pid
                   and account_lock.relation = 'user_currency_account'::regclass
                   and account_lock.mode = 'RowExclusiveLock'
                   and account_lock.granted
              ) as account_write_lock_held
         from pg_stat_activity activity
        where activity.datname = current_database()
          and activity.pid <> pg_backend_pid()
          and $1 = any(pg_blocking_pids(activity.pid))
          and activity.wait_event_type = 'Lock'
        order by activity.pid`,
      [blockerPid],
    );
    const blocked =
      rows.find((row) => row.account_write_lock_held) ??
      rows.find((row) => preferredQuery.test(row.query));
    if (blocked !== undefined) {
      return {
        pid: blocked.pid,
        query: blocked.query,
        accountWriteLockHeld: blocked.account_write_lock_held,
      };
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('writer did not wait for the locked users row');
}
