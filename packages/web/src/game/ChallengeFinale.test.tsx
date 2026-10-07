import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChallengeFinale } from './ChallengeFinale.js';

afterEach(() => {
  vi.useRealTimers();
});
describe('ChallengeFinale', () => {
  it.each(['completed', 'failed'] as const)(
    'automatically changes %s artwork after two and a half seconds',
    (outcome) => {
      vi.useFakeTimers();
      render(<ChallengeFinale outcome={outcome} />);
      const prefix = outcome === 'completed' ? 'win' : 'loss';
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        `/bonus-games/finales/beach-${prefix}-1.webp?v=20261007-challenge-story-v1`,
      );
      act(() => vi.advanceTimersByTime(2499));
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        `/bonus-games/finales/beach-${prefix}-1.webp?v=20261007-challenge-story-v1`,
      );
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        `/bonus-games/finales/beach-${prefix}-2.webp?v=20261007-challenge-story-v1`,
      );
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(
        screen.getByText(outcome === 'completed' ? /Ты успел убежать/ : /Вода затопила каток/),
      ).toBeInTheDocument();
    },
  );
  it('cleans up the timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = render(<ChallengeFinale outcome="completed" />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the story readable if artwork fails', () => {
    render(<ChallengeFinale outcome="failed" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText(/Вода затопила каток/)).toBeInTheDocument();
  });
});

it.each(['completed', 'failed'] as const)('shows ski avalanche artwork for %s', (outcome) => {
  vi.useFakeTimers();
  render(<ChallengeFinale outcome={outcome} location="ski" />);
  const prefix = outcome === 'completed' ? 'win' : 'loss';
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    `/bonus-games/finales/ski-${prefix}-1.webp?v=20261007-challenge-story-v1`,
  );
  expect(
    screen.getByText(outcome === 'completed' ? /успел уйти с катка/ : /Лавина накрыла каток/),
  ).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(2500));
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    `/bonus-games/finales/ski-${prefix}-2.webp?v=20261007-challenge-story-v1`,
  );
});

it.each(['completed', 'failed'] as const)('shows cyberpunk overload story for %s', (outcome) => {
  vi.useFakeTimers();
  render(<ChallengeFinale outcome={outcome} location="cyberpunk" />);
  const prefix = outcome === 'completed' ? 'win' : 'loss';
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    `/bonus-games/finales/cyberpunk-${prefix}-1.webp?v=20261007-challenge-story-v1`,
  );
  expect(
    screen.getByText(outcome === 'completed' ? /сеть перегорела/ : /Магниты удержали/),
  ).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(2500));
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    `/bonus-games/finales/cyberpunk-${prefix}-2.webp?v=20261007-challenge-story-v1`,
  );
  expect(screen.queryByRole('button')).toBeNull();
});
