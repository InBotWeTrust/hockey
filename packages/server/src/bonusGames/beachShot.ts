import { beachCleanupRules, beachWindClock, type BeachCleanupEvent, resolveBeachCourtShot, sampleBeachPuddles, type BonusChallengeEnvironmentRules, type GoalieConfig, type SessionPhaseOffsets, type ShotInput } from '@hockey/game-core';
export function assertVersionedBeachEnvironment(
  environment: BonusChallengeEnvironmentRules | null | undefined, slug: string, coreVersion: number,
): void {
  if (environment?.beach?.interactive && coreVersion < 74) throw new Error('interactive beach requires core version 74');
  if (environment?.beach && (coreVersion < 72 || slug !== 'challenge-beach')) {
    throw new Error('beach environment requires beach snapshot core version 72 or later');
  }
}

export function resolveVersionedBeachShot(args: {
  input: ShotInput; goalie: GoalieConfig; seed: string; shotIndex: number;
  slug: string; coreVersion: number; environment: BonusChallengeEnvironmentRules | null | undefined;
  phaseOffsets?: SessionPhaseOffsets; cleanupEvents?: readonly BeachCleanupEvent[];
}): ReturnType<typeof resolveBeachCourtShot> | null {
  if (!args.environment?.beach) return null;
  assertVersionedBeachEnvironment(args.environment, args.slug, args.coreVersion);
  return resolveBeachCourtShot(args.input, args.goalie, args.seed, args.shotIndex,
    sampleBeachPuddles(beachCleanupRules(args.environment.beach.puddles, args.cleanupEvents ?? [], args.input.tapTime), args.input.tapTime), args.phaseOffsets,
    args.environment.beach.interactive
      ? (target, time) => beachWindClock(args.environment!.beach!.interactive!.wind, target, time) : undefined);
}
