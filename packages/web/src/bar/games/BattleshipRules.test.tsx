import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {GameHelp} from './GameModals.js';
afterEach(cleanup);
it('describes four-cell charged airstrikes for new matches',()=>{
 render(<GameHelp kind="battleship" close={()=>{}}/>);
 expect(screen.getByRole('dialog')).toHaveTextContent('квадрат 2×2');
 expect(screen.getByRole('dialog')).not.toHaveTextContent('40 секунд');
 expect(screen.getByRole('dialog')).toHaveTextContent('после пяти обычных выстрелов');
});
it('keeps old salvo instructions in already started matches',()=>{
 render(<GameHelp kind="battleship" engineVersion={14} close={()=>{}}/>);
 expect(screen.getByRole('dialog')).toHaveTextContent('залп 3×2');
 expect(screen.getByRole('dialog')).not.toHaveTextContent('после пяти обычных выстрелов');
});

it('describes a single rescue after damage and a miss for new matches',()=>{
 render(<GameHelp kind="battleship" engineVersion={19} close={()=>{}}/>);
 expect(screen.getByRole('dialog')).toHaveTextContent('Всего один манёвр за матч');
 expect(screen.getByRole('dialog')).toHaveTextContent('последующего промаха');
 expect(screen.getByRole('dialog')).not.toHaveTextContent('Два манёвра');
});
