import { afterEach, expect, it, vi } from 'vitest';
import { recordNavigationStart, recordNavigationReady, cancelNavigation } from './navigationTiming.js';
afterEach(() => { vi.unstubAllGlobals(); });
it('records only the first ready frame and never includes a player identifier', () => {
  const measure = vi.fn();
  vi.stubGlobal('performance', { now: () => 100, measure });
  const token = recordNavigationStart('public-profile');
  recordNavigationReady(token); recordNavigationReady(token);
  expect(measure).toHaveBeenCalledOnce();
  expect(measure.mock.calls[0]?.[0]).toBe('hockey.navigation.public-profile');
});
it('does not report a cancelled navigation as ready', () => {
  const measure = vi.fn(); vi.stubGlobal('performance', { now: () => 100, measure });
  const token = recordNavigationStart('chat'); cancelNavigation(token); recordNavigationReady(token);
  expect(measure).not.toHaveBeenCalled();
});
