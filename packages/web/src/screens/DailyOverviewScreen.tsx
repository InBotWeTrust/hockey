import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AccessibleModal } from '../components/AccessibleModal.js';
import {
  fetchDailyHistory,
  fetchDailyState,
  type DailyGameStats,
  type DailyHistorySummary,
  type DailyStateResponse,
} from '../api/duel.js';

const HISTORY_PAGE_SIZE = 20;
const CALENDAR_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
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

type CalendarDayStatus = 'completed' | 'incomplete' | 'missed';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatGoalRate(goals: number, shots: number): string {
  if (shots <= 0) return '0%';
  return `${Math.round((goals / shots) * 100)}%`;
}

function formatPercent(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function formatDailyGameDate(dayDate: string): string {
  const [year, month, day] = dayDate.split('-');
  if (!year || !month || !day) return dayDate;
  return `${day}.${month}.${year}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const monthName = MONTH_NAMES[Number(monthText) - 1] ?? monthText;
  return `${monthName} ${yearText}`;
}

function calendarDayLabel(dayDate: string): string {
  const [year, month, day] = dayDate.split('-');
  const monthName = MONTH_NAMES_GENITIVE[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

function calendarDays(monthKey: string): Array<number | null> {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const numberOfDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondayFirstOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  return [
    ...Array.from<null>({ length: mondayFirstOffset }).fill(null),
    ...Array.from({ length: numberOfDays }, (_, index) => index + 1),
  ];
}

function calendarStatus(game: DailyGameStats, totalPeriods: number): CalendarDayStatus {
  if (game.total_shots <= 0) return 'missed';
  if (game.periods.length >= totalPeriods) return 'completed';
  return 'incomplete';
}

function calendarStatusLabel(status: CalendarDayStatus): string {
  if (status === 'completed') return 'игра завершена';
  if (status === 'incomplete') return 'игра начата, но не завершена';
  return 'без бросков';
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function timestampMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function dailyNowMs(state: DailyStateResponse | undefined, fallbackNow: number): number {
  const serverNow = timestampMs(state?.server_now);
  const receivedAt = state?.received_at_performance_ms;
  if (serverNow > 0 && typeof receivedAt === 'number' && typeof performance !== 'undefined') {
    return serverNow + Math.max(0, performance.now() - receivedAt);
  }
  return fallbackNow;
}

function todayTitle(state: DailyStateResponse | undefined): string {
  if (!state) return 'Сегодняшняя игра';
  if (state.state === 'period_active') return `${state.current_period}-й период идёт`;
  if (state.state === 'break_active') return 'Перерыв между периодами';
  if (state.state === 'closed') return 'Игра завершена';
  const nextPeriod = Math.min(state.current_period + 1, state.total_periods);
  return `${nextPeriod}-й период доступен`;
}

function stateDate(state: DailyStateResponse | undefined): string {
  if (!state?.day_date) return 'Сегодня';
  return formatDailyGameDate(state.day_date);
}

function todayArtwork(state: DailyStateResponse | undefined): string {
  if (!state) return '/daily-game/start.webp';
  if (state.state === 'break_active') return '/daily-game/break.webp';
  if (state.state === 'closed') return '/daily-game/finished.webp';
  const period =
    state.state === 'period_active'
      ? state.current_period
      : Math.min(state.current_period + 1, state.total_periods);
  if (period === 2) return '/daily-game/period-2.webp';
  if (period === 3) return '/daily-game/period-3.webp';
  return '/daily-game/period-1.webp';
}

function todayTimer(
  state: DailyStateResponse | undefined,
  nowMs: number,
): { label: string; value: string } {
  if (!state) return { label: 'Таймер', value: '--:--' };
  if (state.state === 'period_active') {
    return {
      label: 'До конца периода',
      value: formatDurationMs(timestampMs(state.period_ends_at) - nowMs),
    };
  }
  if (state.state === 'break_active') {
    return {
      label: 'До конца перерыва',
      value: formatDurationMs(timestampMs(state.break_ends_at) - nowMs),
    };
  }
  if (state.state === 'closed') {
    return {
      label: 'До новой игры',
      value: formatDurationMs(timestampMs(state.next_day_starts_at) - nowMs),
    };
  }
  return {
    label: 'До конца дня',
    value: formatDurationMs(timestampMs(state.next_day_starts_at) - nowMs),
  };
}

export function DailyOverviewScreen(): JSX.Element {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<DailyGameStats | null>(null);
  const state = useQuery({
    queryKey: ['daily', 'state'],
    queryFn: fetchDailyState,
  });
  const history = useInfiniteQuery({
    queryKey: ['daily', 'history'],
    queryFn: ({ pageParam }) => fetchDailyHistory(HISTORY_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const today = state.data;
  const games = history.data?.pages.flatMap((page) => page.games) ?? [];
  const historySummary = history.data?.pages[0]?.summary;
  const syncedNow = dailyNowMs(today, now);
  const timer = todayTimer(today, syncedNow);
  const latestMonth = today?.day_date?.slice(0, 7) ?? currentMonthKey();
  const selectedMonth = calendarMonth ?? latestMonth;
  const gamesByDate = useMemo(() => new Map(games.map((game) => [game.day_date, game])), [games]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!history.hasNextPage || history.isFetchingNextPage) return;
    const oldestLoadedDate = games.reduce<string | null>(
      (oldest, game) => (oldest === null || game.day_date < oldest ? game.day_date : oldest),
      null,
    );
    if (oldestLoadedDate === null || oldestLoadedDate > `${selectedMonth}-01`) {
      void history.fetchNextPage();
    }
  }, [
    games,
    history.fetchNextPage,
    history.hasNextPage,
    history.isFetchingNextPage,
    selectedMonth,
  ]);

  return (
    <main
      className="screen mode-shell mode-shell--section-hub"
      style={{
        padding: 'calc(18px + var(--app-safe-top)) 14px 24px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div className="bonus-games-catalog__header">
          <button
            type="button"
            className="icon-btn catalog-header-back"
            onClick={() => navigate('/sections')}
            aria-label="Назад"
            title="Назад"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="bonus-games-catalog__title screen-title-on-arena">Ежедневная игра</h1>
        </div>

        <section aria-label="Сегодняшняя игра" style={{ display: 'grid', gap: 8 }}>
          <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
            Сегодня
          </div>
          <div
            className="glass"
            style={{
              borderRadius: 26,
              padding: 16,
              display: 'grid',
              gap: 14,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', gap: 12 }}>
              <div
                aria-label="Изображение ежедневной игры"
                style={{
                  width: 86,
                  height: 86,
                  aspectRatio: '1 / 1',
                  borderRadius: 22,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.48)',
                  border: '1px solid rgba(255,255,255,0.72)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 8px 18px rgba(15,23,42,0.1)',
                }}
              >
                <img
                  src={todayArtwork(today)}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 850 }}>
                  {stateDate(today)}
                </div>
                <h2
                  style={{ margin: '3px 0 0', color: 'var(--ink)', fontSize: 20, fontWeight: 950 }}
                >
                  {todayTitle(today)}
                </h2>
                <div
                  aria-label={`${timer.label}: ${timer.value}`}
                  style={{
                    marginTop: 9,
                    display: 'inline-grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 10,
                    maxWidth: '100%',
                    padding: 0,
                    background: 'transparent',
                    border: 0,
                    boxShadow: 'none',
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      color: 'rgba(15,23,42,0.56)',
                      fontSize: 10,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {timer.label}
                  </span>
                  <span
                    style={{
                      color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      fontWeight: 900,
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {timer.value}
                  </span>
                </div>
              </div>
            </div>

            <div
              aria-label="Статистика сегодняшней игры"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <StatTile label="Голы" value={numberText(today?.daily_total_goals ?? 0)} />
              <StatTile label="Броски" value={numberText(today?.daily_total_shots ?? 0)} />
              <StatTile
                label="Процент"
                value={formatGoalRate(today?.daily_total_goals ?? 0, today?.daily_total_shots ?? 0)}
              />
            </div>

            <button
              type="button"
              className="btn btn--cta"
              onClick={() => navigate('/?view=daily')}
              style={{ minHeight: 42, display: 'inline-flex', justifyContent: 'center' }}
            >
              На лёд
            </button>
          </div>
        </section>

        <section aria-label="История дней" style={{ display: 'grid', gap: 8 }}>
          <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
            История
          </div>
          {history.isLoading ? (
            <div className="glass" style={{ borderRadius: 22, padding: 16, color: 'var(--muted)' }}>
              Загрузка...
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {historySummary && <HistorySummaryCard summary={historySummary} />}
              <DailyHistoryCalendar
                monthKey={selectedMonth}
                latestMonth={latestMonth}
                gamesByDate={gamesByDate}
                totalPeriods={today?.total_periods ?? 3}
                loadingOlderDays={history.isFetchingNextPage}
                onPreviousMonth={() => setCalendarMonth(shiftMonth(selectedMonth, -1))}
                onNextMonth={() => setCalendarMonth(shiftMonth(selectedMonth, 1))}
                onSelectGame={setSelectedGame}
              />
            </div>
          )}
        </section>
      </section>
      {selectedGame ? (
        <DailyGameResultModal
          game={selectedGame}
          totalPeriods={today?.total_periods ?? 3}
          onClose={() => setSelectedGame(null)}
        />
      ) : null}
    </main>
  );
}

function DailyHistoryCalendar({
  monthKey,
  latestMonth,
  gamesByDate,
  totalPeriods,
  loadingOlderDays,
  onPreviousMonth,
  onNextMonth,
  onSelectGame,
}: {
  monthKey: string;
  latestMonth: string;
  gamesByDate: Map<string, DailyGameStats>;
  totalPeriods: number;
  loadingOlderDays: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectGame: (game: DailyGameStats) => void;
}): JSX.Element {
  const days = calendarDays(monthKey);
  return (
    <section className="glass daily-calendar" aria-label="Календарь ежедневных игр">
      <div className="daily-calendar__header">
        <button
          type="button"
          className="icon-btn daily-calendar__nav"
          aria-label="Предыдущий месяц"
          onClick={onPreviousMonth}
        >
          <ChevronLeft size={16} />
        </button>
        <h2 className="daily-calendar__month">{monthTitle(monthKey)}</h2>
        <button
          type="button"
          className="icon-btn daily-calendar__nav"
          aria-label="Следующий месяц"
          disabled={monthKey >= latestMonth}
          onClick={onNextMonth}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="daily-calendar__weekdays" aria-hidden="true">
        {CALENDAR_WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="daily-calendar__grid">
        {days.map((day, index) => {
          if (day === null) {
            return <span key={`empty-${index}`} className="daily-calendar__empty" />;
          }
          const dayDate = `${monthKey}-${String(day).padStart(2, '0')}`;
          const game = gamesByDate.get(dayDate);
          if (!game) {
            return (
              <span key={dayDate} className="daily-calendar__day daily-calendar__day--neutral">
                {day}
              </span>
            );
          }
          const status = calendarStatus(game, totalPeriods);
          return (
            <button
              key={dayDate}
              type="button"
              className={`daily-calendar__day daily-calendar__day--${status}`}
              aria-label={`${calendarDayLabel(dayDate)}: ${calendarStatusLabel(status)}`}
              onClick={() => onSelectGame(game)}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="daily-calendar__legend" aria-label="Обозначения календаря">
        <span>
          <i className="daily-calendar__dot daily-calendar__dot--completed" />
          Завершена
        </span>
        <span>
          <i className="daily-calendar__dot daily-calendar__dot--incomplete" />
          Начата
        </span>
        <span>
          <i className="daily-calendar__dot daily-calendar__dot--missed" />
          Без бросков
        </span>
      </div>
      {loadingOlderDays ? <div className="daily-calendar__loading">Загружаем дни…</div> : null}
    </section>
  );
}

function DailyGameResultModal({
  game,
  totalPeriods,
  onClose,
}: {
  game: DailyGameStats;
  totalPeriods: number;
  onClose: () => void;
}): JSX.Element {
  const formattedDate = formatDailyGameDate(game.day_date);
  const periodSlots = Array.from({ length: totalPeriods }, (_, index) => {
    const periodNumber = index + 1;
    return {
      periodNumber,
      period: game.periods.find((entry) => entry.period_number === periodNumber),
    };
  });
  return (
    <AccessibleModal
      title={formattedDate}
      ariaLabel={`Результат за ${formattedDate}`}
      onClose={onClose}
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={16} />
        </button>
      }
    >
      <div className="daily-result-modal__summary">
        <div>
          <span>Голы</span>
          <strong>
            {game.total_goals} из {game.total_shots}
          </strong>
        </div>
        <div>
          <span>Процент</span>
          <strong>{formatGoalRate(game.total_goals, game.total_shots)}</strong>
        </div>
        <div>
          <span>Время</span>
          <strong>{formatDurationMs(game.total_duration_ms)}</strong>
        </div>
      </div>
      <div className="daily-result-modal__periods">
        {periodSlots.map(({ periodNumber, period }) => (
          <div
            key={periodNumber}
            className={`daily-result-modal__period${period ? '' : ' daily-result-modal__period--empty'}`}
          >
            <span>{periodNumber} период</span>
            {period ? (
              <>
                <strong>
                  {period.goals}/{period.shots_taken}
                </strong>
                <small>{formatDurationMs(period.duration_ms)}</small>
              </>
            ) : (
              <strong>Не сыгран</strong>
            )}
          </div>
        ))}
      </div>
    </AccessibleModal>
  );
}

function HistorySummaryCard({ summary }: { summary: DailyHistorySummary }): JSX.Element {
  const participationPercent = formatPercent(summary.played_games, summary.possible_games);
  const goalRate = formatGoalRate(summary.total_goals, summary.total_shots);
  return (
    <article
      className="glass"
      aria-label="Общая статистика ежедневных игр"
      style={{
        borderRadius: 22,
        padding: 14,
        display: 'grid',
        gap: 10,
        background:
          'linear-gradient(135deg, rgba(147,197,253,0.72), rgba(219,234,254,0.86) 52%, rgba(255,255,255,0.72))',
        border: '1px solid rgba(255,255,255,0.94)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92), 0 18px 42px rgba(37,99,235,0.2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          minWidth: 0,
        }}
      >
        <h2
          style={{
            minWidth: 0,
            margin: 0,
            color: 'var(--ink)',
            fontSize: 15,
            fontWeight: 950,
            lineHeight: 1.05,
          }}
        >
          За всё время
        </h2>
        <div
          style={{
            flex: '0 0 auto',
            color: 'var(--ink)',
            fontSize: 14,
            fontWeight: 950,
            lineHeight: 1.05,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {goalRate} ({numberText(summary.total_goals)} из {numberText(summary.total_shots)})
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        <SummaryTile
          label="Игры"
          value={`${numberText(summary.played_games)}/${numberText(summary.possible_games)}`}
          note={participationPercent}
        />
        <SummaryTile
          label="Доиграно"
          value={`${numberText(summary.completed_games)}/${numberText(summary.played_games)}`}
          note={formatPercent(summary.completed_games, summary.played_games)}
        />
        <SummaryTile label="Голы" value={numberText(summary.total_goals)} note="всего" />
      </div>
    </article>
  );
}

function SummaryTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}): JSX.Element {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 14,
        padding: '9px 6px',
        textAlign: 'center',
        background: 'rgba(255,255,255,0.48)',
        border: '1px solid rgba(255,255,255,0.7)',
      }}
    >
      <div
        style={{
          color: 'var(--muted)',
          fontSize: 8,
          fontWeight: 900,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          color: 'var(--ink)',
          fontSize: 12,
          fontWeight: 950,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 3,
          color: 'var(--muted)',
          fontSize: 9,
          fontWeight: 750,
          lineHeight: 1.05,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {note}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: '12px 8px',
        textAlign: 'center',
        background: 'rgba(255,255,255,0.46)',
        border: '1px solid rgba(255,255,255,0.66)',
      }}
    >
      <div
        style={{
          color: 'rgba(15,23,42,0.52)',
          fontSize: 9,
          fontWeight: 900,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 7,
          color: 'var(--ink)',
          fontFamily: 'var(--font-mono)',
          fontSize: 19,
          fontWeight: 850,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}
