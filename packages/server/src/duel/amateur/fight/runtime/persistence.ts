import type { PoolClient } from 'pg';

export const RUNTIME_LEASE_MS = 4000;
export async function renewRuntimeLease(
  client: PoolClient,
  fightId: string,
  owner: string,
  generation: number,
): Promise<boolean> {
  const result = await client.query(
    `update amateur_duel_fight set runtime_lease_until=clock_timestamp()+interval '4 seconds'
     where id=$1 and runtime_owner=$2 and runtime_generation=$3
       and runtime_lease_until>clock_timestamp() and status in ('starting','fighting','sudden_death')`,
    [fightId, owner, generation],
  );
  return result.rowCount === 1;
}
