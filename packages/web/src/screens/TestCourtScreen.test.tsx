import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestCourtScreen } from './TestCourtScreen.js';

vi.mock('../game/PixiStage.js', () => ({
  PixiStage: () => <div data-testid="pixi-stage-stub" />,
}));

describe('TestCourtScreen', () => {
  it('renders the experimental training court with arena perspective', () => {
    render(
      <MemoryRouter>
        <TestCourtScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Тестовая площадка' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Тестовая площадка в перспективе' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeInTheDocument();
  });
});
