import React, { useMemo } from 'react';
import { createRng } from '@hockey/game-core';
export function SkiSnowfall({ heavy }: { heavy: boolean }) {
  const flakes = useMemo(() => {
    const rng = createRng('ski-snow-particles');
    return Array.from({ length: 130 }, (_, index) => ({
      index,
      left: rng.next() * 100,
      size: 2.5 + rng.next() * 4.5,
      duration: 4 + rng.next() * 5,
      delay: -rng.next() * 12,
      drift: -15 + rng.next() * 30,
    }));
  }, []);
  return (
    <div aria-hidden="true" className={`ski-snowfall${heavy ? ' ski-snowfall--heavy' : ''}`}>
      <style>{`
      .ski-snowfall {position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:3;border-radius:inherit;}
      .ski-snowflake {position:absolute;top:-5%;border-radius:50%;background:#fff;opacity:.65;animation:ski-snow-fall linear infinite;transition:opacity .6s;}
      .ski-snowfall--heavy .ski-snowflake {opacity:.9;}
      .ski-snowflake:nth-of-type(n+91) {opacity:0;}
      .ski-snowfall--heavy .ski-snowflake:nth-of-type(n+91) {opacity:.8;}
      @keyframes ski-snow-fall {from {top:-5%;transform:translateX(0);} to {top:105%;transform:translateX(var(--snow-drift));}}
      @media(prefers-reduced-motion:reduce) {.ski-snowfall {display:none;}}
    `}</style>
      {flakes.map((f) => (
        <i
          key={f.index}
          className="ski-snowflake"
          style={
            {
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              '--snow-drift': `${f.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
