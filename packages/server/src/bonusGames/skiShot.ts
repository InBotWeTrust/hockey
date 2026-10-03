import type { BonusChallengeEnvironmentRules } from '@hockey/game-core';
export function assertVersionedSkiEnvironment(
  environment: BonusChallengeEnvironmentRules | null | undefined,
  slug: string,
  coreVersion: number,
): void {
  if (environment?.ski && (coreVersion < 75 || slug !== 'challenge-ski-resort'))
    throw new Error('ski environment requires ski snapshot core version 75 or later');
}
