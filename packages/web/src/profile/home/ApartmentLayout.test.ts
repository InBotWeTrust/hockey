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
