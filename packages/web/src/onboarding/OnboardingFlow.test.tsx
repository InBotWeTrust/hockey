import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingRequired, OnboardingRequiredResponse } from '../api/onboarding.js';
import type * as OnboardingApi from '../api/onboarding.js';
import { completeOnboarding, recordStepView } from '../api/onboarding.js';
import { OnboardingFlow } from './OnboardingFlow.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('../api/onboarding.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OnboardingApi>()),
  recordStepView: vi.fn(),
  completeOnboarding: vi.fn(),
}));

const required: OnboardingRequired = {
  chain: 'amateur',
  versionId: 'version-1',
  steps: [
    {
      id: 'step-1',
      position: 1,
      kind: 'informational',
      title: 'Первый шаг',
      description: 'Описание 1',
      ctaLabel: 'Далее',
      imageUrl: '/one.webp',
    },
    {
      id: 'step-2',
      position: 2,
      kind: 'informational',
      title: 'Второй шаг',
      description: 'Описание 2',
      ctaLabel: 'Далее',
      imageUrl: '/two.webp',
    },
    {
      id: 'step-3',
      position: 3,
      kind: 'informational',
      title: 'Финал',
      description: 'Описание 3',
      ctaLabel: 'Готово',
      imageUrl: '/three.webp',
    },
  ],
};

describe('OnboardingFlow', () => {
  beforeEach(() => {
    vi.mocked(recordStepView).mockReset().mockResolvedValue({ viewed: true });
    vi.mocked(completeOnboarding).mockReset();
  });

  it('shows semantic progress, navigation and records each reached step only once', async () => {
    render(<OnboardingFlow runId="run-1" required={required} onCompleted={vi.fn()} />);

    expect(screen.getByText('1 из 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument();
    await waitFor(() => expect(recordStepView).toHaveBeenCalledWith('run-1', 'step-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('2 из 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    await waitFor(() => expect(recordStepView).toHaveBeenCalledTimes(2));
  });

  it('replaces a broken informational image with an accessible fallback', () => {
    render(<OnboardingFlow runId="run-1" required={required} onCompleted={vi.fn()} />);
    fireEvent.error(screen.getByRole('img', { name: 'Первый шаг' }));
    expect(
      screen.getByRole('img', { name: 'Изображение временно недоступно' }),
    ).toBeInTheDocument();
  });

  it('blocks completion until the server confirms it and exposes a retryable error', async () => {
    const pending = deferred<OnboardingRequiredResponse>();
    const onCompleted = vi.fn();
    vi.mocked(completeOnboarding)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ required: null });
    render(
      <OnboardingFlow
        runId="run-1"
        required={{ ...required, steps: [required.steps[2]!] }}
        onCompleted={onCompleted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByRole('button', { name: 'Завершаем…' })).toBeDisabled();
    expect(onCompleted).not.toHaveBeenCalled();
    pending.reject(new Error('network'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось завершить онбординг');
    expect(onCompleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith({ required: null }));
  });

  it('retries a transient final-step view failure before completing without duplicating success', async () => {
    const onCompleted = vi.fn();
    vi.mocked(recordStepView)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ viewed: true });
    vi.mocked(completeOnboarding).mockResolvedValue({ required: null });
    render(
      <OnboardingFlow
        runId="run-1"
        required={{ ...required, steps: [required.steps[2]!] }}
        onCompleted={onCompleted}
      />,
    );
    await waitFor(() => expect(recordStepView).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    await waitFor(() => expect(recordStepView).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1));
    expect(onCompleted).toHaveBeenCalledWith({ required: null });

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(recordStepView).toHaveBeenCalledTimes(2);
  });
});
