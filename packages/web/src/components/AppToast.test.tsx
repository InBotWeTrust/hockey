import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppToast } from './AppToast.js';

describe('AppToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismisses a short-lived development notice after 1.5 seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <AppToast message="Раздел в разработке" onDismiss={onDismiss} durationMs={1_500} />,
    );

    act(() => vi.advanceTimersByTime(1_499));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Раздел в разработке');
  });

  it('does not restart the timer when the parent supplies a new dismiss callback', () => {
    vi.useFakeTimers();
    const firstDismiss = vi.fn();
    const latestDismiss = vi.fn();
    const view = render(
      <AppToast
        message="Раздел в разработке"
        onDismiss={firstDismiss}
        durationMs={1_500}
      />,
    );

    act(() => vi.advanceTimersByTime(1_000));
    view.rerender(
      <AppToast
        message="Раздел в разработке"
        onDismiss={latestDismiss}
        durationMs={1_500}
      />,
    );
    act(() => vi.advanceTimersByTime(500));

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(latestDismiss).toHaveBeenCalledTimes(1);
  });
});
