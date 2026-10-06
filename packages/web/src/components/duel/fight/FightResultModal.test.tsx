import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FightResultModal } from './FightResultModal.js';

describe('fight result rewards', () => {
  it.each([true, false])('shows the confirmed reward for winner=%s without manual dismissal', (won) => {
    render(<FightResultModal won={won} />);
    const result = screen.getByRole('dialog', { name: won ? 'Вы победили' : 'Вы проиграли' });
    expect(within(result).getByRole('group', { name: '+1 опыт' })).toHaveClass('profile-balance__amount--experience');
    expect(Boolean(within(result).queryByRole('group', { name: '+1 звезда' }))).toBe(won);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
