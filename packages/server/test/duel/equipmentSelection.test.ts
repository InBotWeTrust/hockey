import { describe, expect, it } from 'vitest';
import { mergeEquipmentSelection } from '../../src/duel/equipmentSelection.js';

describe('mergeEquipmentSelection', () => {
  const empty = { stick: null, skates: null, nutrition: null };

  it('carries the game selection when the profile has not changed', () => {
    expect(mergeEquipmentSelection(
      { ...empty, skates: 'game-skates' }, empty, empty, {},
    )).toEqual({ ...empty, skates: 'game-skates' });
  });

  it('applies profile changes per slot without removing other game choices', () => {
    expect(mergeEquipmentSelection(
      { ...empty, stick: 'game-stick' }, empty,
      { ...empty, skates: 'profile-skates' }, {},
    )).toEqual({ stick: 'game-stick', skates: 'profile-skates', nutrition: null });
  });

  it('lets the explicit game choice override the same profile slot at the boundary', () => {
    expect(mergeEquipmentSelection(
      empty, empty, { ...empty, nutrition: 'profile-nutrition' },
      { nutrition: 'game-nutrition' },
    )).toEqual({ ...empty, nutrition: 'game-nutrition' });
  });
});
