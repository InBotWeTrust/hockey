import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('configures tournament rules instead of showing placeholder wizard steps', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    const create = vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000911',
        slug: 'configured-cup',
        title: 'Настраиваемый кубок',
        description: 'Полная проверка мастера',
        status: 'draft',
        regularSource: 'head_to_head',
        revision: 1,
        participantCount: 0,
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать турнир' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Настраиваемый кубок' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Slug' }), {
      target: { value: 'configured-cup' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Полная проверка мастера' },
    });

    fireEvent.click(screen.getByRole('button', { name: '2. Доступ' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Регистрация' }), {
      target: { value: 'approval' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Минимум голов' }), {
      target: { value: '1000' },
    });

    fireEvent.click(screen.getByRole('button', { name: '3. Регулярка' }));
    expect(screen.getByRole('spinbutton', { name: 'Кругов' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Туров в день' }), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Шаблон дуэли регулярки' }), {
      target: { value: '00000000-0000-4000-8000-000000000912' },
    });

    fireEvent.click(screen.getByRole('button', { name: '4. Плей-офф' }));
    expect(screen.getByRole('spinbutton', { name: 'Раунд 1: побед для серии' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Раунд 1: побед для серии' }), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Раунд 1: порядок площадок' }), {
      target: { value: 'H-H-A-A-H-A-H' },
    });

    fireEvent.click(screen.getByRole('button', { name: '5. Расписание' }));
    fireEvent.change(screen.getByLabelText('Старт турнира'), {
      target: { value: '2030-09-01T12:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: '6. Награды' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Награды регулярки' }), {
      target: { value: '1,100,50,3' },
    });

    fireEvent.click(screen.getByRole('button', { name: '7. Уведомления' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Напоминания до старта, минуты' }), {
      target: { value: '60,15' },
    });

    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    expect(screen.getByText('approval · public')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить draft' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'configured-cup',
        startsAt: '2030-09-01T09:00:00.000Z',
        rules: expect.objectContaining({
          config: expect.objectContaining({
            registrationMode: 'approval',
            roundsPerDay: 2,
          }),
          eligibility: expect.objectContaining({ minGoals: 1000 }),
          regularDuelTemplateId: '00000000-0000-4000-8000-000000000912',
          playoffRounds: expect.arrayContaining([
            expect.objectContaining({
              roundNumber: 1,
              winsRequired: 4,
              homeSequence: ['H', 'H', 'A', 'A', 'H', 'A', 'H'],
            }),
          ]),
          notificationReminderOffsetsMs: [3_600_000, 900_000],
          stageRewards: expect.objectContaining({
            regular: [{ place: 1, experience: 100, coins: 50, stars: 3 }],
          }),
        }),
      }),
    );
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
    vi.spyOn(api, 'fetchAdminTournamentSchedule').mockResolvedValue({ fixtures: [] });
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
    fireEvent.click(screen.getByRole('button', { name: 'Календарь' }));
    expect(await screen.findByText('Календарь пока пуст.')).toBeInTheDocument();
  });

  it('updates the operational lifecycle controls after publishing without leaving the screen', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({
      tournaments: [
        {
          id: '00000000-0000-4000-8000-000000000921',
          slug: 'lifecycle-cup',
          title: 'Кубок переходов',
          description: '',
          status: 'draft',
          regularSource: 'head_to_head',
          revision: 3,
          participantCount: 0,
        },
      ],
    });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const publish = vi.spyOn(api, 'publishAdminTournament').mockResolvedValue({
      tournamentId: '00000000-0000-4000-8000-000000000921',
      status: 'registration',
      revision: 3,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок переходов' }));
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать набор' }));

    expect(await screen.findByText('registration · ревизия 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сгенерировать календарь' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать набор' })).not.toBeInTheDocument();
    expect(publish).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000921', 3);
  });
});
