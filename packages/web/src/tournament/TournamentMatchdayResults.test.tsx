import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../api/tournament.js';
import { TournamentMatchdayResults } from './TournamentMatchdayResults.js';

describe('TournamentMatchdayResults', () => {
  it('loads completed results by pages and reopens cached rows without another request', async () => {
    const fetchResults = vi
      .spyOn(api, 'fetchTournamentMatchdayResults')
      .mockImplementation(async (_tournamentId, _day, cursor) =>
        cursor === null
          ? {
              results: Array.from({ length: 4 }, (_, index) => ({
                id: `result-${index + 1}`,
                userId: `user-${index + 1}`,
                displayName: `Игрок ${index + 1}`,
                avatarUrl: null,
                goals: 20 - index,
                shots: 30,
                accuracy: (20 - index) / 30,
              })),
              nextCursor: {
                finalizedAt: '2030-09-02T10:00:00.000Z',
                id: 'result-4',
              },
            }
          : {
              results: [
                {
                  id: 'result-5',
                  userId: 'user-5',
                  displayName: 'Игрок 5',
                  avatarUrl: null,
                  goals: 16,
                  shots: 30,
                  accuracy: 16 / 30,
                },
              ],
              nextCursor: null,
            },
      );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <TournamentMatchdayResults
          tournamentId="tournament-1"
          matchdayNumber={2}
          viewerUserId="viewer-1"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Игрок 1')).toBeInTheDocument();
    expect(screen.getByText('20 шайб из 30 · точность 67%')).toBeInTheDocument();
    expect(screen.queryByText('Игрок 5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect(await screen.findByText('Игрок 5')).toBeInTheDocument();
    expect(fetchResults).toHaveBeenLastCalledWith(
      'tournament-1',
      2,
      { finalizedAt: '2030-09-02T10:00:00.000Z', id: 'result-4' },
      4,
    );
    expect(
      client.getQueryData([
        'tournaments',
        'tournament-1',
        'matchdays',
        2,
        'results',
        'viewer-1',
      ]),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
    expect(screen.queryByText('Игрок 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect(screen.getByText('Игрок 5')).toBeInTheDocument();
    await waitFor(() => expect(fetchResults).toHaveBeenCalledTimes(2));
  });
});
