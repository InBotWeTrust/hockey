import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, X } from 'lucide-react';
import {
  fetchAdminWeeklyChallenges,
  updateAdminWeeklyChallengeSettings,
  updateNextAdminWeeklyChallenge,
  type AdminWeeklyChallenge,
  type AdminWeeklyChallengeDashboard,
  type AdminWeeklyChallengeInput,
  type AdminWeeklyChallengeTaskType,
} from './api.js';
import { GlassSelect } from '../components/GlassSelect.js';

const queryKey = ['admin', 'weekly-challenges'];
const taskTypeOptions: Array<{ value: AdminWeeklyChallengeTaskType; label: string }> = [
  { value: 'goals_scored', label: 'Забросить шайбы' },
  { value: 'duels_played', label: 'Сыграть дуэли' },
  { value: 'duels_won', label: 'Победить в дуэлях' },
  { value: 'duel_invites_sent', label: 'Пригласить соперников' },
  { value: 'trainings_completed', label: 'Завершить тренировки' },
];

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

function taskTypeLabel(type: AdminWeeklyChallengeTaskType): string {
  return taskTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function toInput(challenge: AdminWeeklyChallenge | null): AdminWeeklyChallengeInput {
  if (!challenge)
    return {
      title: '',
      description: '',
      rewardCoins: 0,
      rewardStars: 0,
      rewardExperience: 0,
      tasks: [{ type: 'goals_scored', title: '', target: 500, sortOrder: 0 }],
    };
  return {
    title: challenge.title,
    description: challenge.description,
    rewardCoins: challenge.rewardCoins,
    rewardStars: challenge.rewardStars,
    rewardExperience: challenge.rewardExperience,
    tasks: challenge.tasks.map((task, index) => ({
      type: task.type,
      title: task.title ?? '',
      target: task.target,
      sortOrder: index,
    })),
  };
}

export function WeeklyChallengesAdmin(): JSX.Element {
  const queryClient = useQueryClient();
  const [statsChallenge, setStatsChallenge] = useState<AdminWeeklyChallenge | null>(null);
  const query = useQuery({ queryKey, queryFn: fetchAdminWeeklyChallenges });
  const updateDashboard = (data: AdminWeeklyChallengeDashboard): void => {
    queryClient.setQueryData(queryKey, data);
  };
  const settings = useMutation({
    mutationFn: updateAdminWeeklyChallengeSettings,
    onSuccess: updateDashboard,
  });

  if (query.isPending) return <p>Загрузка недельных челленджей…</p>;
  if (query.isError) return <p role="alert">Не удалось загрузить недельные челленджи.</p>;
  const data = query.data;
  return (
    <section className="weekly-challenge-admin">
      <h2 className="section-label">Еженедельные челленджи</h2>
      <section className="glass weekly-challenge-admin__card">
        <label className="weekly-challenge-admin__toggle">
          <input
            type="checkbox"
            checked={data.enabled}
            disabled={settings.isPending}
            onChange={(event) => settings.mutate(event.target.checked)}
          />
          Недельные челленджи включены
        </label>
        <p className="weekly-challenge-admin__copy">
          Отключение отменяет запуск следующих недель. Действующая неделя продолжается до
          завершения.
        </p>
        {settings.isError && <p role="alert">Не удалось изменить настройку. Попробуйте ещё раз.</p>}
      </section>

      <h3>Действующая неделя</h3>
      {data.current ? (
        <ChallengeCard challenge={data.current} onStats={setStatsChallenge} />
      ) : (
        <p className="weekly-challenge-admin__copy">Сейчас нет действующего челленджа.</p>
      )}

      <h3>Челлендж на следующую неделю</h3>
      <NextChallengeEditor
        key={data.next?.id ?? 'first-week'}
        challenge={data.next}
        onSaved={updateDashboard}
        settingsPending={settings.isPending}
      />

      <h3>История</h3>
      {data.history.length === 0 ? (
        <p className="weekly-challenge-admin__copy">Завершённых челленджей пока нет.</p>
      ) : (
        data.history.map((challenge) => (
          <ChallengeCard key={challenge.id} challenge={challenge} onStats={setStatsChallenge} />
        ))
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

function NextChallengeEditor({
  challenge,
  onSaved,
  settingsPending,
}: {
  challenge: AdminWeeklyChallenge | null;
  onSaved: (data: AdminWeeklyChallengeDashboard) => void;
  settingsPending: boolean;
}): JSX.Element {
  const [form, setForm] = useState(() => toInput(challenge));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: updateNextAdminWeeklyChallenge,
    onSuccess: (data) => {
      onSaved(data);
      if (data.next) setForm(toInput(data.next));
      setSaved(true);
    },
  });
  const busy = save.isPending || settingsPending;
  const update = (patch: Partial<AdminWeeklyChallengeInput>): void => {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };
  const updateTask = (
    index: number,
    patch: Partial<AdminWeeklyChallengeInput['tasks'][number]>,
  ): void => {
    update({
      tasks: form.tasks.map((task, taskIndex) =>
        taskIndex === index ? { ...task, ...patch } : task,
      ),
    });
  };
  return (
    <form
      className="glass weekly-challenge-admin__card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy)
          save.mutate({
            ...form,
            title: form.title.trim(),
            description: form.description.trim(),
            tasks: form.tasks.map((task, index) => ({
              ...task,
              title: task.title?.trim() ?? '',
              sortOrder: index,
            })),
          });
      }}
    >
      <p className="weekly-challenge-admin__copy">
        {challenge
          ? `${dateText(challenge.startAt)} — ${dateText(challenge.endAt)} (МСК). Даты назначаются автоматически.`
          : 'Первая неделя начнётся в ближайший будущий понедельник. Даты назначаются автоматически при сохранении.'}
      </p>
      <fieldset disabled={busy} className="weekly-challenge-admin__fieldset">
        <AdminField label="Название">
          <input
            required
            maxLength={120}
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </AdminField>
        <AdminField label="Описание">
          <textarea
            maxLength={2000}
            rows={3}
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
          />
        </AdminField>
        <div className="weekly-challenge-admin__rewards">
          {(
            [
              { key: 'rewardCoins', label: 'Монеты' },
              { key: 'rewardStars', label: 'Звёзды' },
              { key: 'rewardExperience', label: 'Опыт' },
            ] as const
          ).map(({ key, label }) => (
            <AdminField key={key} label={label}>
              <input
                type="number"
                required
                min={0}
                max={10_000_000}
                step={1}
                value={form[key]}
                onChange={(event) => update({ [key]: event.target.valueAsNumber })}
              />
            </AdminField>
          ))}
        </div>
        <h4>Задания</h4>
        {form.tasks.map((task, index) => (
          <div key={index} className="glass weekly-challenge-admin-task">
            <div className="weekly-challenge-admin-task__fields">
              <div className="weekly-challenge-admin__field">
                <span>Тип</span>
                <GlassSelect
                  value={task.type}
                  options={taskTypeOptions}
                  onChange={(value) => updateTask(index, { type: value })}
                  ariaLabel={`Тип задания ${index + 1}`}
                />
              </div>
              <AdminField label={`Название задания ${index + 1}`}>
                <input
                  maxLength={120}
                  value={task.title ?? ''}
                  onChange={(event) => updateTask(index, { title: event.target.value })}
                />
              </AdminField>
              <AdminField label={`Цель задания ${index + 1}`}>
                <input
                  type="number"
                  required
                  min={1}
                  max={1_000_000}
                  step={1}
                  value={task.target}
                  onChange={(event) => updateTask(index, { target: event.target.valueAsNumber })}
                />
              </AdminField>
              <button
                type="button"
                className="btn btn--ghost weekly-challenge-admin-task__remove"
                aria-label={`Удалить задание ${index + 1}`}
                disabled={form.tasks.length === 1}
                onClick={() =>
                  update({ tasks: form.tasks.filter((_, taskIndex) => taskIndex !== index) })
                }
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
        <div className="weekly-challenge-admin__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={form.tasks.length >= 12}
            onClick={() =>
              update({
                tasks: [
                  ...form.tasks,
                  { type: 'goals_scored', title: '', target: 100, sortOrder: form.tasks.length },
                ],
              })
            }
          >
            Добавить задание
          </button>
          <button type="submit" className="btn btn--cta" disabled={!form.title.trim()}>
            Сохранить
          </button>
        </div>
      </fieldset>
      {save.isError && (
        <p role="alert">Не удалось сохранить. Обновите данные или попробуйте ещё раз.</p>
      )}
      {saved && <p role="status">Следующая неделя сохранена.</p>}
    </form>
  );
}

function ChallengeCard({
  challenge,
  onStats,
}: {
  challenge: AdminWeeklyChallenge;
  onStats: (challenge: AdminWeeklyChallenge) => void;
}): JSX.Element {
  return (
    <article className="glass weekly-challenge-admin__card">
      <div className="modal-header">
        <h4>{challenge.title}</h4>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Статистика ${challenge.title}`}
          onClick={() => onStats(challenge)}
        >
          <BarChart3 size={16} />
        </button>
      </div>
      <p className="weekly-challenge-admin__copy">
        {dateText(challenge.startAt)} — {dateText(challenge.endAt)} (МСК)
      </p>
      {challenge.description && <p>{challenge.description}</p>}
      <p>
        Монеты: {challenge.rewardCoins} · Звёзды: {challenge.rewardStars} · Опыт:{' '}
        {challenge.rewardExperience}
      </p>
      <ChallengeMetrics challenge={challenge} />
      <TaskStats challenge={challenge} />
    </article>
  );
}

function ChallengeMetrics({ challenge }: { challenge: AdminWeeklyChallenge }): JSX.Element {
  return (
    <div className="weekly-challenge-admin__metrics">
      <div>
        Участники <strong>{challenge.stats.participantsCount}</strong>
      </div>
      <div>
        Выполнили <strong>{challenge.stats.completedCount}</strong>
      </div>
      <div>
        Получили награду <strong>{challenge.stats.rewardClaimedCount}</strong>
      </div>
    </div>
  );
}

function TaskStats({ challenge }: { challenge: AdminWeeklyChallenge }): JSX.Element {
  return (
    <div className="weekly-challenge-admin__tasks">
      {challenge.tasks.map((task, index) => (
        <div key={task.id ?? index}>
          <span>
            {task.title || taskTypeLabel(task.type)} · Цель: {task.target}
          </span>
          <span>
            {task.completedCount}/{challenge.stats.participantsCount} выполнили
          </span>
        </div>
      ))}
    </div>
  );
}

function ChallengeStatsModal({
  challenge,
  onClose,
}: {
  challenge: AdminWeeklyChallenge;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Статистика ${challenge.title}`}
        className="modal-card weekly-challenge-admin__stats"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{challenge.title}</h3>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="modal-copy">
          Участники — игроки с прогрессом хотя бы в одном задании этой недели.
        </p>
        <ChallengeMetrics challenge={challenge} />
        <TaskStats challenge={challenge} />
        <h4>Игроки ({challenge.players.length})</h4>
        {challenge.players.length === 0 ? (
          <p className="modal-copy">Пока нет игроков с прогрессом.</p>
        ) : (
          <div className="weekly-challenge-admin__players">
            {challenge.players.map((player) => (
              <div key={player.userId}>
                <span>{player.displayName}</span>
                <span>
                  {player.tasksCompleted}/{player.tasksTotal}
                </span>
                <span>
                  {player.rewardClaimedAt ? 'Награда получена' : `${player.progressPercent}%`}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-primary btn--cta" onClick={onClose}>
            Готово
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminField({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label className="weekly-challenge-admin__field">
      <span>{label}</span>
      {children}
    </label>
  );
}
