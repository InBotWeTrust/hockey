import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPlayoffPairSchedule, updatePlayoffPairDay, type PlayoffPairDay } from './adminApi.js';
import { TournamentAdminField } from './TournamentAdminField.js';

function localTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function PairDayEditor({ tournamentId, day }: { tournamentId: string; day: PlayoffPairDay }) {
  const [time, setTime] = useState(
    day.overrideStartsAt === null ? '' : localTime(day.overrideStartsAt, day.timezone),
  );
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => updatePlayoffPairDay(tournamentId, day, time || null),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['playoff-pair-schedule', tournamentId] });
      await client.invalidateQueries({
        queryKey: ['admin', 'tournaments', tournamentId, 'schedule'],
      });
    },
  });
  const label = `${day.homeName ?? day.seriesKey} — ${day.awayName ?? 'участник определится'}, день ${day.dayNumber}`;
  return (
    <div className="tournament-pair-schedule__day">
      <TournamentAdminField
        label={label}
        help={`${day.localDate}. По умолчанию ${localTime(day.defaultStartsAt, day.timezone)} (${day.timezone}).`}
      >
        <input
          type="time"
          value={time}
          disabled={!day.editable || save.isPending}
          aria-label={label}
          onChange={(event) => setTime(event.target.value)}
        />
      </TournamentAdminField>
      {day.editable ? (
        <button
          type="button"
          className="btn"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending
            ? 'Сохраняем…'
            : time
              ? 'Сохранить время пары'
              : 'Использовать время раунда'}
        </button>
      ) : (
        <p>Дневная норма уже началась или серия завершена</p>
      )}
      {save.isError && (
        <p role="alert">
          {save.error instanceof Error ? save.error.message : 'Не удалось сохранить время'}
        </p>
      )}
      {save.isSuccess && <p role="status">Время сохранено</p>}
    </div>
  );
}

export function PlayoffPairScheduleEditor({ tournamentId }: { tournamentId: string }) {
  const schedule = useQuery({
    queryKey: ['playoff-pair-schedule', tournamentId],
    queryFn: () => fetchPlayoffPairSchedule(tournamentId),
  });
  if (schedule.isPending) return <p>Загружаем расписание пар…</p>;
  if (schedule.isError) return <p role="alert">Не удалось загрузить расписание пар</p>;
  if (!schedule.data.days.length) return null;
  return (
    <section className="tournament-playoff-days" aria-label="Время дневной нормы пар">
      <h3>Время дневной нормы пар</h3>
      <p>
        Будущие дни можно менять отдельно для каждой пары. Пустое время означает расписание раунда.
      </p>
      {schedule.data.days.map((day) => (
        <PairDayEditor
          key={`${day.seriesId}:${day.dayId}:${day.effectiveStartsAt}`}
          tournamentId={tournamentId}
          day={day}
        />
      ))}
    </section>
  );
}
