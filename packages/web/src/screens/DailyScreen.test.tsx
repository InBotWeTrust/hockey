import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  daily_seed: null,
  goalie_id: 'rookie',
  shots_per_period: 30,
  total_periods: 3,
  recent_periods: [],
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
  goalie_id: 'rookie',
};

const trainingActiveState: TrainingStateResponse = {
  ...trainingIdleState,
  state: 'active',
  selected_period: 2,
  shots_taken: 12,
  goals: 5,
  training_seed: 'a'.repeat(64),
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
      expect(screen.getByRole('button', { name: /Начать 1-й период/ })).toBeInTheDocument();
    });
    expect(screen.getByText('Ежедневная игра')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Об описании страницы' }));
    expect(
      screen.getByRole('dialog', { name: 'Здесь будет описание страницы' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Здесь будут собраны все игровые события/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.getByText('Игра доступна')).toBeInTheDocument();
    expect(screen.getByText('Можно начать 1-й период')).toBeInTheDocument();
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

    const resume = await screen.findByRole('button', { name: /Вернуться в 1-й период/ });
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();

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
      await screen.findByRole('button', { name: /Вернуться в 1-й период/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'БРОСОК' })).not.toBeInTheDocument();
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
    const breakButton = screen.getByRole('button', { name: /Смотреть перерыв/ });
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

    const breakButton = await screen.findByRole('button', { name: /Смотреть перерыв/ });
    fireEvent.click(breakButton);

    await waitFor(() => {
      expect(screen.getAllByText('ПЕРЕРЫВ').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('10/90')).toBeInTheDocument();
    const breakControl = screen.getByRole('button', { name: 'ПЕРЕРЫВ' });
    expect(breakControl).toBeDisabled();
    expect(screen.getByTestId('pixi-stage-stub')).toBeInTheDocument();
  });

  it('renders closed view', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...baseState,
          state: 'closed',
          current_period: 3,
          daily_total_shots: 90,
          daily_total_goals: 42,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderWith();
    await waitFor(() => {
      expect(screen.getByText(/Ждём следующий день/)).toBeInTheDocument();
    });
    expect(screen.getByText(/До обновления/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Продолжить тренировку/ }));
    expect(await screen.findByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
    expect(screen.getByText('12/500')).toBeInTheDocument();
    expect(screen.getByText('ЛИМИТ')).toBeInTheDocument();
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
    const btn = await screen.findByRole('button', { name: /Начать 1-й период/ });
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/duel/daily/period/start'))).toBe(true);
    });
  });
});
