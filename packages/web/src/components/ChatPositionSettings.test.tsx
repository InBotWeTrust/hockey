import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ChatPositionSettings } from './ChatPositionSettings.js';
import { getMapChatPosition } from '../app/mapChatPosition.js';
afterEach(() => localStorage.clear());
it('persists the side per account across remounts', () => {
 const view=render(<ChatPositionSettings owner="one"/>);
 expect(screen.getByRole('tab',{name:'Справа'})).toHaveAttribute('aria-selected','true');
 fireEvent.click(screen.getByRole('tab',{name:'Слева'}));
 expect(getMapChatPosition('one')).toBe('left');
 view.rerender(<ChatPositionSettings owner="two"/>);
 expect(screen.getByRole('tab',{name:'Справа'})).toHaveAttribute('aria-selected','true');
 view.unmount();render(<ChatPositionSettings owner="one"/>);
 expect(screen.getByRole('tab',{name:'Слева'})).toHaveAttribute('aria-selected','true');
});
