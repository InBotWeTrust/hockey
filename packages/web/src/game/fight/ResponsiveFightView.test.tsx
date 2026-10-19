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

it('bar contact emphasis does not disable held input or attack submission',()=>{
 const state=createFightState({...DEFAULT_FIGHT_RULES,version:6},0);
 const input=vi.fn(()=>true),attack=vi.fn(()=> 'bar-hit');
 const view=render(<FightView skin="bar" state={state} player={0} nowMs={100} onAction={()=>{}} onInput={input} onAttack={attack}/>);
 fireEvent.keyDown(screen.getByRole('button',{name:'Присесть'}),{key:'Enter'});
 fireEvent.keyDown(screen.getByRole('button',{name:'Блок'}),{key:'Enter'});
 expect(input).toHaveBeenLastCalledWith({direction:0,crouch:true,guard:true});
 fireEvent.click(screen.getByRole('button',{name:'Удар'}));expect(attack).toHaveBeenCalledOnce();
 view.unmount();
});

it('counts 3, 2, 1 before arrival and starts the full fight only after arrival',()=>{
 const state=createFightState(DEFAULT_FIGHT_RULES,4000);
 const props={state,player:0 as const,onAction:()=>{}};
 const view=render(<FightView {...props} nowMs={0}/>);
 for(const [now,label] of [[0,'3'],[1000,'2'],[2000,'1'],[3000,'Старт']] as const){
  view.rerender(<FightView {...props} nowMs={now}/>);
  expect(screen.getByRole('timer').querySelector('strong')?.textContent).toBe(label);
  expect(screen.getByRole('button',{name:'Удар'})).toBeDisabled();
 }
 view.rerender(<FightView {...props} nowMs={4000}/>);
 expect(screen.getByRole('timer').querySelector('strong')?.textContent).toBe('20');
 expect(screen.getByRole('button',{name:'Удар'})).not.toBeDisabled();
 view.unmount();
});
