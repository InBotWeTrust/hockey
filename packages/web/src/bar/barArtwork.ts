import type {CityTimeOfDay} from '../city/lighting.js';

export const barParts = ['west', 'middle', 'east'] as const;
export type BarPart = typeof barParts[number];
export type StreetStory = 'street' | 'player-win' | 'player-loss' | 'oleg-blocked';
export const barInterior = (part: BarPart, phase: CityTimeOfDay) => `/bar/city-v3/${part}-${phase}-${part === 'east' ? 'v5' : part === 'middle' ? 'v7' : 'v4'}.webp`;
export const barStreet = (story: StreetStory, phase: CityTimeOfDay) => `/bar/city-v3/${story}-${phase}-v3.webp`;
