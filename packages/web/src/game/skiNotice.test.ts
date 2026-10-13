import { expect, it } from 'vitest';
import * as notices from './skiNotice.js';
it('colors fatigue yellow, severe fatigue/rest red, slips orange and recovery green', () => {
  expect(
    notices.skiNoticeTone({
      resting: false,
      slipping: false,
      recovering: false,
      slowdownPercent: 35,
    }),
  ).toBe('warning');
  expect(
    notices.skiNoticeTone({
      resting: false,
      slipping: false,
      recovering: false,
      slowdownPercent: 55,
    }),
  ).toBe('error');
  expect(
    notices.skiNoticeTone({
      resting: true,
      slipping: false,
      recovering: false,
      slowdownPercent: 65,
    }),
  ).toBe('error');
  expect(
    notices.skiNoticeTone({
      resting: false,
      slipping: true,
      recovering: false,
      slowdownPercent: 65,
    }),
  ).toBe('slip');
  expect(
    notices.skiNoticeTone({
      resting: false,
      slipping: false,
      recovering: true,
      slowdownPercent: 35,
    }),
  ).toBe('success');
});
