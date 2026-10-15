import {useEffect, useState} from 'react';
export type CityTimeOfDay = 'morning' | 'day' | 'sunset' | 'night';
export function cityTimeOfDay(date: Date): CityTimeOfDay {
 const hour = date.getHours();
 if (hour >= 6 && hour < 10) return 'morning';
 if (hour >= 10 && hour < 18) return 'day';
 return hour >= 18 && hour < 21 ? 'sunset' : 'night';
}
const images = {
 morning: ['/maps/city-morning-4096-17c3203d4aa0.webp', '/maps/city-morning-6144-7822147c03e5.webp'],
 day: ['/maps/city-day-4096-dbafe28c7809.webp', '/maps/city-day-6144-0a8348477d14.webp'],
 sunset: ['/maps/city-sunset-4096-26c12fd0b834.webp', '/maps/city-sunset-6144-040c69979b97.webp'],
 night: ['/maps/city-night-4096-37aee19186e6.webp', '/maps/city-night-6144-c0b141a09082.webp'],
} as const;
export function cityImage(date: Date, pixelRatio: number): string {
 return images[cityTimeOfDay(date)][pixelRatio > 1.5 ? 1 : 0];
}
export function useCityImage(): string {
 const current = () => cityImage(new Date(), window.devicePixelRatio);
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
 }, []);
 return image;
}
