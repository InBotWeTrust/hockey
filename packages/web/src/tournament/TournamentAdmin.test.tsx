import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/apiFetch.js';
import * as api from './adminApi.js';
import { TournamentAdmin } from './TournamentAdmin.js';
import { TournamentOperations } from './TournamentOperations.js';
import type { TournamentLifecycleDTO } from '../api/tournament.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');
const TEST_LIFECYCLE: TournamentLifecycleDTO = {
  action: 'unchanged',
  dueAt: null,
  approvedParticipantCount: 0,
  requiredParticipantCount: 2,
  reason: null,
};

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
    lifecycle: TEST_LIFECYCLE,
    registrationOpensAt: '2026-11-01T06:10:00.000Z',
    registrationClosesAt: '2026-11-01T06:20:00.000Z',
    startsAt: '2026-11-01T06:30:00.000Z',
    rules: {
      config: {
        regularSource: 'head_to_head',
        timezone: 'America/New_York',
        firstRoundLocalTime: '01:30',
      },
    },
  };
}

describe('TournamentAdmin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'publishAdminTournament').mockResolvedValue({
      tournamentId: 'published-tournament',
      status: 'registration',
      revision: 1,
    });
  });

  it('configures playoff rounds by days, daily game limit, readiness and start interval', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: '00000000-0000-4000-8000-000000000950',
        slug: 'schedule-cup',
        title: 'Кубок расписания',
        description: '',
        status: 'draft',
        regularSource: 'head_to_head',
        revision: 1,
        participantCount: 0,
        lifecycle: TEST_LIFECYCLE,
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const titleInput = screen.getByRole('textbox', { name: 'Название' });
    expect(titleInput).toHaveAttribute('maxlength', '60');
    fireEvent.change(titleInput, {
      target: { value: 'Кубок расписания' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByRole('combobox', { name: 'Регистрация' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByRole('spinbutton', { name: 'Кругов' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByRole('spinbutton', { name: 'Раунд 1: дней на раунд' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'Раунд 1: максимум игр в день' })).toHaveValue(4);
    expect(screen.getByRole('spinbutton', { name: 'Раунд 1: минут на готовность' })).toHaveValue(5);
    expect(
      screen.getByRole('spinbutton', { name: 'Раунд 1: интервал стартов, минуты' }),
    ).toHaveValue(20);
    expect(screen.getByLabelText('Раунд 1: начало первой игры')).toBeInTheDocument();
    expect(screen.queryByText(/овертайм/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/буллит/i)).not.toBeInTheDocument();
  });

  it('publishes a newly created draft before closing the wizard', async () => {
    const draftTournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000951',
      slug: 'published-cup',
      title: 'Опубликованный кубок',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 1,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({ tournament: draftTournament });
    const publish = vi.spyOn(api, 'publishAdminTournament').mockResolvedValue({
      tournamentId: draftTournament.id,
      status: 'registration',
      revision: 1,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: draftTournament.title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    for (let step = 0; step < 6; step += 1) {
      fireEvent.click(await screen.findByRole('button', { name: 'Далее' }));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(draftTournament.id, 1));
    expect(screen.queryByRole('dialog', { name: 'Создание турнира' })).not.toBeInTheDocument();
  });

  it('keeps the wizard open when publishing a new draft fails', async () => {
    const draftTournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000952',
      slug: 'failed-publish-cup',
      title: 'Кубок с ошибкой публикации',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 1,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({ tournament: draftTournament });
    vi.spyOn(api, 'publishAdminTournament').mockRejectedValue(new Error('publish failed'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: draftTournament.title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    for (let step = 0; step < 6; step += 1) {
      fireEvent.click(await screen.findByRole('button', { name: 'Далее' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось опубликовать турнир.');
    expect(screen.getByRole('dialog', { name: 'Создание турнира' })).toBeInTheDocument();
  });

  it('saves an edit to a published tournament without publishing it again', async () => {
    const publishedTournament: api.AdminTournament = {
      ...dstOverlapTournament(),
      status: 'registration',
      revision: 7,
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({
      tournaments: [publishedTournament],
    });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: {
        ...publishedTournament,
        description: 'Описание после публикации',
        revision: 8,
      },
    });
    const publish = vi.spyOn(api, 'publishAdminTournament');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок DST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Описание после публикации' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и закрыть' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        publishedTournament.id,
        publishedTournament.revision,
        expect.objectContaining({ description: 'Описание после публикации' }),
      ),
    );
    expect(publish).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Изменения сохранены.');
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
        lifecycle: TEST_LIFECYCLE,
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
    const style = document.createElement('style');
    style.textContent = designSystemCss;
    document.head.append(style);
    try {
      const formGrid = dialog.querySelector<HTMLElement>('.tournament-admin-grid');
      expect(formGrid).not.toBeNull();
      expect(getComputedStyle(formGrid!).alignContent).toBe('start');
    } finally {
      style.remove();
    }
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

  it('explains draft autosave and waits for the latest save before closing the wizard', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000948',
      slug: 'flush-cup',
      title: 'Кубок очереди',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    expect(screen.getByRole('status')).toHaveTextContent('Черновик сохранён автоматически');
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Последняя версия' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    expect(
      screen.getByText(
        'Изменения сохраняются автоматически. Кнопка ниже сохранит последние правки и опубликует турнир. Регистрация откроется и закроется по указанным датам, а регулярный сезон вы начнёте вручную, когда всё будет готово.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));

    expect(screen.getByRole('button', { name: 'Публикуем…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Публикуем…');

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
    expect(screen.getByRole('status')).toHaveTextContent('Турнир опубликован.');
    expect(screen.getByRole('tab', { name: 'Заявки и оплаты' })).toBeInTheDocument();
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
        lifecycle: TEST_LIFECYCLE,
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
    expect(await screen.findByText('Черновик сохранён автоматически')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Регистрация' })).toBeInTheDocument();
  });

  it('uploads optional square WebP artwork and includes its URL in the draft payload', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'uploadAdminTournamentArtwork').mockResolvedValue({
      url: '/api/media/proxy/tournaments/artwork/cup.webp?token=signed',
      objectKey: 'tournaments/artwork/cup.webp',
    });
    const create = vi.spyOn(api, 'createAdminTournament').mockResolvedValue({
      tournament: {
        id: 'artwork-cup',
        slug: 'artwork-cup',
        title: 'Кубок с картинкой',
        description: '',
        imageUrl: '/api/media/proxy/tournaments/artwork/cup.webp?token=signed',
        status: 'draft',
        regularSource: 'head_to_head',
        revision: 1,
        participantCount: 0,
        lifecycle: TEST_LIFECYCLE,
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    const artwork = screen.getByLabelText('Изображение турнира');
    expect(artwork).toHaveAttribute('accept', 'image/webp,.webp');
    fireEvent.change(artwork, {
      target: { files: [new File(['webp'], 'cup.webp', { type: 'image/webp' })] },
    });

    expect(await screen.findByRole('img', { name: 'Изображение турнира' })).toHaveAttribute(
      'src',
      '/api/media/proxy/tournaments/artwork/cup.webp?token=signed',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Кубок с картинкой' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: '/api/media/proxy/tournaments/artwork/cup.webp?token=signed',
        }),
      ),
    );
  });

  it('blocks progression during artwork upload and ignores a result from a closed wizard', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    let resolveUpload!: (value: { url: string; objectKey: string }) => void;
    vi.spyOn(api, 'uploadAdminTournamentArtwork').mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    fireEvent.change(screen.getByLabelText('Изображение турнира'), {
      target: { files: [new File(['webp'], 'old.webp', { type: 'image/webp' })] },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Старая форма' },
    });
    expect(await screen.findByRole('button', { name: 'Далее' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть без сохранения' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Создать' }));
    expect(screen.getByRole('img', { name: 'Изображение турнира' })).toHaveAttribute(
      'src',
      '/modes/tournaments.webp',
    );

    await act(async () => {
      resolveUpload({ url: '/api/media/old.webp', objectKey: 'old.webp' });
      await Promise.resolve();
    });
    expect(screen.getByRole('img', { name: 'Изображение турнира' })).toHaveAttribute(
      'src',
      '/modes/tournaments.webp',
    );
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
        lifecycle: TEST_LIFECYCLE,
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
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '6. Награды' }));
    const place = screen.getByRole('spinbutton', { name: 'Место награды регулярки 1' });
    fireEvent.change(place, { target: { value: '' } });

    expect(place).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните место награды');
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));
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
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '6. Награды' }));
    const place = screen.getByRole('spinbutton', { name: 'Место награды регулярки 1' });

    fireEvent.change(place, { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните место награды');

    fireEvent.change(place, { target: { value: '1' } });

    expect(await screen.findByText('Черновик сохранён автоматически')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(
      screen.queryByRole('alertdialog', { name: 'Закрыть без сохранения?' }),
    ).not.toBeInTheDocument();
  });

  it('automatically retries after a failed autosave when the user corrects the form', async () => {
    const tournament: api.AdminTournament = {
      id: 'failed-save-cup',
      slug: 'failed-save-cup',
      title: 'Кубок сетевой ошибки',
      description: 'Исходное описание',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    const description = screen.getByRole('textbox', { name: 'Описание' });
    fireEvent.change(description, { target: { value: 'Несохранённое описание' } });
    expect(
      await screen.findByText(
        'Не удалось сохранить изменения. Проверьте соединение и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(description, { target: { value: 'Исходное описание' } });

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({ description: 'Исходное описание' }),
    );
    expect(await screen.findByText('Черновик сохранён автоматически')).toBeInTheDocument();
  });

  it('lets the final action retry a failed autosave and closes only after it succeeds', async () => {
    const tournament: api.AdminTournament = {
      id: 'failed-final-save-cup',
      slug: 'failed-final-save-cup',
      title: 'Кубок повторного сохранения',
      description: 'Исходное описание',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
      rules: { config: { regularSource: 'head_to_head' } },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi
      .spyOn(api, 'updateAdminTournament')
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({
        tournament: { ...tournament, description: 'Новое описание', revision: 5 },
      });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Открыть Кубок повторного сохранения' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Новое описание' },
    });

    expect(
      await screen.findByText(
        'Не удалось сохранить изменения. Проверьте соединение и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    const finish = screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ });
    expect(finish).toBeEnabled();
    fireEvent.click(finish);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Создание турнира' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Турнир опубликован.');
  });

  it('treats zero level limits as no restriction instead of sending an invalid request', async () => {
    const tournament: api.AdminTournament = {
      id: 'zero-level-limit-cup',
      slug: 'zero-level-limit-cup',
      title: 'Кубок без ограничения уровня',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 2,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
      rules: {
        config: { regularSource: 'head_to_head' },
        eligibility: { minLevel: null, maxLevel: null },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 3 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Открыть Кубок без ограничения уровня' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '2. Доступ' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Минимальный уровень' }), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Максимальный уровень' }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: '1. Основное' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Сохранить без ограничения уровня' },
    });

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls.at(-1)?.[2]).toEqual(
      expect.objectContaining({
        rules: expect.objectContaining({
          eligibility: expect.objectContaining({ minLevel: null, maxLevel: null }),
        }),
      }),
    );
  });

  it('allows required numeric fields to be cleared while editing and validates on save', async () => {
    const tournament: api.AdminTournament = {
      id: 'editable-number-cup',
      slug: 'editable-number-cup',
      title: 'Кубок удобных чисел',
      description: '',
      status: 'draft',
      regularSource: 'head_to_head',
      revision: 3,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
      rules: {
        config: { regularSource: 'head_to_head', entryFeeCoins: 10 },
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 4 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок удобных чисел' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '2. Доступ' }));
    const entryFee = screen.getByRole('spinbutton', { name: 'Вступительный взнос, монеты' });
    fireEvent.change(entryFee, { target: { value: '' } });

    expect(entryFee).toHaveValue(null);
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 700)));
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    const finish = screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ });
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Заполните поле «Вступительный взнос, монеты».',
    );
    expect(screen.getByRole('dialog', { name: 'Создание турнира' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2. Доступ' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Вступительный взнос, монеты' }), {
      target: { value: '25' },
    });
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 700)));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls.at(-1)?.[2]).toEqual(
      expect.objectContaining({
        rules: expect.objectContaining({
          config: expect.objectContaining({ entryFeeCoins: 25 }),
        }),
      }),
    );
  });

  it('removes native number steppers inside the tournament editor', () => {
    const style = document.createElement('style');
    style.textContent = designSystemCss;
    const wizard = document.createElement('div');
    wizard.className = 'tournament-wizard';
    const input = document.createElement('input');
    input.type = 'number';
    wizard.append(input);
    document.head.append(style);
    document.body.append(wizard);

    expect(getComputedStyle(input).appearance).toBe('textfield');
    expect(
      Array.from(style.sheet?.cssRules ?? []).some(
        (rule) =>
          rule instanceof CSSStyleRule && rule.selectorText.includes('::-webkit-inner-spin-button'),
      ),
    ).toBe(true);

    wizard.remove();
    style.remove();
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
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '7. Уведомления' }));
    const body = screen.getByRole('textbox', { name: 'Скоро начало игры: текст' });
    fireEvent.change(body, { target: { value: '' } });

    expect(body).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните текст уведомления');
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    const finish = screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ });
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните текст уведомления.');
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
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '7. Уведомления' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Скоро начало игры: текст' }), {
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
      lifecycle: TEST_LIFECYCLE,
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
        lifecycle: TEST_LIFECYCLE,
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
      lifecycle: TEST_LIFECYCLE,
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
    expect(await screen.findByText('Черновик сохранён автоматически')).toBeInTheDocument();
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
      lifecycle: TEST_LIFECYCLE,
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
        lifecycle: TEST_LIFECYCLE,
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

  it('configures a separate three-period classic tournament game', async () => {
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    const tournament = {
      id: '00000000-0000-4000-8000-000000000979',
      slug: 'classic-controls',
      title: 'Кубок классики',
      description: '',
      status: 'draft',
      regularSource: 'classic' as const,
      revision: 1,
      participantCount: 0,
      lifecycle: TEST_LIFECYCLE,
    };
    vi.spyOn(api, 'createAdminTournament').mockResolvedValue({ tournament });
    const update = vi
      .spyOn(api, 'updateAdminTournament')
      .mockResolvedValue({ tournament: { ...tournament, revision: 2 } });
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
    await chooseGlassOption('Формат', 'Классика');

    expect(screen.getByRole('spinbutton', { name: 'Бросков в периоде' })).toHaveValue(30);
    expect(screen.getByText('1-й период')).toBeInTheDocument();
    expect(screen.getByText('2-й период')).toBeInTheDocument();
    expect(screen.getByText('3-й период')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: '2-й период: шайба' }), {
      target: { value: '2.25' },
    });

    await waitFor(
      () =>
        expect(update).toHaveBeenCalledWith(
          tournament.id,
          expect.any(Number),
          expect.objectContaining({
            rules: expect.objectContaining({
              config: expect.objectContaining({
                regularSource: 'classic',
                classicRules: expect.objectContaining({
                  shotsPerPeriod: 30,
                  periodSpeedPresets: expect.arrayContaining([
                    expect.objectContaining({ periodNumber: 2, puckSpeedPerMs: 2.25 }),
                  ]),
                }),
              }),
            }),
          }),
        ),
      { timeout: 2_000 },
    );
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
    expect(screen.getByRole('heading', { name: 'Управление сезонами' })).toHaveClass(
      'screen-title-on-arena',
    );
    const createButton = screen.getByRole('button', { name: 'Создать' });
    expect(createButton).toHaveTextContent(/^\+$/);
    expect(createButton).toHaveClass('icon-btn', 'icon-btn--dark');
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
        lifecycle: TEST_LIFECYCLE,
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
        lifecycle: TEST_LIFECYCLE,
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
        lifecycle: TEST_LIFECYCLE,
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
    await chooseGlassOption('Часовой пояс', 'Нью-Йорк');
    act(() => {
      fireEvent.change(screen.getByLabelText('Открытие регистрации'), {
        target: { value: '2030-08-30T10:00' },
      });
      fireEvent.change(screen.getByLabelText('Закрытие регистрации'), {
        target: { value: '2030-08-31T10:00' },
      });
      fireEvent.change(screen.getByLabelText('Первый тур'), {
        target: { value: '2030-09-01' },
      });
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
    await chooseGlassOption('Событие уведомления', 'Скоро начало игры');
    fireEvent.click(screen.getByRole('button', { name: 'Настроить событие' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Скоро начало игры: заголовок' }), {
      target: { value: 'Скоро матч {{tournamentTitle}}' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Скоро начало игры: текст' }), {
      target: { value: 'До начала {{minutes}} минут' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText(/Заявки с одобрением · виден в каталоге/)).toBeInTheDocument();
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls.at(-1)?.[2]).toEqual(
      expect.objectContaining({
        registrationOpensAt: '2030-08-30T14:00:00.000Z',
        registrationClosesAt: '2030-08-31T14:00:00.000Z',
        startsAt: '2030-09-01T23:00:00.000Z',
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
          notificationReminderOffsetsMs: [1_800_000, 300_000],
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
          lifecycle: TEST_LIFECYCLE,
          pendingApplicationCount: 1,
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
        {
          id: '00000000-0000-4000-8000-000000000905',
          user_id: '00000000-0000-4000-8000-000000000906',
          display_name: 'Подтверждённый игрок',
          avatar_url: null,
          state: 'approved',
          seed: null,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required',
        },
        {
          id: '00000000-0000-4000-8000-000000000907',
          user_id: '00000000-0000-4000-8000-000000000908',
          display_name: 'Отклонённый игрок',
          avatar_url: null,
          state: 'rejected',
          seed: null,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required',
        },
      ],
    });
    vi.spyOn(api, 'fetchAdminTournamentSchedule').mockResolvedValue({ fixtures: [] });
    vi.spyOn(api, 'fetchAdminTournamentUsers').mockResolvedValue({
      users: [
        {
          id: '00000000-0000-4000-8000-000000000904',
          displayName: 'Найденный игрок',
          avatarUrl: null,
          level: 2,
          isBlocked: false,
          identities: [{ source: 'telegram', label: 'TG', id: '432014500', username: 'player' }],
        },
      ],
    });
    vi.spyOn(api, 'previewAdminTournamentAudience').mockResolvedValue({
      count: 1,
      recipients: [],
    });
    vi.spyOn(api, 'fetchAdminTournamentDispatches').mockResolvedValue({
      dispatches: [
        {
          id: 'dispatch-sending',
          kind: 'direct_message',
          status: 'sending',
          delivered_count: 2,
          recipient_count: 4,
        },
        {
          id: 'dispatch-partial',
          kind: 'push',
          status: 'partially_failed',
          delivered_count: 3,
          recipient_count: 4,
        },
      ],
    });
    const dispatch = vi
      .spyOn(api, 'dispatchAdminTournamentCommunication')
      .mockRejectedValue(new Error('SYSTEM_USER_ID is required'));
    const approveAll = vi
      .spyOn(api, 'approveAllAdminTournamentApplications')
      .mockResolvedValue({ approvedCount: 1 });
    const reject = vi.spyOn(api, 'rejectAdminTournamentApplication').mockResolvedValue({
      participantId: '00000000-0000-4000-8000-000000000902',
      state: 'rejected',
    });
    const disqualify = vi
      .spyOn(api, 'disqualifyAdminTournamentParticipant')
      .mockResolvedValue({ participantId: '00000000-0000-4000-8000-000000000905' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    const adminCard = await screen.findByRole('button', { name: 'Открыть Кубок админа' });
    expect(adminCard).toHaveTextContent('Идёт регистрация');
    expect(adminCard).toHaveTextContent('3 участника');
    expect(adminCard).toHaveTextContent('Заявки: 1');
    expect(adminCard).not.toHaveTextContent(/registration|ревизия/i);
    fireEvent.click(adminCard);

    expect(screen.getByRole('button', { name: 'Назад к турнирам' })).toHaveClass('icon-btn');
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByText('К списку турниров')).not.toBeInTheDocument();
    expect(screen.getByText('Идёт регистрация')).toBeInTheDocument();
    expect(screen.queryByText(/ревизия/i)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Заявки и оплаты (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Календарь' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Рассылки' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Причина отклонения' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Все' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Подтверждены' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Требуют подтверждения' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Отклонены' })).toBeInTheDocument();
    expect(await screen.findByText('Игрок на проверке')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Отклонены' }));
    expect(screen.getByText('Отклонённый игрок')).toBeInTheDocument();
    expect(screen.queryByText('Игрок на проверке')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Требуют подтверждения' }));
    expect(screen.getByText('Игрок на проверке')).toBeInTheDocument();
    expect(screen.queryByText('Подтверждённый игрок')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Принять все заявки (1)' }));
    await waitFor(() =>
      expect(approveAll).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000901'),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['admin', 'tournaments', 'pending-applications'],
    });
    expect(
      screen.getByText(/Заявка подана · Взнос: 25 монет · Ожидает оплаты/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/applied|pending|not_required|approved/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Дисквалифицировать' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Действия турнира' })).toHaveClass('icon-btn');
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    expect(screen.getByRole('dialog', { name: 'Действия турнира' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Дублировать турнир' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать календарь' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть действия турнира' }));

    fireEvent.click(screen.getByRole('button', { name: 'Управление: Игрок на проверке' }));
    expect(screen.getByRole('dialog', { name: 'Игрок на проверке' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Одобрить заявку' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить заявку' }));
    invalidate.mockClear();
    const rejectionReason = screen.getByRole('textbox', { name: 'Причина отклонения' });
    expect(rejectionReason).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Подтвердить отклонение' })).toBeDisabled();
    fireEvent.change(rejectionReason, { target: { value: 'Не выполнены условия участия' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить отклонение' }));
    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000901',
        '00000000-0000-4000-8000-000000000902',
        'Не выполнены условия участия',
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['admin', 'tournaments', 'pending-applications'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Управление: Игрок на проверке' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть управление участником' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Все' }));
    fireEvent.click(screen.getByRole('button', { name: 'Управление: Подтверждённый игрок' }));
    expect(
      screen.getByRole('button', { name: 'Дисквалифицировать участника' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Причина дисквалификации' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Дисквалифицировать участника' }));
    const disqualificationReason = screen.getByRole('textbox', {
      name: 'Причина дисквалификации',
    });
    expect(disqualificationReason).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Подтвердить дисквалификацию' })).toBeDisabled();
    fireEvent.change(disqualificationReason, { target: { value: 'Нарушение правил турнира' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить дисквалификацию' }));
    await waitFor(() =>
      expect(disqualify).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000901',
        '00000000-0000-4000-8000-000000000905',
        'Нарушение правил турнира',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Управление: Подтверждённый игрок' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть управление участником' }));
    const playerSearch = screen.getByRole('searchbox', { name: 'Найти игрока' });
    expect(playerSearch).toHaveAttribute('placeholder', 'Имя или номер профиля в Telegram/VK');
    fireEvent.change(playerSearch, { target: { value: '432014500' } });
    expect(
      await screen.findByRole('button', { name: /Пригласить Найденный игрок/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Календарь' }));
    expect(await screen.findByText('Календарь пока пуст.')).toBeInTheDocument();
    expect(screen.getByText('Календарь пока пуст.')).toHaveClass('tournament-admin-empty');
    expect(screen.getByText('Календарь пока пуст.').closest('.glass')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Награды' }));
    expect(screen.getByText('Награды выдаются автоматически.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Выдать награды/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Рассылки' }));
    expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Заголовок')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Текст сообщения')).not.toBeInTheDocument();
    await chooseGlassOption('Способ отправки', 'Личные сообщения');
    await chooseGlassOption('Аудитория', 'Все игроки');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Кнопка перехода в турнир' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение' }), {
      target: { value: 'Проверка личной рассылки' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить рассылку' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отправить рассылку' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000901',
        expect.objectContaining({
          kind: 'direct_message',
          audience: 'all_players',
          body: 'Проверка личной рассылки',
          includeTournamentButton: true,
        }),
      ),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Личные сообщения · Отправляется · доставлено 2 \/ 4/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Уведомление на телефон · Отправлена частично · доставлено 3 \/ 4/),
    ).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить рассылку. Попробуйте ещё раз.',
    );
  });

  it.each([
    {
      code: 'capacity_reached',
      details: {
        approvedCount: 14,
        participantLimit: 16,
        availableSlots: 2,
        pendingCount: 3,
      },
      expected:
        'Нельзя принять все заявки: подтверждено 14 из 16, свободно 2 места, а заявок 3. Примите 2 заявки по одной или увеличьте максимум участников.',
    },
    {
      code: 'capacity_reached',
      details: {
        approvedCount: 8,
        participantLimit: 30,
        availableSlots: 22,
        pendingCount: 23,
      },
      expected:
        'Нельзя принять все заявки: подтверждено 8 из 30, свободно 22 места, а заявок 23. Примите 22 заявки по одной или увеличьте максимум участников.',
    },
    {
      code: 'insufficient_coins',
      details: undefined,
      expected:
        'Не удалось принять заявки: у одного или нескольких игроков недостаточно монет для взноса.',
    },
    {
      code: 'registration_closed',
      details: undefined,
      expected: 'Заявки нельзя принять: регистрация на турнир уже закрыта.',
    },
    {
      code: 'unexpected_error',
      details: undefined,
      expected: 'Не удалось принять заявки. Обновите страницу и попробуйте ещё раз.',
    },
  ])(
    'explains the $code bulk approval error in plain language',
    async ({ code, details, expected }) => {
      const tournament: api.AdminTournament = {
        id: '00000000-0000-4000-8000-000000000971',
        slug: 'capacity-cup',
        title: 'Кубок на 16 игроков',
        description: '',
        status: 'registration',
        regularSource: 'head_to_head',
        revision: 2,
        participantCount: 17,
        lifecycle: TEST_LIFECYCLE,
        pendingApplicationCount: 3,
        rules: { config: { participantLimit: 16 } },
      };
      const approvedParticipants: api.AdminTournamentParticipant[] = Array.from(
        { length: 14 },
        (_, index) => ({
          id: `approved-${index}`,
          user_id: `approved-user-${index}`,
          display_name: `Подтверждённый игрок ${index + 1}`,
          avatar_url: null,
          state: 'approved',
          seed: index + 1,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required',
        }),
      );
      const pendingParticipants: api.AdminTournamentParticipant[] = Array.from(
        { length: 3 },
        (_, index) => ({
          id: `pending-${index}`,
          user_id: `pending-user-${index}`,
          display_name: `Новая заявка ${index + 1}`,
          avatar_url: null,
          state: 'applied',
          seed: null,
          entry_fee_coins: 25,
          entry_fee_state: 'pending',
        }),
      );
      vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({
        participants: [...approvedParticipants, ...pendingParticipants],
      });
      vi.spyOn(api, 'approveAllAdminTournamentApplications').mockRejectedValue(
        new ApiError(409, code, 'Внутренняя ошибка', details),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <TournamentOperations
            tournament={tournament}
            onBack={vi.fn()}
            onEdit={vi.fn()}
            onRemoved={vi.fn()}
          />
        </QueryClientProvider>,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Принять все заявки (3)' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    },
  );

  it('does not expose obsolete registration or ordinary calendar actions', async () => {
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
          lifecycle: TEST_LIFECYCLE,
          registrationOpensAt: '2030-01-01T09:00:00.000Z',
          registrationClosesAt: '2030-01-02T09:00:00.000Z',
          startsAt: '2030-01-03T09:00:00.000Z',
        },
      ],
    });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок переходов' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    expect(screen.queryByRole('button', { name: 'Открыть регистрацию' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать календарь' })).not.toBeInTheDocument();
  });

  it('opens schedule-only editing for a legacy playoff without configured schedule days', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000923',
      slug: 'existing-playoff-schedule',
      title: 'Действующий плей-офф',
      description: '',
      status: 'playoff',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 4,
      lifecycle: TEST_LIFECYCLE,
      registrationOpensAt: '2029-12-01T09:00:00.000Z',
      registrationClosesAt: '2029-12-02T09:00:00.000Z',
      startsAt: '2029-12-03T09:00:00.000Z',
      rules: {
        config: {
          regularSource: 'head_to_head',
          timezone: 'Europe/Moscow',
          participantLimit: 4,
          playoffSize: 4,
        },
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            firstGameStartsAt: '2030-01-05T07:00:00.000Z',
          },
          {
            roundNumber: 2,
            winsRequired: 2,
            firstGameStartsAt: '2030-01-08T07:00:00.000Z',
          },
        ],
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 5 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Действующий плей-офф' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить расписание плей-офф' }));

    expect(screen.getByRole('heading', { name: 'Расписание плей-офф' })).toBeInTheDocument();
    expect(screen.getByLabelText('Раунд 1, день 1: дата')).toHaveValue('2030-01-05');
    expect(screen.getByRole('spinbutton', { name: 'Раунд 1, день 1: количество игр' })).toHaveValue(
      3,
    );
    expect(
      screen.queryByRole('spinbutton', { name: 'Раунд 1: максимум игр в день' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Пауза после раунда, минуты')).not.toBeInTheDocument();
    expect(screen.getByText(/Изменения применятся после нажатия/)).toBeInTheDocument();
    expect(screen.getByText('Расписание применится после сохранения')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Раунд 2, день 1: дата'), {
      target: { value: '2030-01-09' },
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    });
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить расписание' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const savedBody = update.mock.calls[0]?.[2] as
      | { rules?: { playoffRounds?: Array<{ scheduleDays?: unknown }> } }
      | undefined;
    const savedRounds = savedBody?.rules?.playoffRounds;
    expect(savedRounds?.[0]?.scheduleDays).toBeUndefined();
    expect(savedRounds?.[1]?.scheduleDays).toBeDefined();
  });

  it('edits every playoff day date, start time, and game count independently', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000924',
      slug: 'configured-playoff-schedule',
      title: 'Плей-офф с днями',
      description: '',
      status: 'playoff',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 4,
      lifecycle: TEST_LIFECYCLE,
      registrationOpensAt: '2029-12-01T09:00:00.000Z',
      registrationClosesAt: '2029-12-02T09:00:00.000Z',
      startsAt: '2029-12-03T09:00:00.000Z',
      rules: {
        config: {
          regularSource: 'head_to_head',
          timezone: 'Europe/Moscow',
          participantLimit: 4,
          playoffSize: 4,
        },
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            scheduleDays: [
              {
                localDate: '2030-01-05',
                firstWaveLocalTime: '18:00',
                maxResultGames: 2,
              },
              {
                localDate: '2030-01-07',
                firstWaveLocalTime: '20:30',
                maxResultGames: 1,
              },
            ],
          },
          {
            roundNumber: 2,
            winsRequired: 2,
            scheduleDays: [
              {
                localDate: '2030-01-10',
                firstWaveLocalTime: '19:00',
                maxResultGames: 3,
              },
            ],
          },
        ],
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    const update = vi.spyOn(api, 'updateAdminTournament').mockResolvedValue({
      tournament: { ...tournament, revision: 5 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Плей-офф с днями' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить расписание плей-офф' }));

    const dialog = screen.getByRole('dialog', { name: 'Расписание плей-офф' });
    expect(dialog).toHaveClass('tournament-wizard--schedule-only');
    expect(screen.getByLabelText('Раунд 1, день 1: дата')).toHaveValue('2030-01-05');
    expect(screen.getByLabelText('Раунд 1, день 2: дата')).toHaveValue('2030-01-07');
    expect(screen.getByLabelText('Раунд 1, день 2: время начала')).toHaveValue('20:30');
    expect(screen.getAllByText('Максимум игр в серии — 3')).toHaveLength(2);
    expect(screen.getByRole('spinbutton', { name: 'Раунд 1, день 2: количество игр' })).toHaveValue(
      1,
    );
    expect(screen.getByRole('button', { name: 'Добавить день в раунд 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить расписание' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить день в раунд 2' }));
    expect(screen.getByLabelText('Раунд 2, день 2: дата')).toHaveValue('2030-01-11');
    expect(screen.getByRole('spinbutton', { name: 'Раунд 2, день 1: количество игр' })).toHaveValue(
      2,
    );
    expect(screen.getByRole('spinbutton', { name: 'Раунд 2, день 2: количество игр' })).toHaveValue(
      1,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Удалить день 2 из раунда 2' }));
    expect(screen.queryByLabelText('Раунд 2, день 2: дата')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Раунд 2, день 1: количество игр' })).toHaveValue(
      3,
    );

    fireEvent.change(screen.getByLabelText('Раунд 1, день 2: дата'), {
      target: { value: '2030-01-08' },
    });
    fireEvent.change(screen.getByLabelText('Раунд 1, день 2: время начала'), {
      target: { value: '21:15' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Раунд 1, день 1: количество игр' }), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Раунд 1, день 2: количество игр' }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить расписание' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const savedBody = update.mock.calls[0]?.[2] as {
      rules?: {
        playoffRounds?: Array<{
          scheduleDays?: Array<{
            localDate: string;
            firstWaveLocalTime: string;
            maxResultGames: number;
          }>;
        }>;
      };
    };
    expect(savedBody.rules?.playoffRounds?.[0]?.scheduleDays).toEqual([
      { localDate: '2030-01-05', firstWaveLocalTime: '18:00', maxResultGames: 1 },
      { localDate: '2030-01-08', firstWaveLocalTime: '21:15', maxResultGames: 2 },
    ]);
  });

  it('explains a started-round rejection and offers one clear retry action', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000925',
      slug: 'started-playoff-schedule',
      title: 'Плей-офф с начатым раундом',
      description: '',
      status: 'playoff',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 4,
      lifecycle: TEST_LIFECYCLE,
      registrationOpensAt: '2029-12-01T09:00:00.000Z',
      registrationClosesAt: '2029-12-02T09:00:00.000Z',
      startsAt: '2029-12-03T09:00:00.000Z',
      rules: {
        config: {
          regularSource: 'head_to_head',
          timezone: 'Europe/Moscow',
          participantLimit: 4,
          playoffSize: 4,
        },
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 2,
            scheduleDays: [
              { localDate: '2030-01-05', firstWaveLocalTime: '18:00', maxResultGames: 3 },
            ],
          },
        ],
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'updateAdminTournament').mockRejectedValue(
      new ApiError(
        409,
        'playoff_round_started',
        'Раунд уже начался. Перенесите оставшиеся игры отдельно в календаре.',
        { roundNumber: 1 },
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Открыть Плей-офф с начатым раундом' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить расписание плей-офф' }));
    fireEvent.change(screen.getByLabelText('Раунд 1, день 1: дата'), {
      target: { value: '2030-01-06' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить расписание' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Раунд 1 уже начался. Перенесите оставшиеся игры отдельно в календаре.',
    );
    expect(screen.getAllByRole('button', { name: 'Повторить сохранение' })).toHaveLength(1);
    expect(screen.queryByText('Не удалось сохранить изменения.')).not.toBeInTheDocument();
  });

  it('puts the remaining games into a new playoff day without changing the first day', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000926',
      slug: 'split-playoff-days',
      title: 'Плей-офф с распределением дней',
      description: '',
      status: 'playoff',
      regularSource: 'head_to_head',
      revision: 4,
      participantCount: 4,
      lifecycle: TEST_LIFECYCLE,
      registrationOpensAt: '2029-12-01T09:00:00.000Z',
      registrationClosesAt: '2029-12-02T09:00:00.000Z',
      startsAt: '2029-12-03T09:00:00.000Z',
      rules: {
        config: {
          regularSource: 'head_to_head',
          timezone: 'Europe/Moscow',
          participantLimit: 4,
          playoffSize: 2,
        },
        playoffRounds: [
          {
            roundNumber: 1,
            winsRequired: 4,
            scheduleDays: [
              { localDate: '2030-01-05', firstWaveLocalTime: '18:00', maxResultGames: 7 },
            ],
          },
        ],
      },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    vi.spyOn(api, 'fetchAdminTournamentDuelTemplates').mockResolvedValue({ templates: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Открыть Плей-офф с распределением дней' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить расписание плей-офф' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Раунд 1, день 1: количество игр' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить день в раунд 1' }));

    expect(screen.getByRole('spinbutton', { name: 'Раунд 1, день 1: количество игр' })).toHaveValue(
      4,
    );
    expect(screen.getByRole('spinbutton', { name: 'Раунд 1, день 2: количество игр' })).toHaveValue(
      3,
    );
  });

  it('shows the admin schedule as a monthly calendar with games below the selected day', async () => {
    const tournament: api.AdminTournament = {
      id: '00000000-0000-4000-8000-000000000981',
      slug: 'schedule-cup',
      title: 'Кубок с большим расписанием',
      description: '',
      status: 'regular',
      regularSource: 'head_to_head',
      revision: 5,
      participantCount: 8,
      lifecycle: TEST_LIFECYCLE,
      startsAt: '2030-01-03T09:00:00.000Z',
      projectedEndsAt: '2030-01-06T09:00:00.000Z',
      rules: { config: { timezone: 'Europe/Moscow' } },
    };
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    vi.spyOn(api, 'fetchAdminTournamentSchedule').mockResolvedValue({
      fixtures: [
        {
          id: 'fixture-1',
          fixtureNumber: 1,
          stage: 'regular',
          roundNumber: 1,
          scheduledStartsAt: '2030-01-03T09:00:00.000Z',
          windowEndsAt: '2030-01-03T09:20:00.000Z',
          status: 'scheduled',
          home: { userId: 'home-1', name: 'Александр Первый' },
          away: { userId: 'away-1', name: 'Роза Вторая' },
          score: { home: 0, away: 0 },
        },
        {
          id: 'fixture-2',
          fixtureNumber: 2,
          stage: 'regular',
          roundNumber: 1,
          scheduledStartsAt: '2030-01-03T09:20:00.000Z',
          windowEndsAt: '2030-01-03T09:40:00.000Z',
          status: 'active',
          home: { userId: 'home-2', name: 'Игрок Три' },
          away: { userId: 'away-2', name: 'Игрок Четыре' },
          score: { home: 1, away: 0 },
        },
        {
          id: 'fixture-3',
          fixtureNumber: 3,
          stage: 'playoff',
          roundNumber: 2,
          scheduledStartsAt: '2030-01-04T09:00:00.000Z',
          windowEndsAt: '2030-01-04T09:20:00.000Z',
          status: 'conditional',
          home: { userId: 'home-3', name: 'Сириус' },
          away: { userId: 'away-3', name: 'Александра' },
          score: { home: 0, away: 0 },
        },
        {
          id: 'fixture-4',
          fixtureNumber: 4,
          stage: 'third_place',
          roundNumber: 3,
          scheduledStartsAt: '2030-01-05T09:00:00.000Z',
          windowEndsAt: '2030-01-05T09:20:00.000Z',
          status: 'active',
          home: null,
          away: null,
          score: { home: 0, away: 0 },
        },
      ],
      matchdays: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={tournament}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Календарь' }));

    expect(await screen.findByRole('grid', { name: 'Календарь турнира' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 января' })).toBeInTheDocument();
    expect(screen.getByText('12:00–12:20')).toBeInTheDocument();
    expect(screen.getByText('12:20–12:40')).toBeInTheDocument();
    expect(screen.getAllByText('1-й тур')).toHaveLength(2);
    expect(screen.getByText('Александр Первый — Роза Вторая')).toBeInTheDocument();
    expect(screen.queryByText('Следующие игры')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /4 января, 1 игра, плей-офф/i }));
    expect(screen.getByRole('heading', { name: '4 января' })).toBeInTheDocument();
    expect(screen.getByText('Сириус — Александра')).toBeInTheDocument();
    expect(screen.getByText('Если серия продолжится')).toBeInTheDocument();
    expect(screen.queryByText('Соперники определятся')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /5 января, 1 игра, плей-офф/i }));
    expect(screen.getByRole('heading', { name: '5 января' })).toBeInTheDocument();
    expect(screen.getByText('Пара сформируется по итогам предыдущего раунда')).toBeInTheDocument();
    expect(screen.getByText('Ожидает определения пары')).toBeInTheDocument();
    expect(screen.getByText('Плей-офф · матч за 3-е место')).toBeInTheDocument();
    expect(screen.queryByText('Идёт игра')).not.toBeInTheDocument();
    expect(screen.queryByText('Счёт 0:0')).not.toBeInTheDocument();
    expect(screen.queryByText(/09:00:00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Соперник не определён/)).not.toBeInTheDocument();
    expect(screen.queryByText('Условная игра')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Описание обновлено' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));

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
      'imageUrl',
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '3. Регулярка' }));
    fireEvent.change(screen.getByLabelText('Первый тур дня'), {
      target: { value: '01:45' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '5. Сроки' }));
    await chooseGlassOption('Часовой пояс', 'Москва (МСК)');
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    fireEvent.click(screen.getByRole('button', { name: '3. Регулярка' }));
    fireEvent.change(screen.getByLabelText('Первый тур дня'), {
      target: { value: '02:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: '5. Сроки' }));
    fireEvent.change(screen.getByLabelText('Первый тур'), {
      target: { value: '2026-03-08' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));
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
      lifecycle: TEST_LIFECYCLE,
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
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    expect(screen.queryByRole('button', { name: 'Отменить турнир' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать турнир' }));
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('Кубок CRUD');
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), {
      target: { value: 'Кубок CRUD обновлён' },
    });
    fireEvent.click(screen.getByRole('button', { name: '8. Проверка' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить и (закрыть|опубликовать)/ }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        tournament.id,
        5,
        expect.objectContaining({ title: 'Кубок CRUD обновлён', rules: expect.any(Object) }),
      ),
    );
    await screen.findByRole('tab', { name: 'Заявки и оплаты' });

    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Дублировать турнир' }));
    await waitFor(() =>
      expect(duplicate).toHaveBeenCalledWith(tournament.id, {
        title: 'Копия: Кубок CRUD',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить черновик' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление черновика' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(tournament.id));
  });

  it('allows a draft with participants to be cancelled instead of leaving it stuck', async () => {
    const tournament = {
      id: '00000000-0000-4000-8000-000000000933',
      slug: 'draft-with-participant',
      title: 'Кубок с заявкой',
      description: 'Черновик, в котором уже есть участник',
      status: 'draft',
      regularSource: 'head_to_head' as const,
      revision: 3,
      participantCount: 1,
      lifecycle: TEST_LIFECYCLE,
      registrationOpensAt: null,
      registrationClosesAt: null,
      startsAt: null,
      rules: { config: { regularSource: 'head_to_head' } },
    };
    vi.spyOn(api, 'fetchAdminTournaments').mockResolvedValue({ tournaments: [tournament] });
    vi.spyOn(api, 'fetchAdminTournamentParticipants').mockResolvedValue({ participants: [] });
    const cancel = vi.spyOn(api, 'cancelAdminTournament').mockResolvedValue({
      tournamentId: tournament.id,
      status: 'cancelled',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentAdmin />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Открыть Кубок с заявкой' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));

    expect(screen.queryByRole('button', { name: 'Удалить черновик' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить турнир' }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith(tournament.id, 3));
  });
});
