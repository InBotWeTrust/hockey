import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: (): JSX.Element => <div data-testid="pixi-stage-mock" />,
}));

import { DuelScreen } from './DuelScreen.js';

describe('DuelScreen', () => {
  it('renders the goalie name in the header for a valid id', () => {
    render(
      <MemoryRouter initialEntries={['/duel/rookie']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Новичок')).toBeInTheDocument();
    expect(screen.getByTestId('pixi-stage-mock')).toBeInTheDocument();
  });

  it('shows an error for an unknown goalie id', () => {
    render(
      <MemoryRouter initialEntries={['/duel/no-such-boss']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/неизвестный босс/i)).toBeInTheDocument();
  });
});
