import { describe, it, expect } from 'vitest';
import { createDefaultBarLayout, barActionsFor, moveBarOccupant } from '../src/barLayout.js';
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
