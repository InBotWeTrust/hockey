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
 morning: ['/maps/city-morning-4096-6c51c36a5e7c.webp', '/maps/city-morning-6144-827e19348fd3.webp'],
 day: ['/maps/city-day-4096-76504717105e.webp', '/maps/city-day-6144-dfce58fc1431.webp'],
 sunset: ['/maps/city-sunset-4096-feaa739ef876.webp', '/maps/city-sunset-6144-ec5c4b307955.webp'],
 night: ['/maps/city-night-4096-658017a820ba.webp', '/maps/city-night-6144-32a760b2628a.webp'],
} as const;
export function cityImage(date: Date, pixelRatio: number, city?:SolarCity|null): string {
 return images[cityTimeOfDay(date,city)][pixelRatio > 1.5 ? 1 : 0];
}
export function useCityImage(city?:SolarCity|null): string {
 const current = () => cityImage(new Date(), window.devicePixelRatio,city);
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
  const interval = window.setInterval(check, 1000);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  check();
  return () => {
   disposed = true;
   window.clearInterval(interval);
   window.removeEventListener('focus', check);
   window.removeEventListener('pageshow', check);
   document.removeEventListener('visibilitychange', check);
  };
 // The effect owns its requested source for its entire lifetime.
 }, [city?.latitude,city?.longitude,city?.timeZone]);
 return image;
}
