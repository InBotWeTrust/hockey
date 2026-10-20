import { expect, it } from 'vitest';
import { nextConflict, validateConflictVerdict } from './conflict.js';
const clean = { warnings: 0, intervening: false };
it('counts warnings across characters and escalates only after Oleg intervenes', () => {
  const first = nextConflict(clean, 'insult');
  expect(first.kind).toBe('warning');
  expect(first.warnings).toBe(1);
  const second = nextConflict(first, 'sexual');
  expect(second.kind).toBe('intervention');
  expect(nextConflict(second, 'insult').kind).toBe('fight');
});
it('an apology ends intervention without clearing warnings', () => {
  const calm = nextConflict({ warnings: 2, intervening: true }, 'apology');
  expect(calm.intervening).toBe(false);
  expect(calm.warnings).toBe(2);
  expect(nextConflict(calm, 'insult').kind).toBe('intervention');
});
it('uncertainty does not count or end intervention', () => {
  const result = nextConflict({ warnings: 2, intervening: true }, 'uncertain');
  expect(result.warnings).toBe(2);
  expect(result.intervening).toBe(true);
  expect(result.kind).toBe('none');
});
it('sexuality is only a violation when explicitly directed at a female character', () => {
  expect(validateConflictVerdict('sexual', 'oleg')).toBe('none');
  expect(validateConflictVerdict('sexual', 'maria')).toBe('sexual');
});
