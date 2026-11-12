import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ChatPositionSettings } from './ChatPositionSettings.js';
import { getMapIconPosition } from '../app/mapIconPosition.js';
afterEach(() => localStorage.clear());
it('persists the side per account across remounts', () => {
 const view=render(<ChatPositionSettings owner="one"/>);
 expect(screen.getByRole('tab',{name:'Справа'})).toHaveAttribute('aria-selected','true');
 fireEvent.click(screen.getByRole('tab',{name:'Слева'}));
 expect(getMapIconPosition('one')).toBe('left');
 view.rerender(<ChatPositionSettings owner="two"/>);
 expect(screen.getByRole('tab',{name:'Справа'})).toHaveAttribute('aria-selected','true');
 view.unmount();render(<ChatPositionSettings owner="one"/>);
 expect(screen.getByRole('tab',{name:'Слева'})).toHaveAttribute('aria-selected','true');
});
it('describes the map icon group and weather swapping', () => {
 render(<ChatPositionSettings owner="map-copy"/>);
 expect(screen.getByRole('region',{name:'Положение иконок на карте'})).toBeInTheDocument();
 expect(screen.getByText(/Погода.*противоположной стороне/)).toBeInTheDocument();
});
