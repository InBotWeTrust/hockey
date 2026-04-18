import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GOALIES } from '@hockey/game-core';
import { GoalieListScreen } from './GoalieListScreen.js';

describe('GoalieListScreen', () => {
  it('renders all 10 bosses with a link each', () => {
    render(
      <MemoryRouter>
        <GoalieListScreen />
      </MemoryRouter>,
    );
    for (const g of GOALIES) {
      const link = screen.getByRole('link', { name: new RegExp(g.name) });
      expect(link).toHaveAttribute('href', `/duel/${g.id}`);
    }
  });
});
