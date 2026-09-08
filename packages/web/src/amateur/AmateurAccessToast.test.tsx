import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmateurAccessToast, AMATEUR_ACCESS_TOAST_DURATION_MS } from './AmateurAccessToast.js';
import { showAmateurAccessToast, useAmateurAccessToastStore } from './amateurAccessStore.js';

describe('AmateurAccessToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAmateurAccessToastStore.setState({ toast: null, sequence: 0 });
  });

  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  it('shows the exact account-status copy in a polite live region', () => {
    render(<AmateurAccessToast />);

    act(() => showAmateurAccessToast({ goalsRemaining: 184, unlockGoalsRequired: 300 }));

    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Нужен статус «Любитель»')).toBeInTheDocument();
    expect(
      screen.getByText('До открытия осталось забить 184 шайб в ежедневной игре.'),
    ).toBeInTheDocument();
  });

  it('replaces a visible toast and restarts its dismissal timeout', () => {
    render(<AmateurAccessToast />);
    act(() => showAmateurAccessToast({ goalsRemaining: 184, unlockGoalsRequired: 300 }));
    act(() => vi.advanceTimersByTime(1_400));

    act(() => showAmateurAccessToast({ goalsRemaining: 73, unlockGoalsRequired: 300 }));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(
      screen.getByText('До открытия осталось забить 73 шайб в ежедневной игре.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/184 шайб/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(AMATEUR_ACCESS_TOAST_DURATION_MS - 1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
