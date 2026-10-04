export const ARSENICH_DESTINATION_KEYS = [
  'main',
  'daily',
  'sections',
  'training',
  'tasks',
  'shop',
  'bonus-games',
  'amateur',
  'chat',
  'profile-main',
] as const;

export type ArsenichDestinationKey = (typeof ARSENICH_DESTINATION_KEYS)[number];
