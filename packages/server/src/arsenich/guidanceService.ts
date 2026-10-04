import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import type { ArsenichDestinationKey } from './destinationRegistry.js';
import { arsenichIntroWindowsSchema, type ArsenichDestinationIntroDTO } from './types.js';

type Queryable = Pool | PoolClient;

export async function getDestinationIntro(
  db: Queryable,
  userId: string,
  destinationKey: ArsenichDestinationKey,
): Promise<ArsenichDestinationIntroDTO | null> {
  const { rows } = await db.query<{ revision: number; windows: unknown; viewed: boolean }>(
    `select intro.revision, intro.windows,
            exists (select 1 from arsenich_destination_intro_view view where view.user_id=$1 and view.destination_key=intro.destination_key) as viewed
       from arsenich_destination_intro intro
      where intro.destination_key=$2 and intro.enabled=true`,
    [userId, destinationKey],
  );
  const row = rows[0];
  if (!row || row.viewed) return null;
  return {
    destinationKey,
    revision: Number(row.revision),
    speaker: 'stranger',
    windows: arsenichIntroWindowsSchema.parse(row.windows),
  };
}

export async function completeDestinationIntro(
  client: PoolClient,
  userId: string,
  destinationKey: ArsenichDestinationKey,
  revision: number,
): Promise<{ viewed: true }> {
  const eligible = await client.query(
    `select 1 from arsenich_destination_intro where destination_key=$1 and enabled=true and revision=$2 for update`,
    [destinationKey, revision],
  );
  if (!eligible.rows[0])
    throw new AppError('arsenich_intro_unavailable', 'Arsenich introduction is unavailable', 409);
  await client.query(
    `insert into arsenich_destination_intro_view (user_id,destination_key,viewed_revision) values ($1,$2,$3) on conflict (user_id,destination_key) do nothing`,
    [userId, destinationKey, revision],
  );
  return { viewed: true };
}
