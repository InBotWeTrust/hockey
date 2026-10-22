import type {CityTimeOfDay} from '../city/lighting.js';

export const barMapBackground=(phase:CityTimeOfDay)=>phase==='day'
 ?'/bar/map-v35/background-v1.webp':`/bar/map-v37/${phase}-v1.webp`;
