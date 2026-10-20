import { describe, it, expect } from 'vitest';
import { createDefaultBarLayout, upgradeBarLayout, barActionsFor, moveBarOccupant } from '../src/barLayout.js';
describe('bar layout', () => {
  it('starts at Veronika with ten stable slots and fresh defaults', () => {
    const a = createDefaultBarLayout();
    const b = createDefaultBarLayout();
    expect(a.slots).toHaveLength(10);
    expect(new Set(a.slots.map((s) => s.id)).size).toBe(10);
    expect(a.slots.find((s) => s.id === a.defaultSlotId)?.occupantId).toBe('veronika');
    a.profiles.maria.name = 'Changed';
    expect(b.profiles.maria.name).toBe('Мария');
  });
  it('moves occupants without duplicates and keeps their identity', () => {
    const a = createDefaultBarLayout();
    a.slots.find(slot => slot.id === 'bar-6')!.occupantId = null;
    const b = moveBarOccupant(a, a.slots.find(slot => slot.id === 'bar-6')!.id, 'maria');
    expect(b.slots.find(slot => slot.id === 'bar-3')!.occupantId).toBe(null);
    expect(b.slots.find(slot => slot.id === 'bar-6')!.occupantId).toBe('maria');
    expect(a.slots.find(slot => slot.id === 'bar-3')!.occupantId).toBe('maria');
  });
  it('only offers available actions', () => {
    expect(barActionsFor('maria')).toEqual(['cards']);
    expect(barActionsFor('oleg')).toEqual(['armwrestling']);
    expect(barActionsFor('online')).toEqual(['online']);
    expect(barActionsFor('broadcasts')).toEqual(['broadcasts']);
  });
});

it('provides finished assets for the four new characters', () => {
  const layout = createDefaultBarLayout();
  for (const id of ['oleg', 'timofey', 'veronika', 'igor'] as const) {
    expect(layout.profiles[id]?.composition).toMatch(/composition-v[12].webp$/);
    expect(layout.profiles[id]?.avatar).toMatch(/avatar-v[12].webp$/);
  }
});

it('upgrades old assets without moving existing characters or replacing custom profiles', () => {
  const layout = createDefaultBarLayout();
  layout.profiles.oleg.composition = '/bar/cards/custom.png';
  layout.profiles.oleg.description = 'Custom';
  layout.profiles.veronika.composition = null;
  layout.slots.find(slot => slot.id === 'bar-6')!.x = 35;
  layout.slots.find(slot => slot.id === 'bar-9')!.occupantId = 'news';
  const upgraded = upgradeBarLayout(layout);
  expect(upgraded.profiles.oleg.composition).toBe('/bar/cards/custom.png');
  expect(upgraded.profiles.oleg.description).toBe('Custom');
  expect(upgraded.profiles.veronika.composition).toContain('veronika-composition');
  expect(upgraded.slots.find(slot => slot.id === 'bar-6')!.x).toBe(35);
  expect(upgraded.slots.find(slot => slot.id === 'bar-9')!.occupantId).toBe('igor');
  expect(layout.slots.find(slot => slot.id === 'bar-9')!.occupantId).toBe('news');
  expect(upgradeBarLayout(upgraded)).toEqual(upgraded);
});

it('updates distorted legacy portraits while keeping custom avatar paths', () => {
  const layout = createDefaultBarLayout();
  layout.profiles.igor.avatar = '/bar/cards/igor-avatar-v1.webp';
  layout.profiles.oleg.avatar = '/bar/cards/oleg-avatar-v1.webp';
  layout.profiles.veronika.avatar = '/bar/cards/custom.png';
  const upgraded = upgradeBarLayout(layout);
  expect(upgraded.profiles.igor.avatar).toBe('/bar/cards/igor-avatar-v2.webp');
  expect(upgraded.profiles.oleg.avatar).toBe('/bar/cards/oleg-avatar-v2.webp');
  expect(upgraded.profiles.veronika.avatar).toBe('/bar/cards/custom.png');
});

it('restores the broadcast television for default and saved layouts without replacing custom images', () => {
  const layout = createDefaultBarLayout();
  expect(layout.profiles.broadcasts.composition).toBe('/bar/cards/broadcast-tv-v1.webp');
  layout.profiles.broadcasts.composition = null;
  expect(upgradeBarLayout(layout).profiles.broadcasts.composition).toBe('/bar/cards/broadcast-tv-v1.webp');
  layout.profiles.broadcasts.composition = '/bar/custom-tv.webp';
  expect(upgradeBarLayout(layout).profiles.broadcasts.composition).toBe('/bar/custom-tv.webp');
});

it('upgrades shipped Timofey and TV while preserving custom edits and placement', () => {
 const layout=createDefaultBarLayout();
 layout.profiles.timofey={name:'Тимофей',role:'Работник стадиона',description:'Вечно что-то забывает и ищет повод передохнуть. Курит, флиртует и выпутывается из неловких ситуаций с хитрой улыбкой.',avatar:'/bar/cards/timofey-avatar-v1.webp',composition:'/bar/cards/timofey-composition-v1.webp'};
 layout.profiles.broadcasts.composition='/bar/broadcasts-entry-v1.webp';
 layout.slots.find(slot => slot.id === 'bar-7')!.x=37;
 const next=upgradeBarLayout(layout);
 expect(next.profiles.timofey.role).toBe('Руководитель службы стадиона');
 expect(next.profiles.timofey.composition).toBe('/bar/cards/timofey-composition-v2.webp');
 expect(next.profiles.timofey.avatar).toBe('/bar/cards/timofey-avatar-v2.webp');
 expect(next.profiles.broadcasts.composition).toBe('/bar/cards/broadcast-tv-v1.webp');
 expect(next.slots.find(slot => slot.id === 'bar-7')!.x).toBe(37);
 expect(upgradeBarLayout(next)).toEqual(next);
 layout.profiles.timofey.role='Custom role'; layout.profiles.timofey.description='Custom copy';layout.profiles.timofey.composition='/bar/custom.png';
 const custom=upgradeBarLayout(layout);
 expect(custom.profiles.timofey.role).toBe('Custom role');expect(custom.profiles.timofey.description).toBe('Custom copy');expect(custom.profiles.timofey.composition).toBe('/bar/custom.png');
});
it('offers Grigory his own ochko game',()=>{expect(barActionsFor('grigory')).toEqual(['ochko']);});
it('refreshes shipped Veronika URLs without replacing custom artwork',()=>{
 const layout=createDefaultBarLayout();
 layout.profiles.veronika.composition='/bar/cards/veronika-composition-v1.webp';
 layout.profiles.veronika.avatar='/bar/cards/veronika-avatar-v1.webp';
 const next=upgradeBarLayout(layout);
 expect(next.profiles.veronika.composition).toBe('/bar/cards/veronika-composition-v2.webp');
 expect(next.profiles.veronika.avatar).toBe('/bar/cards/veronika-avatar-v2.webp');
 layout.profiles.veronika.composition='/bar/cards/custom.png';
 expect(upgradeBarLayout(layout).profiles.veronika.composition).toBe('/bar/cards/custom.png');
});

const westEntryOrder = ['oleg', 'broadcasts', 'igor', 'veronika', 'online', 'timofey', 'arsenich', 'maria', 'grigory', 'daria'];
it('orders the bar from the western exit while preserving stable character slot IDs', () => {
 const layout = createDefaultBarLayout();
 expect(layout.slots.map(slot => slot.occupantId)).toEqual(westEntryOrder);
 expect(layout.slots.find(slot => slot.id === 'bar-1')?.occupantId).toBe('daria');
 expect(layout.slots.find(slot => slot.id === layout.defaultSlotId)?.occupantId).toBe('veronika');
});
it('upgrades the old shipped order once without losing placements or custom ordering', () => {
 const old = createDefaultBarLayout();
 old.slots.sort((a,b) => Number(a.id.slice(4)) - Number(b.id.slice(4)));
 old.slots[0]!.x = 42;
 const next = upgradeBarLayout(old);
 expect(next.slots.map(slot => slot.occupantId)).toEqual(westEntryOrder);
 expect(next.slots.find(slot => slot.id === 'bar-1')?.x).toBe(42);
 expect(upgradeBarLayout(next)).toEqual(next);
 const custom = structuredClone(old);
 [custom.slots[0], custom.slots[1]] = [custom.slots[1]!, custom.slots[0]!];
 expect(upgradeBarLayout(custom).slots.map(slot => slot.id)).toEqual(custom.slots.map(slot => slot.id));
});
