import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeeklyChallengeStartModal } from './WeeklyChallengeStartModal.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WeeklyChallengeStartModal', () => {
  it('shows the pending challenge with clear Moscow dates and acknowledges it on close', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/weekly-challenge/starts/pending')) {
        return new Response(
          JSON.stringify({
            challenge: {
              id: '11111111-1111-4111-8111-111111111111',
              title: 'Ледовая неделя',
              description: 'Выполни все задания до воскресенья',
              status: 'running',
              startAt: '2026-09-06T21:00:00.000Z',
              endAt: '2026-09-13T09:00:00.000Z',
              reward: { coins: 100, stars: 25, experience: 25, tokens: 0 },
              rewardClaimedAt: null,
              tasks: [
                {
                  id: 'task-1',
                  type: 'channel_posts_commented',
                  title: 'Прокомментировать 3 поста',
                  target: 3,
                  progress: 0,
                  completed: false,
                },
              ],
              hasProgress: false,
              canClaimReward: false,
              allTasksCompleted: false,
              serverNow: '2026-09-15T08:00:00.000Z',
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/weekly-challenge/starts/') && init?.method === 'POST') {
        return new Response(JSON.stringify({ challenge: null }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WeeklyChallengeStartModal enabled />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('dialog', { name: 'Новый недельный челлендж' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ледовая неделя')).toBeInTheDocument();
    expect(screen.getByText('Прокомментировать посты канала')).toBeInTheDocument();
    expect(screen.queryByText('Прокомментировать 3 поста')).toBeNull();
    expect(screen.getByText('Недельный челлендж стартовал!')).toBeInTheDocument();
    expect(screen.getByText('Старт')).toBeInTheDocument();
    expect(screen.getByText('Финиш')).toBeInTheDocument();
    expect(screen.getByText('Понедельник')).toBeInTheDocument();
    expect(screen.getByText('7 сен · 00:00')).toBeInTheDocument();
    expect(screen.getByText('Воскресенье')).toBeInTheDocument();
    expect(screen.getByText('13 сен · 12:00')).toBeInTheDocument();
    expect(screen.queryByText('Монеты')).toBeNull();
    expect(screen.queryByText('Звёзды')).toBeNull();
    expect(screen.queryByLabelText('Токены: 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Идёт сейчас')).toBeNull();
    expect(screen.queryByText(/Цель/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/weekly-challenge/starts/11111111-1111-4111-8111-111111111111/acknowledge',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(screen.queryByRole('dialog', { name: 'Новый недельный челлендж' })).toBeNull();
  });

  it('does not request or show a challenge when disabled for a beginner', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WeeklyChallengeStartModal enabled={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
