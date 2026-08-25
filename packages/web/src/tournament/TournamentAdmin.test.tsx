import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './adminApi.js';
import { TournamentAdmin } from './TournamentAdmin.js';

function dstOverlapTournament(): api.AdminTournament {
  return {
    id: '00000000-0000-4000-8000-000000000941',
    slug: 'dst-overlap-cup',
    title: 'Кубок DST',
    description: 'Позднее вхождение локального времени',
    status: 'draft',
    regularSource: 'head_to_head',
    revision: 7,
    participantCount: 0,
    registrationOpensAt: '2026-11-01T06:10:00.000Z',
    registrationClosesAt: '2026-11-01T06:20:00.000Z',
    startsAt: '2026-11-01T06:30:00.000Z',
    rules: {
      config: {
        regularSource: 'head_to_head',
        timezone: 'America/New_York',
      },
    },
  };
}

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

  it('renders the wizard backdrop outside the app content stacking context', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <div className="app-content" data-testid="app-content">
        <QueryClientProvider client={client}>
          <TournamentAdmin />
        </QueryClientProvider>
      </div>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать турнир' }));

    const appContent = screen.getByTestId('app-content');
    const dialog = screen.getByRole('dialog', { name: 'Создание турнира' });
    const backdrop = dialog.closest<HTMLElement>('.modal-backdrop');
    expect(backdrop).toBeInstanceOf(HTMLElement);
    expect(appContent).not.toContainElement(backdrop);
    expect(backdrop?.parentElement).toBe(document.body);
  });

  it('preserves the admin form styling scope inside the portaled wizard', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <div className="admin-screen">
        <QueryClientProvider client={client}>
          <TournamentAdmin />
        </QueryClientProvider>
      </div>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать турнир' }));

    const titleInput = screen.getByRole('textbox', { name: 'Название' });
    const backdrop = titleInput.closest<HTMLElement>('.modal-backdrop');
    expect(backdrop).toHaveClass('modal-backdrop', 'admin-screen');
    expect(titleInput.matches('.admin-screen input')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '2. Доступ' }));
    expect(
      screen.getByRole('combobox', { name: 'Регистрация' }).matches('.admin-screen select'),
    ).toBe(true);
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
    expect(
      screen.getByRole('spinbutton', { name: 'Раунд 1: побед для серии' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Раунд 1: побед для серии' }), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Раунд 1: порядок площадок' }), {
      target: { value: 'H-H-A-A-H-A-H' },
    });

    fireEvent.click(screen.getByRole('button', { name: '5. Расписание' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Часовой пояс' }), {
      target: { value: 'America/New_York' },
    });
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Переопределения push-шаблонов' }), {
      target: {
        value:
          'tournament.live_soon|Скоро матч {{tournamentTitle}}|До начала {{minutes}} минут|/?view=amateur&section=tournaments',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    expect(screen.getByText('approval · public')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить draft' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'configured-cup',
        startsAt: '2030-09-01T16:00:00.000Z',
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
          notificationOverrides: {
            'tournament.live_soon': {
              title: 'Скоро матч {{tournamentTitle}}',
              body: 'До начала {{minutes}} минут',
              url: '/?view=amateur&section=tournaments',
            },
          },
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

  it('preserves the later DST occurrence when unrelated fields change', async () => {
    const tournament = dstOverlapTournament();
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, description: 'Описание обновлено', revision: 8 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок DST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Описание обновлено' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const body = update.mock.calls[0]?.[2];
    expect(body).toEqual(
      expect.objectContaining({
        registrationOpensAt: '2026-11-01T06:10:00.000Z',
        registrationClosesAt: '2026-11-01T06:20:00.000Z',
        startsAt: '2026-11-01T06:30:00.000Z',
      }),
    );
    expect(Object.keys(body ?? {}).sort()).toEqual([
      'description',
      'registrationClosesAt',
      'registrationOpensAt',
      'rules',
      'startsAt',
      'title',
    ]);
  });

  it('uses the deterministic earlier DST occurrence after the wall time changes', async () => {
    const tournament = dstOverlapTournament();
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, startsAt: '2026-11-01T05:45:00.000Z', revision: 8 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок DST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '5. Расписание' }));
    fireEvent.change(screen.getByLabelText('Старт турнира'), {
      target: { value: '2026-11-01T01:45' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        registrationOpensAt: '2026-11-01T06:10:00.000Z',
        registrationClosesAt: '2026-11-01T06:20:00.000Z',
        startsAt: '2026-11-01T05:45:00.000Z',
      }),
    );
  });

  it('recomputes existing wall times after the tournament timezone changes', async () => {
    const tournament = dstOverlapTournament();
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 8 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок DST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '5. Расписание' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Часовой пояс' }), {
      target: { value: 'Europe/Moscow' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        registrationOpensAt: '2026-10-31T22:10:00.000Z',
        registrationClosesAt: '2026-10-31T22:20:00.000Z',
        startsAt: '2026-10-31T22:30:00.000Z',
      }),
    );
  });

  it('continues to reject nonexistent spring-forward wall times', async () => {
    const tournament = dstOverlapTournament();
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 8 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок DST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '5. Расписание' }));
    fireEvent.change(screen.getByLabelText('Старт турнира'), {
      target: { value: '2026-03-08T02:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('exposes edit, duplicate and guarded hard-delete actions for an empty draft', async () => {
    const tournament = {
      id: '00000000-0000-4000-8000-000000000931',
      slug: 'crud-cup',
      title: 'Кубок CRUD',
      description: 'Черновик для управления',
      status: 'draft',
      regularSource: 'head_to_head' as const,
      revision: 5,
      participantCount: 0,
      registrationOpensAt: null,
      registrationClosesAt: null,
      startsAt: null,
      rules: {
        config: {
          regularSource: 'head_to_head',
          participantLimit: 8,
          playoffSize: 4,
          timezone: 'Europe/Moscow',
          registrationMode: 'open',
          visibility: 'public',
          entryFeeCoins: 0,
          roundRobinCycles: 1,
          roundsPerDay: 1,
          firstRoundLocalTime: '19:00',
          fixtureWindowMs: 3_600_000,
          roundBreakMs: 900_000,
        },
        eligibility: {
          minLevel: null,
          maxLevel: null,
          minGoals: 0,
          minExperience: 0,
          invitedUserIds: [],
          bannedUserIds: [],
        },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, title: 'Кубок CRUD обновлён', revision: 6 },
    });
    const duplicate = vi
      .spyOn(api as never, 'duplicateAdminTournament' as never)
      .mockResolvedValue({
        tournament: { ...tournament, id: '00000000-0000-4000-8000-000000000932', revision: 1 },
      } as never);
    const remove = vi
      .spyOn(api as never, 'deleteAdminTournamentDraft' as never)
      .mockResolvedValue(undefined as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок CRUD' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('Кубок CRUD');
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Кубок CRUD обновлён' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        tournament.id,
        5,
        expect.objectContaining({ title: 'Кубок CRUD обновлён', rules: expect.any(Object) }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Дублировать' }));
    await waitFor(() =>
      expect(duplicate).toHaveBeenCalledWith(tournament.id, {
        slug: 'crud-cup-copy',
        title: 'Копия: Кубок CRUD обновлён',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Удалить draft' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(tournament.id));
  });
});
