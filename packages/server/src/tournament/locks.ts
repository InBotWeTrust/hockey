import type { PoolClient } from 'pg';

/**
 * Tournament fixture flows lock in this order: tournament advisory lock, fixture advisory/row lock,
 * then any affected series row. Do not acquire the tournament lock after a fixture or series lock.
 */
export async function lockTournament(client: PoolClient, tournamentId: string): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`tournament:${tournamentId}`]);
}

export async function lockTournamentFixture(
  client: PoolClient,
  input: { tournamentId: string; fixtureId: string },
): Promise<void> {
  await lockTournament(client, input.tournamentId);
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`fixture:${input.fixtureId}`]);
}
