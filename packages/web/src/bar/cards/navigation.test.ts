import { expect, it } from 'vitest';
import { isOpenRinkRoute } from '../../components/BottomNav.js';
it('treats card gameplay as full-screen route', () => {
  expect(isOpenRinkRoute({ pathname: '/bar/cards/maria', search: '' })).toBe(true);
  expect(isOpenRinkRoute({ pathname: '/bar', search: '' })).toBe(false);
});
