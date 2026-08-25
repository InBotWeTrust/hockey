import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './adminApi.js';
import { TournamentAdmin } from './TournamentAdmin.js';

async function chooseGlassOption(label: string, option: string | RegExp): Promise<void> {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

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

  it('uses compact described fields, custom selects and collapsed advanced settings', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000949',
        slug: 'compact-cup',
        title: 'Компактный кубок',
        description: 'Короткое описание',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const dialog = screen.getByRole('dialog', { name: 'Создание турнира' });
    expect(dialog.style.height).toContain('--app-viewport-height');
    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveClass(
      'tournament-admin-textarea',
    );
    const fields = Array.from(dialog.querySelectorAll<HTMLElement>('[data-tournament-field]'));
    expect(fields.length).toBeGreaterThanOrEqual(2);
    for (const field of fields) {
      expect(field.querySelector('.tournament-admin-field__help')?.textContent?.trim()).not.toBe(
        '',
      );
    }

    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Компактный кубок' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    const registration = await screen.findByRole('combobox', { name: 'Регистрация' });
    expect(registration.tagName).toBe('BUTTON');
    expect(dialog.querySelector('select')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    const advanced = screen.getByText('Тонкие настройки очков').closest('details');
    expect(advanced).not.toHaveAttribute('open');
  });

  it('waits for the latest save before Done closes the wizard and opens operations', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000948',
      slug: 'flush-cup',
      title: 'Кубок очереди',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 0,
      rules: { config: { regularSource: 'head_to_head' } },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    let resolveUpdate!: (value: { tournament: api.AdminTournament }) => void;
    const update = vi.spyOn(api, 'updateAdminTournament').mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок очереди' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Последняя версия' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    expect(update).toHaveBeenCalledWith(
      tournament.id,
      4,
      expect.objectContaining({ description: 'Последняя версия' }),
    );
    expect(screen.getByRole('dialog', { name: 'Создание турнира' })).toBeInTheDocument();

    await act(async () => {
      resolveUpdate({
        tournament: { ...tournament, description: 'Последняя версия', revision: 5 },
      });
    });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Создание турнира' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Заявки и оплаты' })).toBeInTheDocument();
    expect(
      screen.queryByRole('alertdialog', { name: 'Закрыть без сохранения?' }),
    ).not.toBeInTheDocument();
  });

  it('opens a wide sequential wizard without exposing slug and creates the draft after step one', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    const create = vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000950',
        slug: 'kubok-severa',
        title: 'Кубок Севера',
        description: 'Описание',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const dialog = screen.getByRole('dialog', { name: 'Создание турнира' });
    expect(dialog).toHaveClass('tournament-wizard');
    expect(screen.queryByRole('textbox', { name: 'Slug' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Доступ' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Кубок Севера' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Описание' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('slug');
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Регистрация' })).toBeInTheDocument();
  });

  it('prevents a double tap from creating duplicate tournament drafts', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    let resolveCreate!: (value: { tournament: api.AdminTournament }) => void;
    const create = vi.spyOn(api, 'createAdminTournament').mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Один черновик' },
    });
    const next = screen.getByRole('button', { name: 'Далее' });
    fireEvent.click(next);
    fireEvent.click(next);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();

    resolveCreate({
      tournament: {
        id: 'draft-1',
        slug: 'odin-chernovik',
        title: 'Один черновик',
        description: '',
        status: 'draft',
        regularSource: 'head_to_head',
        revision: 1,
        participantCount: 0,
      },
    });
    expect(await screen.findByRole('combobox', { name: 'Регистрация' })).toBeInTheDocument();
  });

  it('keeps an invalid reward row dirty instead of autosaving its deletion', async () => {
    const tournament: api.AdminTournament = {
      id: 'reward-cup',
      slug: 'reward-cup',
      title: 'Кубок наград',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 3,
      participantCount: 0,
      rules: {
        config: { regularSource: 'head_to_head' },
        stageRewards: { regular: [{ place: 1, experience: 100, coins: 50, stars: 3 }] },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок наград' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '6. Награды' }));
    const place = screen.getByRole('spinbutton', { name: 'Место награды регулярки 1' });
    fireEvent.change(place, { target: { value: '' } });

    expect(place).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните место награды');
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Создание турнира' })).toBeInTheDocument();
  });

  it('returns to saved state when invalid input is restored to the saved snapshot', async () => {
    const tournament: api.AdminTournament = {
      id: 'restored-reward-cup',
      slug: 'restored-reward-cup',
      title: 'Кубок восстановления',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 3,
      participantCount: 0,
      rules: {
        config: { regularSource: 'head_to_head' },
        stageRewards: { regular: [{ place: 1, experience: 100, coins: 50, stars: 3 }] },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок восстановления' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '6. Награды' }));
    const place = screen.getByRole('spinbutton', { name: 'Место награды регулярки 1' });

    fireEvent.change(place, { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните место награды');

    fireEvent.change(place, { target: { value: '1' } });

    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(
      screen.queryByRole('alertdialog', { name: 'Закрыть без сохранения?' }),
    ).not.toBeInTheDocument();
  });

  it('retries the visible saved snapshot after a failed autosave is reverted', async () => {
    const tournament: api.AdminTournament = {
      id: 'failed-save-cup',
      slug: 'failed-save-cup',
      title: 'Кубок сетевой ошибки',
      description: 'Исходное описание',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 0,
      rules: { config: { regularSource: 'head_to_head' } },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi
      .spyOn(api, 'updateAdminTournament')
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({ tournament: { ...tournament, revision: 5 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок сетевой ошибки' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    const description = screen.getByRole('textbox', { name: 'Описание' });
    fireEvent.change(description, { target: { value: 'Несохранённое описание' } });
    expect(await screen.findByText('Не удалось сохранить изменения.')).toBeInTheDocument();

    fireEvent.change(description, { target: { value: 'Исходное описание' } });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({ description: 'Исходное описание' }),
    );
  });

  it('keeps an incomplete notification card dirty instead of deleting it', async () => {
    const tournament: api.AdminTournament = {
      id: 'notify-cup',
      slug: 'notify-cup',
      title: 'Кубок уведомлений',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 2,
      participantCount: 0,
      rules: {
        config: { regularSource: 'head_to_head' },
        notificationOverrides: {
          'tournament.live_soon': {
            title: 'Скоро матч',
            body: 'До старта 15 минут',
            url: '/?view=amateur&section=tournaments',
          },
        },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок уведомлений' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '7. Уведомления' }));
    const body = screen.getByRole('textbox', { name: 'Live-старт приближается: текст' });
    fireEvent.change(body, { target: { value: '' } });

    expect(body).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните текст уведомления');
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    expect(screen.getByRole('button', { name: 'Готово' })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it('preserves pipes and line breaks in notification text', async () => {
    const tournament: api.AdminTournament = {
      id: 'notification-text-cup',
      slug: 'notification-text-cup',
      title: 'Кубок текста',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 5,
      participantCount: 0,
      rules: {
        config: { regularSource: 'head_to_head' },
        notificationOverrides: {
          'tournament.live_soon': {
            title: 'Скоро матч',
            body: 'До старта 15 минут',
            url: '/?view=amateur&section=tournaments',
          },
        },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 6 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок текста' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать draft' }));
    fireEvent.click(screen.getByRole('button', { name: '7. Уведомления' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Live-старт приближается: текст' }), {
      target: { value: 'До старта | 15 минут\nОткройте расписание' },
    });

    await waitFor(
      () =>
        expect(update).toHaveBeenCalledWith(
          tournament.id,
          5,
          expect.objectContaining({
            rules: expect.objectContaining({
              notificationOverrides: {
                'tournament.live_soon': {
                  title: 'Скоро матч',
                  body: 'До старта | 15 минут\nОткройте расписание',
                  url: '/?view=amateur&section=tournaments',
                },
              },
            }),
          }),
        ),
      { timeout: 2_000 },
    );
  });

  it('uses active duel templates by title instead of asking for UUID values', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({
      templates: [
        {
          id: '00000000-0000-4000-8000-000000000951',
          title: 'Классика',
          isActive: true,
          duelKind: 'classic',
          totalPeriods: 3,
          shotsPerPeriod: 10,
        },
        {
          id: '00000000-0000-4000-8000-000000000952',
          title: 'Старый шаблон',
          isActive: false,
          duelKind: 'classic',
          totalPeriods: 1,
          shotsPerPeriod: 5,
        },
      ],
    });
    const tournament = {
      id: '00000000-0000-4000-8000-000000000953',
      slug: 'template-cup',
      title: 'Кубок шаблонов',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head' as const,
      revision: 1,
      participantCount: 0,
      rules: { config: { regularSource: 'head_to_head' } },
    };
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({ tournament });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: tournament.title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('combobox', { name: 'Регистрация' });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    await screen.findByRole('combobox', { name: 'Шаблон дуэли регулярки' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Шаблон дуэли регулярки' }));
    expect(await screen.findByRole('option', { name: /Классика/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Старый шаблон/ })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/UUID/)).not.toBeInTheDocument();
  });

  it('selects invited players by name without rendering their UUID', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'fetchAdminTournamentUsers').mockResolvedValue({
      users: [
        {
          id: '00000000-0000-4000-8000-000000000960',
          displayName: 'Иван Петров',
          avatarUrl: null,
          level: 4,
          isBlocked: false,
          identities: [{ username: 'ivan' }],
        },
      ],
    });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000961',
        slug: 'players-cup',
        title: 'Кубок игроков',
        description: '',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Кубок игроков' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    const search = await screen.findByRole('searchbox', { name: 'Найти приглашённого игрока' });
    fireEvent.change(search, { target: { value: 'Иван' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить Иван Петров' }));

    expect(screen.getByRole('button', { name: 'Убрать Иван Петров' })).toBeInTheDocument();
    expect(screen.queryByText('00000000-0000-4000-8000-000000000960')).not.toBeInTheDocument();
  });

  it('autosaves valid draft changes with the latest revision', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    const tournament = {
      id: '00000000-0000-4000-8000-000000000970',
      slug: 'autosave-cup',
      title: 'Кубок автосохранения',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head' as const,
      revision: 1,
      participantCount: 0,
    };
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({ tournament });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 2 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: tournament.title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('combobox', { name: 'Регистрация' });
    await chooseGlassOption('Регистрация', 'С одобрением');

    await waitFor(
      () =>
        expect(update).toHaveBeenCalledWith(
          tournament.id,
          1,
          expect.objectContaining({ title: tournament.title, rules: expect.any(Object) }),
        ),
      { timeout: 2_000 },
    );
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  });

  it('edits tie-break priority and home order with domain controls', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({
      templates: [
        {
          id: '00000000-0000-4000-8000-000000000980',
          title: 'Классика',
          isActive: true,
          duelKind: 'classic',
          totalPeriods: 3,
          shotsPerPeriod: 10,
        },
      ],
    });
    const tournament = {
      id: '00000000-0000-4000-8000-000000000981',
      slug: 'controls-cup',
      title: 'Кубок контролов',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head' as const,
      revision: 1,
      participantCount: 0,
    };
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({ tournament });
    vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({ tournament });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: tournament.title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('combobox', { name: 'Регистрация' });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByRole('button', { name: 'Опустить Очки' })).toBeInTheDocument();
    await chooseGlassOption('Шаблон дуэли регулярки', /Классика/);
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByRole('button', { name: 'Раунд 1, игра 1: Дома' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /порядок площадок/i })).not.toBeInTheDocument();
  });

  it('uses visual tables and cards for daily points, rewards and notifications', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000980',
        slug: 'visual-controls',
        title: 'Визуальный кубок',
        description: '',
        status: 'draft',
        regularSource: 'daily_aggregate',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Визуальный кубок' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('combobox', { name: 'Регистрация' });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await chooseGlassOption('Формат', 'Результаты ежедневных игр');
    expect(screen.getByRole('button', { name: 'Добавить место' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('10,8,6,5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить место' }));
    expect(screen.getByRole('spinbutton', { name: 'Очки за 1 место' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    fireEvent.click(screen.getByRole('button', { name: '6. Награды' }));
    expect(screen.getByRole('button', { name: 'Добавить награду регулярки' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Награды регулярки' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByRole('button', { name: 'Добавить напоминание' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Настроить событие' })).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Переопределения push-шаблонов' }),
    ).not.toBeInTheDocument();
  });

  it('asks before closing when the draft has unsaved changes', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Несохранённый кубок' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Закрыть без сохранения?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
    expect(screen.getByRole('dialog', { name: 'Создание турнира' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));

    const appContent = screen.getByTestId('app-content');
    const dialog = screen.getByRole('dialog', { name: 'Создание турнира' });
    const backdrop = dialog.closest<HTMLElement>('.modal-backdrop');
    expect(backdrop).toBeInstanceOf(HTMLElement);
    expect(appContent).not.toContainElement(backdrop);
    expect(backdrop?.parentElement).toBe(document.body);
  });

  it('preserves the admin form styling scope inside the portaled wizard', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000999',
        slug: 'styles',
        title: 'Стили',
        description: '',
        status: 'draft',
        regularSource: 'head_to_head',
        revision: 1,
        participantCount: 0,
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <div className="admin-screen">
        <QueryClientProvider client={client}>
          <TournamentAdmin />
        </QueryClientProvider>
      </div>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));

    const titleInput = screen.getByRole('textbox', { name: 'Название' });
    const backdrop = titleInput.closest<HTMLElement>('.modal-backdrop');
    expect(backdrop).toHaveClass('modal-backdrop', 'admin-screen');
    expect(titleInput.matches('.admin-screen input')).toBe(true);

    fireEvent.change(titleInput, { target: { value: 'Стили' } });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('combobox', { name: 'Регистрация' });
    expect(
      screen
        .getByRole('combobox', { name: 'Регистрация' })
        .matches('.admin-screen button[role="combobox"]'),
    ).toBe(true);
  });

  it('configures tournament rules instead of showing placeholder wizard steps', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({
      templates: [
        {
          id: '00000000-0000-4000-8000-000000000912',
          title: 'Турнирная классика',
          isActive: true,
          duelKind: 'classic',
          totalPeriods: 3,
          shotsPerPeriod: 10,
        },
      ],
    });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
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
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000911',
        slug: 'configured-cup',
        title: 'Настраиваемый кубок',
        description: 'Полная проверка мастера',
        status: 'draft',
        regularSource: 'head_to_head',
        revision: 2,
        participantCount: 0,
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Настраиваемый кубок' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Полная проверка мастера' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByRole('combobox', { name: 'Регистрация' });
    await chooseGlassOption('Регистрация', 'С одобрением');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Минимум голов' }), {
      target: { value: '1000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByRole('spinbutton', { name: 'Кругов' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Туров в день' }), {
      target: { value: '2' },
    });
    await chooseGlassOption('Шаблон дуэли регулярки', /Турнирная классика/);

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(
      screen.getByRole('spinbutton', { name: 'Раунд 1: побед для серии' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Раунд 1: побед для серии' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await chooseGlassOption('Часовой пояс', 'America/New_York');
    fireEvent.change(screen.getByLabelText('Старт турнира'), {
      target: { value: '2030-09-01T12:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить награду регулярки' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Опыт награды регулярки 1' }), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Монеты награды регулярки 1' }), {
      target: { value: '50' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Звёзды награды регулярки 1' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await chooseGlassOption('Событие уведомления', 'Live-старт приближается');
    fireEvent.click(screen.getByRole('button', { name: 'Настроить событие' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Live-старт приближается: заголовок' }), {
      target: { value: 'Скоро матч {{tournamentTitle}}' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Live-старт приближается: текст' }), {
      target: { value: 'До начала {{minutes}} минут' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText(/Заявки с одобрением · виден в каталоге/)).toBeInTheDocument();
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls.at(-1)?.[2]).toEqual(
      expect.objectContaining({
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
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

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
    await chooseGlassOption('Часовой пояс', 'Europe/Moscow');
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

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
      fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        tournament.id,
        5,
        expect.objectContaining({ title: 'Кубок CRUD обновлён', rules: expect.any(Object) }),
      ),
    );
    await screen.findByRole('button', { name: 'Заявки и оплаты' });

    fireEvent.click(screen.getByRole('button', { name: 'Дублировать' }));
    await waitFor(() =>
      expect(duplicate).toHaveBeenCalledWith(tournament.id, {
        title: 'Копия: Кубок CRUD обновлён',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Удалить draft' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(tournament.id));
  });
});
