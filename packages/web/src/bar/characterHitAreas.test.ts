import {it,expect} from 'vitest';
import {characterHitTransform} from './characterHitAreas.js';
it('keeps the hit contour aligned with contain fit and edited object position',()=>{
 expect(characterHitTransform(360,568,50,50)).toEqual({x:0,y:14,scale:360/1024});
 expect(characterHitTransform(360,568,20,100)).toEqual({x:0,y:28,scale:360/1024});
 expect(characterHitTransform(400,300,100,50)).toEqual({x:200,y:0,scale:300/1536});
});
