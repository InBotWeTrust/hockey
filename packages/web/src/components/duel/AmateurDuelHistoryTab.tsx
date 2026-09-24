import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  fetchAmateurHistoryCalendar,
  type AmateurDuelHistoryCalendarMatch,
} from '../../api/amateurDuel.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';

const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
const MONTH_NAMES_GENITIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const MONTH_NAMES_DATE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

type HistoryStats = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  win_percentage: number;
};

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const monthName = MONTH_NAMES[Number(month) - 1];
  return monthName && year ? `${monthName} ${year}` : key;
}

function shiftMonthKey(key: string, delta: number): string {
  const [year = '1970', month = '1'] = key.split('-');
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthName(key: string): string {
  const month = Number(key.split('-')[1]);
  return MONTH_NAMES_GENITIVE[month - 1] ?? key;
}

function monthDateName(key: string): string {
  const month = Number(key.split('-')[1]);
  return MONTH_NAMES_DATE[month - 1] ?? key;
}

function monthGeometry(key: string): { days: number; offset: number } {
  const [year = 1970, month = 1] = key.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  return {
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    offset: (first.getUTCDay() + 6) % 7,
  };
}

function duelKindLabel(kind: AmateurDuelHistoryCalendarMatch['duel_kind']): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Микс';
  return 'Классика';
}

function resultLabel(result: AmateurDuelHistoryCalendarMatch['result']): string {
  if (result === 'win') return 'Победа';
  if (result === 'draw') return 'Ничья';
  return 'Поражение';
}

function venueLabel(venueRole: AmateurDuelHistoryCalendarMatch['venue_role']): string {
  if (venueRole === 'home') return 'Дома';
  if (venueRole === 'away') return 'В гостях';
  return 'Нейтральное поле';
}

function HistorySummaryCard({
  title,
  ariaLabel,
  stats,
}: {
  title: string;
  ariaLabel: string;
  stats: HistoryStats;
}): JSX.Element {
  return (
    <article className="glass duel-history-summary" aria-label={ariaLabel}>
      <div className="duel-history-summary__header">
        <h2>{title}</h2>
        <strong>{stats.win_percentage}% побед</strong>
      </div>
      <dl className="duel-history-summary__tiles">
        <div>
          <dt>Сыграно</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>Победы</dt>
          <dd>{stats.wins}</dd>
        </div>
        <div>
          <dt>Ничьи</dt>
          <dd>{stats.draws}</dd>
        </div>
        <div>
          <dt>Поражения</dt>
          <dd>{stats.losses}</dd>
        </div>
      </dl>
    </article>
  );
}

export function AmateurDuelHistoryTab({
  initialMonthKey,
  onOpenMatch,
  onCloseMatch,
  expandedMatchId,
  expandedContent,
}: {
  initialMonthKey: string;
  onOpenMatch: (matchId: string) => void;
  onCloseMatch: () => void;
  expandedMatchId: string | null;
  expandedContent: ReactNode;
}): JSX.Element {
  const [monthKey, setMonthKey] = useState(initialMonthKey);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [canScrollDayListDown, setCanScrollDayListDown] = useState(false);
  const dayListRef = useRef<HTMLDivElement>(null);
  const updateDayListScrollHint = useCallback(() => {
    const list = dayListRef.current;
    setCanScrollDayListDown(
      Boolean(list && list.scrollHeight - list.scrollTop - list.clientHeight > 2),
    );
  }, []);
  const calendar = useQuery({
    queryKey: ['amateur-duel', 'history', 'calendar', monthKey],
    queryFn: () => fetchAmateurHistoryCalendar(monthKey),
  });
  useEffect(() => {
    setSelectedDay(null);
    onCloseMatch();
  }, [monthKey, onCloseMatch]);
  const data = calendar.data;
  const dayMap = useMemo(
    () => new Map((data?.days ?? []).map((day) => [day.day, day.matches])),
    [data?.days],
  );
  const geometry = monthGeometry(monthKey);
  const selectedMatches = selectedDay === null ? [] : (dayMap.get(selectedDay) ?? []);
  const stats = data?.stats ?? {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    win_percentage: 0,
  };
  const monthStats = useMemo<HistoryStats>(() => {
    const matches = (data?.days ?? []).flatMap((day) => day.matches);
    const wins = matches.filter((match) => match.result === 'win').length;
    const draws = matches.filter((match) => match.result === 'draw').length;
    const losses = matches.filter((match) => match.result === 'loss').length;
    return {
      played: matches.length,
      wins,
      draws,
      losses,
      win_percentage: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
    };
  }, [data?.days]);
  const earliestMonth = data?.range.from ?? monthKey;
  const latestMonth = data?.range.to ?? monthKey;

  useEffect(() => {
    if (selectedDay === null) {
      setCanScrollDayListDown(false);
      return;
    }

    const list = dayListRef.current;
    if (!list) return;

    updateDayListScrollHint();
    window.addEventListener('resize', updateDayListScrollHint);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateDayListScrollHint);
    resizeObserver?.observe(list);
    const mutationObserver = new MutationObserver(updateDayListScrollHint);
    mutationObserver.observe(list, { childList: true, subtree: true, characterData: true });

    return () => {
      window.removeEventListener('resize', updateDayListScrollHint);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [selectedDay, updateDayListScrollHint]);

  return (
    <section className="duel-section" aria-label="История дуэлей">
      <div className="section-label duel-section-title">История</div>
      <HistorySummaryCard title="За всё время" ariaLabel="За всё время" stats={stats} />
      {!calendar.isLoading && !calendar.isError ? (
        <HistorySummaryCard
          title={`За ${monthName(monthKey)}`}
          ariaLabel={`Статистика за ${monthName(monthKey)}`}
          stats={monthStats}
        />
      ) : null}
      {calendar.isLoading ? (
        <div className="duel-state-card">Загрузка истории…</div>
      ) : calendar.isError ? (
        <div className="duel-state-card duel-state-card--error">Не удалось загрузить историю.</div>
      ) : (
        <section
          className="glass daily-calendar"
          aria-label={`Календарь дуэлей: ${monthLabel(monthKey)}`}
        >
          <div className="daily-calendar__header">
            <button
              type="button"
              className="icon-btn daily-calendar__nav"
              aria-label="Предыдущий месяц"
              disabled={monthKey <= earliestMonth}
              onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="daily-calendar__month">{monthLabel(monthKey)}</h2>
            <button
              type="button"
              className="icon-btn daily-calendar__nav"
              aria-label="Следующий месяц"
              disabled={monthKey >= latestMonth}
              onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="daily-calendar__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="daily-calendar__grid">
            {Array.from({ length: geometry.offset }, (_, index) => (
              <span className="daily-calendar__empty" aria-hidden="true" key={`empty-${index}`} />
            ))}
            {Array.from({ length: geometry.days }, (_, index) => {
              const day = index + 1;
              const matches = dayMap.get(day) ?? [];
              if (matches.length === 0) {
                return (
                  <span key={day} className="daily-calendar__day daily-calendar__day--neutral">
                    {day}
                  </span>
                );
              }
              return (
                <button
                  key={day}
                  type="button"
                  className="daily-calendar__day daily-calendar__day--duel"
                  aria-label={`${day}, сыграно дуэлей: ${matches.length}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <span className="daily-calendar__day-number">{day}</span>
                  <span
                    className="daily-calendar__duel-count"
                    aria-label={`Количество дуэлей: ${matches.length}`}
                  >
                    {matches.length}
                  </span>
                  <span className="daily-calendar__duel-results" aria-hidden="true">
                    {matches.map((match) => (
                      <i
                        key={match.id}
                        className={`daily-calendar__duel-result daily-calendar__duel-result--${match.result}`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="daily-calendar__legend" aria-label="Обозначения календаря">
            <span>
              <i className="daily-calendar__dot daily-calendar__dot--duel" />
              Игровой день
            </span>
            <span>
              <i className="daily-calendar__dot daily-calendar__dot--win" />
              Победа
            </span>
            <span>
              <i className="daily-calendar__dot daily-calendar__dot--loss" />
              Поражение
            </span>
            <span>
              <i className="daily-calendar__dot daily-calendar__dot--draw" />
              Ничья
            </span>
          </div>
        </section>
      )}
      {selectedDay !== null && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setSelectedDay(null);
            onCloseMatch();
          }}
        >
          <section
            role="dialog"
            aria-label={`Дуэли за ${selectedDay} ${monthDateName(monthKey)}`}
            className="modal-card duel-day-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="duel-day-dialog__header">
              <div className="modal-title">
                Дуэли за {selectedDay} {monthDateName(monthKey)}
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Закрыть"
                onClick={() => {
                  setSelectedDay(null);
                  onCloseMatch();
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div ref={dayListRef} className="duel-day-list" onScroll={updateDayListScrollHint}>
              {selectedMatches.map((match) => {
                const expanded = expandedMatchId === match.id;
                return (
                  <div
                    key={match.id}
                    className={`duel-day-match-group${expanded ? ' duel-day-match-group--expanded' : ''}`}
                  >
                    <button
                      type="button"
                      className="duel-day-match"
                      aria-label={`Дуэль с ${match.opponent.display_name}, ${duelKindLabel(match.duel_kind)}, счёт ${match.my_goals}:${match.opponent_goals}, ${venueLabel(match.venue_role)}, ${resultLabel(match.result)}`}
                      aria-expanded={expanded}
                      onClick={() => (expanded ? onCloseMatch() : onOpenMatch(match.id))}
                    >
                      <UserAvatar
                        avatarUrl={match.opponent.avatar_url}
                        name={match.opponent.display_name}
                        size={40}
                        fontSize={14}
                      />
                      <span className="duel-day-match__copy">
                        <strong>{match.opponent.display_name}</strong>
                        <span>
                          {duelKindLabel(match.duel_kind)} · {match.my_goals}:{match.opponent_goals}{' '}
                          · {venueLabel(match.venue_role)}
                        </span>
                      </span>
                      <span className="duel-day-match__aside">
                        <span
                          className={`duel-day-match__result duel-day-match__result--${match.result}`}
                        >
                          {resultLabel(match.result)}
                        </span>
                        <ChevronRight
                          className="duel-day-match__chevron"
                          size={16}
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                    {expanded ? expandedContent : null}
                  </div>
                );
              })}
            </div>
            {canScrollDayListDown ? (
              <div className="duel-day-scroll-hint" aria-hidden="true">
                <span>
                  <ChevronDown size={15} />
                </span>
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="modal-primary btn btn--cta"
                onClick={() => {
                  setSelectedDay(null);
                  onCloseMatch();
                }}
              >
                Закрыть
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
