import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

function HomePlaceholder(): JSX.Element {
  return <main>Ultimate Hockey — Training</main>;
}
function DuelPlaceholder(): JSX.Element {
  return <main>Duel placeholder</main>;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePlaceholder />} />
        <Route path="/duel/:goalieId" element={<DuelPlaceholder />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('App routes', () => {
  it('renders home at /', () => {
    renderAt('/');
    expect(screen.getByText(/ultimate hockey/i)).toBeInTheDocument();
  });

  it('renders duel placeholder at /duel/:goalieId', () => {
    renderAt('/duel/rookie');
    expect(screen.getByText(/duel placeholder/i)).toBeInTheDocument();
  });
});
