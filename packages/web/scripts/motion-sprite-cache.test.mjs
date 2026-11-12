import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMotionSpriteCache} from '../public/maps/studio-20261110/motion-sprite-cache-9f8c2b4abc2c.mjs';
test('prepares crop, scale and lighting once for repeated vehicle frames',()=>{
 const calls=[];const createCanvas=()=>({getContext:()=>({drawImage:(...args)=>calls.push(args)})});
 const cache=createMotionSpriteCache(createCanvas),image={};const first=cache.get(image,[10,20,210,120],90,45,'brightness(.72)');
 assert.equal(cache.get(image,[10,20,210,120],90,45,'brightness(.72)'),first);assert.equal(calls.length,1);assert.equal(first.width,180);assert.equal(first.height,90);assert.deepEqual(calls[0].slice(1,5),[10,20,200,100]);
 assert.notEqual(cache.get(image,[10,20,210,120],90,45,'none'),first);assert.equal(calls.length,2);
});
test('bounds retained sprite variants and can release them',()=>{let count=0;const cache=createMotionSpriteCache(()=>{count++;return {getContext:()=>({drawImage(){}})}},2),im={};
 for(let i=1;i<=3;i++)cache.get(im,[0,0,100,100],i,10,'none');cache.get(im,[0,0,100,100],1,10,'none');assert.equal(count,4);cache.clear();cache.get(im,[0,0,100,100],1,10,'none');assert.equal(count,5);
});
