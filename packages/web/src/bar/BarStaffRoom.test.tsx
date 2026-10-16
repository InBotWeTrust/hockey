import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';
import {expect, it} from 'vitest';
import {BarStaffRoom} from './BarStaffRoom.js';

function Location() { return <output>{useLocation().pathname}</output>; }
it('returns to the saved Igor slot without offering a nonexistent character', () => {
  sessionStorage.setItem('bar-staff-return-slot', 'bar-3');
  render(<MemoryRouter initialEntries={['/bar/staff-room']}><BarStaffRoom/><Location/></MemoryRouter>);
  expect(screen.queryByRole('button', {name: /чат|играть/i})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Вернуться в бар'}));
  expect(sessionStorage.getItem('bar-active-slot')).toBe('bar-3');
  expect(screen.getByText('/bar')).toBeInTheDocument();
});
