import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Plus } from 'lucide-react';
import { rewardColor } from '../app/rewardColors.js';
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
import { GlassSelect } from '../components/GlassSelect.js';

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

function shortDateText(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(value));
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function taskTypeLabel(type: AdminWeeklyChallengeTaskType): string {
  return taskTypeOptions.find((option) => option.value === type)?.label ?? type;
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
  const [formOpen, setFormOpen] = useState(false);
  const [statsChallenge, setStatsChallenge] = useState<AdminWeeklyChallenge | null>(null);
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
      setFormOpen(false);
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
  const totalParticipants = challenges.reduce(
    (sum, challenge) => sum + challenge.stats.participantsCount,
    0,
  );
  const totalCompleted = challenges.reduce(
    (sum, challenge) => sum + challenge.stats.completedCount,
    0,
  );

  const openCreateForm = (): void => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (challenge: AdminWeeklyChallenge): void => {
    setForm(toForm(challenge));
    setFormOpen(true);
  };

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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
          Еженедельные челленджи ({challenges.length})
        </div>
        <button
          type="button"
          className="chip chip--active"
          onClick={openCreateForm}
          style={{ padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
          <Plus size={14} />
          Создать
        </button>
      </div>

      <section
        className="glass"
        style={{
          borderRadius: 18,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <ChallengeMetric label="Всего" value={challenges.length} />
        <ChallengeMetric label="Активный" value={activeChallenge === null ? 0 : 1} />
        <ChallengeMetric label="Участники" value={totalParticipants} />
        <ChallengeMetric label="Выполнили" value={totalCompleted} />
      </section>

      {formOpen && (
        <section
          className="glass"
          style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 12 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 950 }}>
              {form.id === null ? 'Новый челлендж' : 'Редактирование челленджа'}
            </div>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setForm(emptyForm);
                setFormOpen(false);
              }}
              style={{ padding: '8px 12px' }}
            >
              Закрыть
            </button>
          </div>
          <AdminField label="Название">
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </AdminField>
          <AdminField label="Описание">
            <textarea
              value={form.description}
              rows={3}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              style={{ resize: 'vertical', minHeight: 92 }}
            />
          </AdminField>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
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

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 900 }}>Задания</div>
            {form.tasks.map((task, index) => (
              <div
                key={index}
                className="glass"
                style={{
                  borderRadius: 16,
                  padding: 10,
                  boxShadow: 'none',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(180px, 0.9fr) minmax(220px, 1.4fr) minmax(110px, 0.5fr) auto',
                    gap: 8,
                    alignItems: 'end',
                  }}
                >
                  <AdminField label="Тип">
                    <GlassSelect
                      value={task.type}
                      options={taskTypeOptions}
                      onChange={(value) =>
                        updateTask(index, { type: value as AdminWeeklyChallengeTaskType })
                      }
                      ariaLabel={`Тип задания ${index + 1}`}
                    />
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
                    className="chip"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        tasks: current.tasks.filter((_, taskIndex) => taskIndex !== index),
                      }))
                    }
                    disabled={form.tasks.length === 1}
                    style={{ padding: '8px 12px', alignSelf: 'center' }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <button
              type="button"
              className="chip"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  tasks: [
                    ...current.tasks,
                    {
                      type: 'goals_scored',
                      title: '',
                      target: '100',
                      sortOrder: current.tasks.length,
                    },
                  ],
                }))
              }
              style={{ padding: '8px 12px' }}
            >
              Добавить задание
            </button>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="chip"
                onClick={() => setForm(form.id === null ? emptyForm : form)}
                style={{ padding: '8px 12px' }}
              >
                Сбросить
              </button>
              <button
                type="button"
                className="chip chip--active"
                onClick={() => save.mutate(form)}
                disabled={!canSubmit(form) || save.isPending}
                style={{ padding: '8px 14px' }}
              >
                {form.id === null ? 'Создать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </section>
      )}

      {query.isLoading ? (
        <AdminPlainState>Загружаем челленджи...</AdminPlainState>
      ) : (
        <section style={{ display: 'grid', gap: 10 }}>
          {challenges.map((challenge) => (
            <article
              key={challenge.id}
              className="glass"
              style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 12 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  {challenge.isActive && (
                    <div
                      style={{
                        marginBottom: 5,
                        color: 'var(--muted)',
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      Активный сейчас
                    </div>
                  )}
                  <div
                    style={{
                      fontWeight: 950,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {challenge.title}
                  </div>
                  <div
                    style={{ marginTop: 3, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}
                  >
                    {dateText(challenge.startAt)} - {dateText(challenge.endAt)} МСК
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {!challenge.isActive && (
                    <div
                      style={{
                        color: 'var(--muted)',
                        fontSize: 13,
                        fontWeight: 950,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Не активен
                    </div>
                  )}
                  <button
                    type="button"
                    className="icon-btn icon-btn--dark"
                    onClick={() => setStatsChallenge(challenge)}
                    title="Статистика"
                    aria-label={`Статистика ${challenge.title}`}
                    style={{ width: 34, height: 34, flex: '0 0 34px' }}
                  >
                    <BarChart3 size={16} />
                  </button>
                </div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 }}>
                {challenge.tasks.length} заданий ·{' '}
                <span style={{ color: rewardColor('coin'), fontWeight: 850 }}>
                  {challenge.rewardCoins} монет
                </span>{' '}
                ·{' '}
                <span style={{ color: rewardColor('star'), fontWeight: 850 }}>
                  {challenge.rewardStars} звезд
                </span>{' '}
                ·{' '}
                <span style={{ color: rewardColor('experience'), fontWeight: 850 }}>
                  {challenge.rewardExperience} опыта
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <ChallengeMetric label="Записались" value={challenge.stats.participantsCount} />
                <ChallengeMetric label="Прошли" value={challenge.stats.completedCount} />
                <ChallengeMetric
                  label="Процент"
                  value={
                    challenge.stats.participantsCount > 0
                      ? Math.round(
                          (challenge.stats.completedCount / challenge.stats.participantsCount) *
                            100,
                        )
                      : 0
                  }
                  suffix="%"
                />
                <ChallengeMetric label="Забрали" value={challenge.stats.rewardClaimedCount} />
              </div>
              <div style={{ display: 'grid', gap: 7 }}>
                {challenge.tasks.map((task) => {
                  const progressPercent =
                    challenge.stats.participantsCount > 0
                      ? Math.round((task.completedCount / challenge.stats.participantsCount) * 100)
                      : 0;
                  return (
                    <div
                      key={task.id ?? `${task.type}-${task.sortOrder}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            color: 'var(--ink)',
                            fontSize: 12,
                            fontWeight: 900,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {task.title || taskTypeLabel(task.type)}
                        </div>
                        <div
                          style={{
                            marginTop: 5,
                            height: 5,
                            overflow: 'hidden',
                            borderRadius: 999,
                            background: 'rgba(15,23,42,0.08)',
                          }}
                        >
                          <div
                            style={{
                              width: `${progressPercent}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: 'rgba(15,23,42,0.82)',
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 900 }}>
                        {task.completedCount}/{challenge.stats.participantsCount}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => openEditForm(challenge)}
                  style={{ padding: '8px 12px' }}
                >
                  Править
                </button>
                {!challenge.isActive && (
                  <button
                    type="button"
                    className="chip chip--active"
                    onClick={() => activate.mutate(challenge.id)}
                    disabled={activate.isPending}
                    style={{ padding: '8px 12px' }}
                  >
                    Активировать
                  </button>
                )}
                {challenge.isActive && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => deactivate.mutate(challenge.id)}
                    disabled={deactivate.isPending}
                    style={{ padding: '8px 12px' }}
                  >
                    Отключить
                  </button>
                )}
                <button
                  type="button"
                  className={challenge.joinEnabled ? 'chip chip--active' : 'chip'}
                  onClick={() =>
                    joinToggle.mutate({ id: challenge.id, enabled: !challenge.joinEnabled })
                  }
                  disabled={joinToggle.isPending}
                  style={{ padding: '8px 12px' }}
                >
                  {challenge.joinEnabled ? 'Вход открыт' : 'Открыть вход'}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {statsChallenge &&
        createPortal(
          <ChallengeStatsModal
            challenge={statsChallenge}
            onClose={() => setStatsChallenge(null)}
          />,
          document.body,
        )}
    </section>
  );
}

function ChallengeStatsModal({
  challenge,
  onClose,
}: {
  challenge: AdminWeeklyChallenge;
  onClose: () => void;
}): JSX.Element {
  const completionPercent =
    challenge.stats.participantsCount > 0
      ? Math.round((challenge.stats.completedCount / challenge.stats.participantsCount) * 100)
      : 0;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1000 }}>
      <section
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(720px, calc(100vw - 28px))', maxHeight: '86dvh', overflow: 'hidden' }}
      >
        <div className="modal-title">{challenge.title}</div>
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <ChallengeMetric label="Записались" value={challenge.stats.participantsCount} />
          <ChallengeMetric label="Прошли" value={challenge.stats.completedCount} />
          <ChallengeMetric label="Процент" value={completionPercent} suffix="%" />
          <ChallengeMetric label="Отказались" value={challenge.stats.declinedCount} />
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 900 }}>Задания</div>
          {challenge.tasks.map((task) => {
            const progressPercent =
              challenge.stats.participantsCount > 0
                ? Math.round((task.completedCount / challenge.stats.participantsCount) * 100)
                : 0;
            return (
              <div
                key={task.id ?? `${task.type}-${task.sortOrder}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--ink)',
                      fontSize: 12,
                      fontWeight: 900,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.title || taskTypeLabel(task.type)}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      height: 5,
                      overflow: 'hidden',
                      borderRadius: 999,
                      background: 'rgba(15,23,42,0.08)',
                    }}
                  >
                    <div
                      style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: 'rgba(15,23,42,0.82)',
                      }}
                    />
                  </div>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 900 }}>
                  {task.completedCount}/{challenge.stats.participantsCount}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 8, minHeight: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 900 }}>
            Игроки ({challenge.players.length})
          </div>
          {challenge.players.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 800 }}>
              Пока никто не записался.
            </div>
          ) : (
            <div
              className="no-scrollbar"
              style={{ display: 'grid', gap: 6, maxHeight: '34dvh', overflow: 'auto' }}
            >
              {challenge.players.map((player) => (
                <div
                  key={player.userId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                    gap: 8,
                    alignItems: 'center',
                    borderRadius: 12,
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.34)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: 'var(--ink)',
                        fontSize: 12,
                        fontWeight: 900,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {player.displayName}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        color: 'var(--muted)',
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    >
                      вошел {shortDateText(player.joinedAt)}
                    </div>
                  </div>
                  <div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 950 }}>
                    {player.tasksCompleted}/{player.tasksTotal}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 900 }}>
                    {player.rewardClaimedAt ? 'награда' : `${player.progressPercent}%`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="modal-primary btn--cta" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </section>
    </div>
  );
}

function ChallengeMetric({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number;
  suffix?: string;
}): JSX.Element {
  return (
    <div className="glass" style={{ borderRadius: 14, padding: 9, boxShadow: 'none' }}>
      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>{label}</div>
      <div style={{ marginTop: 2, color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>
        {value}
        {suffix}
      </div>
    </div>
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
