import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArsenichDestinationKey } from '../api/arsenich.js';
import { fetchAdminUsers } from './api.js';
import {
  fetchAdminArsenichIntroductions,
  resetAdminArsenichIntroduction,
  saveAdminArsenichIntroduction,
  type AdminArsenichIntroduction,
} from './arsenichApi.js';

const labels: Record<ArsenichDestinationKey, string> = {
  main: 'Главный экран',
  daily: 'Ежедневная игра',
  sections: 'Разделы',
  training: 'Тренировки: общая страница',
  'training-course': 'Тренировки: начальный уровень',
  'training-advanced': 'Тренировки: продвинутый уровень',
  'training-open': 'Тренировки: открытая тренировка',
  tasks: 'Задания',
  shop: 'Инвентарь и магазин',
  'bonus-games': 'Бонусные игры',
  amateur: 'Любительский раздел',
  chat: 'Чат',
  'profile-main': 'Главная профиля',
};

export function ArsenichAdmin(): JSX.Element {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'arsenich', 'introductions'],
    queryFn: fetchAdminArsenichIntroductions,
  });
  const [key, setKey] = useState<ArsenichDestinationKey>('daily');
  const selected = query.data?.introductions.find((item) => item.destinationKey === key);
  const [draft, setDraft] = useState<AdminArsenichIntroduction | null>(null);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setDraft(
      selected ? { ...selected, windows: selected.windows.map((item) => ({ ...item })) } : null,
    );
  }, [selected]);
  const users = useQuery({
    queryKey: ['admin', 'arsenich', 'users', submittedSearch],
    queryFn: () =>
      fetchAdminUsers({
        q: submittedSearch,
        role: 'all',
        level: 'all',
        sort: 'name_asc',
        minGoals: '',
        minAccuracy: '',
      }),
    enabled: submittedSearch.length > 0,
  });
  const save = useMutation({
    mutationFn: () =>
      saveAdminArsenichIntroduction(key, { enabled: draft!.enabled, windows: draft!.windows }),
    onSuccess: ({ introduction }) => {
      client.setQueryData<{ introductions: AdminArsenichIntroduction[] }>(
        ['admin', 'arsenich', 'introductions'],
        (current) =>
          current
            ? {
                introductions: current.introductions.map((item) =>
                  item.destinationKey === key ? introduction : item,
                ),
              }
            : current,
      );
      setNotice('Сохранено. Уже просмотревшие игроки не увидят окно повторно.');
    },
  });
  const reset = useMutation({
    mutationFn: () => resetAdminArsenichIntroduction(key, selectedUserId!),
    onSuccess: () => setNotice('Просмотр сброшен. Игрок снова увидит это знакомство.'),
  });
  if (query.isLoading)
    return (
      <section className="admin-panel">
        <h1>Арсенич</h1>
        <p>Загрузка…</p>
      </section>
    );
  if (!draft)
    return (
      <section className="admin-panel">
        <h1>Арсенич</h1>
        <p role="alert">Не удалось загрузить настройки.</p>
      </section>
    );
  const window = draft.windows[0]!;
  return (
    <section className="admin-panel arsenich-admin">
      <h1>Арсенич</h1>
      <p>Одноразовые знакомства игрока с разделами приложения.</p>
      {notice && <p role="status">{notice}</p>}
      <div className="admin-form-stack">
        <label>
          Раздел
          <select
            value={key}
            onChange={(event) => setKey(event.target.value as ArsenichDestinationKey)}
          >
            {query.data!.introductions.map((item) => (
              <option value={item.destinationKey} key={item.destinationKey}>
                {labels[item.destinationKey]}
              </option>
            ))}
          </select>
          <small className="admin-field-help">
            Экран, при первом открытии которого появится реплика.
          </small>
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />{' '}
          Показывать знакомство
          <small className="admin-field-help">
            Если выключить, новые игроки не увидят это окно.
          </small>
        </label>
        <label>
          Заголовок
          <input
            value={window.title}
            onChange={(event) =>
              setDraft({ ...draft, windows: [{ ...window, title: event.target.value }] })
            }
          />
          <small className="admin-field-help">
            Короткая прямая реплика Арсенича, а не название раздела.
          </small>
        </label>
        <label>
          Реплика
          <textarea
            value={window.body}
            onChange={(event) =>
              setDraft({ ...draft, windows: [{ ...window, body: event.target.value }] })
            }
          />
          <small className="admin-field-help">
            Первый абзац объясняет раздел. Строки с «- » показываются отдельными пунктами с
            вертикальной чертой.
          </small>
        </label>
        <label>
          Кнопка
          <input
            value={window.ctaLabel}
            onChange={(event) =>
              setDraft({ ...draft, windows: [{ ...window, ctaLabel: event.target.value }] })
            }
          />
          <small className="admin-field-help">
            Закрывает модалку и сохраняет просмотр навсегда.
          </small>
        </label>
        <button
          className="btn btn--cta"
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Сохранить
        </button>
        <fieldset>
          <legend>Сброс просмотра игроку</legend>
          <label>
            Имя, фамилия, Telegram или VK ID
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
            <small className="admin-field-help">
              UUID вводить не нужно: найди игрока по понятным данным.
            </small>
          </label>
          <button
            type="button"
            onClick={() => {
              setSubmittedSearch(search.trim());
              setSelectedUserId(null);
            }}
          >
            Найти игрока
          </button>
          {users.data?.users.map((user) => (
            <label key={user.id}>
              <input
                type="radio"
                name="arsenich-reset-user"
                checked={selectedUserId === user.id}
                onChange={() => setSelectedUserId(user.id)}
              />{' '}
              {user.displayName}
              <small className="admin-field-help">
                TG: {user.providers.telegram?.id ?? 'нет'} · VK: {user.providers.vk?.id ?? 'нет'}
              </small>
            </label>
          ))}
          <button
            type="button"
            disabled={!selectedUserId || reset.isPending}
            onClick={() => reset.mutate()}
          >
            Сбросить просмотр выбранного раздела
          </button>
        </fieldset>
      </div>
    </section>
  );
}
