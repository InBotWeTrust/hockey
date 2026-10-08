import { expect,it,vi } from 'vitest';
import { render,screen,fireEvent } from '@testing-library/react';
import { createFightState,DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { FightView } from './FightView.js';
vi.mock('../PixiStage.js',()=>({PixiStage:()=>null}));
it('v3 has left directions and two right actions, held controls release independently',()=>{
 const input=vi.fn(()=>true),attack=vi.fn(()=> 'a');const v=render(<FightView state={createFightState(DEFAULT_FIGHT_RULES,0)} player={0} nowMs={1000} onAction={()=>{}} onInput={input} onAttack={attack}/>);
 const down=screen.getByRole('button',{name:'Присесть'}),block=screen.getByRole('button',{name:'Блок'});
 fireEvent.keyDown(down,{key:'Enter'});fireEvent.keyDown(block,{key:'Enter'});
 expect(input).toHaveBeenLastCalledWith({direction:0,crouch:true,guard:true});
 fireEvent.click(screen.getByRole('button',{name:'Удар'}));expect(attack).toHaveBeenCalledTimes(1);
 fireEvent.keyUp(down,{key:'Enter'});expect(input).toHaveBeenLastCalledWith({direction:0,crouch:false,guard:true});
 fireEvent(window,new Event('blur'));expect(input).toHaveBeenLastCalledWith({direction:0,crouch:false,guard:false});
 expect(screen.getAllByRole('button')).toHaveLength(5);expect(block.closest('.fight-control-right')).not.toBeNull();expect(down.closest('.fight-control-left')).not.toBeNull();v.unmount();
});
