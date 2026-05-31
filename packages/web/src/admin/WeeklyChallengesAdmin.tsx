import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateAdminWeeklyChallenge,
  createAdminWeeklyChallenge,
  deactivateAdminWeeklyChallenge,
  fetchAdminWeeklyChallenges,
  patchAdminWeeklyChallenge,
  setAdminWeeklyChallengeJoinEnabled,
  type AdminWeeklyChallenge,
  type AdminWeeklyChallengeInput,
  type AdminWeeklyChallengeTaskType,
} from './api.js';

const taskTypeOptions: Array<{ value: AdminWeeklyChallengeTaskType; label: string }> = [
  { value: 'goals_scored', label: 'Забросить шайбы' },
  { value: 'duels_played', label: 'Сыграть дуэли' },
  { value: 'duels_won', label: 'Победить в дуэлях' },
  { value: 'duel_invites_sent', label: 'Пригласить соперников' },
  { value: 'trainings_completed', label: 'Завершить тренировки' },
];

interface WeeklyChallengeFormTask {
  type: AdminWeeklyChallengeTaskType;
  title: string;
  target: string;
  sortOrder: number;
}

interface WeeklyChallengeFormState {
  id: string | null;
  title: string;
  description: string;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  rewardCoins: string;
  rewardStars: string;
  rewardExperience: string;
  tasks: WeeklyChallengeFormTask[];
}

const emptyForm: WeeklyChallengeFormState = {
  id: null,
  title: '',
  description: '',
  joinOpenAt: '',
  startAt: '',
  endAt: '',
  rewardCoins: '0',
  rewardStars: '0',
  rewardExperience: '0',
  tasks: [{ type: 'goals_scored', title: '', target: '500', sortOrder: 0 }],
};

function datePartsInMoscow(value: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toMoscowInput(value: string): string {
  const parts = datePartsInMoscow(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function fromMoscowInput(value: string): string {
  return new Date(`${value}:00+03:00`).toISOString();
}

function dateText(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(value));
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toForm(challenge: AdminWeeklyChallenge): WeeklyChallengeFormState {
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    joinOpenAt: toMoscowInput(challenge.joinOpenAt),
    startAt: toMoscowInput(challenge.startAt),
    endAt: toMoscowInput(challenge.endAt),
    rewardCoins: String(challenge.rewardCoins),
    rewardStars: String(challenge.rewardStars),
    rewardExperience: String(challenge.rewardExperience),
    tasks: challenge.tasks.map((task, index) => ({
      type: task.type,
      title: task.title ?? '',
      target: String(task.target),
      sortOrder: task.sortOrder ?? index,
    })),
  };
}

function toInput(form: WeeklyChallengeFormState): AdminWeeklyChallengeInput {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    joinOpenAt: fromMoscowInput(form.joinOpenAt),
    startAt: fromMoscowInput(form.startAt),
    endAt: fromMoscowInput(form.endAt),
    rewardCoins: numberValue(form.rewardCoins),
    rewardStars: numberValue(form.rewardStars),
    rewardExperience: numberValue(form.rewardExperience),
    tasks: form.tasks.map((task, index) => ({
      type: task.type,
      title: task.title.trim() || null,
      target: numberValue(task.target),
      sortOrder: index,
    })),
  };
}

function canSubmit(form: WeeklyChallengeFormState): boolean {
  return (
    form.title.trim().length > 0 &&
    form.joinOpenAt.length > 0 &&
    form.startAt.length > 0 &&
    form.endAt.length > 0 &&
    form.tasks.length > 0 &&
    form.tasks.every((task) => numberValue(task.target) > 0)
  );
}

export function WeeklyChallengesAdmin(): JSX.Element {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WeeklyChallengeFormState>(emptyForm);
  const query = useQuery({
    queryKey: ['admin', 'weekly-challenges'],
    queryFn: fetchAdminWeeklyChallenges,
  });
  const save = useMutation({
    mutationFn: (state: WeeklyChallengeFormState) =>
      state.id === null
        ? createAdminWeeklyChallenge(toInput(state))
        : patchAdminWeeklyChallenge(state.id, toInput(state)),
    onSuccess: () => {
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] });
    },
  });
  const activate = useMutation({
    mutationFn: activateAdminWeeklyChallenge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });
  const deactivate = useMutation({
    mutationFn: deactivateAdminWeeklyChallenge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });
  const joinToggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setAdminWeeklyChallengeJoinEnabled(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'weekly-challenges'] }),
  });
  const challenges = query.data?.challenges ?? [];
  const activeChallenge = useMemo(
    () => challenges.find((challenge) => challenge.isActive) ?? null,
    [challenges],
  );

  const updateTask = (index: number, patch: Partial<WeeklyChallengeFormTask>): void => {
    setForm((current) => ({
      ...current,
      tasks: current.tasks.map((task, taskIndex) =>
        taskIndex === index ? { ...task, ...patch } : task,
      ),
    }));
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
        Еженедельные челленджи
      </div>

      <section className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
          {form.id === null ? 'Новый челлендж' : 'Редактирование челленджа'}
        </div>
        <AdminField label="Название">
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
        </AdminField>
        <AdminField label="Описание">
          <input
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
        </AdminField>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <AdminField label="Вход с">
            <input
              type="datetime-local"
              value={form.joinOpenAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, joinOpenAt: event.target.value }))
              }
            />
          </AdminField>
          <AdminField label="Старт">
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, startAt: event.target.value }))
              }
            />
          </AdminField>
          <AdminField label="Финиш">
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endAt: event.target.value }))
              }
            />
          </AdminField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <AdminField label="Монеты">
            <input
              type="number"
              min="0"
              value={form.rewardCoins}
              onChange={(event) =>
                setForm((current) => ({ ...current, rewardCoins: event.target.value }))
              }
            />
          </AdminField>
          <AdminField label="Звезды">
            <input
              type="number"
              min="0"
              value={form.rewardStars}
              onChange={(event) =>
                setForm((current) => ({ ...current, rewardStars: event.target.value }))
              }
            />
          </AdminField>
          <AdminField label="Опыт">
            <input
              type="number"
              min="0"
              value={form.rewardExperience}
              onChange={(event) =>
                setForm((current) => ({ ...current, rewardExperience: event.target.value }))
              }
            />
          </AdminField>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {form.tasks.map((task, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr) 92px 68px',
                gap: 8,
                alignItems: 'end',
              }}
            >
              <AdminField label="Тип">
                <select
                  value={task.type}
                  onChange={(event) =>
                    updateTask(index, { type: event.target.value as AdminWeeklyChallengeTaskType })
                  }
                >
                  {taskTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Название">
                <input
                  value={task.title}
                  onChange={(event) => updateTask(index, { title: event.target.value })}
                />
              </AdminField>
              <AdminField label="Цель">
                <input
                  type="number"
                  min="1"
                  value={task.target}
                  onChange={(event) => updateTask(index, { target: event.target.value })}
                />
              </AdminField>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    tasks: current.tasks.filter((_, taskIndex) => taskIndex !== index),
                  }))
                }
                disabled={form.tasks.length === 1}
                style={{ height: 44, padding: 0, fontSize: 12 }}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              setForm((current) => ({
                ...current,
                tasks: [
                  ...current.tasks,
                  { type: 'goals_scored', title: '', target: '100', sortOrder: current.tasks.length },
                ],
              }))
            }
          >
            Добавить задание
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setForm(emptyForm)}>
            Очистить
          </button>
          <button
            type="button"
            className="btn btn--cta"
            onClick={() => save.mutate(form)}
            disabled={!canSubmit(form) || save.isPending}
          >
            {form.id === null ? 'Создать' : 'Сохранить'}
          </button>
        </div>
      </section>

      {query.isLoading ? (
        <AdminPlainState>Загружаем челленджи...</AdminPlainState>
      ) : (
        <section style={{ display: 'grid', gap: 10 }}>
          {activeChallenge && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 800 }}>
              Активный сейчас: {activeChallenge.title}
            </div>
          )}
          {challenges.map((challenge) => (
            <article
              key={challenge.id}
              className="glass"
              style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 8 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 950, color: 'var(--ink)' }}>{challenge.title}</div>
                  <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>
                    {dateText(challenge.startAt)} - {dateText(challenge.endAt)} МСК
                  </div>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 900 }}>
                  {challenge.isActive ? 'Активен' : 'Не активен'}
                </div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 }}>
                {challenge.tasks.length} заданий · {challenge.rewardCoins} монет ·{' '}
                {challenge.rewardStars} звезд · {challenge.rewardExperience} опыта
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setForm(toForm(challenge))}>
                  Править
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => activate.mutate(challenge.id)}
                  disabled={challenge.isActive || activate.isPending}
                >
                  Активировать
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => deactivate.mutate(challenge.id)}
                  disabled={!challenge.isActive || deactivate.isPending}
                >
                  Отключить
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    joinToggle.mutate({ id: challenge.id, enabled: !challenge.joinEnabled })
                  }
                  disabled={joinToggle.isPending}
                >
                  {challenge.joinEnabled ? 'Закрыть вход' : 'Открыть вход'}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function AdminField({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>
      {children}
    </div>
  );
}

function AdminPlainState({ children }: { children: string }): JSX.Element {
  return (
    <div className="glass" style={{ borderRadius: 18, padding: 16, color: 'var(--muted)' }}>
      {children}
    </div>
  );
}
