import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from './adminApi.js';
import { TournamentAdmin } from './TournamentAdmin.js';

describe('TournamentAdmin', () => {
  it('shows the tournament list and all wizard stages', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Турниров пока нет')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать турнир' })).toBeInTheDocument();
  });
});
