export const GAME_CORE_VERSION = 122 as const;

// Versions 89–122 add bar games, Rhythm, private submarine rescues and billiards bot updates. Hockey shot simulation remains identical to 88.
// Reassess this compatibility explicitly on the next engine version bump.
export function isShotCoreVersionCompatible(version: number): boolean {
  return (
    version === GAME_CORE_VERSION ||
    (GAME_CORE_VERSION === 122 && [88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121].includes(version))
  );
}
