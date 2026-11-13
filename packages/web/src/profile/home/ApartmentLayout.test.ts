import { apartmentDesigns } from './apartmentDesigns.js';
import type { ApartmentImageLayer } from './apartmentTypes.js';

it('leaves a clear gap between the base desk and TV cabinet', () => {
  const base = apartmentDesigns.find(d => d.id === 'base')!;
  const item = (id: string) => base.layers.find((l): l is ApartmentImageLayer => l.kind === 'image' && l.id === id)!;
  const cabinet = item('tv-stand'), desk = item('desk');
  expect(desk.x).toBeGreaterThanOrEqual(cabinet.x + cabinet.width + 12);
  for (const id of ['chair', 'decor-plant-0']) {
    const object = item(id), center = object.x + object.width / 2;
    expect(center).toBeGreaterThan(desk.x);
    expect(center).toBeLessThan(desk.x + desk.width);
  }
});

it.each(['scandinavian', 'modern', 'premium'])('grounds furniture and mounts wall objects in %s', id => {
  const design = apartmentDesigns.find(d => d.id === id)!;
  const layer = (name: string) => design.layers.find(l => l.id === name)!;
  expect(layer('mounted-shadow-tv')?.kind).toBe(id === 'scandinavian' ? undefined : 'image-shadow');
  expect(layer('cast-chair')?.kind).toBe('shadow');
  expect(layer('cast-player')?.kind).toBe('shadow');
  expect(layer('contact-decor-plant-0')).toMatchObject({ decor: 'plant' });
  expect(layer('player')).toMatchObject({ src: expect.stringContaining('natural-base') });
  if (id === 'premium') {
    expect(layer('mounted-shadow-desk')?.kind).toBe('image-shadow');
    expect(layer('cast-desk')).toBeUndefined();
  } else {
    const desk = layer('desk') as ApartmentImageLayer;
    const cabinet = layer('tv-stand') as ApartmentImageLayer;
    expect(desk.x - cabinet.x - cabinet.width).toBeGreaterThanOrEqual(12);
    expect(layer('cast-desk')?.kind).toBe('shadow');
  }
});

it.each(apartmentDesigns)('keeps interactive props on their furniture and mirror clear of TV in $id', async design => {
  const {apartmentInteractiveObjects}=await import('./apartmentInteractiveObjects.js');
  const {layers,targets}=apartmentInteractiveObjects(design);
  const item=(id:string)=>layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id===id)!;
  const desk=item('desk');
  for(const id of ['phone','laptop']) {
    const prop=item(id);
    expect(prop.x).toBeGreaterThan(desk.x);
    expect(prop.x+prop.width).toBeLessThan(desk.x+desk.width);
    expect(prop.y+prop.height).toBeGreaterThanOrEqual(desk.supportY??desk.y);
    expect(prop.y+prop.height).toBeLessThanOrEqual((desk.supportY??desk.y)+15);
    expect(layers.indexOf(prop)).toBeLessThan(layers.indexOf(item('chair')));
  }
  const mirror=item('mirror'),tv=item('tv');
  expect(mirror.x+mirror.width<=tv.x || mirror.x>=tv.x+tv.width || mirror.y+mirror.height<=tv.y || mirror.y>=tv.y+tv.height).toBe(true);
  expect(targets).toHaveLength(10);
});

it.each(apartmentDesigns)('mounts the small mirror beside the door on the left wall in $id', async design => {
  const {apartmentInteractiveObjects}=await import('./apartmentInteractiveObjects.js');
  const {layers}=apartmentInteractiveObjects(design);
  const item=(id:string)=>layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id===id)!;
  const mirror=item('mirror'),door=item('door'),floorlamp=item('decor-floorlamp-0');
  // Door sprites include transparent padding beyond the visible frame.
  expect(mirror.x).toBeGreaterThan(door.x+door.width*0.86);
  expect(mirror.x+mirror.width).toBeLessThan(84);
  expect(mirror.x+mirror.width<floorlamp.x || mirror.y+mirror.height<floorlamp.y).toBe(true);
  expect(mirror.src).toContain('mirror-v2.webp');
});

it('reduces the seated player around the seat and gives the base floorlamp visible floor space', async () => {
 const {apartmentInteractiveObjects}=await import('./apartmentInteractiveObjects.js');
 const base=apartmentDesigns[0]!;
 const {layers,targets}=apartmentInteractiveObjects(base);
 const source=base.layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id==='player')!;
 const player=layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id==='player')!;
 expect(player.height).toBeLessThan(source.height*0.9);
 expect(targets.find(t=>t.id==='profile')?.box).toEqual(player);
 const sofa=layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id==='sofa')!;
 const floorlamp=layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id==='decor-floorlamp-0')!;
 expect(layers.indexOf(floorlamp)).toBeGreaterThan(layers.indexOf(sofa));
 expect(floorlamp.y+floorlamp.height).toBeGreaterThan(sofa.y+sofa.height+20);
 expect(floorlamp.x).toBeGreaterThan(300);
});

it.each(apartmentDesigns)('places separate ceiling lights over the living and desk areas in $id', async design => {
 const {apartmentInteractiveObjects}=await import('./apartmentInteractiveObjects.js');
 const {layers,targets}=apartmentInteractiveObjects(design);
 const living=targets.find(t=>t.id==='lamp')!.box;
 const work=layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id==='desk-lamp')!;
 const desk=layers.find((l):l is ApartmentImageLayer=>l.kind==='image'&&l.id==='desk')!;
 expect(living.x+living.width/2).toBe(247);
 expect(work.x+work.width/2).toBeCloseTo(desk.x+desk.width/2);
});
