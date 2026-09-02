import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentOperations } from './TournamentOperations.js';
import type { AdminTournament } from './adminApi.js';
import type { TournamentLifecycleDTO } from '../api/tournament.js';

const designSystemCss = readFileSync(resolve(process.cwd(), 'src/app/design-system.css'), 'utf8');
const TEST_LIFECYCLE: TournamentLifecycleDTO = {
  action: 'unchanged',
  dueAt: null,
  approvedParticipantCount: 0,
  requiredParticipantCount: 2,
  reason: null,
};

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
    lifecycle: TEST_LIFECYCLE,
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TournamentOperations', () => {
  it('opens playoff schedule editing from tournament actions after the bracket is created', async () => {
    const onEdit = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{ ...tournament(), status: 'playoff' }}
          onBack={vi.fn()}
          onEdit={onEdit}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    expect(
      screen.queryByRole('button', { name: 'Перенести регулярный сезон' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить расписание плей-офф' }));

    expect(onEdit).toHaveBeenCalledWith(3, true);
  });

  it('puts playoff incidents in a clear requires-decision block', async () => {
    vi.spyOn(await import('./adminApi.js'), 'fetchAdminTournamentSchedule').mockResolvedValue({
      matchdays: [],
      fixtures: [
        {
          id: 'fixture-1',
          fixtureNumber: 7,
          stage: 'playoff',
          roundNumber: 1,
          scheduledStartsAt: '2030-09-10T12:00:00.000Z',
          windowEndsAt: '2030-09-10T12:20:00.000Z',
          status: 'needs_reschedule',
          home: { userId: 'u1', name: 'Первый игрок' },
          away: { userId: 'u2', name: 'Второй игрок' },
          score: { home: 0, away: 0 },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{ ...tournament(), status: 'playoff' }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Календарь' }));

    expect(await screen.findByRole('heading', { name: 'Требуют решения' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /игра №7.*нужно назначить новое время/i }),
    ).toBeInTheDocument();
  });

  it('requires a reason and a separate confirmation before forcing a playoff series winner', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith('/confirm')
        ? { id: 'decision-1', status: 'confirmed' }
        : {
            id: 'decision-1',
            seriesId: 'series-1',
            winnerParticipantId: 'participant-1',
            reason: 'Игрок дисквалифицирован',
            status: 'pending',
            factualScore: { higherSeedWins: 2, lowerSeedWins: 1 },
            requestedAt: '2030-09-10T12:00:00.000Z',
            confirmedAt: null,
          };
      return new Response(JSON.stringify(body), {
        status: url.endsWith('/confirm') ? 200 : 201,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.spyOn(await import('./adminApi.js'), 'fetchAdminTournamentParticipants').mockResolvedValue({
      participants: [
        {
          id: 'participant-1',
          user_id: 'user-1',
          display_name: 'Первый игрок',
          avatar_url: null,
          state: 'approved',
          seed: 1,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required',
        },
        {
          id: 'participant-2',
          user_id: 'user-2',
          display_name: 'Второй игрок',
          avatar_url: null,
          state: 'approved',
          seed: 2,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required',
        },
      ],
    });
    vi.spyOn(await import('./adminApi.js'), 'fetchAdminTournamentBracket').mockResolvedValue({
      series: [
        {
          id: 'series-1',
          bracket_position: 1,
          kind: 'championship',
          round_number: 1,
          round_name: 'Полуфиналы',
          wins_required: 4,
          status: 'active',
          higher_user_id: 'user-1',
          higher_name: 'Первый игрок',
          higher_avatar_url: null,
          higher_seed: 1,
          higher_seed_wins: 2,
          lower_user_id: 'user-2',
          lower_name: 'Второй игрок',
          lower_avatar_url: null,
          lower_seed: 4,
          lower_seed_wins: 1,
          winner_user_id: null,
          depends_on: { key: 'semi-1', sources: [] },
          fixtures: [
            {
              id: 'fixture-1',
              gameNumber: 1,
              scheduledStartsAt: '2030-09-01T07:00:00.000Z',
              windowEndsAt: '2030-09-01T08:00:00.000Z',
              status: 'settled',
              homeName: 'Первый игрок',
              awayName: 'Второй игрок',
              homeScore: 3,
              awayScore: 2,
              winnerSide: 'home',
            },
          ],
        },
        {
          id: 'series-2',
          bracket_position: 2,
          kind: 'championship',
          round_number: 1,
          round_name: 'Полуфиналы',
          wins_required: 4,
          status: 'pending',
          higher_user_id: null,
          higher_name: null,
          higher_avatar_url: null,
          higher_seed: null,
          higher_seed_wins: 0,
          lower_user_id: null,
          lower_name: null,
          lower_avatar_url: null,
          lower_seed: null,
          lower_seed_wins: 0,
          winner_user_id: null,
          depends_on: { key: 'semi-2', sources: [] },
          fixtures: [],
        },
        {
          id: 'series-3',
          bracket_position: 1,
          kind: 'championship',
          round_number: 2,
          round_name: 'Финал',
          wins_required: 4,
          status: 'pending',
          higher_user_id: null,
          higher_name: null,
          higher_avatar_url: null,
          higher_seed: null,
          higher_seed_wins: 0,
          lower_user_id: null,
          lower_name: null,
          lower_avatar_url: null,
          lower_seed: null,
          lower_seed_wins: 0,
          winner_user_id: null,
          depends_on: {
            key: 'final',
            sources: [
              { type: 'winner', seriesKey: 'semi-1' },
              { type: 'winner', seriesKey: 'semi-2' },
            ],
          },
          fixtures: [],
        },
      ],
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{ ...tournament(), status: 'playoff' }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Сетка' }));
    const semifinalCard = (await screen.findByText('Полуфинал 1')).closest<HTMLElement>(
      '.tournament-bracket-series',
    );
    expect(semifinalCard).not.toBeNull();
    expect(within(semifinalCard!).getByText('Первый игрок')).toBeInTheDocument();
    expect(within(semifinalCard!).getByText('Второй игрок')).toBeInTheDocument();
    expect(within(semifinalCard!).queryByText(/Игра 1/)).not.toBeInTheDocument();
    expect(
      within(semifinalCard!).queryByRole('button', { name: 'Решить серию вручную' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(semifinalCard!).getByRole('button', { name: 'Открыть серию Полуфинал 1' }),
    );
    expect(
      within(semifinalCard!).getByText('Игра 1 · 1 сентября, 10:00–11:00'),
    ).toBeInTheDocument();
    expect(within(semifinalCard!).getByLabelText('Посев 1')).toHaveTextContent('1');
    expect(within(semifinalCard!).getByLabelText('2 победы в серии')).toHaveTextContent('2');
    expect(within(semifinalCard!).getByLabelText('1 победа в серии')).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: 'Полуфиналы' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Финал' }));
    expect(screen.getByText('Победитель полуфинала 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Полуфиналы' }));
    const reopenedSemifinalCard = screen
      .getByText('Полуфинал 1')
      .closest<HTMLElement>('.tournament-bracket-series');
    expect(reopenedSemifinalCard).not.toBeNull();
    fireEvent.click(
      within(reopenedSemifinalCard!).getByRole('button', { name: 'Открыть серию Полуфинал 1' }),
    );
    fireEvent.click(
      await within(reopenedSemifinalCard!).findByRole('button', { name: 'Решить серию вручную' }),
    );
    expect(screen.getByRole('button', { name: 'Подготовить решение' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Причина решения' }), {
      target: { value: 'Игрок дисквалифицирован' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить решение' }));

    expect(await screen.findByText(/решение ещё не применено/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить победителя серии' }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/winner-decisions\/[^/]+\/confirm$/),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows the automatic lifecycle and keeps only the manual regular-season start', async () => {
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
    const refreshSelectedTournament = vi.fn().mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            status: 'scheduling',
            lifecycle: {
              action: 'await_manual_regular_start',
              dueAt: null,
              approvedParticipantCount: 8,
              requiredParticipantCount: 8,
              reason: null,
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
          onTournamentUpdated={refreshSelectedTournament}
        />
      </QueryClientProvider>,
    );

    const startRegularSeasonButton = screen.getByRole('button', {
      name: 'Начать регулярный сезон',
    });
    expect(startRegularSeasonButton).toHaveClass(
      'btn',
      'tournament-lifecycle-panel__primary-action',
    );
    expect(screen.queryByRole('button', { name: 'Открыть регистрацию' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Опубликовать календарь' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /запустить плей-офф/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Начать регулярный сезон' }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/admin/tournaments/${tournament().id}/schedule/publish`,
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(refreshSelectedTournament).toHaveBeenCalledTimes(1));
  });

  it('moves the generated regular schedule and future playoffs from tournament actions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/schedule/shift') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            shiftedCalendarDays: 4,
            tournament: { ...tournament(), revision: 4, startsAt: '2030-09-05T07:00:00.000Z' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/schedule')) {
        return new Response(JSON.stringify({ fixtures: [], matchdays: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ participants: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const refreshSelectedTournament = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            status: 'scheduling',
            lifecycle: {
              action: 'await_manual_regular_start',
              dueAt: null,
              approvedParticipantCount: 4,
              requiredParticipantCount: 2,
              reason: null,
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
          onTournamentUpdated={refreshSelectedTournament}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Перенести регулярный сезон' }));

    const dialog = screen.getByRole('dialog', { name: 'Перенести регулярный сезон' });
    expect(dialog).toHaveTextContent('Регистрация останется без изменений');
    expect(dialog).toHaveTextContent('регулярный сезон и плей-офф');
    const newFirstMatchday = within(dialog).getByLabelText('Новая дата первого тура');
    expect(newFirstMatchday).toHaveAttribute('min');
    expect(dialog).toHaveTextContent('сегодняшний или будущий день');
    fireEvent.change(newFirstMatchday, {
      target: { value: '2030-09-05' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Перенести расписание' }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/admin/tournaments/${tournament().id}/schedule/shift`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ expectedRevision: 3, firstMatchdayLocalDate: '2030-09-05' }),
        }),
      ),
    );
    await waitFor(() => expect(refreshSelectedTournament).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('dialog', { name: 'Перенести регулярный сезон' }),
    ).not.toBeInTheDocument();
  });

  it('allows selecting the current tournament date when the regular season has not started', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-02T09:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ participants: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            status: 'scheduling',
            regularSource: 'daily_aggregate',
            startsAt: '2030-09-01T21:00:00.000Z',
            lifecycle: {
              action: 'await_manual_regular_start',
              dueAt: null,
              approvedParticipantCount: 4,
              requiredParticipantCount: 2,
              reason: null,
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия турнира' }));
    fireEvent.click(screen.getByRole('button', { name: 'Перенести регулярный сезон' }));

    const dialog = screen.getByRole('dialog', { name: 'Перенести регулярный сезон' });
    expect(within(dialog).getByLabelText('Новая дата первого тура')).toHaveAttribute(
      'min',
      '2030-09-02',
    );
    expect(dialog).toHaveTextContent('сегодняшний или будущий день');
  });

  it('offers the exceptional calendar action only for a blocked head-to-head tournament with two players', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith('/participants')
        ? { participants: [] }
        : url.endsWith('/schedule')
          ? { fixtures: [], matchdays: [] }
          : { tournamentId: tournament().id, status: 'scheduling' };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const base = {
      ...tournament(),
      status: 'registration_blocked' as const,
      lifecycle: {
        action: 'block_registration' as const,
        dueAt: null,
        approvedParticipantCount: 2,
        requiredParticipantCount: 4,
        reason: 'not_enough_participants' as const,
      },
    };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={base}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Создать календарь' }));
    expect(screen.getByRole('dialog', { name: 'Создать календарь' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Создать календарь' })).toHaveTextContent(
      'Подтверждённые игроки: 2',
    );
    expect(screen.getByRole('combobox', { name: 'Размер плей-офф' })).toHaveTextContent('2 игрока');
    fireEvent.click(
      screen.getByRole('button', { name: 'Подтвердить размер плей-офф и создать календарь' }),
    );
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/admin/tournaments/${base.id}/schedule/generate-manual`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ expectedRevision: base.revision, playoffSize: 2 }),
        }),
      ),
    );

    rerender(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...base,
            lifecycle: {
              ...base.lifecycle,
              approvedParticipantCount: 1,
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Создать календарь' })).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...base,
            regularSource: 'daily_aggregate',
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Создать календарь' })).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...base,
            regularSource: 'classic',
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Создать календарь' })).not.toBeInTheDocument();
  });

  it('shows calendar recovery immediately after approving the player who completes the blocked roster', async () => {
    const base = {
      ...tournament(),
      status: 'registration' as const,
      lifecycle: {
        action: 'registration_open' as const,
        dueAt: null,
        approvedParticipantCount: 1,
        requiredParticipantCount: 4,
        reason: null,
      },
    };
    const refreshed = {
      ...base,
      status: 'registration_blocked' as const,
      lifecycle: {
        action: 'block_registration' as const,
        dueAt: null,
        approvedParticipantCount: 2,
        requiredParticipantCount: 4,
        reason: 'not_enough_participants' as const,
      },
    };
    const participants = {
      participants: [
        {
          id: 'approved-player',
          user_id: 'approved-user',
          display_name: 'Подтверждённый игрок',
          avatar_url: null,
          state: 'approved' as const,
          seed: null,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required' as const,
        },
        {
          id: 'applied-player',
          user_id: 'applied-user',
          display_name: 'Игрок на проверке',
          avatar_url: null,
          state: 'applied' as const,
          seed: null,
          entry_fee_coins: 0,
          entry_fee_state: 'not_required' as const,
        },
      ],
    };
    vi.spyOn(await import('./adminApi.js'), 'fetchAdminTournamentParticipants').mockResolvedValue(
      participants,
    );
    const approve = vi
      .spyOn(await import('./adminApi.js'), 'approveAdminTournamentParticipant')
      .mockResolvedValue({ participantId: 'applied-player', state: 'approved' });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const rerenderTournament: { current?: (next: AdminTournament) => void } = {};
    const refreshSelectedTournament = vi.fn(async () => rerenderTournament.current?.(refreshed));
    const rendered = render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={base}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
          onTournamentUpdated={refreshSelectedTournament}
        />
      </QueryClientProvider>,
    );
    rerenderTournament.current = (next) => {
      rendered.rerender(
        <QueryClientProvider client={client}>
          <TournamentOperations
            tournament={next}
            onBack={vi.fn()}
            onEdit={vi.fn()}
            onRemoved={vi.fn()}
            onTournamentUpdated={refreshSelectedTournament}
          />
        </QueryClientProvider>,
      );
    };

    fireEvent.click(await screen.findByRole('button', { name: 'Управление: Игрок на проверке' }));
    fireEvent.click(screen.getByRole('button', { name: 'Одобрить заявку' }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith(base.id, 'applied-player'));
    await waitFor(() => expect(refreshSelectedTournament).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Создать календарь' })).toBeInTheDocument();
  });

  it('offers only available playoff sizes and sends the size chosen for calendar recovery', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith('/participants')
        ? { participants: [] }
        : { tournamentId: tournament().id, status: 'scheduling' };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const base = {
      ...tournament(),
      status: 'registration_blocked' as const,
      lifecycle: {
        action: 'block_registration' as const,
        dueAt: null,
        approvedParticipantCount: 4,
        requiredParticipantCount: 8,
        reason: 'not_enough_participants' as const,
      },
      rules: { config: { timezone: 'Europe/Moscow', playoffSize: 2 } },
    };
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={base}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Создать календарь' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Размер плей-офф' }));
    expect(await screen.findByRole('option', { name: '2 игрока' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '4 игрока' }));
    expect(screen.queryByRole('option', { name: '8 игрока' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Размер плей-офф' })).toHaveTextContent('4 игрока');
    fireEvent.click(
      screen.getByRole('button', { name: 'Подтвердить размер плей-офф и создать календарь' }),
    );

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `/api/admin/tournaments/${base.id}/schedule/generate-manual`,
        expect.objectContaining({
          body: JSON.stringify({ expectedRevision: base.revision, playoffSize: 4 }),
        }),
      ),
    );
  });

  it('keeps calendar recovery open after an error and lets the administrator retry', async () => {
    let manualRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/participants')) {
        return new Response(JSON.stringify({ participants: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/schedule/generate-manual')) {
        manualRequests += 1;
        if (manualRequests === 1) {
          return new Response(
            JSON.stringify({ error: { code: 'revision_conflict', message: 'stale revision' } }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          );
        }
      }
      return new Response(JSON.stringify({ tournamentId: tournament().id, status: 'scheduling' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const base = {
      ...tournament(),
      status: 'registration_blocked' as const,
      lifecycle: {
        action: 'block_registration' as const,
        dueAt: null,
        approvedParticipantCount: 2,
        requiredParticipantCount: 4,
        reason: 'not_enough_participants' as const,
      },
      rules: { config: { timezone: 'Europe/Moscow', playoffSize: 2 } },
    };
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={base}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Создать календарь' }));
    const dialog = screen.getByRole('dialog', { name: 'Создать календарь' });
    const confirm = within(dialog).getByRole('button', {
      name: 'Подтвердить размер плей-офф и создать календарь',
    });
    expect(confirm).toHaveClass('modal-primary', 'btn--cta');
    fireEvent.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Не удалось создать календарь. Проверьте число подтверждённых игроков и выбранный размер плей-офф, затем повторите.',
    );
    expect(screen.getByRole('dialog', { name: 'Создать календарь' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть создание календаря' }));
    expect(screen.queryByRole('dialog', { name: 'Создать календарь' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Создать календарь' }));
    const retryDialog = screen.getByRole('dialog', { name: 'Создать календарь' });
    expect(within(retryDialog).queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(
      within(retryDialog).getByRole('button', {
        name: 'Подтвердить размер плей-офф и создать календарь',
      }),
    );
    await waitFor(() => expect(manualRequests).toBe(2));
    expect(screen.queryByRole('dialog', { name: 'Создать календарь' })).not.toBeInTheDocument();
  });

  it('uses correct Russian player labels for every supported playoff size', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const base = {
      ...tournament(),
      status: 'registration_blocked' as const,
      lifecycle: {
        action: 'block_registration' as const,
        dueAt: null,
        approvedParticipantCount: 16,
        requiredParticipantCount: 16,
        reason: 'not_enough_participants' as const,
      },
      rules: { config: { timezone: 'Europe/Moscow', playoffSize: 2 } },
    };
    render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={base}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Создать календарь' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Размер плей-офф' }));
    expect(await screen.findByRole('option', { name: '2 игрока' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '4 игрока' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '8 игроков' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '16 игроков' })).toBeInTheDocument();
  });

  it('explains automatic lifecycle milestones in human language', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            lifecycle: {
              action: 'registration_waiting',
              dueAt: '2030-08-01T07:00:00.000Z',
              approvedParticipantCount: 0,
              requiredParticipantCount: 8,
              reason: null,
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(document.querySelector('.tournament-lifecycle-panel')?.textContent).toBe(
      'Регистрация откроется 1 августа в 10:00 мск.',
    );

    rerender(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            lifecycle: {
              action: 'generate_schedule',
              dueAt: null,
              approvedParticipantCount: 8,
              requiredParticipantCount: 8,
              reason: null,
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText('Регистрация завершена. Календарь создаётся автоматически.'),
    ).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            status: 'regular',
            lifecycle: {
              action: 'await_regular_results',
              dueAt: null,
              approvedParticipantCount: 8,
              requiredParticipantCount: 8,
              reason: 'regular_results_incomplete',
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText('Плей-офф начнётся автоматически после завершения всех игр.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /плей-офф/i })).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <TournamentOperations
          tournament={{
            ...tournament(),
            status: 'regular',
            lifecycle: {
              action: 'playoff_schedule_missing',
              dueAt: null,
              approvedParticipantCount: 8,
              requiredParticipantCount: 8,
              reason: 'playoff_schedule_missing',
            },
          }}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onRemoved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText('Укажите дату и время первого раунда плей-офф в настройках турнира.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Настроить расписание плей-офф' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /запустить плей-офф/i })).not.toBeInTheDocument();
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
          tournament={{ ...tournament(), regularSource: 'daily_aggregate' }}
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
    expect(await screen.findByText('1-й тур')).toBeInTheDocument();
    expect(screen.queryByText('Календарь пока пуст.')).not.toBeInTheDocument();
    const style = document.createElement('style');
    style.textContent = designSystemCss;
    document.head.append(style);
    try {
      expect(getComputedStyle(screen.getByText('1-й тур')).color).toBe('rgb(23, 50, 77)');
      const matchday = screen.getByText('1-й тур').closest('article');
      expect(matchday).not.toBeNull();
      expect(getComputedStyle(within(matchday!).getByText(/^1 сентября 2030/)).color).toBe(
        'rgb(83, 107, 130)',
      );
    } finally {
      style.remove();
    }
    expect(screen.getByText('Начало')).toBeInTheDocument();
    expect(screen.getByText('Конец')).toBeInTheDocument();
    expect(screen.queryByText(/1 сентября 2030.*2 сентября 2030/)).not.toBeInTheDocument();
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
