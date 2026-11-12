import {expect,it} from 'vitest';
import * as pool from '../../src/barGames/pool.js';
const board=():pool.Game=>({...pool.create(0),break:false,groups:['solids','stripes'],balls:[
 {id:0,x:.5,y:1.5,pocketed:false},
 {id:1,x:.25,y:.4,pocketed:false},
 {id:2,x:.75,y:.5,pocketed:false},
 {id:8,x:.595,y:1.1,pocketed:false},
 {id:9,x:.8,y:1.7,pocketed:false},
]});
it('avoids an eight blocking the shortest route to a pot',()=>{
 const g=board(),chosen=pool.bot(g);
 const result=pool.shoot(g,chosen.shot);
 expect(result.firstContact).not.toBe(8);
 expect(result.firstContact===1||result.firstContact===2).toBe(true);
 expect(result.game.lastFoul).toBe(false);
 expect(chosen).toEqual(pool.bot(g));
});
it('preserves an open table after the break and assigns groups on the next legal pot',()=>{
 const broken=pool.resolve(pool.create(0),{firstContact:1,pocketed:[1],railAfter:true,scratch:false});
 expect(broken.groups).toEqual([null,null]);
 expect(pool.resolve(broken,{firstContact:9,pocketed:[9],railAfter:true,scratch:false}).groups).toEqual(['stripes','solids']);
});
it('pots an available own ball without scratching and only plays the eight after clearing',()=>{
 const g:pool.Game={...pool.create(0),break:false,groups:['solids','stripes'],balls:[
 {id:0,x:.45,y:.45,pocketed:false},{id:1,x:.15,y:.15,pocketed:false},
 {id:8,x:.8,y:1.5,pocketed:false},{id:9,x:.8,y:.7,pocketed:false}]};
 const shot=pool.bot(g).shot,result=pool.shoot(g,shot);
 expect(result.pocketed).toContain(1);expect(result.game.lastFoul).toBe(false);
 const cleared={...g,balls:g.balls.map(b=>({...b,pocketed:b.id===1}))};
 expect(pool.shoot(cleared,pool.bot(cleared).shot).firstContact).toBe(8);
});
it('keeps evaluation identical to rendering physics without allocating animation frames',()=>{
 const g=board(),shot=pool.bot(g).shot;
 const full=pool.shoot(g,shot),probe=pool.shoot(g,shot,'responsive',false);
 expect(probe.game).toEqual(full.game);expect(probe.firstContact).toBe(full.firstContact);
 expect(probe.pocketed).toEqual(full.pocketed);expect(probe.frames).toEqual([]);
});
it('retains the previous bot policy for legacy matches',()=>{
 const g=board();
 expect(pool.shoot(g,pool.bot(g,false).shot).firstContact).toBe(8);
});

it('can miss long pots while keeping seeded aiming repeatable', () => {
 const game:pool.Game={...pool.create(0),break:false,groups:['solids','stripes'],balls:[
  {id:0,x:.75,y:1.5,pocketed:false},{id:1,x:.2,y:.4,pocketed:false},
  {id:8,x:.85,y:1.8,pocketed:false},{id:9,x:.85,y:.8,pocketed:false}]};
 const outcomes=Array.from({length:20},(_,i)=>{
  const choice=pool.bot(game,true,i/19);
  expect(choice).toEqual(pool.bot(game,true,i/19));
  return pool.shoot(game,choice.shot).pocketed.includes(1);
 });
 expect(outcomes).toContain(true);
 expect(outcomes).toContain(false);
});

it('chooses ball-in-hand placement for an easy legal pot instead of the first free grid point', () => {
 const game:pool.Game={...pool.create(0),break:false,ballInHand:true,groups:['solids','stripes'],balls:[
  {id:0,x:.5,y:1.5,pocketed:true},{id:1,x:.15,y:.15,pocketed:false},
  {id:8,x:.85,y:1.7,pocketed:false},{id:9,x:.1,y:.8,pocketed:false},
  {id:10,x:.2,y:.8,pocketed:false},{id:11,x:.3,y:.8,pocketed:false},
 ]};
 const easy=pool.place(game,{x:.35,y:.35});
 expect(pool.shoot(easy,{angle:-3*Math.PI/4,power:.3},'responsive',false).pocketed).toContain(1);
 const choice=pool.bot(game,true,.5,7,true);
 expect(choice.placement).not.toBeNull();
 const result=pool.shoot(pool.place(game,choice.placement!),choice.shot,'responsive',false);
 expect(result.game.lastFoul).toBe(false);
 expect(result.pocketed).toContain(1);
 expect(choice).toEqual(pool.bot(game,true,.5,7,true));
});

it('uses spin to leave a playable next pot instead of only minimizing cue distance', () => {
 const positions=[
  [0,.6875935400384856,.25063385046742054], [1,.4667746170442607,.5481667691367136],
  [2,.23330029155253793,1.4711875456834806], [3,.5844017630375642,1.5400989972402552],
  [8,.3282307844441364,1.658596922682395], [9,.2741506587879409,1.306793963058869],
  [10,.8419091261943781,.7945197361908869], [11,.4224327209674474,1.260789515148343],
 ];
 const game:pool.Game={...pool.create(0),break:false,groups:['solids','stripes'],balls:positions.map(([id,x,y])=>({id:id!,x:x!,y:y!,pocketed:false}))};
 const choice=pool.bot(game,true,.5,7,true);
 expect(choice.shot.spin).toBeDefined();
 expect(pool.validSpin(choice.shot.spin)).toBe(true);
 const first=pool.shoot(game,choice.shot,'responsive',false);
 expect(first.game.lastFoul).toBe(false);
 expect(first.game.turn).toBe(game.turn);
 expect(first.pocketed).toContain(3);
 const next=pool.shoot(first.game,pool.bot(first.game,true,.5,7,true).shot,'responsive',false);
 expect(next.game.lastFoul).toBe(false);
 expect(next.pocketed.some(id=>id>0 && id<8)).toBe(true);
 const neutral=pool.shoot(game,{angle:choice.shot.angle,power:choice.shot.power},'responsive',false);
 expect(neutral.pocketed).toContain(3);
 const neutralNext=pool.shoot(neutral.game,pool.bot(neutral.game,true,.5,7,true).shot,'responsive',false);
 expect(neutralNext.pocketed.some(id=>id>0 && id<8)).toBe(false);
 expect(choice).toEqual(pool.bot(game,true,.5,7,true));
});

it('keeps the planning decision stable while retaining human aiming error', () => {
 const game=board();
 const ideal=pool.bot(game,true,.5,7,true);
 for(const roll of [0,.2,.8,1]) {
  const noisy=pool.bot(game,true,roll,7,true);
  expect(noisy.placement).toEqual(ideal.placement);
  expect(noisy.shot.power).toBe(ideal.shot.power);
  expect(noisy.shot.spin).toEqual(ideal.shot.spin);
  expect(noisy.shot.angle).not.toBe(ideal.shot.angle);
 }
 expect(pool.bot(game,true,.5,7,false)).toEqual(pool.bot(game,true,.5,7));
});
