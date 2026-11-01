import {expect,it,vi} from 'vitest';
import {stadiumMachineFrame,drawStadiumMachine,STADIUM_MACHINE_SPRITES} from './stadiumMachine.js';
it('uses matching directional views instead of rotating one flat machine',()=>{
 expect(stadiumMachineFrame(0).key).toBe('right');
 expect(stadiumMachineFrame(Math.PI).key).toBe('left');
 expect(stadiumMachineFrame(-Math.PI/2).key).toBe('up');
 expect(stadiumMachineFrame(Math.PI/2).key).toBe('down');
});
it('uses a matching impact image in all four directions',()=>{
 expect(stadiumMachineFrame(0,true).key).toBe('impact');
 expect(stadiumMachineFrame(Math.PI,true).flip).toBe(true);
 expect(stadiumMachineFrame(-Math.PI/2,true).key).toBe('impactUp');
 expect(stadiumMachineFrame(Math.PI/2,true).key).toBe('impactDown');
});
it('keeps the exact same chassis placement and scale when a collision starts',()=>{
 for(const angle of [0,Math.PI,-Math.PI/2,Math.PI/2]){
  const idle=stadiumMachineFrame(angle),impact=stadiumMachineFrame(angle,true);
  expect({x:impact.x,y:impact.y,scale:impact.pixelScale}).toEqual({x:idle.x,y:idle.y,scale:idle.pixelScale});
 }
});

it('draws the same base vehicle pixels and bounds before and during impact in every direction',()=>{
 const images=Object.fromEntries(Object.keys(STADIUM_MACHINE_SPRITES).map(key=>[key,{
  complete:true,naturalWidth:['left','right','impact'].includes(key)?1536:1024,
  naturalHeight:['left','right','impact'].includes(key)?1024:1536,
 }])) as unknown as Record<keyof typeof STADIUM_MACHINE_SPRITES,HTMLImageElement>;
 const drawImage=vi.fn();
 const ctx={drawImage,save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),clip:vi.fn(),translate:vi.fn(),scale:vi.fn()} as unknown as CanvasRenderingContext2D;
 for(const angle of [0,Math.PI,-Math.PI/2,Math.PI/2]){
  drawImage.mockClear();
  drawStadiumMachine(ctx,images,angle,false);
  const baseCall=drawImage.mock.calls[0];
  drawImage.mockClear();
  drawStadiumMachine(ctx,images,angle,true);
  expect(drawImage.mock.calls[0]).toEqual(baseCall);
  expect(drawImage).toHaveBeenCalledTimes(2);
 }
});
