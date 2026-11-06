const releasedChallenges = new Set(['challenge-beach', 'challenge-ski-resort']);

export function isReleasedBonusChallenge(slug: string): boolean {
  return releasedChallenges.has(slug);
}
