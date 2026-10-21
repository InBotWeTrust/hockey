import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import { GameNavigationBoundary } from './GameNavigationBoundary.js';
function Flow() {
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <>
      <output>{location.pathname + location.search}</output>
      <button onClick={() => navigate('/?view=training&play=1')}>Start</button>
      <button onClick={() => navigate('/sections')}>Finish</button>
    </>
  );
}
beforeEach(() => sessionStorage.clear());
it('returns from the single game route to the exact source page', () => {
  render(
    <MemoryRouter initialEntries={['/?view=training&section=advanced']}>
      <GameNavigationBoundary owner="a">
        <Flow />
      </GameNavigationBoundary>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('Start'));
  expect(screen.getByText('/?view=training&play=1')).toBeVisible();
  fireEvent.click(screen.getByText('Finish'));
  expect(screen.getByText('/?view=training&section=advanced')).toBeVisible();
});
