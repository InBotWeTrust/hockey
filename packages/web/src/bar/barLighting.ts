import {useEffect, useState} from 'react';
import {cityTimeOfDay, type CityTimeOfDay} from '../city/lighting.js';
import {barInterior, barFloor, barParts, barStreet} from './barArtwork.js';
export function barTimeOfDay(): CityTimeOfDay {
  if (import.meta.env.DEV && location.pathname.endsWith('/durak-preview.html')) {
    const phase = new URLSearchParams(location.search).get('bar-lighting');
    if (phase === 'morning' || phase === 'day' || phase === 'sunset' || phase === 'night') return phase;
  }
  return cityTimeOfDay(new Date());
}

export function useBarLighting(group: 'interior' | 'blocked', enabled = true) {
  const [art, setArt] = useState<{phase: CityTimeOfDay; previous: CityTimeOfDay | null}>(() => ({phase: barTimeOfDay(), previous: null}));
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, generation = 0;
    let requested: CityTimeOfDay | null = art.phase;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const phase = barTimeOfDay();
      if (requested === phase) return;
      requested = phase;
      const token = ++generation;
      const paths = group === 'interior' ? [barFloor(phase), ...barParts.map(part => barInterior(part, phase))] : [barStreet('oleg-blocked', phase)];
      void Promise.all(paths.map(src => {const image = new Image(); image.src = src; return image.decode();})).then(() => {
        if (disposed || token !== generation) return;
        clearTimeout(fade);
        setArt(previous => ({phase, previous: previous.phase}));
        fade = setTimeout(() => {if (!disposed) setArt(previous => ({...previous, previous: null}));}, 700);
      }).catch(() => {if (!disposed && token === generation) requested = null;});
    };
    const timer = setInterval(check, 1000);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      disposed = true; generation++; clearInterval(timer); clearTimeout(fade);
      window.removeEventListener('focus', check); window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
  // The effect owns request ordering for this asset group.
  }, [group, enabled]);
  return art;
}
