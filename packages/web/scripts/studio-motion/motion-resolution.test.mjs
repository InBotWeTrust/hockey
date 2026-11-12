import test from 'node:test';
import assert from 'node:assert/strict';
import {motionSurfaceSize,resizeMotionSurface} from '../../public/maps/studio-20261110/motion-resolution.mjs';

test('zoomed retina map receives enough backing pixels instead of stretching a 3000px canvas',()=>{
 assert.deepEqual(motionSurfaceSize(3000,1000,2),{width:6000,height:2000});
 assert.deepEqual(motionSurfaceSize(4500,1500,1),{width:4500,height:1500});
});
test('small and temporarily hidden maps preserve the original minimum resolution',()=>{
 for(const args of [[1000,1000/3,1],[0,0,2],[NaN,NaN,NaN]])assert.deepEqual(motionSurfaceSize(...args),{width:3000,height:1000});
});
test('large zoom is bounded in memory and preserves the world aspect ratio',()=>{
 const {width,height}=motionSurfaceSize(18000,6000,3);assert.ok(width*height<=24_000_000);assert.equal(width,height*3);assert.ok(width>6000);
});
test('resizing preserves logical actor coordinates and never clears an unchanged surface',()=>{
 let changes=0;const canvas={_w:3000,_h:1000,get width(){return this._w},set width(v){changes++;this._w=v},get height(){return this._h},set height(v){changes++;this._h=v}};
 const transforms=[],ctx={setTransform(...args){transforms.push(args)}};
 resizeMotionSurface(canvas,ctx,4500,1500,1);
 assert.deepEqual(transforms.at(-1),[1.5,0,0,1.5,0,0]);assert.equal(canvas.width,4500);assert.equal(changes,2);
 resizeMotionSurface(canvas,ctx,4500,1500,1);assert.equal(changes,2);assert.equal(ctx.imageSmoothingQuality,'high');
});
