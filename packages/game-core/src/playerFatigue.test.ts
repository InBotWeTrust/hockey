import { describe, expect, it } from 'vitest';
import { getPlayerFatigueState } from './playerFatigue.js';
import { DEFAULT_DUEL_INVENTORY_TIMING } from './duelInventory.js';
describe('shared player fatigue', () => {
  const timing = DEFAULT_DUEL_INVENTORY_TIMING;
  it('preserves duel rest/recovery transitions exactly', () => {
    expect(getPlayerFatigueState(2999, timing).level).toBe('none');
    expect(getPlayerFatigueState(3000, timing).level).toBe('medium');
    expect(getPlayerFatigueState(8000, timing).level).toBe('heavy');
    expect(getPlayerFatigueState(13000, timing).canShoot).toBe(false);
    expect(getPlayerFatigueState(15999, timing).canShoot).toBe(false);
    expect(getPlayerFatigueState(16000, timing).level).toBe('none');
    expect(getPlayerFatigueState(23000, timing).level).toBe('medium');
    expect(getPlayerFatigueState(33000, timing).level).toBe('resting');
  });
});
