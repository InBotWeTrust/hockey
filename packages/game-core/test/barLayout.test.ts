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
    expect(barActionsFor('maria')).toEqual(['cards']);
    expect(barActionsFor('oleg')).toEqual([]);
    expect(barActionsFor('online')).toEqual(['online']);
    expect(barActionsFor('broadcasts')).toEqual(['broadcasts']);
  });
});

it('provides finished assets for the four new characters', () => {
  const layout = createDefaultBarLayout();
  for (const id of ['oleg', 'timofey', 'veronika', 'igor'] as const) {
    expect(layout.profiles[id]?.composition).toMatch(/composition-v1.webp$/);
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
