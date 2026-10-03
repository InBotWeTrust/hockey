import type { Pool } from 'pg';
import { AppError } from '../plugins/errors.js';
import { lockTournament } from './locks.js';
import { zonedDateTimeToUtc } from './schedule.js';

export async function getPlayoffPairSchedule(pool: Pool, tournamentId: string) {
  const result = await pool.query<{
    series_id: string;
    series_key: string;
    day_id: string;
    day_number: number;
    local_date: string;
    default_starts_at: Date;
    override_starts_at: Date | null;
    timezone: string;
    home_name: string | null;
    away_name: string | null;
    editable: boolean;
  }>(
    `select series.id as series_id, series.depends_on->>'key' as series_key,
             day.id as day_id, day.day_number, day.local_date::text,
             coalesce(day.rescheduled_starts_at, day.first_game_starts_at) as default_starts_at,
             pair_day.starts_at as override_starts_at,
             coalesce(revision.rules_snapshot->'config'->>'timezone', 'Europe/Moscow') as timezone,
             home_user.display_name as home_name, away_user.display_name as away_name,
             series.status <> 'completed' and day.status <> 'cancelled' and not exists (
               select 1 from tournament_fixture_attempt attempt
               join tournament_fixture fixture on fixture.id = attempt.fixture_id
               where fixture.series_id = series.id and attempt.round_game_day_id = day.id
                 and (attempt.status <> 'pending' or attempt.home_ready_at is not null
                      or attempt.away_ready_at is not null or attempt.amateur_duel_match_id is not null
                      or attempt.scheduled_starts_at <= now())
             ) as editable
        from tournament_playoff_series series
        join tournament tournament on tournament.id = series.tournament_id
        left join tournament_revision revision on revision.id = tournament.published_revision_id
        join tournament_round_game_day day on day.round_id = series.round_id
        left join tournament_series_game_day_schedule pair_day
          on pair_day.series_id = series.id and pair_day.round_game_day_id = day.id
        left join tournament_participant home on home.id = series.higher_seed_participant_id
        left join users home_user on home_user.id = home.user_id
        left join tournament_participant away on away.id = series.lower_seed_participant_id
        left join users away_user on away_user.id = away.user_id
       where series.tournament_id = $1
       order by series.depends_on->>'key', day.day_number`,
    [tournamentId],
  );
  return {
    days: result.rows.map((row) => ({
      seriesId: row.series_id,
      seriesKey: row.series_key,
      dayId: row.day_id,
      dayNumber: row.day_number,
      localDate: row.local_date,
      timezone: row.timezone,
      homeName: row.home_name,
      awayName: row.away_name,
      editable: row.editable,
      defaultStartsAt: row.default_starts_at.toISOString(),
      overrideStartsAt: row.override_starts_at?.toISOString() ?? null,
      effectiveStartsAt: (row.override_starts_at ?? row.default_starts_at).toISOString(),
    })),
  };
}

export async function updatePlayoffPairDay(
  pool: Pool,
  input: {
    tournamentId: string;
    seriesId: string;
    dayId: string;
    startsAt: Date | null;
    localTime?: string;
    adminUserId: string;
  },
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await lockTournament(client, input.tournamentId);
    const row = (
      await client.query<{
        starts_at: Date;
        override_at: Date | null;
        local_date: string;
        timezone: string;
      }>(
        `select coalesce(day.rescheduled_starts_at, day.first_game_starts_at) as starts_at,
               pair_day.starts_at as override_at, day.local_date::text,
               coalesce(revision.rules_snapshot->'config'->>'timezone', 'Europe/Moscow') as timezone
          from tournament_playoff_series series
          join tournament tournament on tournament.id = series.tournament_id
          left join tournament_revision revision on revision.id = tournament.published_revision_id
          join tournament_round_game_day day on day.round_id = series.round_id and day.id = $3
          left join tournament_series_game_day_schedule pair_day
            on pair_day.series_id = series.id and pair_day.round_game_day_id = day.id
         where series.id = $2 and series.tournament_id = $1 and series.status <> 'completed'
           and day.status <> 'cancelled'`,
        [input.tournamentId, input.seriesId, input.dayId],
      )
    ).rows[0];
    if (!row) throw new AppError('not_found', 'День этой пары не найден', 404);
    if (input.localTime !== undefined) {
      const [year, month, day] = row.local_date.split('-').map(Number);
      const [hour, minute] = input.localTime.split(':').map(Number);
      let resolved: Date;
      try {
        resolved = zonedDateTimeToUtc(
          { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: 0 },
          row.timezone,
        );
      } catch {
        throw new AppError('bad_request', 'Это время не существует в часовом поясе турнира', 400);
      }
      input = {
        ...input,
        startsAt: resolved,
      };
    }
    const startsAt = input.startsAt ?? row.starts_at;
    const same = (input.startsAt?.getTime() ?? null) === (row.override_at?.getTime() ?? null);
    if (same) {
      await client.query('commit');
      return { changed: false };
    }
    const localDate = (
      await client.query<{ date: string }>(
        `select ($1::timestamptz at time zone $2)::date::text as date`,
        [startsAt, row.timezone],
      )
    ).rows[0]!.date;
    if (startsAt.getTime() <= Date.now() || localDate !== row.local_date)
      throw new AppError('bad_request', 'Укажите будущее время в пределах выбранного дня', 400);
    const blocked = await client.query(
      `select 1 from tournament_fixture_attempt attempt
      join tournament_fixture fixture on fixture.id = attempt.fixture_id
      where fixture.series_id = $1 and attempt.round_game_day_id = $2
        and (attempt.status <> 'pending' or attempt.home_ready_at is not null
             or attempt.away_ready_at is not null or attempt.amateur_duel_match_id is not null
             or attempt.scheduled_starts_at <= now()) limit 1`,
      [input.seriesId, input.dayId],
    );
    if (blocked.rowCount)
      throw new AppError('conflict', 'Дневная норма этой пары уже началась', 409);
    const windows = (
      await client.query<{ id: string; start: Date; minutes: number }>(
        `select day.id, coalesce(pair_day.starts_at, day.rescheduled_starts_at, day.first_game_starts_at) as start,
              (day.max_result_bearing_games * (coalesce((round.rules_snapshot->>'readinessMinutes')::int,5)
                 + coalesce((round.rules_snapshot->>'gameDurationMinutes')::int,20))
                + (day.max_result_bearing_games-1)*extract(epoch from day.inter_game_break_duration)/60)::int as minutes
         from tournament_playoff_series series
         join tournament_round round on round.id=series.round_id
         join tournament_round_game_day day on day.round_id=series.round_id and day.status<>'cancelled'
         left join tournament_series_game_day_schedule pair_day on pair_day.series_id=series.id and pair_day.round_game_day_id=day.id
        where series.id=$1 order by day.day_number`,
        [input.seriesId],
      )
    ).rows;
    for (let index = 0; index < windows.length - 1; index++) {
      const day = windows[index]!;
      const next = windows[index + 1]!;
      const start = day.id === input.dayId ? startsAt : day.start;
      const nextStart = next.id === input.dayId ? startsAt : next.start;
      if (start.getTime() + day.minutes * 60_000 > nextStart.getTime())
        throw new AppError(
          'bad_request',
          'Дневная норма пересекается со следующим игровым днём',
          400,
        );
    }
    const nextRound = (
      await client.query<{ starts_at: Date; break_ms: string }>(
        `select next.starts_at, coalesce((current.rules_snapshot->>'roundBreakMs')::bigint, 0)::text as break_ms
       from tournament_playoff_series series
       join tournament_round current on current.id=series.round_id
       join tournament_round next on next.tournament_id=current.tournament_id
         and next.stage='playoff' and next.number=current.number+1
         and next.status<>'cancelled'
       where series.id=$1 and next.starts_at is not null`,
        [input.seriesId],
      )
    ).rows[0];
    if (
      nextRound &&
      windows.some(
        (day) =>
          (day.id === input.dayId ? startsAt : day.start).getTime() +
            day.minutes * 60_000 +
            Number(nextRound.break_ms) >
          nextRound.starts_at.getTime(),
      )
    ) {
      throw new AppError('bad_request', 'Дневная норма пересекается со следующим раундом', 400);
    }
    await client.query(
      `insert into tournament_series_game_day_schedule (series_id, round_game_day_id, starts_at)
        values ($1,$2,$3) on conflict (series_id, round_game_day_id) do update
        set starts_at=excluded.starts_at, schedule_revision=tournament_series_game_day_schedule.schedule_revision+1`,
      [input.seriesId, input.dayId, input.startsAt],
    );
    await client.query(
      `update tournament_fixture_attempt attempt
      set scheduled_starts_at=$3::timestamptz,
          readiness_expires_at=$3::timestamptz+(attempt.readiness_expires_at-attempt.scheduled_starts_at),
          hard_deadline_at=$3::timestamptz+(attempt.hard_deadline_at-attempt.scheduled_starts_at), updated_at=now()
      from tournament_fixture fixture
      where fixture.id=attempt.fixture_id and fixture.series_id=$1
        and attempt.round_game_day_id=$2 and attempt.status='pending'`,
      [input.seriesId, input.dayId, startsAt],
    );
    await client.query(
      `update tournament_fixture fixture
      set scheduled_starts_at=attempt.scheduled_starts_at, window_ends_at=attempt.hard_deadline_at, updated_at=now()
      from tournament_fixture_attempt attempt
      where fixture.id=attempt.fixture_id and fixture.series_id=$1 and attempt.round_game_day_id=$2
        and attempt.status='pending'`,
      [input.seriesId, input.dayId],
    );
    await client.query(
      `insert into tournament_adjustment (tournament_id, kind, payload, reason, created_by)
      values ($1,'schedule',$2::jsonb,'Изменение начала дневной нормы пары',$3)`,
      [
        input.tournamentId,
        JSON.stringify({ seriesId: input.seriesId, dayId: input.dayId, startsAt: input.startsAt }),
        input.adminUserId,
      ],
    );
    await client.query('commit');
    return { changed: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
