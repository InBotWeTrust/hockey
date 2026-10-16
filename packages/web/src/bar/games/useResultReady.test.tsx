import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useResultReady } from './useResultReady.js';
it('keeps revealed ochko hands visible for a flip and four seconds before results', () => {
  const { result, rerender } = renderHook(
    ({ now, id, finished }) => useResultReady(id, 'ochko', finished, now, 0),
    { initialProps: { now: 1000, id: 'a', finished: false } },
  );
  rerender({ now: 2000, id: 'a', finished: true });
  expect(result.current).toBe(false);
  rerender({ now: 7599, id: 'a', finished: true });
  expect(result.current).toBe(false);
  rerender({ now: 7600, id: 'a', finished: true });
  expect(result.current).toBe(true);
  rerender({ now: 8000, id: 'b', finished: true });
  expect(result.current).toBe(false);
});
it('retains the existing animation gate for other games', () => {
  const { result, rerender } = renderHook(
    ({ now }) => useResultReady('a', 'billiards', true, now, 3000),
    { initialProps: { now: 2000 } },
  );
  expect(result.current).toBe(false);
  rerender({ now: 3000 });
  expect(result.current).toBe(true);
});
