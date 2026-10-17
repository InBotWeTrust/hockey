import {expect,it} from 'vitest';
import {createAccident,accidentStageAt,nextAccidentAt,accidentWidth,validAccident} from './accident.js';
it('only uses upper lanes and brings opposite fronts together despite different speeds',()=>{
 for(const value of [0,.3,.99]){
  const event=createAccident(1000,()=>value);
  expect([0,1]).toContain(event.lane);
  expect(event.policeLane).toBe(1-event.lane);
  const seconds=(event.collisionAt-event.start)/1000;
  expect(-10+event.speedA*seconds+accidentWidth(event.vehicleA!)).toBeCloseTo(110-event.speedB*seconds,3);
  expect(event.policeStart-event.collisionAt).toBeGreaterThanOrEqual(300000);
  expect(event.policeStart-event.collisionAt).toBeLessThanOrEqual(600000);
  expect(event.departAt-event.policeArrived).toBeGreaterThanOrEqual(300000);
  expect(event.departAt-event.policeArrived).toBeLessThanOrEqual(600000);
  expect(nextAccidentAt(event,()=>0)-event.start).toBeGreaterThanOrEqual(48*3600000);
 }
});
it('restores each phase by real time and finishes after leaving the map',()=>{
 const event=createAccident(1000,()=>.5);
 expect(accidentStageAt(event,event.start).phase).toBe('approach');
 expect(accidentStageAt(event,event.collisionAt).phase).toBe('waiting');
 expect(accidentStageAt(event,event.policeStart).phase).toBe('police-approach');
 expect(accidentStageAt(event,event.policeArrived).phase).toBe('police-wait');
 expect(accidentStageAt(event,event.departAt).phase).toBe('departing');
 expect(accidentStageAt(event,event.end).phase).toBe('done');
});

it('computes the contact point from unequal independent approach speeds',()=>{
 const values=[.1,.2,.8,.4,.5,.6];const event=createAccident(0,()=>values.shift()??.5);
 expect(event.speedA).not.toBe(event.speedB);
 const t=event.collisionAt/1000;
 expect(-10+event.speedA*t+accidentWidth(event.vehicleA!)).toBeCloseTo(110-event.speedB*t,6);
});
it('gives all three vehicles distinct random departure speeds and waits for the last exit',()=>{
 for(const value of [0,.4,.99]){
  const event=createAccident(1000,()=>value);
  const speeds=[event.departSpeedA,event.departSpeedB,event.departPoliceSpeed];
  expect(speeds.every(speed=>Number.isFinite(speed)&&speed>0)).toBe(true);
  expect(new Set(speeds).size).toBe(3);
  const last=Math.max((event.impact+10)/event.departSpeedA,(110-event.impact-accidentWidth(event.vehicleA!))/event.departSpeedB,(110-event.impact)/event.departPoliceSpeed);
  expect(event.end-event.departAt).toBeCloseTo(last*1000,5);
 }
});

it('selects every traffic model for either role and persists the chosen pair',()=>{
 const models=['sedan','hatchback','wagon','suv','crossover','coupe','compact','executive','taxi','sedan-blue','bus-red','bus'];
 for(let i=0;i<models.length;i++){
  const event=createAccident(1000,()=> (i+.1)/models.length);
  expect(event.vehicleA).toBe(models[i]);
  expect(models).toContain(event.vehicleB);
  expect(event.vehicleB).not.toBe(event.vehicleA);
  expect(JSON.parse(JSON.stringify(event)).vehicleA).toBe(models[i]);
 }
});

it('keeps every car and bus pairing nose-to-nose at the computed instant',()=>{
 for(let a=0;a<12;a++)for(let b=0;b<11;b++){
  const values=[(a+.1)/12,(b+.1)/11,.2,.1,.9];
  const event=createAccident(1000,()=>values.shift()??.5);
  const t=(event.collisionAt-event.start)/1000;
  expect(-10+event.speedA*t+accidentWidth(event.vehicleA!)).toBeCloseTo(110-event.speedB*t,8);
  expect(validAccident(JSON.parse(JSON.stringify(event)))).toBe(true);
 }
});
it('accepts old saved incidents but rejects unknown saved vehicle models',()=>{
 const {vehicleA,vehicleB,...legacy}=createAccident(1000,()=>.5);
 void vehicleA;void vehicleB;
 expect(validAccident(legacy)).toBe(true);
 expect(validAccident({...legacy,vehicleA:'unknown'})).toBe(false);
});
