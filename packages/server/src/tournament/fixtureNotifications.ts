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
  const recipients = await client.query<{ participant_id: string; user_id: string; tournament_id: string }>(
    `select p.id as participant_id, p.user_id, p.tournament_id from tournament_participant p
      where p.id = any($1::uuid[])`,
    [[input.homeParticipantId, input.awayParticipantId].filter(Boolean)],
  );
  for (const recipient of recipients.rows) {
    const won = recipient.participant_id === input.winnerParticipantId;
    await enqueueTournamentPush(client, {
      tournamentId: recipient.tournament_id,
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

export async function enqueueTournamentSeriesNextGamePush(
  client: PoolClient,
  input: { fixtureId: string },
): Promise<void> {
  const recipients = await client.query<{
    fixture_id: string;
    scheduled_starts_at: Date;
    user_id: string;
    tournament_id: string;
  }>(
    `select f.id as fixture_id, f.scheduled_starts_at, participant.user_id, f.tournament_id
       from tournament_fixture f
       join tournament_playoff_series series on series.id = f.series_id
       join tournament t on t.id = f.tournament_id
       join tournament_participant participant
         on participant.id in (f.home_participant_id, f.away_participant_id)
        and participant.state = 'approved'
      where f.id = $1
        and f.status = 'scheduled'
        and f.home_participant_id is not null
        and f.away_participant_id is not null
        and f.scheduled_starts_at is not null
        and series.status in ('scheduled', 'active')
        and t.status = 'playoff'
      order by participant.user_id`,
    [input.fixtureId],
  );
  const fixture = recipients.rows[0];
  if (!fixture) return;
  const startsAt = fixture.scheduled_starts_at.toISOString();
  const eventKey = `${fixture.fixture_id}:series-next-game:${startsAt}`;
  for (const recipient of recipients.rows) {
    await enqueueTournamentPush(client, {
      tournamentId: recipient.tournament_id,
      userId: recipient.user_id,
      eventType: 'tournament.series_next_game',
      eventKey,
      variables: { startsAt },
      fallback: {
        title: 'Следующая игра серии',
        body: `Следующий матч откроется ${startsAt}.`,
        url: '/?view=tournaments',
      },
    });
  }
}
