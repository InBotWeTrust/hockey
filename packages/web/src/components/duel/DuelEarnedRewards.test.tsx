import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DuelEarnedRewards } from './DuelEarnedRewards.js';

describe('DuelEarnedRewards', () => {
  it('shows only positive earned amounts as colored icons and numbers', () => {
    render(<DuelEarnedRewards reward={{ stars: 3, experience: 0 }} />);
    const stars = screen.getByLabelText('Звёзды: 3');
    expect(stars).toHaveTextContent('3');
    expect(stars).toHaveStyle({ color: 'var(--reward-star)' });
    expect(stars.querySelector('svg')).toHaveClass('lucide-star');
    expect(screen.queryByLabelText(/Опыт:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Звёзды')).not.toBeInTheDocument();
  });

  it('shows experience independently of stars', () => {
    render(<DuelEarnedRewards reward={{ stars: 0, experience: 1 }} />);
    const experience = screen.getByLabelText('Опыт: 1');
    expect(experience).toHaveTextContent('1');
    expect(experience).toHaveStyle({ color: 'var(--reward-experience)' });
    expect(experience.querySelector('svg')).toHaveClass('lucide-trending-up');
    expect(screen.queryByLabelText(/Звёзды:/)).not.toBeInTheDocument();
  });

  it('shows nothing when no reward was earned', () => {
    const { container } = render(<DuelEarnedRewards reward={{ stars: 0, experience: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
