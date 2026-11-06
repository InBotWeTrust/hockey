import { expect, it } from 'vitest';
import { isReleasedBonusChallenge } from '../src/bonusChallengeRelease.js';

it.each(['challenge-beach', 'challenge-ski-resort'])('releases %s', slug => {
  expect(isReleasedBonusChallenge(slug)).toBe(true);
});

it.each(['challenge-cyberpunk-yard', 'challenge-abandoned-waterpark', 'challenge-pirate-bay',
  'challenge-north-pole', 'challenge-desert', 'challenge-volcanic-ice', 'challenge-castle', 'challenge-space'])('keeps %s closed in production', slug => {
  expect(isReleasedBonusChallenge(slug)).toBe(false);
});
