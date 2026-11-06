import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {GameHelp} from './GameModals.js';
afterEach(cleanup);
it('describes a private rescue that retains the shot in new matches',()=>{
 render(<GameHelp kind="battleship" engineVersion={22} close={()=>{}}/>);
 const dialog=screen.getByRole('dialog');
 expect(dialog).toHaveTextContent('После манёвра ты можешь выстрелить');
 expect(dialog).toHaveTextContent('Соперник не получает уведомление о перемещении');
 expect(dialog).not.toHaveTextContent('манёвр всегда передают ход');
 expect(dialog).not.toHaveTextContent('Перенос расходует обычный манёвр и передаёт ход');
 expect(dialog).not.toHaveTextContent('Соперник видит только факт манёвра');
});
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
