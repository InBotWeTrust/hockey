import {expect,it} from 'vitest';
import {advanceTraffic,roadSignal} from './trafficMotion.js';
it('cycles both directions together through green, yellow and red',()=>{
 expect([0,12,15,25].map(roadSignal)).toEqual(['green','yellow','red','green']);
});
it('queues before the zebra in both directions and resumes on green',()=>{
 let cars=[{lane:2,x:57,width:4.5,speed:6,leftward:false},{lane:2,x:49,width:4.5,speed:6,leftward:false},{lane:0,x:78,width:4.5,speed:6,leftward:true}];
 for(let i=0;i<100;i++)cars=advanceTraffic(cars,.1,'red');
 expect(cars[0]!.x).toBe(60.5);expect(cars[2]!.x).toBe(75);
 expect(cars[1]!.x+cars[1]!.width).toBeLessThan(cars[0]!.x);
 const go=advanceTraffic(cars,.1,'green');expect(go[0]!.x).toBeGreaterThan(cars[0]!.x);expect(go[2]!.x).toBeLessThan(cars[2]!.x);
});
it('lets cars already crossing clear the road and removes off-map cars',()=>{
 expect(advanceTraffic([{lane:2,x:66,width:4.5,speed:6,leftward:false}],.5,'red')[0]!.x).toBe(69);
 expect(advanceTraffic([{lane:2,x:111,width:4.5,speed:6,leftward:false}],1,'green')).toEqual([]);
});
