import { StrictMode, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

function renderGate(child = <div>Профиль</div>, strict = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={client}>
      <OnboardingGate>{child}</OnboardingGate>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    vi.mocked(fetchRequiredOnboarding).mockReset();
    vi.mocked(startOnboarding).mockReset();
  });

  it('shows loading, then passes through only when no onboarding is required', async () => {
    vi.mocked(fetchRequiredOnboarding).mockResolvedValue({ required: null });
    renderGate();
    expect(screen.getByText('Проверяем прогресс…')).toBeInTheDocument();
    expect(await screen.findByText('Профиль')).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось проверить онбординг');
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
    renderGate(<Harness />);
    await screen.findByText('Игра завершена');
    expect(fetchRequiredOnboarding).toHaveBeenCalledTimes(1);
    await act(() => refresh());
    expect(await screen.findByText('Всё начинается здесь')).toBeInTheDocument();
    expect(startOnboarding).toHaveBeenCalledTimes(1);
  });
});
