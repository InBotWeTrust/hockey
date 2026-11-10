import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicles,stepVehicles} from '../../public/maps/studio-20261110/traffic-variety-4aa4e0c869a3.mjs';
const seeded=()=>{let n=271;return()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};};
test('fleet is moderately smaller, has varied drivers, gaps and vehicle types',()=>{
 const fleet=createVehicles(seeded());
 assert.equal(fleet.length,14);
 assert.ok(new Set(fleet.map(c=>c.speed.toFixed(2))).size>8);
 assert.ok(new Set(fleet.map(c=>c.launchDelay.toFixed(2))).size>8);
 assert.ok(new Set(fleet.map(c=>c.model)).size>8);
 assert.ok(fleet.every(c=>c.speed>=3&&c.speed<=10));
});
test('recycled cars wait outside the map and get a new driver instead of looping at fixed spacing',()=>{
 const car={id:1,lane:2,x:113,width:4.5,direction:1,speed:6,model:'sedan'};
 const [next]=stepVehicles([car],.1,'green',undefined,()=>.5);
 assert.ok(next.spawnWait>=2);
 assert.ok(next.x<0);
 const [waiting]=stepVehicles([next],.1,'green',undefined,()=>.5);
 assert.equal(waiting.x,next.x);
 assert.ok(waiting.spawnWait<next.spawnWait);
});
test('drivers leave a red light after individual delays and accelerate smoothly',()=>{
 const car={id:1,lane:2,x:60.5,width:4.5,direction:1,speed:7,model:'sedan',velocity:0,launchDelay:.6,wasStopped:true};
 let [next]=stepVehicles([car],.1,'green');assert.equal(next.x,car.x);
 for(let i=0;i<7;i++)[next]=stepVehicles([next],.1,'green');
 assert.ok(next.x>car.x);assert.ok(next.velocity>0&&next.velocity<next.speed);
});
test('mixed fast and slow traffic never overlaps, and red queues stay behind both stop lines',()=>{
 let fleet=createVehicles(seeded()),random=seeded();
 for(let i=0;i<5000;i++){
  const phase=i%250<120?'green':i%250<150?'yellow':'red';
  fleet=stepVehicles(fleet,.1,phase,undefined,random);
  for(let lane=0;lane<4;lane++){
   const cars=fleet.filter(c=>c.lane===lane).sort((a,b)=>a.x-b.x);
   for(let j=1;j<cars.length;j++)assert.ok(cars[j].x>=cars[j-1].x+cars[j-1].width+1.19);
  }
 }
});
