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
