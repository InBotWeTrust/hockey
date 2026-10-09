vi.mock('./BeginnerStoryFlow.js', () => ({ BeginnerStoryFlow: () => <div>Первая серия</div> }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OnboardingFlow } from './OnboardingFlow.js';
import { ProfileStorySeriesScreen } from '../screens/ProfileStorySeriesScreen.js';
import { ProfileStoryScreen } from '../screens/ProfileDestinationScreens.js';
import { completeOnboarding, recordStepView } from '../api/onboarding.js';
import type * as OnboardingApi from '../api/onboarding.js';
vi.mock('../api/onboarding.js', async (original) => ({
  ...(await original<typeof OnboardingApi>()),
  completeOnboarding: vi.fn(),
  recordStepView: vi.fn(),
}));
vi.mock('./AmateurStoryFlow.js', () => ({
  AmateurStoryFlow: ({
    unlockGoalsRequired,
    onCompleted,
    onClose,
    completing,
    completionError,
    onRetry,
  }: {
    unlockGoalsRequired?: number;
    onCompleted: () => void;
    onClose?: () => void;
    completing?: boolean;
    completionError?: string;
    onRetry?: () => void;
  }) => (
    <section aria-label="Вторая серия" data-threshold={unlockGoalsRequired}>
      <button disabled={completing} onClick={onCompleted}>
        Завершить вторую серию
      </button>
      {onClose && <button onClick={onClose}>Закрыть вторую серию</button>}
      {completionError && (
        <div role="alert">
          {completionError}
          <button onClick={onRetry}>Повторить сохранение</button>
        </div>
      )}
    </section>
  ),
}));
const required = {
  chain: 'amateur' as const,
  versionId: 'v1',
  steps: Array.from({ length: 7 }, (_, i) => ({
    id: `step-${i}`,
    position: i + 1,
    kind: 'informational' as const,
    title: 'old',
    description: 'old',
    ctaLabel: 'old',
    imageUrl: '/old.webp',
  })),
};
function profile(completed: boolean) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        beginnerOnboardingCompleted: true,
        amateurOnboardingCompleted: completed,
        amateurUnlockGoalsRequired: 100,
      }),
      { status: 200 },
    ),
  );
}
function page(element: JSX.Element) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/profile/story/series-2']}>
        <Routes>
          <Route path="/profile/story/series-2" element={element} />
          <Route path="/profile/story" element={<div>Каталог</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('amateur cinematic integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(recordStepView).mockReset().mockResolvedValue({ viewed: true });
    vi.mocked(completeOnboarding).mockReset().mockResolvedValue({ required: null });
  });
  it('completes every published step only after the narrative finishes, including legacy seven-step versions', async () => {
    const done = vi.fn();
    render(<OnboardingFlow runId="run" required={required} unlockGoalsRequired={175} onCompleted={done} />);
    expect(screen.getByRole('region', { name: 'Вторая серия' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Вторая серия' })).toHaveAttribute('data-threshold', '175');
    expect(completeOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Завершить вторую серию' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith({ required: null }));
    for (const step of required.steps) expect(recordStepView).toHaveBeenCalledWith('run', step.id);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });
  it('retries failed completion and prevents duplicate progress writes', async () => {
    vi.mocked(completeOnboarding).mockRejectedValueOnce(new Error('offline'));
    const done = vi.fn();
    render(<OnboardingFlow runId="run" required={required} onCompleted={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Завершить вторую серию' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось завершить');
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(recordStepView).toHaveBeenCalledTimes(7);
  });
  it('guards direct access to the second series before amateur completion', async () => {
    profile(false);
    page(<ProfileStorySeriesScreen series={2} />);
    expect(await screen.findByText('Каталог')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Вторая серия' })).not.toBeInTheDocument();
  });
  it('replays locally without completion or view writes', async () => {
    profile(true);
    page(<ProfileStorySeriesScreen series={2} />);
    const finish = await screen.findByRole('button', { name: 'Завершить вторую серию' });
    expect(screen.getByRole('region', { name: 'Вторая серия' })).toHaveAttribute('data-threshold', '100');
    fireEvent.click(finish);
    expect(await screen.findByText('Каталог')).toBeInTheDocument();
    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(recordStepView).not.toHaveBeenCalled();
  });
  it('unlocks the second catalog card only after amateur completion', async () => {
    profile(true);
    page(<ProfileStoryScreen />);
    expect(
      await screen.findByRole('button', { name: 'Открыть серию «Обещанный разговор»' }),
    ).toBeInTheDocument();
  });
});
