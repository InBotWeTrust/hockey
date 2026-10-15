import {useEffect, useState} from 'react';
export type CityTimeOfDay = 'morning' | 'day' | 'night';
export function cityTimeOfDay(date: Date): CityTimeOfDay {
 const hour = date.getHours();
 return hour >= 5 && hour < 10 ? 'morning' : hour >= 10 && hour < 18 ? 'day' : 'night';
}
const images = {
 morning: ['/maps/city-morning-4096-56b2c885b9ae.webp', '/maps/city-morning-6144-dfc7356e2dc8.webp'],
 day: ['/maps/city-day-4096-18066a8cc004.webp', '/maps/city-day-6144-dc849d1f8624.webp'],
 night: ['/maps/city-4096-ff03b6a9e3f4.webp', '/maps/city-6144-950ff27a3699.webp'],
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
