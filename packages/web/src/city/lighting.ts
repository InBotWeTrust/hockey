import {useEffect, useState} from 'react';
export type CityTimeOfDay = 'morning' | 'day' | 'sunset' | 'night';
export function cityTimeOfDay(date: Date): CityTimeOfDay {
 const hour = date.getHours();
 if (hour >= 6 && hour < 10) return 'morning';
 if (hour >= 10 && hour < 18) return 'day';
 return hour >= 18 && hour < 21 ? 'sunset' : 'night';
}
// One approved panorama is temporarily shared by every lighting phase.
const approvedImage = ['/maps/city-approved-4096-c22b8b605dce.webp', '/maps/city-approved-6144-019d2f29903d.webp'] as const;
const images = {
 morning: approvedImage,
 day: approvedImage,
 sunset: approvedImage,
 night: approvedImage,
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
