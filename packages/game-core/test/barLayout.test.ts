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
    a.slots[5]!.occupantId = null;
    const b = moveBarOccupant(a, a.slots[5]!.id, 'maria');
    expect(b.slots[2]!.occupantId).toBe(null);
    expect(b.slots[5]!.occupantId).toBe('maria');
    expect(a.slots[2]!.occupantId).toBe('maria');
  });
  it('only offers available actions', () => {
    expect(barActionsFor('maria')).toEqual(['darts']);
    expect(barActionsFor('oleg')).toEqual([]);
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
  layout.slots[5]!.x = 35;
  layout.slots[8]!.occupantId = 'news';
  const upgraded = upgradeBarLayout(layout);
  expect(upgraded.profiles.oleg.composition).toBe('/bar/cards/custom.png');
  expect(upgraded.profiles.oleg.description).toBe('Custom');
  expect(upgraded.profiles.veronika.composition).toContain('veronika-composition');
  expect(upgraded.slots[5]!.x).toBe(35);
  expect(upgraded.slots[8]!.occupantId).toBe('igor');
  expect(layout.slots[8]!.occupantId).toBe('news');
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
 layout.slots[6]!.x=37;
 const next=upgradeBarLayout(layout);
 expect(next.profiles.timofey.role).toBe('Руководитель службы стадиона');
 expect(next.profiles.timofey.composition).toBe('/bar/cards/timofey-composition-v2.webp');
 expect(next.profiles.timofey.avatar).toBe('/bar/cards/timofey-avatar-v2.webp');
 expect(next.profiles.broadcasts.composition).toBe('/bar/cards/broadcast-tv-v1.webp');
 expect(next.slots[6]!.x).toBe(37);
 expect(upgradeBarLayout(next)).toEqual(next);
 layout.profiles.timofey.role='Custom role'; layout.profiles.timofey.description='Custom copy';layout.profiles.timofey.composition='/bar/custom.png';
 const custom=upgradeBarLayout(layout);
 expect(custom.profiles.timofey.role).toBe('Custom role');expect(custom.profiles.timofey.description).toBe('Custom copy');expect(custom.profiles.timofey.composition).toBe('/bar/custom.png');
});
