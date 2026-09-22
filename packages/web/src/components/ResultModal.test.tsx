import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultModal } from './ResultModal.js';

describe('ResultModal marksmanship breakdown', () => {
  it('shows the total beside GOAL and each scoring reason in a compact row', () => {
    const { container } = render(
      <ResultModal
        result={{ type: 'goal', hitPoint: { x: 286, y: 80 } }}
        durationMs={1_000}
        title="ГОЛ"
        points={258}
        breakdown={[
          { points: 140, label: 'Сложное окно' },
          { points: 98, label: 'Два за секунду' },
          { points: 20, label: 'Противоход' },
        ]}
      />,
    );

    expect(container.querySelector('.result-modal__headline')).toHaveTextContent('ГОЛ+258');
    expect(container.querySelectorAll('.result-modal__breakdown-item')).toHaveLength(3);
    expect(screen.getByText('Сложное окно')).toBeInTheDocument();
    expect(screen.getByText('Два за секунду')).toBeInTheDocument();
    expect(screen.getByText('Противоход')).toBeInTheDocument();
  });

  it('adds one divider under the miss title before the timing hint', () => {
    const { container } = render(
      <ResultModal
        result={{ type: 'miss', reason: 'wide' }}
        durationMs={1_000}
        title="МИМО"
        divider
        details={['Брось позже']}
      />,
    );

    expect(container.querySelector('.result-modal__details--divider')).toHaveTextContent(
      'Брось позже',
    );
    expect(container.querySelector('[role="status"]')).toHaveStyle({
      width: 'min(340px, calc(100vw - 40px))',
    });
  });

  it('uses the full breakdown width when only base points were awarded', () => {
    const { container } = render(
      <ResultModal
        result={{ type: 'goal', hitPoint: { x: 286, y: 80 } }}
        durationMs={1_000}
        title="ГОЛ"
        points={140}
        breakdown={[{ points: 140, label: 'Узкое окно' }]}
      />,
    );

    expect(container.querySelector('.result-modal__breakdown')).toHaveStyle({
      gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    });
  });
});
