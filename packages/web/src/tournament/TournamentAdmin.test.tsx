import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './adminApi.js';
import { TournamentAdmin } from './TournamentAdmin.js';

describe('TournamentAdmin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it('opens the operational applications and payments screen', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({
      tournaments: [
        {
          id: '00000000-0000-4000-8000-000000000901',
          slug: 'admin-cup',
          title: 'Кубок админа',
          description: '',
          status: 'registration',
          regularSource: 'head_to_head',
          revision: 2,
          participantCount: 3,
        },
      ],
    });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({
      participants: [
        {
          id: '00000000-0000-4000-8000-000000000902',
          user_id: '00000000-0000-4000-8000-000000000903',
          display_name: 'Игрок на проверке',
          avatar_url: null,
          state: 'applied',
          seed: null,
          entry_fee_coins: 25,
          entry_fee_state: 'pending',
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок админа' }));

    expect(screen.getByRole('button', { name: 'Заявки и оплаты' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Календарь' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Рассылки' })).toBeInTheDocument();
    expect(await screen.findByText('Игрок на проверке')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Одобрить заявку' })).toBeInTheDocument();
  });
});
