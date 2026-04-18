import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { computeScale, type Scale } from './coords.js';

export interface PixiStageProps {
  onReady: (app: Application, scale: Scale) => void;
  onResize: (scale: Scale) => void;
}

export function PixiStage({ onReady, onResize }: PixiStageProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let disposed = false;

    const measure = (): Scale =>
      computeScale({
        width: host.clientWidth || 390,
        height: host.clientHeight || 700,
      });

    void (async () => {
      await app.init({
        background: '#0b2e5c',
        resizeTo: host,
        antialias: true,
      });
      if (disposed) {
        try {
          app.destroy(true, { children: true });
        } catch {
          /* ignore */
        }
        return;
      }
      host.appendChild(app.canvas);
      onReady(app, measure());
    })();

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      onResize(measure());
    });
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      try {
        app.destroy(true, { children: true });
      } catch {
        /* ignore */
      }
    };
  }, [onReady, onResize]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
