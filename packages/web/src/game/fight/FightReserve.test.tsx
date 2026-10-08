import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FightReserve } from './FightReserve.js';
it('keeps empty outlines and animates only changed units',()=>{
 const view=render(<FightReserve kind="health" value={5} total={5}/>);
 expect(screen.getByLabelText('Здоровье: 5 из 5').children).toHaveLength(5);
 expect(document.querySelector('.is-changing')).toBeNull();
 view.rerender(<FightReserve kind="health" value={4} total={5}/>);
 expect(document.querySelectorAll('.is-changing')).toHaveLength(1);
 expect(document.querySelector('.is-changing')).toHaveClass('is-empty');
 view.rerender(<FightReserve kind="guard" value={3} total={3}/>);
 expect(screen.getByLabelText('Запас блока: 3 из 3').children).toHaveLength(3);
});
