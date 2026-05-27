import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchDailyHistory,
  fetchDailyState,
  type DailyGameStats,
  type DailyStateResponse,
} from '../api/duel.js';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function shotWord(value: number): string {
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'бросков';
  if (last === 1) return 'бросок';
  if (last >= 2 && last <= 4) return 'броска';
  return 'бросков';
}

function goalWord(value: number): string {
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'голов';
  if (last === 1) return 'гол';
  if (last >= 2 && last <= 4) return 'гола';
  return 'голов';
}

function formatGoalRate(goals: number, shots: number): string {
  if (shots <= 0) return '0%';
  return `${Math.round((goals / shots) * 100)}%`;
}

function formatDailyGameDate(dayDate: string): string {
  const [year, month, day] = dayDate.split('-');
  if (!year || !month || !day) return dayDate;
  return `${day}.${month}.${year}`;
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function todayTitle(state: DailyStateResponse | undefined): string {
  if (!state) return 'Сегодняшняя игра';
  if (state.state === 'period_active') return `${state.current_period}-й период идёт`;
  if (state.state === 'break_active') return 'Перерыв между периодами';
  if (state.state === 'closed') return 'Игра завершена';
  const nextPeriod = Math.min(state.current_period + 1, state.total_periods);
  return `${nextPeriod}-й период доступен`;
}

function todayMeta(state: DailyStateResponse | undefined): string {
  if (!state) return 'Загрузка...';
  const totalShots = state.shots_per_period * state.total_periods;
  return `${numberText(state.daily_total_goals)} ${goalWord(state.daily_total_goals)} · ${numberText(state.daily_total_shots)}/${numberText(totalShots)} ${shotWord(totalShots)}`;
}

function stateDate(state: DailyStateResponse | undefined): string {
  if (!state?.day_date) return 'Сегодня';
  return formatDailyGameDate(state.day_date);
}

export function DailyOverviewScreen(): JSX.Element {
  const navigate = useNavigate();
  const state = useQuery({
    queryKey: ['daily', 'state'],
    queryFn: fetchDailyState,
  });
  const history = useQuery({
    queryKey: ['daily', 'history'],
    queryFn: () => fetchDailyHistory(14),
  });
  const today = state.data;
  const games = history.data?.games ?? [];

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
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>
            Ежедневная игра
          </h1>
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
            <div style={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr)', gap: 12 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,0.48)',
                  border: '1px solid rgba(255,255,255,0.72)',
                }}
              >
                <CalendarDays size={24} strokeWidth={2.3} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 850 }}>
                  {stateDate(today)}
                </div>
                <h2 style={{ margin: '3px 0 0', color: 'var(--ink)', fontSize: 20, fontWeight: 950 }}>
                  {todayTitle(today)}
                </h2>
                <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 13, fontWeight: 800 }}>
                  {todayMeta(today)}
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
              На площадку
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
          ) : games.length === 0 ? (
            <div
              className="glass"
              style={{ borderRadius: 22, padding: 16, color: 'var(--muted)', fontSize: 13, fontWeight: 750 }}
            >
              Завершённые ежедневные игры появятся здесь.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {games.map((game) => (
                <HistoryCard key={game.day_date} game={game} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
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
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>
            {numberText(game.total_goals)} {goalWord(game.total_goals)} из{' '}
            {numberText(game.total_shots)} {shotWord(game.total_shots)}
          </div>
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>
          {formatGoalRate(game.total_goals, game.total_shots)}
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
