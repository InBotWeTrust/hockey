import test from 'node:test';
import assert from 'node:assert/strict';
import {paintRoadDepth} from '../../public/maps/studio-20261110/road-depth.mjs';
test('vehicles cover the far signal, while the near signal covers vehicles',()=>{
 const order=[];paintRoadDepth(front=>order.push(front?'near':'far'),()=>order.push('vehicles'));
 assert.deepEqual(order,['far','vehicles','near']);
});
