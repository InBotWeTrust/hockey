import test from 'node:test';
import assert from 'node:assert/strict';
import {motionViewportFrame,resizeMotionViewport} from '../../public/maps/studio-20261110/motion-viewport-a73a41840552.mjs';
test('road animation is bounded by the viewport rather than the entire high-DPR world',()=>{
 const frame=motionViewportFrame({viewportWidth:2295,worldWidth:4284,worldHeight:1428,dpr:2,scrollLeft:800});
 assert.ok(frame.width*frame.height<=6_000_000);
 assert.ok(frame.width<4000);
 assert.ok(Math.abs(frame.scaleX/frame.density-4284/3000)<1e-10);
 assert.ok(Math.abs(frame.translateX/frame.density+800)<1e-10);
});
test('mobile rendering does not allocate invisible map width or excessive DPR',()=>{
 const frame=motionViewportFrame({viewportWidth:390,worldWidth:2532,worldHeight:844,dpr:3,scrollLeft:1300});
 assert.ok(frame.width<=780);assert.ok(frame.height<=1688);
 const screenX=(1800*frame.scaleX+frame.translateX)/frame.density;
 assert.ok(Math.abs(screenX-(1800/3000*2532-1300))<1e-8);
});
test('panning updates the transform without clearing or reallocating the backing canvas',()=>{
 let writes=0;const canvas={style:{},_w:1,_h:1,get width(){return this._w;},set width(v){writes++;this._w=v;},get height(){return this._h;},set height(v){writes++;this._h=v;}};
 const transforms=[];const ctx={setTransform(...a){transforms.push(a);}};
 const settings={viewportWidth:390,worldWidth:2532,worldHeight:844,dpr:2,scrollLeft:0};
 resizeMotionViewport(canvas,ctx,settings);resizeMotionViewport(canvas,ctx,{...settings,scrollLeft:200});
 assert.equal(writes,2);assert.notDeepEqual(transforms[0],transforms[1]);
 assert.equal(canvas.style.width,'390px');
});
test('hidden surfaces remain tiny and every supported size stays within the pixel budget',()=>{
 for(const [w,h,dpr] of [[0,0,3],[300,800,3],[2295,1428,2],[8000,4000,4]]){
 const f=motionViewportFrame({viewportWidth:w,worldWidth:w*3,worldHeight:h,dpr,scrollLeft:0});
 assert.ok(f.width>=1&&f.height>=1);assert.ok(f.width*f.height<=6_000_000);
 }
});
