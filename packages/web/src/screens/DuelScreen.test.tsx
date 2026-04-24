import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: (): JSX.Element => <div data-testid="pixi-stage-mock" />,
}));

import { DuelScreen } from './DuelScreen.js';

describe('DuelScreen', () => {
  it('renders the rink and shot button for a valid goalie id', () => {
    render(
      <MemoryRouter initialEntries={['/duel/rookie']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('pixi-stage-mock')).toBeInTheDocument();
    expect(screen.getByText(/бросок/i)).toBeInTheDocument();
  });

  it('falls back to rookie for an unknown goalie id', () => {
    render(
      <MemoryRouter initialEntries={['/duel/no-such-boss']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('pixi-stage-mock')).toBeInTheDocument();
    expect(screen.getByText(/бросок/i)).toBeInTheDocument();
  });

  it('exposes speed controls through the settings sheet', () => {
    render(
      <MemoryRouter initialEntries={['/duel/rookie']}>
        <Routes>
          <Route path="/duel/:goalieId" element={<DuelScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/ворота/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /настройки/i }));
    expect(screen.getByText(/ворота/i)).toBeInTheDocument();
    expect(screen.getByText(/вратарь/i)).toBeInTheDocument();
    expect(screen.getByText(/хоккеист/i)).toBeInTheDocument();
  });
});
