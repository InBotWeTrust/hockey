import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentOperations } from './TournamentOperations.js';
import type { AdminTournament } from './adminApi.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');

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
  it('explains that a generated schedule still needs publication', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/schedule')) {
        return new Response(JSON.stringify({ fixtures: [], matchdays: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/participants')) {
        return new Response(JSON.stringify({ participants: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{ ...tournament(), status: 'scheduling' }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Календарь' }));
    expect(
      await screen.findByText(/Календарь создан, но участники его ещё не видят/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Календарь уже опубликован/)).not.toBeInTheDocument();
  });

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
        return new Response(
          JSON.stringify({
            fixtures: [],
            matchdays: [
              {
                id: 'day-1',
                number: 1,
                localDate: '2030-09-01',
                startsAt: '2030-09-01T07:00:00.000Z',
                endsAt: '2030-09-02T07:00:00.000Z',
              },
            ],
          }),
          {
          status: 200,
          headers: { 'content-type': 'application/json' },
          },
        );
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

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    const actionsButton = screen.getByRole('button', { name: 'Действия турнира' });
    expect(actionsButton).toHaveClass('icon-btn');
    expect(actionsButton).toHaveTextContent('');
    fireEvent.click(actionsButton);
    expect(screen.getByRole('button', { name: 'Редактировать турнир' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть действия турнира' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Календарь' }));
    expect(await screen.findByText('Плановое окончание')).toBeInTheDocument();
    expect(screen.getByText(/^1 августа 2030.*\(МСК\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Europe\/Moscow/)).not.toBeInTheDocument();
    expect(await screen.findByText('Турнирный день 1')).toBeInTheDocument();
    expect(screen.queryByText('Календарь пока пуст.')).not.toBeInTheDocument();
    const style = document.createElement('style');
    style.textContent = designSystemCss;
    document.head.append(style);
    try {
      expect(getComputedStyle(screen.getByText('Турнирный день 1')).color).toBe('rgb(23, 50, 77)');
      expect(getComputedStyle(screen.getByText(/1 сентября 2030.*2 сентября 2030/)).color).toBe(
        'rgb(83, 107, 130)',
      );
    } finally {
      style.remove();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Изменить сроки' }));
    expect(onEdit).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByRole('tab', { name: 'Награды' }));
    expect(screen.getByText('Регулярный чемпионат')).toBeInTheDocument();
    expect(screen.getByText('Выплачены')).toBeInTheDocument();
    const editRewards = screen.getByRole('button', { name: 'Изменить награды' });
    expect(editRewards).toHaveClass('icon-btn');
    expect(editRewards).toHaveTextContent('');
    fireEvent.click(editRewards);
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
