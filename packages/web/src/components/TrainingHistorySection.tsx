import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AccessibleModal } from './AccessibleModal.js';
import {
  fetchTrainingHistory,
  type TrainingHistorySession,
  type TrainingHistorySummary,
} from '../api/training.js';

const PAGE_SIZE = 20;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '0%';
}

function monthKeyNow(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function dayLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS_GENITIVE[Number(month) - 1] ?? month} ${year}`;
}

function formattedDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function calendarDays(key: string): Array<number | null> {
  const [year, month] = key.split('-').map(Number);
  const count = new Date(Date.UTC(year ?? 0, month ?? 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)).getUTCDay() + 6) % 7;
  return [...Array.from<null>({ length: offset }).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
}

function summaryFor(sessions: TrainingHistorySession[]): TrainingHistorySummary {
  const played = sessions.filter((session) => session.total_shots > 0);
  return {
    played_trainings: played.length,
    completed_trainings: played.filter((session) => session.completed).length,
    total_shots: played.reduce((sum, session) => sum + session.total_shots, 0),
    total_goals: played.reduce((sum, session) => sum + session.total_goals, 0),
  };
}

function SummaryCard({ title, summary }: { title: string; summary: TrainingHistorySummary }): JSX.Element {
  return (
    <article className="glass daily-history-summary" aria-label={`Статистика: ${title}`}>
      <div className="training-history-summary__header">
        <h2>{title}</h2>
        <strong>{percent(summary.total_goals, summary.total_shots)} ({numberText(summary.total_goals)} из {numberText(summary.total_shots)})</strong>
      </div>
      <div className="training-history-summary__tiles">
        <SummaryTile label="Тренировки" value={numberText(summary.played_trainings)} />
        <SummaryTile label="Завершено" value={numberText(summary.completed_trainings)} />
        <SummaryTile label="Голы" value={numberText(summary.total_goals)} />
      </div>
    </article>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="training-history-summary__tile"><span>{label}</span><strong>{value}</strong></div>;
}

export function TrainingHistorySection({ currentDayDate }: { currentDayDate: string | null }): JSX.Element {
  const latestMonth = currentDayDate?.slice(0, 7) ?? monthKeyNow();
  const [month, setMonth] = useState(latestMonth);
  const [selected, setSelected] = useState<TrainingHistorySession | null>(null);
  const history = useInfiniteQuery({
    queryKey: ['training', 'history'],
    queryFn: ({ pageParam }) => fetchTrainingHistory(PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const sessions = history.data?.pages.flatMap((page) =>
    Array.isArray(page.sessions) ? page.sessions : [],
  ) ?? [];
  const lifetime = history.data?.pages[0]?.summary;
  const monthSessions = sessions.filter((session) => session.day_date.startsWith(`${month}-`));
  const monthSummary = useMemo(() => summaryFor(monthSessions), [monthSessions]);
  const byDate = useMemo(() => new Map(sessions.map((session) => [session.day_date, session])), [sessions]);

  useEffect(() => setMonth(latestMonth), [latestMonth]);
  useEffect(() => {
    if (!history.hasNextPage || history.isFetchingNextPage) return;
    const oldest = sessions.reduce<string | null>((value, session) => value === null || session.day_date < value ? session.day_date : value, null);
    if (oldest === null || oldest > `${month}-01`) void history.fetchNextPage();
  }, [history.fetchNextPage, history.hasNextPage, history.isFetchingNextPage, month, sessions]);

  return (
    <section className="training-history" aria-label="История тренировок">
      <div className="section-label training-history__title">История</div>
      {history.isLoading ? <div className="training-history__state">Загрузка...</div> : null}
      {history.isError ? <div className="training-history__state" role="alert">Не удалось загрузить историю.</div> : null}
      {!history.isLoading && !history.isError ? (
        <div className="training-history__content">
          {lifetime ? <SummaryCard title="За всё время" summary={lifetime} /> : null}
          <SummaryCard title={`За ${(MONTHS[Number(month.split('-')[1]) - 1] ?? month).toLocaleLowerCase('ru-RU')}`} summary={monthSummary} />
          <section className="glass daily-calendar" aria-label="Календарь тренировок">
            <div className="daily-calendar__header">
              <button type="button" className="icon-btn daily-calendar__nav" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></button>
              <h2 className="daily-calendar__month">{monthTitle(month)}</h2>
              <button type="button" className="icon-btn daily-calendar__nav" aria-label="Следующий месяц" disabled={month >= latestMonth} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16} /></button>
            </div>
            <div className="daily-calendar__weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="daily-calendar__grid">
              {calendarDays(month).map((day, index) => {
                if (day === null) return <span key={`empty-${index}`} className="daily-calendar__empty" />;
                const date = `${month}-${String(day).padStart(2, '0')}`;
                const session = byDate.get(date);
                if (!session) return <span key={date} className="daily-calendar__day daily-calendar__day--neutral"><span className="daily-calendar__day-number">{day}</span></span>;
                const status = session.completed ? 'completed' : 'incomplete';
                const active = date === currentDayDate && !session.completed;
                const statusText = session.completed ? 'тренировка завершена' : 'тренировка начата, но не завершена';
                return <button key={date} type="button" className={`daily-calendar__day daily-calendar__day--${status}${active ? ' daily-calendar__day--active-today' : ''}`} aria-label={`${dayLabel(date)}: ${statusText}`} onClick={() => setSelected(session)}><span className="daily-calendar__day-number">{day}</span><span className="daily-calendar__goal-count" aria-label={`Забито шайб: ${session.total_goals}`}>{session.total_goals}</span></button>;
              })}
            </div>
            <div className="daily-calendar__legend" aria-label="Обозначения календаря"><span><i className="daily-calendar__dot daily-calendar__dot--completed" />Завершена</span><span><i className="daily-calendar__dot daily-calendar__dot--incomplete" />Не завершена</span></div>
          </section>
        </div>
      ) : null}
      {selected ? <TrainingResultModal session={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function TrainingResultModal({ session, onClose }: { session: TrainingHistorySession; onClose: () => void }): JSX.Element {
  const date = formattedDate(session.day_date);
  return <AccessibleModal title={date} ariaLabel={`Результат тренировки за ${date}`} onClose={onClose} headerAction={<button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={16} /></button>}>
    <div className="daily-result-modal__summary training-result-modal__summary">
      <div><span>Голы</span><strong>{session.total_goals} из {session.total_shots}</strong></div>
      <div><span>Броски</span><strong>{session.total_shots} из {session.shots_limit}</strong></div>
      <div><span>Процент</span><strong>{percent(session.total_goals, session.total_shots)}</strong></div>
    </div>
  </AccessibleModal>;
}
