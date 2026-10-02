import { expect, it } from 'vitest';
import { getBonusChallengeCondition } from '@hockey/game-core';
import { beachNoticeLabel } from './beachNotice.js';
const condition = getBonusChallengeCondition(null, 0);
it('reports actual combined slowdown while ice stays damaged after recovery', () => {
  expect(beachNoticeLabel({ ...condition, shooterSpeedMultiplier: .75, puckSpeedDelta: -.3 }, 1.2))
    .toBe('Лёд тает · игрок −25% · шайба −25%');
  expect(beachNoticeLabel({ ...condition, status: 'tired', shooterSpeedMultiplier: .6 }, 1.2))
    .toBe('Усталость и мокрый лёд · игрок −40%');
});
it('gives rest priority over all other effects', () => {
  expect(beachNoticeLabel({ ...condition, status: 'exhausted_stop', stumbleActive: true }, 1.2))
    .toBe('Передышка · лёд продолжает таять');
});
