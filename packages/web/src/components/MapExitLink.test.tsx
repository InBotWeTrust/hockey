import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { MapExitLink } from './MapExitLink.js';
function Location() { const location=useLocation(); return <output>{location.pathname + location.search}</output>; }
it('returns to the map through the router without a document navigation', () => {
  render(<MemoryRouter initialEntries={['/daily']}><MapExitLink className="exit">Выход</MapExitLink><Location /></MemoryRouter>);
  expect(fireEvent.click(screen.getByRole('link',{name:'На карту'}))).toBe(false);
  expect(screen.getByText('/sections')).toBeInTheDocument();
});
