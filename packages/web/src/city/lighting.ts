import { subscribeVisibleMinute } from './visibleMinuteClock.js';
import {useEffect, useState} from 'react';
import {citySolarPhase,type SolarCity} from './citySolar.js';
export type CityTimeOfDay = 'morning' | 'day' | 'sunset' | 'night';
export function cityTimeOfDay(date: Date, city?:SolarCity|null): CityTimeOfDay {
 if(city)return citySolarPhase(date,city);
 const hour = date.getHours();
 if (hour >= 7 && hour < 10) return 'morning';
 if (hour >= 10 && hour < 18) return 'day';
 return hour >= 18 && (hour < 19 || (hour === 19 && date.getMinutes() < 30)) ? 'sunset' : 'night';
}
const images = {
  "day": [
    "/maps/studio-20261110/city-day-4096-ebe669859b31.webp",
    "/maps/studio-20261110/city-day-6144-a0199b49f99b.webp"
  ],
  "morning": [
    "/maps/studio-20261110/city-morning-4096-55b1c9db6647.webp",
    "/maps/studio-20261110/city-morning-6144-0dfa13cfb5e6.webp"
  ],
  "sunset": [
    "/maps/studio-20261110/city-sunset-4096-221713d56f14.webp",
    "/maps/studio-20261110/city-sunset-6144-4741d0353c3f.webp"
  ],
  "night": [
    "/maps/studio-20261110/city-night-4096-7e5431acc840.webp",
    "/maps/studio-20261110/city-night-6144-cd71f95efe93.webp"
  ]
} as const;
export function chooseCityImageSize(input: {width:number;height:number;dpr:number;saveData?:boolean|undefined;deviceMemory?:number|undefined}): 4096 | 6144 {
 if(input.saveData || (input.deviceMemory !== undefined && input.deviceMemory <= 4))return 4096;
 // The map is three viewport heights wide. Backgrounds do not need the full 3x phone DPR.
 const pixels = Math.max(input.width, input.height * 3) * Math.min(Math.max(input.dpr, 1), 1.5);
 return pixels > 4096 ? 6144 : 4096;
}
export function cityImage(date: Date, pixelRatio: number, city?:SolarCity|null, size?:4096|6144): string {
 return images[cityTimeOfDay(date,city)][(size ?? (pixelRatio > 1.5 ? 6144 : 4096)) === 6144 ? 1 : 0];
}
export function useCityImage(city?:SolarCity|null): string {
 const current = () => {
  const hints = navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}};
  return cityImage(new Date(), window.devicePixelRatio,city,chooseCityImageSize({
   width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio,
   saveData:hints.connection?.saveData,deviceMemory:hints.deviceMemory,
  }));
 };
 const [image, setImage] = useState(current);
 useEffect(() => {
  let disposed = false;
  let requested = image;
  let generation = 0;
  const check = () => {
   const next = current();
   if (requested === next) return;
   requested = next;
   const token = ++generation;
   const preload = new Image();
   preload.src = next;
   void preload.decode().then(() => {
    if (!disposed && token === generation) setImage(next);
   }).catch(() => {
    if (token === generation) requested = '';
   });
  };
  const unsubscribe = subscribeVisibleMinute(check);
  const resize = () => { if (!document.hidden) check(); };
  window.addEventListener('resize', resize);
  return () => {
   disposed = true;
   unsubscribe();
   window.removeEventListener('resize', resize);
  };
 // The effect owns its requested source for its entire lifetime.
 }, [city?.latitude,city?.longitude,city?.timeZone]);
 return image;
}
