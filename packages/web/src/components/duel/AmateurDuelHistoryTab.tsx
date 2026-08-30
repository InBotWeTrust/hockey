import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAmateurHistoryCalendar,
  type AmateurDuelHistoryCalendarMatch,
} from '../../api/amateurDuel.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { GlassSelect } from '../GlassSelect.js';

const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
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
  if (kind === 'express_plus') return 'Экспресс+';
  return 'Классика';
}

function resultLabel(result: AmateurDuelHistoryCalendarMatch['result']): string {
  if (result === 'win') return 'Победа';
  if (result === 'draw') return 'Ничья';
  return 'Поражение';
}

export function AmateurDuelHistoryTab({
  initialMonthKey,
  onOpenMatch,
}: {
  initialMonthKey: string;
  onOpenMatch: (matchId: string) => void;
}): JSX.Element {
  const [monthKey, setMonthKey] = useState(initialMonthKey);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const calendar = useQuery({
    queryKey: ['amateur-duel', 'history', 'calendar', monthKey],
    queryFn: () => fetchAmateurHistoryCalendar(monthKey),
  });
  useEffect(() => setSelectedDay(null), [monthKey]);
  const data = calendar.data;
  const months = Array.from(new Set([monthKey, ...(data?.available_months ?? [])]));
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

  return (
    <section className="duel-section" aria-label="История дуэлей">
      <div className="duel-section-title">История</div>
      <div className="duel-history-summary" aria-label="За всё время">
        <div className="duel-history-summary__title">За всё время</div>
        <strong>{stats.win_percentage}%</strong>
        <span>побед</span>
        <dl>
          <div><dt>Сыграно</dt><dd>{stats.played}</dd></div>
          <div><dt>Победы</dt><dd>{stats.wins}</dd></div>
          <div><dt>Ничьи</dt><dd>{stats.draws}</dd></div>
          <div><dt>Поражения</dt><dd>{stats.losses}</dd></div>
        </dl>
      </div>
      <GlassSelect
        ariaLabel="Месяц календаря дуэлей"
        value={monthKey}
        options={months.map((key) => ({ value: key, label: monthLabel(key) }))}
        onChange={setMonthKey}
      />
      {calendar.isLoading ? (
        <div className="duel-state-card">Загрузка истории…</div>
      ) : calendar.isError ? (
        <div className="duel-state-card duel-state-card--error">Не удалось загрузить историю.</div>
      ) : (
        <div className="duel-calendar" aria-label={`Календарь дуэлей: ${monthLabel(monthKey)}`}>
          {WEEKDAYS.map((day) => <span className="duel-calendar__weekday" key={day}>{day}</span>)}
          {Array.from({ length: geometry.offset }, (_, index) => (
            <span aria-hidden="true" key={`empty-${index}`} />
          ))}
          {Array.from({ length: geometry.days }, (_, index) => {
            const day = index + 1;
            const matches = dayMap.get(day) ?? [];
            return (
              <button
                key={day}
                type="button"
                className={matches.length > 0 ? 'duel-calendar__day duel-calendar__day--played' : 'duel-calendar__day'}
                aria-label={`${day}, ${matches.length > 0 ? `сыграно дуэлей: ${matches.length}` : 'дуэлей нет'}`}
                disabled={matches.length === 0}
                onClick={() => setSelectedDay(day)}
              >
                {day}
              </button>
            );
          })}
        </div>
      )}
      {selectedDay !== null && (
        <div className="modal-backdrop" onClick={() => setSelectedDay(null)}>
          <section
            role="dialog"
            aria-label={`Дуэли за ${selectedDay} число`}
            className="modal-card duel-day-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title">Дуэли за {selectedDay} число</div>
            <div className="duel-day-list">
              {selectedMatches.map((match) => (
                <button
                  type="button"
                  key={match.id}
                  className="duel-day-match"
                  aria-label={`Открыть дуэль с ${match.opponent.display_name}`}
                  onClick={() => {
                    setSelectedDay(null);
                    onOpenMatch(match.id);
                  }}
                >
                  <UserAvatar
                    avatarUrl={match.opponent.avatar_url}
                    name={match.opponent.display_name}
                    size={40}
                    fontSize={14}
                  />
                  <span className="duel-day-match__copy">
                    <strong>{match.opponent.display_name}</strong>
                    <span>{duelKindLabel(match.duel_kind)} · {match.my_goals}:{match.opponent_goals}</span>
                  </span>
                  <span className={`duel-day-match__result duel-day-match__result--${match.result}`}>
                    {resultLabel(match.result)}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-primary btn btn--cta" onClick={() => setSelectedDay(null)}>
                Закрыть
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
