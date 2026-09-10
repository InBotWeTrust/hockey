import type { Pool, PoolClient } from 'pg';
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

export async function enqueueTournamentFixtureRescheduledPush(
  client: Pool | PoolClient,
  input: { fixtureId: string; startsAt: Date },
): Promise<void> {
  const recipients = await client.query<{
    user_id: string;
    tournament_id: string;
  }>(
    `select participant.user_id, fixture.tournament_id
       from tournament_fixture fixture
       join tournament_participant participant
         on participant.id in (fixture.home_participant_id, fixture.away_participant_id)
        and participant.state = 'approved'
      where fixture.id = $1
      order by participant.user_id`,
    [input.fixtureId],
  );
  const startsAt = input.startsAt.toISOString();
  for (const recipient of recipients.rows) {
    await enqueueTournamentPush(client, {
      tournamentId: recipient.tournament_id,
      userId: recipient.user_id,
      eventType: 'tournament.rescheduled',
      eventKey: `${input.fixtureId}:rescheduled:${startsAt}`,
      variables: { startsAt },
      fallback: {
        title: 'Матч перенесён',
        body: `Новое время: ${startsAt}`,
        url: '/?view=amateur&section=tournaments',
      },
    });
  }
}

export async function enqueueTournamentOpponentReadyPush(
  client: PoolClient,
  input: { duelMatchId: string; readyUserId: string },
): Promise<void> {
  const result = await client.query<{
    tournament_id: string;
    opponent_user_id: string;
    ready_display_name: string;
  }>(
    `select fixture.tournament_id,
            case when home.user_id = $2 then away.user_id else home.user_id end as opponent_user_id,
            ready_user.display_name as ready_display_name
       from tournament_fixture_attempt attempt
       join tournament_fixture fixture on fixture.id = attempt.fixture_id
       join tournament_participant home on home.id = fixture.home_participant_id
       join tournament_participant away on away.id = fixture.away_participant_id
       join users ready_user on ready_user.id = $2
      where attempt.amateur_duel_match_id = $1
        and $2::uuid in (home.user_id, away.user_id)`,
    [input.duelMatchId, input.readyUserId],
  );
  const recipient = result.rows[0];
  if (!recipient) return;
  await enqueueTournamentPush(client, {
    tournamentId: recipient.tournament_id,
    userId: recipient.opponent_user_id,
    eventType: 'tournament.opponent_ready',
    eventKey: `${input.duelMatchId}:opponent-ready:${input.readyUserId}`,
    variables: { opponentName: recipient.ready_display_name },
    fallback: {
      title: 'Соперник готов',
      body: `${recipient.ready_display_name} подтвердил готовность к игре.`,
      url: '/?view=amateur&section=tournaments',
    },
  });
}
