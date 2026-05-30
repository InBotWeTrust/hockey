import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchDailyHistory,
  fetchDailyState,
  type DailyGameStats,
  type DailyHistorySummary,
  type DailyStateResponse,
} from '../api/duel.js';

const HISTORY_PAGE_SIZE = 20;

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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(22px + var(--app-safe-top)) 24px 24px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate('/sections')}
            aria-label="Назад"
            title="Назад"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              minHeight: 40,
              borderRadius: 999,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>Ежедневная игра</h1>
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
                    minHeight: 30,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.48)',
                    border: '1px solid rgba(255,255,255,0.66)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
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
              На лед
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
              {games.length === 0 ? (
                <div
                  className="glass"
                  style={{
                    borderRadius: 22,
                    padding: 16,
                    color: 'var(--muted)',
                    fontSize: 13,
                    fontWeight: 750,
                  }}
                >
                  Завершённые ежедневные игры появятся здесь.
                </div>
              ) : (
                games.map((game) => <HistoryCard key={game.day_date} game={game} />)
              )}
              {history.hasNextPage && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                  style={{ minHeight: 42, justifyContent: 'center' }}
                >
                  {history.isFetchingNextPage ? 'Загрузка...' : 'Загрузить ещё'}
                </button>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
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

function HistoryCard({ game }: { game: DailyGameStats }): JSX.Element {
  return (
    <article
      className="glass"
      style={{
        borderRadius: 22,
        padding: 14,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
            {formatDailyGameDate(game.day_date)}
          </h2>
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950, textAlign: 'right' }}>
          {formatGoalRate(game.total_goals, game.total_shots)} ({numberText(game.total_goals)} из{' '}
          {numberText(game.total_shots)})
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        {game.periods.slice(0, 3).map((period) => (
          <div
            key={period.period_number}
            style={{
              borderRadius: 14,
              padding: '8px 6px',
              textAlign: 'center',
              background: 'rgba(255,255,255,0.38)',
              border: '1px solid rgba(255,255,255,0.56)',
            }}
          >
            <div style={{ color: 'var(--muted)', fontSize: 9, fontWeight: 900 }}>
              {period.period_number} период
            </div>
            <div style={{ marginTop: 4, color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>
              {period.goals}/{period.shots_taken}
            </div>
            <div style={{ marginTop: 2, color: 'var(--muted)', fontSize: 10, fontWeight: 750 }}>
              {formatDurationMs(period.duration_ms)}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
