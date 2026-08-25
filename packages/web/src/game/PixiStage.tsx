import { useEffect, useRef } from 'react';
import { Application, Assets } from 'pixi.js';
import { RINK } from '@hockey/game-core';
import { computeScale, type Scale } from './coords.js';

const SPRITE_ASSETS = [
  '/sprites/gate.webp',
  '/sprites/goalkeeper.webp',
  '/sprites/save.webp',
  '/sprites/lefthand.webp',
  '/sprites/righthand.webp',
  '/sprites/ultimate-player-left.webp',
  '/sprites/ultimate-player-left-shoot.webp',
  '/sprites/ultimate-player-right.webp',
  '/sprites/ultimate-player-right-shoot.webp',
  '/sprites/player-falling.webp',
  '/sprites/player-rest.webp',
  '/sprites/ice-resurfacer-center.webp',
  '/sprites/ice-resurfacer-left-down.webp',
  '/sprites/ice-resurfacer-left-up.webp',
  '/sprites/ice-resurfacer-right-down.webp',
  '/sprites/ice-resurfacer-right-up.webp',
];

export interface PixiStageProps {
  onReady: (app: Application, scale: Scale) => void;
  onResize: (scale: Scale) => void;
  preloadAssets?: readonly string[] | undefined;
}

export function PixiStage({ onReady, onResize, preloadAssets = [] }: PixiStageProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacksRef = useRef({ onReady, onResize });
  callbacksRef.current = { onReady, onResize };
  const preloadAssetsRef = useRef(preloadAssets);
  preloadAssetsRef.current = preloadAssets;
  const initializedRef = useRef(false);
  const preloadKey = preloadAssets.join('\u0000');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let disposed = false;

    const measure = (): Scale =>
      computeScale({
        width: host.clientWidth || RINK.width,
        height: host.clientHeight || RINK.height,
      });

    void (async () => {
      await app.init({
        backgroundAlpha: 0,
        resizeTo: host,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio ?? 1, 3),
        autoDensity: true,
      });
      await Assets.load([...SPRITE_ASSETS, ...preloadAssetsRef.current]).catch(() => undefined);
      if (disposed) {
        try {
          app.destroy(true, { children: true });
        } catch {
          /* ignore */
        }
        return;
      }
      host.appendChild(app.canvas);
      initializedRef.current = true;
      callbacksRef.current.onReady(app, measure());
    })();

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      callbacksRef.current.onResize(measure());
    });
    ro.observe(host);

    return () => {
      disposed = true;
      initializedRef.current = false;
      ro.disconnect();
      try {
        app.destroy(true, { children: true });
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current || preloadAssetsRef.current.length === 0) return;
    void Assets.load(preloadAssetsRef.current).catch(() => undefined);
  }, [preloadKey]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
