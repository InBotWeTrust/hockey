import {fireEvent,render,screen} from '@testing-library/react';
import {createDefaultBarLayout} from '@hockey/game-core';
import {expect,it,vi} from 'vitest';
import {BarScene} from './BarScene.js';
it('uses the new interior without requiring a preview query',()=>{
 const {container}=render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-1" onSelectSlot={vi.fn()} onAction={vi.fn()}/>);
 expect(container.querySelector('img[src^="/bar/city-v4/"]')).not.toBeNull();
 expect(container.querySelector('img[src^="/bar/city-v3/west"]')).toBeNull();
});
it('opens Timofey battleship from his new shelf, never from a drag',()=>{
 const action=vi.fn();const {container}=render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-7" onSelectSlot={vi.fn()} onAction={action}/>);
 const shelf=screen.getByRole('button',{name:'Играть в морской бой с Тимофеем'});
 expect(container.querySelector('[data-bar-object-glow="timofey"]')).not.toBeNull();
 fireEvent.click(shelf);expect(action).toHaveBeenCalledWith('battleship','timofey');action.mockClear();
 const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:300});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});fireEvent(shelf,event);};
 pointer('pointerdown',200);pointer('pointermove',100);pointer('pointerup',100);fireEvent.click(shelf,{detail:1});expect(action).not.toHaveBeenCalled();
});
it('highlights Igor membership cards and newspapers, but never the staff door',()=>{
 const props={layout:createDefaultBarLayout(),onSelectSlot:vi.fn(),onAction:vi.fn(),onStaffRoom:vi.fn()};
 const {container,rerender}=render(<BarScene {...props} activeSlotId="bar-9"/>);
 expect(container.querySelector('[data-bar-object="club-cards"] [data-bar-object-glow="igor"]')).not.toBeNull();
 expect(container.querySelector('[data-bar-object="newspapers"] [data-bar-object-glow="igor"]')).not.toBeNull();
 rerender(<BarScene {...props} activeSlotId="bar-10"/>);
 expect(container.querySelector('[data-bar-object-glow]')).toBeNull();
 expect(screen.getByRole('button',{name:'Открыть служебную дверь'})).toBeInTheDocument();
});
