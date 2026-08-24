import type { Pool } from 'pg';
import type { Realtime } from '../plugins/realtime.js';
import { getFixtureLiveSnapshot } from './live.js';

export interface TournamentFixtureProgressInput {
  duelMatchId: string;
  sequence: number;
}

/**
 * Emits only committed tournament-duel progress. The fixture segment mapping is immutable,
 * while the fresh snapshot deliberately comes from a new pool query after the route transaction.
 */
export async function publishTournamentFixtureProgress(
  pool: Pool,
  publisher: Pick<Realtime, 'publish'>,
  input: TournamentFixtureProgressInput,
): Promise<void> {
  try {
    const mapping = await pool.query<{ fixture_id: string }>(
      `select fixture_id
         from tournament_fixture_segment
        where duel_match_id = $1`,
      [input.duelMatchId],
    );
    const fixtureId = mapping.rows[0]?.fixture_id;
    if (fixtureId === undefined) return;

    const live = await getFixtureLiveSnapshot(pool, fixtureId);
    if (live === null) return;

    await publisher.publish(`tournament:fixture:${fixtureId}`, {
      type: 'tournament:fixture_update',
      fixtureId,
      sequence: input.sequence,
      payload: { live },
    });
  } catch {
    // Redis/WebSocket delivery is best-effort; HTTP gameplay is already committed.
  }
}
