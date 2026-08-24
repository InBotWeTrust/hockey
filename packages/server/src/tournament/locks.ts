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

/**
 * A fixture segment receives its duel_match_id only when that duel is opened and never reassigns it.
 * Read that immutable mapping before locking the duel, so tournament mutations keep the same order.
 */
export async function lockTournamentForDuelMutation(
  client: PoolClient,
  duelMatchId: string,
): Promise<void> {
  const { rows } = await client.query<{ tournament_id: string }>(
    `select fixture.tournament_id
       from tournament_fixture_segment segment
       join tournament_fixture fixture on fixture.id = segment.fixture_id
      where segment.duel_match_id = $1
      limit 1`,
    [duelMatchId],
  );
  const tournamentId = rows[0]?.tournament_id;
  if (tournamentId !== undefined) await lockTournament(client, tournamentId);
}
