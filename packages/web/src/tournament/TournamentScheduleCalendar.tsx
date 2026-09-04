import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  TournamentFixture,
  TournamentMatchday,
  TournamentScheduleDay,
  TournamentStatus,
} from '../api/tournament.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { TournamentMatchdayRow } from './TournamentMatchdayTimes.js';

interface TournamentScheduleCalendarProps {
  fixtures: TournamentFixture[];
  fixtureDays?: TournamentScheduleDay[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  hasOtherGames?: boolean;
  otherGamesLoaded?: boolean;
  otherGamesLoading?: boolean;
  hasMoreOtherGames?: boolean;
  onLoadOtherGames?: () => void;
  matchdays: TournamentMatchday[];
  regularSource: 'head_to_head' | 'daily_aggregate' | 'classic';
  tournamentStatus: TournamentStatus;
  currentUserId: string | null;
  isParticipant: boolean;
  timezone: string;
  rangeStartsAt: string | null;
  rangeEndsAt: string | null;
  playoffStartsAt?: string[];
  fixtureDetailsMode?: 'modal' | 'inline';
  renderFixture: (fixture: TournamentFixture, mine: boolean, inSeries?: boolean) => ReactNode;
  formatDateTime: (value: string) => string;
  onOpenDailyGame?: () => void;
  renderMatchdayResults?: (matchday: TournamentMatchday) => ReactNode;
}

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function datePartsInTimezone(value: string | number, timezone: string) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const year = read('year');
    const month = read('month');
    const day = read('day');
    if (![year, month, day].every(Number.isFinite)) return null;
    return { year, month, day, key: dateKeyFromParts(year, month, day) };
  } catch {
    return null;
  }
}

function fixtureDateKey(fixture: TournamentFixture, timezone: string): string | null {
  if (fixture.gameDay?.localDate) return fixture.gameDay.localDate;
  if (fixture.scheduledStartsAt === null) return null;
  return datePartsInTimezone(fixture.scheduledStartsAt, timezone)?.key ?? null;
}

function monthTitle(year: number, month: number): string {
  const value = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(/\s*г\.$/, '');
  return value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);
}

function spokenDate(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function isMine(fixture: TournamentFixture, currentUserId: string | null): boolean {
  return (
    currentUserId !== null &&
    (fixture.home?.userId === currentUserId || fixture.away?.userId === currentUserId)
  );
}

function initialDateKey(eventKeys: string[], todayKey: string): string {
  if (eventKeys.includes(todayKey)) return todayKey;
  return eventKeys.find((key) => key > todayKey) ?? eventKeys[0] ?? todayKey;
}

function puckWord(value: number): string {
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'шайб';
  const last = lastTwo % 10;
  if (last === 1) return 'шайба';
  if (last >= 2 && last <= 4) return 'шайбы';
  return 'шайб';
}

function gameWord(value: number): string {
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'игр';
  const last = lastTwo % 10;
  if (last === 1) return 'игра';
  if (last >= 2 && last <= 4) return 'игры';
  return 'игр';
}

function scheduleDayTitle(fixture: TournamentFixture, timezone: string): string | null {
  const startsAt = fixture.gameDay?.startsAt;
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  return `${new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(date)}, начало в ${new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`;
}

function seriesScore(
  fixtures: TournamentFixture[],
  leftUserId: string | null,
  rightUserId: string | null,
): { home: number; away: number } {
  return fixtures.reduce(
    (score, fixture) => {
      if (leftUserId !== null && fixture.winnerUserId === leftUserId) score.home += 1;
      if (rightUserId !== null && fixture.winnerUserId === rightUserId) score.away += 1;
      return score;
    },
    { home: 0, away: 0 },
  );
}

export function TournamentScheduleCalendar(props: TournamentScheduleCalendarProps) {
  const fixtureDetailsMode = props.fixtureDetailsMode ?? 'modal';
  const showsFixturesInline =
    fixtureDetailsMode === 'inline' || props.regularSource !== 'head_to_head';
  const today = datePartsInTimezone(Date.now(), props.timezone) ?? {
    year: new Date().getUTCFullYear(),
    month: new Date().getUTCMonth() + 1,
    day: new Date().getUTCDate(),
    key: new Date().toISOString().slice(0, 10),
  };
  const fixturesByDate = useMemo(() => {
    const result = new Map<string, TournamentFixture[]>();
    for (const fixture of props.fixtures) {
      const key = fixtureDateKey(fixture, props.timezone);
      if (key === null) continue;
      result.set(key, [...(result.get(key) ?? []), fixture]);
    }
    return result;
  }, [props.fixtures, props.timezone]);
  const matchdaysByDate = useMemo(
    () => new Map(props.matchdays.map((matchday) => [matchday.localDate, matchday])),
    [props.matchdays],
  );
  const playoffDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          (props.playoffStartsAt ?? [])
            .map((value) => datePartsInTimezone(value, props.timezone)?.key ?? null)
            .filter((key): key is string => key !== null),
        ),
      ).sort(),
    [props.playoffStartsAt, props.timezone],
  );
  const playoffFixtureDateKeys = useMemo(
    () =>
      Array.from(fixturesByDate.entries())
        .filter(([, fixtures]) =>
          fixtures.some(
            (fixture) => fixture.stage === 'playoff' || fixture.stage === 'third_place',
          ),
        )
        .map(([key]) => key),
    [fixturesByDate],
  );
  const eventKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...(props.regularSource !== 'head_to_head'
            ? [
                ...props.matchdays.map((matchday) => matchday.localDate),
                ...(props.fixtureDays ?? []).map((day) => day.localDate),
              ]
            : [
                ...Array.from(fixturesByDate.keys()),
                ...(props.fixtureDays ?? []).map((day) => day.localDate),
              ]),
          ...playoffDateKeys,
          ...playoffFixtureDateKeys,
        ]),
      ).sort(),
    [
      fixturesByDate,
      playoffDateKeys,
      playoffFixtureDateKeys,
      props.fixtureDays,
      props.matchdays,
      props.regularSource,
    ],
  );
  const rangeStart =
    (props.rangeStartsAt === null
      ? null
      : datePartsInTimezone(props.rangeStartsAt, props.timezone)?.key) ??
    eventKeys[0] ??
    today.key;
  const requestedRangeEnd =
    props.rangeEndsAt === null
      ? null
      : (datePartsInTimezone(props.rangeEndsAt, props.timezone)?.key ?? null);
  const lastEventKey = eventKeys[eventKeys.length - 1];
  const rangeEndCandidate =
    requestedRangeEnd === null
      ? (lastEventKey ?? rangeStart)
      : lastEventKey !== undefined && lastEventKey > requestedRangeEnd
        ? lastEventKey
        : requestedRangeEnd;
  const rangeEnd = rangeEndCandidate < rangeStart ? rangeStart : rangeEndCandidate;
  const preferredDate = initialDateKey(eventKeys, today.key);
  const [internalSelectedDate, setInternalSelectedDate] = useState(preferredDate);
  const selectedDate = props.selectedDate ?? internalSelectedDate;
  const selectDate = (date: string): void => {
    setInternalSelectedDate(date);
    props.onSelectDate?.(date);
  };
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const preferredParts = preferredDate.split('-').map(Number);
  const [visibleMonth, setVisibleMonth] = useState({
    year: preferredParts[0] ?? today.year,
    month: preferredParts[1] ?? today.month,
  });

  useEffect(() => {
    if (selectedDate >= rangeStart && selectedDate <= rangeEnd) return;
    const next = initialDateKey(eventKeys, today.key);
    const [year, month] = next.split('-').map(Number);
    selectDate(next);
    if (year !== undefined && month !== undefined) setVisibleMonth({ year, month });
  }, [eventKeys, rangeEnd, rangeStart, selectedDate, today.key]);

  const firstWeekday = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1)).getUTCDay();
  const leadingDays = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 0)).getUTCDate();
  const cells = Array.from({ length: leadingDays + daysInMonth }, (_, index) =>
    index < leadingDays ? null : index - leadingDays + 1,
  );
  while (cells.length % 7 !== 0) cells.push(null);

  const changeMonth = (offset: number) => {
    const next = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1 + offset, 1));
    const year = next.getUTCFullYear();
    const month = next.getUTCMonth() + 1;
    setVisibleMonth({ year, month });
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const firstDay = `${prefix}01`;
    const lastDay = dateKeyFromParts(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
    selectDate(
      eventKeys.find((key) => key.startsWith(prefix)) ??
        (rangeStart > firstDay ? rangeStart : rangeEnd < lastDay ? rangeEnd : firstDay),
    );
  };

  const visibleMonthIndex = visibleMonth.year * 12 + visibleMonth.month - 1;
  const [rangeStartYear, rangeStartMonth] = rangeStart.split('-').map(Number);
  const [rangeEndYear, rangeEndMonth] = rangeEnd.split('-').map(Number);
  const firstMonthIndex = (rangeStartYear ?? visibleMonth.year) * 12 + (rangeStartMonth ?? 1) - 1;
  const lastMonthIndex = (rangeEndYear ?? visibleMonth.year) * 12 + (rangeEndMonth ?? 1) - 1;

  const fixturesDate = modalDate ?? selectedDate;
  const selectedFixtures = [...(fixturesByDate.get(fixturesDate) ?? [])];
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const selectedFixturesExpanded = expandedDate === fixturesDate;
  const mySelectedFixtures = selectedFixtures.filter((fixture) =>
    isMine(fixture, props.currentUserId),
  );
  const otherSelectedFixtures = selectedFixtures.filter(
    (fixture) => !isMine(fixture, props.currentUserId),
  );
  const hasLazyOtherGames = props.hasOtherGames ?? false;
  const lazyOtherGamesHidden = hasLazyOtherGames && !props.otherGamesLoaded;
  const visibleOtherFixtures = hasLazyOtherGames || selectedFixturesExpanded
    ? otherSelectedFixtures
    : otherSelectedFixtures.slice(0, 4);
  const selectedMatchday = matchdaysByDate.get(selectedDate);
  const selectedMatchdayIsActive =
    selectedMatchday !== undefined &&
    new Date(selectedMatchday.startsAt).getTime() <= Date.now() &&
    Date.now() < new Date(selectedMatchday.endsAt).getTime();
  const undatedFixtures = props.fixtures.filter(
    (fixture) => fixtureDateKey(fixture, props.timezone) === null,
  );
  const renderFixtureCollection = (fixtures: TournamentFixture[], mine: boolean) => {
    const groups = new Map<string, TournamentFixture[]>();
    const standalone: TournamentFixture[] = [];
    for (const fixture of fixtures) {
      if (fixture.seriesId && fixture.gameDay) {
        const key = `${fixture.seriesId}:${fixture.gameDay.id}`;
        groups.set(key, [...(groups.get(key) ?? []), fixture]);
      } else {
        standalone.push(fixture);
      }
    }
    return (
      <>
        {[...groups.entries()].map(([key, games]) => {
          const ordered = [...games].sort(
            (left, right) => (left.gameNumber ?? 0) - (right.gameNumber ?? 0),
          );
          const first = ordered[0]!;
          const score = seriesScore(
            ordered,
            first.home?.userId ?? null,
            first.away?.userId ?? null,
          );
          const expanded = expandedSeriesId === key;
          const noun = (first.seriesWinsRequired ?? 1) > 1 ? 'серию' : 'игру';
          return (
            <article className="tournament-schedule-series" key={key}>
              <button
                type="button"
                className="tournament-schedule-series__summary"
                aria-label={`${expanded ? 'Закрыть' : 'Открыть'} ${noun}`}
                aria-expanded={expanded}
                onClick={() => setExpandedSeriesId(expanded ? null : key)}
              >
                <span className="tournament-schedule-series__time">
                  {scheduleDayTitle(first, props.timezone)}
                </span>
                <span className="tournament-schedule-series__matchup">
                  <strong>{first.home?.name ?? 'Участник'}</strong>
                  <b>{score.home}:{score.away}</b>
                  <strong>{first.away?.name ?? 'Участник'}</strong>
                </span>
              </button>
              {expanded && (
                <div className="tournament-schedule-series__games">
                  {ordered.map((fixture) => props.renderFixture(fixture, mine, true))}
                </div>
              )}
            </article>
          );
        })}
        {standalone.map((fixture) => props.renderFixture(fixture, mine))}
      </>
    );
  };
  const renderSelectedFixtureSections = () => (
    <div className="tournament-fixture-sections">
      {mySelectedFixtures.length > 0 && (
        <section className="tournament-fixture-section tournament-fixture-section--mine">
          <h5>Ваши игры</h5>
          <div className="tournament-fixture-list">
            {renderFixtureCollection(mySelectedFixtures, true)}
          </div>
        </section>
      )}
      {(otherSelectedFixtures.length > 0 || hasLazyOtherGames) && (
        <section
          className={`tournament-fixture-section${mySelectedFixtures.length > 0 ? ' tournament-fixture-section--others' : ''}`}
        >
          {!lazyOtherGamesHidden && (
            <h5>{mySelectedFixtures.length > 0 ? 'Другие игры дня' : 'Все игры дня'}</h5>
          )}
          <div className="tournament-fixture-list">
            {renderFixtureCollection(visibleOtherFixtures, false)}
          </div>
          {hasLazyOtherGames && props.onLoadOtherGames &&
            (!props.otherGamesLoaded || props.hasMoreOtherGames) && (
              <button
                type="button"
                className="tournament-calendar__expand"
                disabled={props.otherGamesLoading}
                onClick={props.onLoadOtherGames}
              >
                {props.otherGamesLoading
                  ? 'Загрузка…'
                  : props.otherGamesLoaded
                    ? 'Показать ещё'
                    : mySelectedFixtures.length > 0
                      ? 'Посмотреть другие игры дня'
                      : 'Посмотреть игры дня'}
              </button>
            )}
          {!hasLazyOtherGames && otherSelectedFixtures.length > 4 && (
            <button
              type="button"
              className="tournament-calendar__expand"
              onClick={() => setExpandedDate(selectedFixturesExpanded ? null : fixturesDate)}
            >
              {selectedFixturesExpanded
                ? 'Свернуть'
                : `Показать ещё (${otherSelectedFixtures.length - 4})`}
            </button>
          )}
        </section>
      )}
    </div>
  );

  return (
    <div className="tournament-calendar">
      <div className="tournament-calendar__header">
        <button
          type="button"
          className="icon-btn tournament-calendar__month-button"
          aria-label="Предыдущий месяц"
          disabled={visibleMonthIndex <= firstMonthIndex}
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong>{monthTitle(visibleMonth.year, visibleMonth.month)}</strong>
        <button
          type="button"
          className="icon-btn tournament-calendar__month-button"
          aria-label="Следующий месяц"
          disabled={visibleMonthIndex >= lastMonthIndex}
          onClick={() => changeMonth(1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="tournament-calendar__weekdays" aria-hidden="true">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="tournament-calendar__grid" role="grid" aria-label="Календарь турнира">
        {cells.map((day, index) => {
          if (day === null) {
            return <span key={`empty-${index}`} className="tournament-calendar__empty-day" />;
          }
          const key = dateKeyFromParts(visibleMonth.year, visibleMonth.month, day);
          const inRange = key >= rangeStart && key <= rangeEnd;
          const fixtures = fixturesByDate.get(key) ?? [];
          const daySummary = props.fixtureDays?.find((day) => day.localDate === key);
          const matchday = matchdaysByDate.get(key);
          const hasEvents =
            showsFixturesInline
              ? matchday !== undefined || fixtures.length > 0
              : props.regularSource !== 'head_to_head'
                ? matchday !== undefined
                : (daySummary?.hasGames ?? fixtures.length > 0);
          const hasPlayoff =
            playoffDateKeys.includes(key) ||
            daySummary?.hasPlayoff === true ||
            fixtures.some(
              (fixture) => fixture.stage === 'playoff' || fixture.stage === 'third_place',
            );
          const mine =
            props.regularSource !== 'head_to_head'
              ? hasEvents && props.isParticipant
              : (daySummary?.hasMyGame ??
                fixtures.some((fixture) => isMine(fixture, props.currentUserId)));
          const descriptions = [spokenDate(visibleMonth.year, visibleMonth.month, day)];
          if (props.regularSource !== 'head_to_head' && matchday !== undefined)
            descriptions.push('игровой день');
          if (
            fixtures.length > 0 &&
            (props.regularSource === 'head_to_head' || showsFixturesInline)
          ) {
            descriptions.push(`${fixtures.length} ${gameWord(fixtures.length)}`);
          }
          if (hasPlayoff) descriptions.push('плей-офф');
          if (mine && props.regularSource === 'head_to_head') descriptions.push('ваша игра');
          if (!inRange) descriptions.push('вне дат турнира');
          return (
            <button
              key={key}
              type="button"
              aria-label={descriptions.join(', ')}
              aria-selected={selectedDate === key}
              disabled={!inRange}
              className={`tournament-calendar__day${!inRange ? ' tournament-calendar__day--outside-range' : ''}${hasEvents ? ' tournament-calendar__day--has-events' : ''}${hasPlayoff ? ' tournament-calendar__day--playoff' : ''}${mine ? ' tournament-calendar__day--mine' : ''}${today.key === key ? ' tournament-calendar__day--today' : ''}${selectedDate === key ? ' tournament-calendar__day--selected' : ''}`}
              onClick={() => {
                selectDate(key);
                if (props.regularSource === 'head_to_head' && fixtureDetailsMode === 'modal') {
                  setModalDate(key);
                }
              }}
            >
              <span>{day}</span>
              {mine && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <ul className="tournament-calendar__legend" aria-label="Обозначения календаря">
        {(props.currentUserId !== null ||
          (props.regularSource !== 'head_to_head' && props.isParticipant)) && (
          <li>
            <span
              className="tournament-calendar__legend-dot tournament-calendar__legend-dot--mine"
              aria-hidden="true"
            />
            Ваша игра
          </li>
        )}
        <li>
          <span
            className="tournament-calendar__legend-dot tournament-calendar__legend-dot--playoff"
            aria-hidden="true"
          />
          Плей-офф
        </li>
        <li>
          <span
            className="tournament-calendar__legend-dot tournament-calendar__legend-dot--selected"
            aria-hidden="true"
          />
          Выбранный день
        </li>
      </ul>

      {props.regularSource !== 'head_to_head' && (
        <div className="tournament-calendar__details" aria-live="polite">
          <h4>
            {spokenDate(...(selectedDate.split('-').map(Number) as [number, number, number]))}
          </h4>
          {selectedMatchday && (
            <>
              <TournamentMatchdayRow
                number={selectedMatchday.number}
                startsAt={selectedMatchday.startsAt}
                endsAt={selectedMatchday.endsAt}
                startLabel={props.formatDateTime(selectedMatchday.startsAt)}
                endLabel={props.formatDateTime(selectedMatchday.endsAt)}
                regularStarted={['regular', 'playoff', 'completed'].includes(
                  props.tournamentStatus,
                )}
              />
              {selectedMatchday.myResult?.completed === true && (
                <>
                  <div className="tournament-matchday-result" aria-label="Ваш результат игры">
                    <strong>Ваш результат</strong>
                    <span>
                      {selectedMatchday.myResult.goals} {puckWord(selectedMatchday.myResult.goals)} из{' '}
                      {selectedMatchday.myResult.shots} · точность{' '}
                      {Math.round(selectedMatchday.myResult.accuracy * 100)}%
                    </span>
                  </div>
                  {props.renderMatchdayResults?.(selectedMatchday)}
                </>
              )}
              {props.isParticipant &&
                selectedDate === today.key &&
                selectedMatchdayIsActive &&
                selectedMatchday.myResult?.completed !== true &&
                props.tournamentStatus === 'regular' &&
                props.onOpenDailyGame && (
                  <button type="button" className="btn btn--cta" onClick={props.onOpenDailyGame}>
                    {props.regularSource === 'classic'
                      ? 'Открыть турнирную игру'
                      : 'Открыть ежедневную игру'}
                  </button>
                )}
            </>
          )}
          {showsFixturesInline && (selectedFixtures.length > 0 || hasLazyOtherGames) && (
            renderSelectedFixtureSections()
          )}
          {selectedMatchday === undefined &&
            selectedFixtures.length === 0 &&
            !hasLazyOtherGames && (
            <p>В этот день игр нет.</p>
          )}
        </div>
      )}

      {props.regularSource === 'head_to_head' && fixtureDetailsMode === 'inline' && (
        <div className="tournament-calendar__details" aria-live="polite">
          <h4>
            {spokenDate(...(selectedDate.split('-').map(Number) as [number, number, number]))}
          </h4>
          {selectedFixtures.length > 0 || hasLazyOtherGames ? (
            renderSelectedFixtureSections()
          ) : (
            <p>В этот день игр нет.</p>
          )}
        </div>
      )}

      {props.regularSource === 'head_to_head' &&
        fixtureDetailsMode === 'modal' &&
        modalDate !== null && (
          <AccessibleModal
            title={spokenDate(...(modalDate.split('-').map(Number) as [number, number, number]))}
            ariaLabel="Игры выбранного дня"
            onClose={() => {
              setModalDate(null);
              setExpandedDate(null);
            }}
          >
            {selectedFixtures.length > 0 || hasLazyOtherGames ? (
              renderSelectedFixtureSections()
            ) : (
              <p className="modal-copy">В этот день игр нет.</p>
            )}
          </AccessibleModal>
        )}

      {undatedFixtures.length > 0 && (
        <section className="tournament-calendar__undated">
          <h4>Время ещё не назначено</h4>
          <div className="tournament-fixture-list">
            {undatedFixtures.map((fixture) =>
              props.renderFixture(fixture, isMine(fixture, props.currentUserId)),
            )}
          </div>
        </section>
      )}
    </div>
  );
}
