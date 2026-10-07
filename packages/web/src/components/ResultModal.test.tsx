import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultModal } from './ResultModal.js';

describe('ResultModal standard result', () => {
  it('can center the same result material inside a spectator rink', () => {
    render(<ResultModal result={{ type: 'miss', reason: 'wide' }} durationMs={1000} contained />);
    expect(screen.getByRole('status')).toHaveStyle({
      position: 'absolute',
      top: '50%',
      left: '50%',
    });
  });

  it('shows the ordinary goal without a points row', () => {
    const { container } = render(
      <ResultModal
        result={{ type: 'goal', hitPoint: { x: 286, y: 80 } }}
        durationMs={1_000}
        title="ГОЛ"
      />,
    );

    expect(screen.getByText('ГОЛ')).toBeInTheDocument();
    expect(container.querySelector('.result-modal__points')).toBeNull();
    expect(container.querySelector('.result-modal__headline')).toBeNull();
    expect(container.querySelector('.result-modal__breakdown')).toBeNull();
  });

  it('keeps miss identical to the standard result', () => {
    const { container } = render(
      <ResultModal result={{ type: 'miss', reason: 'wide' }} durationMs={1_000} title="МИМО" />,
    );

    expect(container.querySelector('.result-modal__details')).toBeNull();
    expect(container.querySelector('.result-modal__points')).toBeNull();
  });
});
