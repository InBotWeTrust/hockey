import test from 'node:test';
import assert from 'node:assert/strict';
import {motionViewportFrame} from '../../public/maps/studio-20261110/motion-world-window-4e3ca71d7054.mjs';
test('painted objects remain attached to world during compositor scroll before the next redraw',()=>{
 const f=motionViewportFrame({viewportWidth:390,worldWidth:2532,worldHeight:844,dpr:3,scrollLeft:800});
 for(const scroll of [800,820,850,940]){
  const x=1800*f.scaleX/f.density+f.translateX/f.density+f.left-scroll;
  assert.ok(Math.abs(x-(1800/3000*2532-scroll))<1e-8);
  assert.ok(f.left<=scroll&&f.left+f.cssWidth>=scroll+390);
 }
 assert.ok(f.width*f.height<=6_000_000);
});
test('window covers map edges without leaving the world bounds',()=>{
 for(const scrollLeft of [0,1,800,2142]){
  const f=motionViewportFrame({viewportWidth:390,worldWidth:2532,worldHeight:844,dpr:2,scrollLeft});
  assert.ok(f.left>=0&&f.left+f.cssWidth<=2532);
  assert.ok(f.left<=scrollLeft&&f.left+f.cssWidth>=scrollLeft+390);
 }
});
