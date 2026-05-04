import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DAILY_PERIOD_SPEED_PRESETS } from '@hockey/game-core';
import { DailyScreen } from './DailyScreen.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import type { DailyStateResponse } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: () => <div data-testid="pixi-stage-stub" />,
}));
vi.mock('../game/RinkSvg.js', () => ({
  RinkSvg: () => <div data-testid="rink-svg-stub" />,
}));

const baseState: DailyStateResponse = {
  state: 'idle',
  current_period: 0,
  current_period_shots: 0,
  current_period_goals: 0,
  daily_total_shots: 0,
  daily_total_goals: 0,
  lifetime_total_shots: 0,
  lifetime_total_goals: 0,
  period_started_at: null,
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  server_now: '2026-04-25T12:00:00.000Z',
  daily_seed: null,
  goalie_id: 'rookie',
  shots_per_period: 30,
  total_periods: 3,
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
  recent_periods: [],
  previous_game: null,
  training_cooldown_ends_at: null,
};

const trainingIdleState: TrainingStateResponse = {
  state: 'idle',
  selected_period: null,
  shots_taken: 0,
  goals: 0,
  shots_limit: 500,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  training_seed: null,
  started_at: null,
  server_now: '2026-04-25T12:00:00.000Z',
  goalie_id: 'rookie',
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
};

const trainingActiveState: TrainingStateResponse = {
  ...trainingIdleState,
  state: 'active',
  selected_period: 2,
  shots_taken: 12,
  goals: 5,
  training_seed: 'a'.repeat(64),
  started_at: '2026-04-25T11:55:00.000Z',
};

function renderWith(initialEntries: string[] = ['/']) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <DailyScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().setSession({
    accessToken: 'token',
    refreshToken: 'r',
    user: { id: 'u1', displayName: 'Tester' },
  });
  useDailyStore.setState({ data: null, loading: false, inFlight: false, error: null });
  useTrainingSessionStore.setState({ data: null, loading: false, inFlight: false, error: null });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    return new Response(
      JSON.stringify(url.includes('/duel/training/state') ? trainingIdleState : baseState),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
});

describe('DailyScreen', () => {
  it('shows loader while fetching state', () => {
    renderWith();
    expect(screen.getByText(/Загрузка/)).toBeInTheDocument();
  });

  it('renders idle view with start button after fetch', async () => {
    renderWith();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'На площадку' })).toBeInTheDocument();
    });
    expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Об описании страницы' }));
    expect(
      screen.getByRole('dialog', { name: 'Здесь будет описание страницы' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Здесь будут собраны все игровые события/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.getByText('1-й период доступен')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.getByLabelText('Статус ежедневной игры')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение режима Тренировка')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение режима Любители')).toBeInTheDocument();
    expect(screen.getByLabelText('Изображение режима Профессионалы')).toBeInTheDocument();
    expect(screen.getByText('Три периода на выбор')).toBeInTheDocument();
    expect(screen.getByText('0/500 бросков сегодня')).toBeInTheDocument();
    expect(screen.getByText('0/1000 шайб для открытия')).toBeInTheDocument();
    expect(screen.getByText('Раздел в разработке')).toBeInTheDocument();
    const amateurArtwork = screen.getByLabelText('Изображение режима Любители');
    const proArtwork = screen.getByLabelText('Изображение режима Профессионалы');
    expect(amateurArtwork).toHaveStyle({ opacity: '1' });
    expect(amateurArtwork.querySelector('img')).toHaveStyle({
      filter: 'grayscale(1) saturate(0.1)',
      opacity: '0.58',
    });
    expect(proArtwork).toHaveStyle({ opacity: '1' });
    expect(proArtwork.querySelector('img')).toHaveStyle({
      filter: 'grayscale(1) saturate(0.1)',
      opacity: '0.58',
    });
  });

  it('names the next available daily period on the hub', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...baseState, current_period: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith();

    expect(await screen.findByText('3-й период доступен')).toBeInTheDocument();
    expect(
      screen.getByLabelText('3-й период доступен. Время периода 20:00. Период 3'),
    ).toBeInTheDocument();
  });

  it('restores amateur artwork color after 1000 lifetime goals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...baseState, lifetime_total_goals: 1000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWith();

    const amateurArtwork = await screen.findByLabelText('Изображение режима Любители');
    expect(amateurArtwork).toHaveStyle({ opacity: '1' });
    expect(amateurArtwork.querySelector('img')).toHaveStyle({
      filter: 'none',
      opacity: '1',
    });
    expect(screen.queryByText('Открыт')).not.toBeInTheDocument();
    expect(screen.queryByText('1000 шайб')).not.toBeInTheDocument();
    expect(screen.queryByText('Скоро')).not.toBeInTheDocument();
  });

  it('keeps an active daily period on the modes hub until the user opens it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 1,
          current_period_shots: 4,
          current_period_goals: 2,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();

    const resume = await screen.findByRole('button', { name: 'Вернуться на площадку' });
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
    expect(screen.getByText('1-й период')).toBeInTheDocument();
    expect(screen.getByText('До конца')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.queryByText('Броски')).not.toBeInTheDocument();

    fireEvent.click(resume);
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
  });

  it('returns from an active daily period to the modes hub', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 1,
          current_period_shots: 4,
          current_period_goals: 2,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith(['/?view=daily']);

    const back = await screen.findByRole('button', { name: 'К режимам' });
    fireEvent.click(back);

    expect(
      await screen.findByRole('button', { name: 'Вернуться на площадку' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
  });

  it('keeps the third period playable instead of showing the closed-day modal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 3,
          current_period_shots: 0,
          current_period_goals: 0,
          daily_total_shots: 60,
          daily_total_goals: 24,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith(['/?view=daily']);

    const shotButton = await screen.findByRole('button', { name: 'БРОСОК' });
    expect(shotButton).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Звук в разработке' }));
    expect(screen.getByRole('status')).toHaveTextContent('Звук в разработке');
    expect(screen.getByText('00/30')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'День завершён' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ДЕНЬ ЗАВЕРШЁН' })).not.toBeInTheDocument();
  });

  it('renders break view with countdown', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'break_active',
          current_period: 1,
          break_ends_at: future,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();
    await waitFor(() => {
      expect(screen.getByText(/Перерыв/)).toBeInTheDocument();
    });
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.queryByText(/Следующий/)).not.toBeInTheDocument();
    const breakButton = screen.getByRole('button', { name: 'Вернуться на площадку' });
    expect(breakButton).toBeEnabled();
  });

  it('opens the rink during a break so the timer surface remains visible', async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'break_active',
          current_period: 1,
          daily_total_shots: 10,
          daily_total_goals: 4,
          break_ends_at: future,
          daily_seed: 'seed-abc',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();

    const breakButton = await screen.findByRole('button', { name: 'Вернуться на площадку' });
    fireEvent.click(breakButton);

    await waitFor(() => {
      expect(screen.getAllByText('ПЕРЕРЫВ').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('10/90')).toBeInTheDocument();
    const breakControl = screen.getByRole('button', { name: 'ПЕРЕРЫВ' });
    expect(breakControl).toBeDisabled();
    expect(screen.getByRole('button', { name: 'К режимам' })).toBeEnabled();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('can leave the daily rink start modal without starting a period', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderWith();

    const rinkButton = await screen.findByRole('button', { name: 'На площадку' });
    fireEvent.click(rinkButton);

    const homeButton = await screen.findByRole('button', { name: 'Вернуться к режимам' });
    fireEvent.click(homeButton);

    await waitFor(() => {
      expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    });
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(false);
  });

  it('renders closed view', async () => {
    const previousGame = {
      day_date: '2026-04-25',
      total_shots: 48,
      total_goals: 19,
      total_duration_ms: 1_980_000,
      periods: [
        {
          period_number: 1,
          shots_taken: 30,
          goals: 14,
          closed_reason: 'quota' as const,
          duration_ms: 1_200_000,
          ended_at: '2026-04-25T12:20:00.000Z',
        },
        {
          period_number: 2,
          shots_taken: 18,
          goals: 5,
          closed_reason: 'day_end' as const,
          duration_ms: 780_000,
          ended_at: '2026-04-25T21:00:00.000Z',
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'closed',
          current_period: 3,
          daily_total_shots: 90,
          daily_total_goals: 42,
          previous_game: previousGame,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();
    await waitFor(() => {
      expect(screen.getByText('Завершена')).toBeInTheDocument();
    });
    expect(screen.getByText('До обновления')).toBeInTheDocument();
    expect(screen.getByText('Период')).toBeInTheDocument();
    expect(screen.getByLabelText(/Периоды не активны/)).toBeInTheDocument();
    expect(screen.queryByText(/Ждём следующий день/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Следующий/)).not.toBeInTheDocument();
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'На площадку' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Статистика последней игры' }));
    expect(screen.getByRole('dialog', { name: 'Статистика последней игры' })).toBeInTheDocument();
    expect(screen.getByText('Статистика прошлой игры')).toBeInTheDocument();
    expect(screen.getByText('Дата: 25.04.2026')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('33:00')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(
      screen.getByLabelText('1-й период: 14 голов из 30 бросков за 20:00'),
    ).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByLabelText('2-й период: 5 голов из 18 бросков за 13:00')).toBeInTheDocument();
    expect(screen.getByText('13:00')).toBeInTheDocument();
    expect(screen.queryByText('лимит бросков')).not.toBeInTheDocument();
    expect(screen.queryByText('день закончился')).not.toBeInTheDocument();
    expect(screen.queryByText('время вышло')).not.toBeInTheDocument();
    expect(screen.getByLabelText('3-й период: не сыгран')).toBeInTheDocument();
    expect(screen.getByText('не сыгран')).toBeInTheDocument();
  });

  it('shows empty previous-game stats state before the first completed game', async () => {
    renderWith();

    const statsButton = await screen.findByRole('button', {
      name: 'Статистика последней игры',
    });
    fireEvent.click(statsButton);

    expect(screen.getByRole('dialog', { name: 'Статистика последней игры' })).toBeInTheDocument();
    expect(screen.getByText('Игр пока нет')).toBeInTheDocument();
    expect(screen.getByText(/После завершения первой ежедневной игры/)).toBeInTheDocument();
  });

  it('keeps the hub daily action disabled when the day is closed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          state: 'closed',
          current_period: 3,
          daily_total_shots: 90,
          daily_total_goals: 42,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith();

    const rinkButton = await screen.findByRole('button', { name: 'На площадку' });
    expect(rinkButton).toBeDisabled();
    fireEvent.click(rinkButton);

    expect(screen.queryByRole('dialog', { name: 'День завершён' })).not.toBeInTheDocument();
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(false);
  });

  it('switches from daily game to the training placeholder', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith();

    const beginnerCard = await screen.findByRole('button', { name: 'Тренировка' });
    fireEvent.click(beginnerCard);

    expect(screen.getByRole('heading', { name: 'Тренировка' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Начать тренировку/ })).toBeInTheDocument();
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.getByText('ДО ОБНОВЛЕНИЯ')).toBeInTheDocument();
    expect(screen.getByText('Скорости 1-го периода')).toBeInTheDocument();
    expect(screen.getByText('0,55/с')).toBeInTheDocument();
  });

  it('shows why training is locked while the daily game is in progress', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          state: 'period_active',
          current_period: 2,
          current_period_shots: 3,
          daily_seed: 'seed-abc',
          period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith();

    const trainingCard = await screen.findByRole('button', { name: 'Тренировка' });
    expect(screen.getByText('Закрыта до завершения игры')).toBeInTheDocument();
    fireEvent.click(trainingCard);

    expect(screen.getByRole('dialog', { name: 'Тренировка закрыта' })).toBeInTheDocument();
    expect(screen.getByText(/не завершён 3-й период/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Тренировка', level: 1 })).not.toBeInTheDocument();
  });

  it('shows why the daily game is locked after a training shot', async () => {
    const cooldownEndsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify({ ...trainingIdleState, shots_taken: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          ...baseState,
          training_cooldown_ends_at: cooldownEndsAt,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    renderWith();

    const dailyButton = await screen.findByRole('button', { name: /Игра через/ });
    expect(screen.getByText('Восстановление')).toBeInTheDocument();
    expect(screen.getByText('До игры')).toBeInTheDocument();
    fireEvent.click(dailyButton);

    expect(screen.getByRole('dialog', { name: 'Нужно восстановиться' })).toBeInTheDocument();
    expect(screen.getByText(/можно начать только через 2 часа/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
  });

  it('keeps active training on the setup screen until the user continues it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/training/start')) {
        return new Response(JSON.stringify(trainingActiveState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith();

    const beginnerCard = await screen.findByRole('button', { name: 'Тренировка' });
    fireEvent.click(beginnerCard);

    expect(
      await screen.findByRole('button', { name: /Продолжить тренировку/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '3 период' }));
    expect(screen.getByRole('tab', { name: '3 период' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Продолжить тренировку/ }));
    await waitFor(() => {
      const startCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes('/duel/training/start'),
      );
      expect(startCall?.[1]?.body).toBe(JSON.stringify({ period_number: 3 }));
    });
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    expect(screen.getByText('12/500')).toBeInTheDocument();
    expect(screen.getByText('ЛИМИТ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Звук в разработке' }));
    expect(screen.getByRole('status')).toHaveTextContent('Звук в разработке');
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('shows a modal for locked amateur level from the card', async () => {
    renderWith();

    const amateurButton = await screen.findByRole('button', { name: 'Любители' });
    fireEvent.click(amateurButton);

    expect(screen.getByRole('dialog', { name: 'Не хватает шайб' })).toBeInTheDocument();
    expect(screen.getByText('Не хватает шайб')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Для открытия любительских игр необходимо забить 1000 шайб в ежедневных играх',
      ),
    ).toBeInTheDocument();
  });

  it('shows a modal for pro level from the card', async () => {
    renderWith();

    const proButton = await screen.findByRole('button', { name: 'Профессионалы' });
    fireEvent.click(proButton);

    expect(screen.getByRole('dialog', { name: 'Раздел в разработке' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Следите за обновлениями игры. Как только режим будет готов, мы вам обязательно сообщим.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking start period triggers POST /duel/daily/period/start', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/duel/training/state')) {
        return new Response(JSON.stringify(trainingIdleState), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/duel/daily/period/start')) {
        return new Response(
          JSON.stringify({
            ...baseState,
            state: 'period_active',
            current_period: 1,
            daily_seed: 'seed-abc',
            period_ends_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(baseState), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWith();
    const rinkButton = await screen.findByRole('button', { name: 'На площадку' });
    fireEvent.click(rinkButton);
    const startButton = await screen.findByRole('button', { name: /Начать 1-й период/ });
    fireEvent.click(startButton);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(true);
    });
  });
});
