import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createDefaultBarLayout } from '@hockey/game-core';
import { BarIdentityPanel } from './BarIdentityPanel.js';
it('opens authored details with correct age and closes on Escape',()=>{
 render(<BarIdentityPanel profile={createDefaultBarLayout().profiles.grigory} characterId="grigory" actions={['cards']} onAction={vi.fn()}/>);
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Подробнее'}));
 expect(screen.getByRole('dialog')).toBeInTheDocument();
 expect(screen.getByText('Заливщик льда · 41 год')).toBeInTheDocument();
 fireEvent.keyDown(document,{key:'Escape'});
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
