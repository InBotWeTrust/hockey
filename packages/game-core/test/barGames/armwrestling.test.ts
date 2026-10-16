import {expect,it} from 'vitest';
import {createArmwrestling,advanceArmwrestling,applyArmInput,type ArmInput} from '../../src/barGames/armwrestling.js';
const hold=(seq=1):ArmInput=>({seq,supportHeld:true,support:0.7,pressing:true,wrist:'straight'});
it('starts a sixty-second match and expires stale holds before inactivity',()=>{
 let g=createArmwrestling(0,1);expect(g.endsAt).toBe(60000);
 g=applyArmInput(g,0,hold(),0);g=applyArmInput(g,1,hold(),0);
 expect(advanceArmwrestling(g,5749).warning).toEqual([false,false]);
 expect(advanceArmwrestling(g,5750).warning).toEqual([true,true]);
 expect(advanceArmwrestling(g,10750).winner).toBe('draw');
});
it('is symmetric and independent of advance chunking',()=>{
 let g=createArmwrestling(0,1);g=applyArmInput(g,0,hold(),0);g=applyArmInput(g,1,hold(),0);
 expect(advanceArmwrestling(g,500).progress).toBeCloseTo(0,8);
 expect(advanceArmwrestling(advanceArmwrestling(g,237),500)).toEqual(advanceArmwrestling(g,500));
});
it('ignores duplicate and out-of-order sequence numbers and validates bounded input',()=>{
 let g=applyArmInput(createArmwrestling(0,1),0,hold(3),0);
 expect(applyArmInput(g,0,{...hold(2),pressing:false},0)).toEqual(g);
 expect(()=>applyArmInput(g,0,{...hold(4),support:NaN},0)).toThrow();
 expect(()=>applyArmInput(g,0,{...hold(4),support:2},0)).toThrow();
});
it('gives a warning at five seconds and loses at ten without input',()=>{
 let g=applyArmInput(createArmwrestling(0,1),1,hold(),0);
 for(let t=250;t<=5000;t+=250)g=applyArmInput(g,1,hold(t),t);
 expect(g.warning[0]).toBe(true);
 for(let t=5250;t<=10000;t+=250)g=applyArmInput(g,1,hold(t),t);
 expect(advanceArmwrestling(g,10000).winner).toBe(1);
});
it('uses the deadline position and does not make exhaustion an automatic loss',()=>{
 const g=createArmwrestling(0,1);
 expect(advanceArmwrestling({...g,simulatedAt:59980,releasedSince:[59980,59980],progress:0.04},60000).winner).toBe('draw');
 expect(advanceArmwrestling({...g,simulatedAt:59980,releasedSince:[59980,59980],progress:0.2},60000).winner).toBe(0);
 expect(advanceArmwrestling({...g,stamina:[0,0]},20).winner).toBeNull();
 expect(advanceArmwrestling({...g,progress:1},20).winner).toBe(0);
});
it('inside trades energy for pressure and outside trades attack for defence',()=>{
 function run(wrist:ArmInput['wrist']){let g=createArmwrestling(0,1);g=applyArmInput(g,0,{...hold(),wrist},0);g=applyArmInput(g,1,{...hold(),pressing:false},0);return advanceArmwrestling(g,500);}
 const inside=run('inside'),straight=run('straight'),outside=run('outside');
 expect(inside.progress).toBeGreaterThan(straight.progress);expect(straight.progress).toBeGreaterThan(outside.progress);expect(inside.stamina[0]).toBeLessThan(straight.stamina[0]);
});

it('accepts independent player inputs through the common runtime and advances Oleg deterministically',async()=>{
 const {createMatch,command,advance}=await import('../../src/barGames/runtime.js');
 let m=createMatch('armwrestling',0,0,false,22);
 m=command(m,0,{type:'arm-input',...hold()},0);
 m=command(m,1,{type:'arm-input',...hold()},0);
 expect(m.game.kind).toBe('armwrestling');
 if(m.game.kind==='armwrestling')expect(m.game.lastSeq).toEqual([1,1]);
 const bot=createMatch('armwrestling',0,0,true,22);
 expect(advance(advance(bot,237),1000).game).toEqual(advance(bot,1000).game);
});
it('does not move the result presentation deadline on later reads',async()=>{
 const {createMatch,advance}=await import('../../src/barGames/runtime.js');
 const finished=advance(createMatch('armwrestling',0,0,false,1),10000);
 expect(finished.game.winner).toBe('draw');
 expect(advance(finished,11000)).toBe(finished);
});
