import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/apiFetch.js';
import type { AdminWeeklyChallenge } from './api.js';
import { WeeklyChallengesAdmin } from './WeeklyChallengesAdmin.js';

vi.mock('../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));

function challenge(id: string, title: string): AdminWeeklyChallenge {
  return {
    id,
    title,
    description: '',
    startAt: '2026-09-13T21:00:00.000Z',
    endAt: '2026-09-20T09:00:00.000Z',
    isActive: id === 'current',
    rewardCoins: 100,
    rewardStars: 5,
    rewardExperience: 50,
    tasks: [
      {
        id: 'task-1',
        type: 'goals_scored',
        title: null,
        target: 500,
        sortOrder: 0,
        completedCount: 1,
      },
    ],
    stats: { participantsCount: 2, completedCount: 1, rewardClaimedCount: 0 },
    players: [
      {
        userId: 'u1',
        displayName: 'Regular Player',
        avatarUrl: null,
        rewardClaimedAt: null,
        tasksCompleted: 1,
        tasksTotal: 1,
        progressPercent: 100,
      },
    ],
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
  };
}

const dashboard = {
  enabled: true,
  current: challenge('current', 'Неделя снайпера'),
  next: challenge('next', 'Неделя побед'),
  history: [challenge('history', 'Прошлая неделя')],
};

function renderAdmin(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WeeklyChallengesAdmin />
    </QueryClientProvider>,
  );
}

describe('WeeklyChallengesAdmin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiFetch).mockResolvedValue(dashboard);
  });

  it('renders read-only current and history, a next editor and the global switch', async () => {
    renderAdmin();
    expect(
      await screen.findByRole('checkbox', { name: 'Недельные челленджи включены' }),
    ).toBeChecked();
    expect(screen.getByText('Действующая неделя')).toBeInTheDocument();
    expect(screen.getByText('Челлендж на следующую неделю')).toBeInTheDocument();
    expect(screen.getByText('Прошлая неделя')).toBeInTheDocument();
    expect(screen.queryByText('Активировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Создать')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Дата начала')).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Название' })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('Неделя побед');
    fireEvent.click(screen.getByRole('button', { name: 'Статистика Неделя снайпера' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Regular Player')).toBeInTheDocument();
    expect(within(dialog).queryByText('Отказались')).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Закрыть' }).closest('.modal-header'),
    ).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves edited content and rewards without IDs or calendar fields', async () => {
    renderAdmin();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Название' }), {
      target: { value: 'Новая неделя' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Монеты' }), {
      target: { value: '250' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Цель задания 1' }), {
      target: { value: '750' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/admin/weekly-challenges/next', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Новая неделя',
          description: '',
          rewardCoins: 250,
          rewardStars: 5,
          rewardExperience: 50,
          tasks: [{ type: 'goals_scored', title: '', target: 750, sortOrder: 0 }],
        }),
      }),
    );
  });

  it('toggles the global setting and removes the next editor while disabled', async () => {
    renderAdmin();
    const toggle = await screen.findByRole('checkbox', { name: 'Недельные челленджи включены' });
    vi.mocked(apiFetch).mockResolvedValue({ ...dashboard, enabled: false, next: null });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(apiFetch).toHaveBeenCalledWith('/admin/weekly-challenges/settings', {
      method: 'PATCH',
      body: '{"enabled":false}',
    });
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(screen.getByText('Неделя снайпера')).toBeInTheDocument();
  });

  it('keeps all task fields in the responsive task card', async () => {
    renderAdmin();
    const taskType = await screen.findByRole('combobox', { name: 'Тип задания 1' });
    const fields = taskType.closest('.weekly-challenge-admin-task__fields');
    expect(fields).not.toBeNull();
    expect(fields).toContainElement(screen.getByRole('textbox', { name: 'Название задания 1' }));
    expect(fields).toContainElement(screen.getByRole('spinbutton', { name: 'Цель задания 1' }));
    expect(fields).toContainElement(screen.getByRole('button', { name: 'Удалить задание 1' }));
  });

  it('reports save errors visibly and preserves the draft for retry', async () => {
    renderAdmin();
    const title = await screen.findByRole('textbox', { name: 'Название' });
    fireEvent.change(title, { target: { value: 'Мой черновик' } });
    vi.mocked(apiFetch).mockRejectedValue(new Error('conflict'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить');
    expect(title).toHaveValue('Мой черновик');
  });
});
