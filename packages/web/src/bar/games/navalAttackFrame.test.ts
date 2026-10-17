import { expect, it } from 'vitest';
import { barBattleship as sea } from '@hockey/game-core';
import { navalAttackFrame } from './navalAttackFrame.js';
it.each([0,1] as const)('defers sinking and automatic border dots for actor %i without mutating the snapshot',actor=>{
 const g=sea.start(sea.create(actor,4,true,true));g.airstrikeCharges![actor]=5;
 g.fleets[1-actor]=[{id:'ship-4',kind:'standard',x:0,y:0,w:2,h:1,hits:[]}];
 const before=sea.view(g,0), after=sea.view(sea.attack(g,actor,0,0,true,false),0);
 const saved=structuredClone(after);
 expect(navalAttackFrame(after,before,-1,0).shots[actor]).toEqual(before.shots[actor]);
 const first=navalAttackFrame(after,before,0,0);
 expect(first.shots[actor]).toEqual([{cell:0,hit:true}]);
 if(actor===0)expect(first.enemySunk).toHaveLength(0);
 else expect(first.ownShips[0]!.hits).toEqual([0]);
 const second=navalAttackFrame(after,before,250,0);
 if(actor===0)expect(second.enemySunk).toHaveLength(1);
 else expect(second.ownShips[0]!.hits).toEqual([0,1]);
 expect(navalAttackFrame(after,before,600,0).shots[actor]).toHaveLength(3);
 expect(navalAttackFrame(after,before,1600,0)).toBe(after);
 expect(after).toEqual(saved);
});
it('preserves old marks, avoids touching the other fleet and catches up a late mount',()=>{
 const g=sea.start(sea.create(0,4,true,true));g.airstrikeCharges![0]=5;
 g.shots[0]=[{cell:0,hit:false},{cell:100,hit:false}];
 const own=g.fleets[0][0]!;own.hits=[sea.cells(own)[0]!];
 const before=sea.view(g,0),after=sea.view(sea.attack(g,0,0,0,true,false),0);
 const frame=navalAttackFrame(after,before,0);
 expect(frame.shots[0].some(m=>m.cell===100)).toBe(true);
 expect(frame.ownShips).toBe(after.ownShips);
 expect(navalAttackFrame(after,undefined,600)).toBe(after);
 const late=navalAttackFrame(after,before,600);
 expect(after.lastAction!.cells.slice(0,3).every(m=>late.shots[0].some(s=>s.cell===m.cell))).toBe(true);
 expect(late.shots[0].some(m=>m.cell===after.lastAction!.cells[3]!.cell)).toBe(false);
});

it('keeps already sunk hulls and their old dots when a reconnect has no previous snapshot',()=>{
 const g=sea.start(sea.create(0,4,true,true));g.airstrikeCharges![0]=5;
 g.fleets[1]=[{id:'ship-8',kind:'standard',x:0,y:0,w:1,h:1,hits:[0]},{id:'ship-9',kind:'standard',x:10,y:10,w:1,h:1,hits:[]}];
 g.shots[0]=[{cell:0,hit:true},...sea.surroundingWater([g.fleets[1][0]!]).map(cell=>({cell,hit:false}))];
 const after=sea.view(sea.attack(g,0,0,0,true,false),0);
 expect(navalAttackFrame(after,undefined,0)).toBe(after);
 expect(navalAttackFrame(after,undefined,250).enemySunk).toEqual(after.enemySunk);
 expect(navalAttackFrame(after,undefined,500).shots).toEqual(after.shots);
});
