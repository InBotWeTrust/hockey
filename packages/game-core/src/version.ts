export const GAME_CORE_VERSION = 102 as const;

// Versions 89–102 changed only bar games; hockey shot simulation is identical to 88.
// Reassess this compatibility explicitly on the next engine version bump.
export function isShotCoreVersionCompatible(version: number): boolean {
  return (
    version === GAME_CORE_VERSION ||
    (GAME_CORE_VERSION === 102 && [88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101].includes(version))
  );
}
