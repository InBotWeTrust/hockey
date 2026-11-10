import test from 'node:test';import assert from 'node:assert/strict';
import {createIncident,stepIncident,incidentFrame,trafficAllowed} from '../../public/maps/studio-20261110/rear-end-preview.mjs';
for(const direction of [-1,1])test(`rear-end incident direction ${direction}: stops, rear impact, adjacent police and no queue`,()=>{
 let s=createIncident(direction,0);s=stepIncident(s,20,'green');assert.equal(s.phase,'idle');s=stepIncident(s,.1,'red');assert.equal(s.phase,'braking');
 for(let i=0;i<32;i++)s=stepIncident(s,.1,'red');let f=incidentFrame(s);assert.equal(f.damaged,true);assert.equal(f.direction,direction);assert.equal(f.policeLane, f.lane+(direction>0?-1:1));
 assert.ok(direction*(f.leadX-f.rearX)>0);let gap=direction>0?f.leadX-(f.rearX+f.rearWidth):f.rearX-(f.leadX+f.leadWidth);assert.ok(Math.abs(gap)<.5);
 assert.equal(trafficAllowed({lane:f.lane,x:f.rearX-direction*15,width:4.5,direction},f),false);
 assert.equal(trafficAllowed({lane:f.lane,x:f.leadX+direction*20,width:4.5,direction},f),true);
 for(let i=0;i<190;i++)s=stepIncident(s,.1,'red');assert.notEqual(s.phase,'departing');s=stepIncident(s,.1,'green');assert.equal(s.phase,'departing');
});
test('traffic uses the existing fleet plus special vehicles',async()=>{const {createVehicles}=await import('../../public/maps/studio-20261110/traffic-variety-34cd028b9994.mjs');const cars=createVehicles();assert.ok(cars.length>12);for(const model of ['compact','wagon','coupe','motorcycle','snowplow'])assert.ok(cars.some(c=>c.model===model));});

test('damage sprites keep both cars facing in the same direction and every fleet model has rear art',async()=>{
 const {incidentModels,incidentActors}=await import('../../public/maps/studio-20261110/rear-end-preview.mjs');const {laneBaselines}=await import('../../public/maps/studio-20261110/traffic-variety-34cd028b9994.mjs');const fs=await import('node:fs');const folder=new URL('../../public/maps/studio-20261110/',import.meta.url);const scene=fs.readdirSync(folder).find(f=>f.startsWith('scene-'));const lib=JSON.parse(fs.readFileSync(new URL(scene,folder))).assets;
 for(const model of incidentModels){const asset=lib.find(a=>a.id==='extra-accident-rear-'+model);assert.ok(asset,model);assert.ok(fs.existsSync(new URL('../../public'+asset.src,import.meta.url)));}
 for(const direction of [-1,1]){const s={...createIncident(direction,0),phase:'police',age:8};const f=incidentFrame(s),actors=incidentActors(f,laneBaselines);assert.ok(actors[0].id.startsWith('accident-rear-'));assert.equal(actors[0].mirror,actors[1].mirror);assert.notEqual(actors[0].baseline,actors[2].baseline);}
});
test('leader is stationary before impact, no position jumps at contact, and next incident reverses direction',()=>{
 for(const direction of [-1,1]){let s={...createIncident(direction),phase:'closing',age:2.5};const before=incidentFrame(s);assert.equal(before.damaged,false);assert.equal(before.leadX,incidentFrame({...s,age:2.9}).leadX);const almost=incidentFrame({...s,age:2.999999});const hit=incidentFrame({...s,age:3});assert.ok(Math.abs(almost.rearX-hit.rearX)<.001);const next=stepIncident({...s,phase:'departing',departAge:18.99},.1,'green');assert.equal(next.phase,'idle');assert.equal(next.direction,-direction);}
});

test('damaged sprites keep the intact model height when damage canvas differs',async()=>{const {vehicleAspect}=await import('../../public/maps/studio-20261110/rear-end-preview.mjs');const lib=[{id:'extra-traffic-sedan',bbox:[0,0,320,150]},{id:'extra-accident-rear-sedan',bbox:[0,0,768,260]},{id:'extra-accident-sedan',bbox:[0,0,384,180]}];assert.equal(vehicleAspect('accident-rear-sedan',lib),150/320);assert.equal(vehicleAspect('accident-sedan',lib),150/320);});
