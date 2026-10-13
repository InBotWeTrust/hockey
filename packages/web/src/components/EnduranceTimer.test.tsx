import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnduranceTimer } from './EnduranceTimer.js';

describe('EnduranceTimer', () => {
  it('does not display result-pause time as extra seconds in a four-second window', () => {
    const view = render(<EnduranceTimer remainingMs={5200} windowMs={4000} tone="warning" />);
    expect(screen.getByRole('timer').textContent).toContain('4,0');
    view.rerender(<EnduranceTimer remainingMs={4500} windowMs={4000} tone="warning" />);
    expect(screen.getByRole('timer').textContent).toContain('4,0');
    view.rerender(<EnduranceTimer remainingMs={200} windowMs={4000} tone="danger" />);
    expect(screen.getByRole('timer').textContent).toContain('0,2');
  });
});
