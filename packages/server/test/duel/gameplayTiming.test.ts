import { expect, it, vi } from 'vitest';
import { createGameplayTiming } from '../../src/duel/gameplayTiming.js';

it('records separate lock, completion and response phases only for slow requests', () => {
  let now = 0;
  const timing = createGameplayTiming(() => now);
  const warn = vi.fn();
  now = 100;
  timing.mark('lock_wait');
  now = 1200;
  timing.mark('completion');
  now = 1250;
  timing.logIfSlow({ warn }, { operation: 'training_shot' });
  expect(warn).toHaveBeenCalledWith({ operation: 'training_shot', totalMs: 1250,
    phasesMs: { lock_wait: 100, completion: 1100, response: 50 } }, 'slow gameplay request');
});

it('does not emit logs for a fast gameplay request', () => {
  const warn = vi.fn();
  createGameplayTiming(() => 0).logIfSlow({ warn }, { operation: 'training_shot' });
  expect(warn).not.toHaveBeenCalled();
});
