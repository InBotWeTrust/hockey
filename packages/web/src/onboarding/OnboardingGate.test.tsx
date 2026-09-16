import { StrictMode, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRequiredOnboarding, startOnboarding } from '../api/onboarding.js';
import type * as OnboardingApi from '../api/onboarding.js';
import { OnboardingGate, OnboardingGateContext } from './OnboardingGate.js';

vi.mock('../api/onboarding.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OnboardingApi>()),
  fetchRequiredOnboarding: vi.fn(),
  startOnboarding: vi.fn(),
}));

const required = {
  chain: 'amateur' as const,
  versionId: 'version-1',
  steps: [
    {
      id: 'step-1',
      position: 1,
      kind: 'informational' as const,
      title: 'Всё начинается здесь',
      description: 'Путь со двора',
      ctaLabel: 'Далее',
      imageUrl: '/one.webp',
    },
  ],
};

function renderGate(
  child = <div>Профиль</div>,
  strict = false,
  preparePlayer?: () => Promise<void>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={client}>
      <OnboardingGate {...(preparePlayer ? { preparePlayer } : {})}>{child}</OnboardingGate>
    </QueryClientProvider>
  );
  return { client, ...render(strict ? <StrictMode>{tree}</StrictMode> : tree) };
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    vi.mocked(fetchRequiredOnboarding).mockReset();
    vi.mocked(startOnboarding).mockReset();
  });

  it('shows loading, then passes through only when no onboarding is required', async () => {
    vi.mocked(fetchRequiredOnboarding).mockResolvedValue({ required: null });
    renderGate();
    expect(screen.getByText('Идёт загрузка…')).toBeInTheDocument();
    expect(await screen.findByText('Профиль')).toBeInTheDocument();
  });

  it('keeps returning players on the shared splash until their first screen is prepared', async () => {
    vi.mocked(fetchRequiredOnboarding).mockResolvedValue({ required: null });
    let resolvePreparation!: () => void;
    const preparePlayer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePreparation = resolve;
        }),
    );

    renderGate(<div>Готовая арена</div>, false, preparePlayer);

    expect(await screen.findByText('Идёт загрузка…')).toBeInTheDocument();
    expect(screen.queryByText('Готовая арена')).not.toBeInTheDocument();

    await waitFor(() => expect(preparePlayer).toHaveBeenCalledTimes(1));

    await act(async () => resolvePreparation());

    expect(await screen.findByText('Готовая арена')).toBeInTheDocument();
    expect(preparePlayer).toHaveBeenCalledTimes(1);
  });

  it('starts a required run and keeps children hidden', async () => {
    vi.mocked(fetchRequiredOnboarding).mockResolvedValue({ required });
    vi.mocked(startOnboarding).mockResolvedValue({ runId: 'run-1', required });
    renderGate();
    expect(await screen.findByText('Всё начинается здесь')).toBeInTheDocument();
    expect(screen.queryByText('Профиль')).not.toBeInTheDocument();
  });

  it('uses one client session id across Strict Mode start retries', async () => {
    vi.mocked(fetchRequiredOnboarding).mockResolvedValue({ required });
    vi.mocked(startOnboarding).mockResolvedValue({ runId: 'run-1', required });
    renderGate(undefined, true);
    await screen.findByText('Всё начинается здесь');
    const ids = vi.mocked(startOnboarding).mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(1);
  });

  it('shows a retry action after required API failure', async () => {
    vi.mocked(fetchRequiredOnboarding)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ required: null });
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подготовить игру');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Профиль')).toBeInTheDocument();
    expect(fetchRequiredOnboarding).toHaveBeenCalledTimes(2);
  });

  it('checks for newly required onboarding only when refreshAfterGameExit is invoked', async () => {
    let refresh!: () => Promise<void>;
    function Harness() {
      refresh = useContext(OnboardingGateContext).refreshAfterGameExit;
      return <div>Игра завершена</div>;
    }
    vi.mocked(fetchRequiredOnboarding)
      .mockResolvedValueOnce({ required: null })
      .mockResolvedValueOnce({ required });
    vi.mocked(startOnboarding).mockResolvedValue({ runId: 'run-2', required });
    const { client } = renderGate(<Harness />);
    client.setQueryData(['inventory', 'me'], { remaining: 10 });
    client.setQueryData(['achievements'], { unclaimedCount: 0 });
    client.setQueryData(['weekly-challenge', 'current'], { challenge: null });
    await screen.findByText('Игра завершена');
    expect(fetchRequiredOnboarding).toHaveBeenCalledTimes(1);
    await act(() => refresh());
    expect(client.getQueryState(['inventory', 'me'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['achievements'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['weekly-challenge', 'current'])?.isInvalidated).toBe(true);
    expect(await screen.findByText('Всё начинается здесь')).toBeInTheDocument();
    expect(startOnboarding).toHaveBeenCalledTimes(1);
  });

  it('replaces stale profile statistics after leaving the game surface', async () => {
    let refresh!: () => Promise<void>;
    function Harness() {
      refresh = useContext(OnboardingGateContext).refreshAfterGameExit;
      return <div>Игра завершена</div>;
    }
    vi.mocked(fetchRequiredOnboarding).mockResolvedValue({ required: null });
    const { client } = renderGate(<Harness />);
    client.setQueryData(['profile'], {
      id: 'player-1',
      stats: { playStreakDays: 0, bestPlayStreakDays: 2 },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'player-1',
          stats: { playStreakDays: 3, bestPlayStreakDays: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await screen.findByText('Игра завершена');
    await act(() => refresh());

    expect(client.getQueryData(['profile'])).toMatchObject({
      id: 'player-1',
      stats: { playStreakDays: 3, bestPlayStreakDays: 3 },
    });
    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/me')),
    ).toHaveLength(1);
  });
});
