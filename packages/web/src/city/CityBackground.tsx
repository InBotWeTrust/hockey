import {useEffect, useState} from 'react';
import {isCityImageReady, prepareCityImage} from './cityImageCache.js';

export function CityBackground({image}: {image: string}) {
  const [layers, setLayers] = useState<{current: string | null; previous: string | null}>(() => ({
    current: isCityImageReady(image) ? image : null,
    previous: null,
  }));
  useEffect(() => {
    let disposed = false;
    const prepare = () => {
      void prepareCityImage(image).then(() => {
        if (!disposed) setLayers(old => old.current === image ? old : {current: image, previous: old.current});
      }).catch(() => {/* Keep the last usable background; retry when the app returns. */});
    };
    prepare();
    window.addEventListener('focus', prepare);
    window.addEventListener('pageshow', prepare);
    return () => {
      disposed = true;
      window.removeEventListener('focus', prepare);
      window.removeEventListener('pageshow', prepare);
    };
  }, [image]);
  useEffect(() => {
    if (!layers.previous) return;
    const timer = window.setTimeout(() => setLayers(old => ({...old, previous: null})), 1000);
    return () => window.clearTimeout(timer);
  }, [layers.current, layers.previous]);
  const phase = image.includes('city-morning-') ? 'morning' : image.includes('city-sunset-') ? 'sunset' : image.includes('city-night-') ? 'night' : null;
  return <>
    {layers.previous && <img src={layers.previous} alt="" aria-hidden="true" draggable={false} decoding="sync"/>}
    {layers.current && <img key={layers.current} className={layers.previous ? 'district-light-enter' : undefined} src={layers.current} alt="Зимний хоккейный район" draggable={false} decoding="sync"/>}
    {phase && !image.includes("/studio-20261110/") && <span className={`city-sky-light is-${phase}`} aria-hidden="true"/>}
  </>;
}
