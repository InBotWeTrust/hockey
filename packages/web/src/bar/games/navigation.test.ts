import { expect, it } from 'vitest';
import { isOpenRinkRoute } from '../../components/BottomNav.js';
it('treats a new bar match as active play and leaves the lobby navigable', () => {
  expect(isOpenRinkRoute({ pathname: '/bar/games/match/example', search: '' })).toBe(true);
  expect(isOpenRinkRoute({ pathname: '/bar/games', search: '' })).toBe(false);
});
