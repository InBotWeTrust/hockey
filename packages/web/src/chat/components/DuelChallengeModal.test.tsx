import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAmateurAccessToastStore } from '../../amateur/amateurAccessStore.js';
import { useAuthStore } from '../../auth/authStore.js';
import type { DailyStateResponse } from '../../api/duel.js';
import { useDailyStore } from '../../stores/dailyStore.js';
import { DuelChallengeModal } from './DuelChallengeModal.js';

const template = {
  id: 'template-express',
  title: 'Экспресс',
  description: '',
  difficulty: 'easy',
  duel_kind: 'express',
  duel_variant: 'time_attack',
  ranked_enabled: true,
  matchmaking_enabled: true,
  starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: '2100-01-01T00:00:00.000Z',
  total_periods: 1,
  shots_per_period: 30,
  period_duration_ms: 180_000,
  break_duration_ms: 0,
  challenge_ttl_ms: 900_000,
  ready_duration_ms: 900_000,
  ready_no_show_cooldown_ms: 900_000,
  matchmaking_timeout_ms: 300_000,
  ranked_daily_limit: 20,
  ranked_same_opponent_limit: 5,
  power_cap: 100,
  goalie_id: 'rookie',
  period_speed_presets: [],
  period_rules: [{ periodNumber: 1, mode: 'time_attack', durationMs: 180_000, shotsLimit: null }],
  stake_amount: 0,
  entry_fee_amount: 0,
  required_inventory_item_id: null,
  inventory_charges_per_period: 0,
  win_points: 3,
  draw_points: 1,
  win_currency_reward: 0,
  draw_currency_reward: 0,
  win_star_reward: 0,
};

function renderModal(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DuelChallengeModal
          opponentUserId="opponent-1"
          opponentName="Иван"
          onClose={() => undefined}
          onCreated={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DuelChallengeModal Amateur preview access', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      accessToken: 'TOKEN',
      refreshToken: null,
      user: { id: 'me', displayName: 'Me', competitionLevel: 'beginner' },
    });
    useDailyStore.setState({
      data: {
        lifetime_total_goals: 116,
        amateur_unlock_goals_required: 300,
      } as DailyStateResponse,
    });
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
  });

  it('marks the selected duel type with a check indicator and pressed state', async () => {
    useAuthStore.getState().updateUser({ competitionLevel: 'amateur' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ templates: [template] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderModal();

    const option = await screen.findByRole('button', { name: /Экспресс/ });
    expect(option).toHaveAttribute('aria-pressed', 'true');
    expect(option.querySelector('.duel-challenge-option__indicator')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(option.querySelector('.duel-challenge-option__indicator svg')).toBeInTheDocument();
  });

  it('guards profile challenge submission locally for a known beginner', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify(url.includes('/templates') ? { templates: [template] } : { match: {} }),
        {
          status: init?.method === 'POST' ? 201 : 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    renderModal();
    const submit = await screen.findByRole('button', { name: 'Вызвать' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/duel/amateur/challenge') && init?.method === 'POST',
      ),
    ).toBe(false);
    expect(useAmateurAccessToastStore.getState().toast).toMatchObject({
      goalsRemaining: 184,
      unlockGoalsRequired: 300,
    });
  });

  it('uses the API fallback without a duplicate inline error for stale access', async () => {
    useAuthStore.getState().updateUser({ competitionLevel: 'amateur' });
    useDailyStore.setState({
      data: {
        lifetime_total_goals: 300,
        amateur_unlock_goals_required: 300,
      } as DailyStateResponse,
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/templates')) {
        return new Response(JSON.stringify({ templates: [template] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      expect(init?.method).toBe('POST');
      return new Response(
        JSON.stringify({
          error: {
            code: 'amateur_level_required',
            message: 'internal policy',
            details: { goalsRemaining: 184, unlockGoalsRequired: 300 },
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    });

    renderModal();
    const submit = await screen.findByRole('button', { name: 'Вызвать' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() =>
      expect(useAmateurAccessToastStore.getState()).toMatchObject({
        sequence: 1,
        toast: { goalsRemaining: 184, unlockGoalsRequired: 300 },
      }),
    );
    expect(screen.queryByText('Не удалось выполнить запрос. Попробуйте ещё раз.')).toBeNull();
  });
});
