import type { PoolClient } from 'pg';
import { enqueueTournamentPush } from '../push/tournament.js';

export async function enqueueTournamentFixtureResultPush(
  client: PoolClient,
  input: {
    fixtureId: string;
    homeParticipantId: string | null;
    awayParticipantId: string | null;
    winnerParticipantId: string | null;
  },
): Promise<void> {
  const recipients = await client.query<{ participant_id: string; user_id: string }>(
    `select p.id as participant_id, p.user_id from tournament_participant p
      where p.id = any($1::uuid[])`,
    [[input.homeParticipantId, input.awayParticipantId].filter(Boolean)],
  );
  for (const recipient of recipients.rows) {
    const won = recipient.participant_id === input.winnerParticipantId;
    await enqueueTournamentPush(client, {
      userId: recipient.user_id,
      eventType: 'tournament.result_ready',
      eventKey: `${input.fixtureId}:result:${recipient.user_id}`,
      variables: { resultText: won ? 'Победа в турнирном матче' : 'Турнирный матч завершён' },
      fallback: {
        title: 'Результат матча',
        body: won ? 'Победа в турнирном матче' : 'Турнирный матч завершён',
        url: '/?view=amateur&section=tournaments',
      },
    });
  }
}
