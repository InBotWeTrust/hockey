import { useEffect, useState } from 'react';
import { cityTimeOfDay, type CityTimeOfDay } from './lighting.js';

export function yardArtwork(time: CityTimeOfDay) {
  const prefix = `/section-panoramas/yard${time === 'day' ? '' : `-${time}`}`;
  return {
    time,
    panorama: `${prefix}-v1.webp`,
    thumbnail: (position: number) => `${prefix}-${position}.webp`,
  };
}

/** Uses the map's device-local clock; keep the old artwork until the replacement decodes. */
export function useYardLighting(enabled: boolean, previewTime?: CityTimeOfDay) {
  const [time, setTime] = useState<CityTimeOfDay>(() => previewTime ?? cityTimeOfDay(new Date()));
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      generation = 0;
    let requested = time;
    const check = () => {
      const next = previewTime ?? cityTimeOfDay(new Date());
      if (next === requested) return;
      requested = next;
      const token = ++generation;
      const preload = new Image();
      preload.src = yardArtwork(next).panorama;
      void preload
        .decode()
        .then(() => {
          if (!disposed && token === generation) setTime(next);
        })
        .catch(() => {
          if (!disposed && token === generation) requested = time;
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
  }, [enabled, previewTime, time]);
  return yardArtwork(time);
}
