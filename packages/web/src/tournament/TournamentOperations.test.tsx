import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentOperations } from './TournamentOperations.js';
import type { AdminTournament } from './adminApi.js';

function tournament(): AdminTournament {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'winter-cup',
    title: 'Зимний кубок',
    description: '',
    status: 'registration',
    regularSource: 'head_to_head',
    revision: 3,
    participantCount: 0,
    registrationOpensAt: '2030-08-01T07:00:00.000Z',
    registrationClosesAt: '2030-08-31T07:00:00.000Z',
    startsAt: '2030-09-01T07:00:00.000Z',
    projectedEndsAt: '2030-09-12T18:00:00.000Z',
    completedAt: null,
    rewardEditability: { regular: 'paid', playoff: 'editable' },
    rules: {
      config: { timezone: 'Europe/Moscow' },
      stageRewards: {
        regular: [{ place: 1, experience: 100, coins: 50, stars: 3 }],
        playoff: [{ place: 1, experience: 200, coins: 100, stars: 5 }],
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TournamentOperations', () => {
  it('keeps date and reward editing visible and locks only the paid reward stage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/participants')) {
        return new Response(JSON.stringify({ participants: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/schedule')) {
        return new Response(JSON.stringify({ fixtures: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/rewards') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ tournament: { ...tournament(), revision: 4 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const onEdit = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={tournament()}
          onBack={vi.fn()}
          onEdit={onEdit}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Календарь' }));
    expect(await screen.findByText('Плановое окончание')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить сроки' }));
    expect(onEdit).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByRole('tab', { name: 'Награды' }));
    expect(screen.getByText('Регулярный чемпионат')).toBeInTheDocument();
    expect(screen.getByText('Выплачены')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить награды' }));
    expect(
      screen.queryByRole('spinbutton', { name: 'Регулярный чемпионат: coins 1' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Плей-офф: coins 1' }), {
      target: { value: '125' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить награды' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/tournaments/${tournament().id}/rewards`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            expectedRevision: 3,
            playoff: [{ place: 1, experience: 200, coins: 125, stars: 5 }],
          }),
        }),
      ),
    );
  });
});
