import test from 'node:test';
import assert from 'node:assert/strict';
import { signalPhase, createVehicles, stepVehicles } from '../../public/maps/studio-20261110/traffic-variety-34cd028b9994.mjs';

test('both directions share green, yellow and red cycle', () => {
  assert.equal(signalPhase(0), 'green');
  assert.equal(signalPhase(12), 'yellow');
  assert.equal(signalPhase(15), 'red');
  assert.equal(signalPhase(25), 'green');
});

test('upper lanes go left, lower lanes go right, and cars are larger', () => {
  const cars = createVehicles();
  assert.ok(cars.every(car => car.direction === (car.lane < 2 ? -1 : 1)));
  assert.ok(cars.every(car => car.width >= (car.model==='motorcycle'?2.4:4.5)));
});

test('red stops both directions before the crossing, queues do not overlap', () => {
  let cars = [
    { id: 1, lane: 2, x: 57, width: 4.5, direction: 1, speed: 6 },
    { id: 2, lane: 2, x: 49, width: 4.5, direction: 1, speed: 6 },
    { id: 3, lane: 0, x: 78, width: 4.5, direction: -1, speed: 6 }
  ];
  for (let i = 0; i < 150; i++) cars = stepVehicles(cars, .1, 'red');
  assert.equal(cars[0].x, 60.5);
  assert.ok(cars[1].x + cars[1].width + 1 <= cars[0].x);
  assert.equal(cars[2].x, 75);
  const resumed = stepVehicles(cars, .1, 'green');
  assert.ok(resumed[0].x > cars[0].x);
  assert.ok(resumed[2].x < cars[2].x);
});

test('vehicles already past the stop line clear the crossing on red', () => {
  const cars = [{id:1,lane:2,x:66,width:4.5,direction:1,speed:6}];
  assert.equal(stepVehicles(cars, .5, 'red')[0].x, 69);
});

test('near lanes cover far incident actors and lower-lane wheels stay above curb', async () => {
  const { laneBaselines, vehiclePaintOrder } = await import('../../public/maps/studio-20261110/traffic-variety-34cd028b9994.mjs');
  const actors = [{id:'bus',baseline:laneBaselines[1]}, {id:'incident-taxi',baseline:laneBaselines[0]}, {id:'taxi',baseline:laneBaselines[3]}];
  assert.deepEqual(vehiclePaintOrder(actors).map(actor=>actor.id), ['incident-taxi','bus','taxi']);
  assert.ok(laneBaselines[2] >= 91 && laneBaselines[2] < 92);
  assert.ok(laneBaselines[3] >= 94 && laneBaselines[3] < 95);
});

test('incoming cars waiting outside viewport do not wrap repeatedly away from map',()=>{
 const incoming=[{id:1,lane:0,x:130,width:4.5,direction:-1,speed:6},{id:2,lane:2,x:-25,width:4.5,direction:1,speed:6}];
 const next=stepVehicles(incoming,.1,'green');assert.ok(Math.abs(next[0].x-129.4)<1e-8);assert.ok(Math.abs(next[1].x+24.4)<1e-8);
 let fleet=createVehicles();for(let i=0;i<1000;i++)fleet=stepVehicles(fleet,.1,'red');assert.ok(fleet.every(c=>Math.abs(c.x)<250));
});

test('bus tires, rather than sprite shadows, sit on the lane baseline',async()=>{
 const {vehicleWheelAnchor}=await import('../../public/maps/studio-20261110/traffic-variety-34cd028b9994.mjs');
 assert.equal(vehicleWheelAnchor('traffic-bus-red'),.84);
 assert.equal(vehicleWheelAnchor('traffic-bus'),.93);
 assert.equal(vehicleWheelAnchor('traffic-sedan'),1);
});
