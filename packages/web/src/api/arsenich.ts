import { apiFetch } from './apiFetch.js';

export const ARSENICH_DESTINATIONS = [
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
export type ArsenichDestinationKey = (typeof ARSENICH_DESTINATIONS)[number];
export interface ArsenichIntroductionWindow {
  title: string;
  body: string;
  ctaLabel: string;
}
export interface ArsenichDestinationIntroduction {
  destinationKey: ArsenichDestinationKey;
  revision: number;
  speaker: 'stranger';
  windows: ArsenichIntroductionWindow[];
}
export interface ArsenichDestinationIntroductionResponse {
  intro: ArsenichDestinationIntroduction | null;
}

export const arsenichIntroductionQueryKey = (destination: ArsenichDestinationKey) =>
  ['arsenich', 'introduction', destination] as const;
export function fetchArsenichDestinationIntroduction(
  destination: ArsenichDestinationKey,
): Promise<ArsenichDestinationIntroductionResponse> {
  return apiFetch(`/arsenich/introductions/${destination}`);
}
export function completeArsenichDestinationIntroduction(
  destination: ArsenichDestinationKey,
  revision: number,
): Promise<{ viewed: true }> {
  return apiFetch(`/arsenich/introductions/${destination}/complete`, {
    method: 'POST',
    body: JSON.stringify({ revision }),
  });
}
