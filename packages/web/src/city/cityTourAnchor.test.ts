import { expect, it } from 'vitest';
import { cityTourAnchor } from './cityTourAnchor.js';
it('keeps the pointer beneath the card while a wide object scrolls under it', () => {
  expect(cityTourAnchor(-200, 600, 400, 200)).toBe(200);
  expect(cityTourAnchor(-350, 450, 400, 200)).toBe(200);
});
it('moves along the visible object edge when it passes the card center', () => {
  expect(cityTourAnchor(230, 330, 400, 200)).toBe(230);
  expect(cityTourAnchor(60, 160, 400, 200)).toBe(160);
});
it('keeps the pointer on screen for partially visible locations', () => {
  expect(cityTourAnchor(-250, 30, 400, 200)).toBe(30);
  expect(cityTourAnchor(370, 800, 400, 200)).toBe(370);
  expect(cityTourAnchor(450, 800, 400, 200)).toBeNull();
});
