import type {CityTimeOfDay} from '../city/lighting.js';

export const barParts = ['west', 'middle', 'east'] as const;
export type BarPart = typeof barParts[number];
export type StreetStory = 'street' | 'player-win' | 'player-loss' | 'oleg-blocked';
export const barInterior = (part: BarPart, phase: CityTimeOfDay) => `/bar/city-v4/${part}-${phase}-${part==='west'&&phase==='day'?'v2':'v1'}.png`;
export const barFloor = (phase:CityTimeOfDay) => `/bar/city-v4/${phase==='day'?'day-master':`master-${phase}`}-v1.png`;
export const barStreet = (story: StreetStory, phase: CityTimeOfDay) => `/bar/city-v3/${story}-${phase}-v3.webp`;
