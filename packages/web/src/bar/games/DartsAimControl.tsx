import { useEffect, useRef, useState } from 'react';
export function DartsAimControl({
  disabled,
  throwAt,
}: {
  disabled: boolean;
  throwAt: (point: { x: number; y: number }) => void;
}) {
  const drag = useRef<{ id: number; x: number; y: number; started: number } | null>(null);
  const base = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const [holding, setHolding] = useState(false);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const cancelAim = () => {
    drag.current = null;
    setHolding(false);
    setMarker(null);
  };
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancelAim(); };
    window.addEventListener('blur', cancelAim);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', cancelAim);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  const update = () => {
    const d = drag.current;
    if (!d) return;
    const seconds = (performance.now() - d.started) / 1000;
    const p = {
      x: Math.max(
        -1.1,
        Math.min(
          1.1,
          base.current.x + Math.sin(seconds * 4.2) * 0.115 + Math.sin(seconds * 7.1 + 0.6) * 0.045,
        ),
      ),
      y: Math.max(
        -1.1,
        Math.min(
          1.1,
          base.current.y +
            Math.sin(seconds * 3.3 + 1) * 0.10 +
            Math.sin(seconds * 6.2 + 2.1) * 0.04,
        ),
      ),
    };
    current.current = p;
    const board = document.querySelector('.bar-dartboard') as SVGSVGElement | null;
    const matrix = board?.getScreenCTM();
    if (board && matrix) {
      const point = board.createSVGPoint();
      point.x = 150 + p.x * 111;
      point.y = 150 + p.y * 111;
      const screen = point.matrixTransform(matrix);
      setMarker({ x: screen.x, y: screen.y });
    }
  };
  useEffect(() => {
    if (!holding) return;
    let frame = 0;
    const tick = () => {
      update();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [holding]);
  useEffect(() => {
    if (disabled) {
      drag.current = null;
      setHolding(false);
      setMarker(null);
    }
  }, [disabled]);
  return (
    <>
      {marker && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: marker.x,
            top: marker.y,
            transform: 'translate(-50%,-50%)',
            width: 18,
            height: 18,
            border: '1.5px solid #ffe7a2',
            borderRadius: '50%',
            boxShadow: '0 0 0 1px #33200d,0 0 10px #ffdb8c88',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 7,
              top: 7,
              width: 3,
              height: 3,
              background: '#fff5ce',
              borderRadius: '50%',
            }}
          />
        </div>
      )}
      <div
        role="button"
        aria-label="Зажми дротик, наведи и отпусти"
        aria-disabled={disabled}
        data-holding={holding}
        style={{
          position: 'absolute',
          bottom: 'var(--darts-rest-bottom, calc(env(safe-area-inset-bottom) + 14px))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 100,
          height: 110,
          touchAction: 'none',
          zIndex: 4,
          cursor: disabled ? 'default' : 'grab',
          borderRadius: 28,
          background: holding ? 'radial-gradient(ellipse,#f4cc6833,transparent 70%)' : 'none',
        }}
        onPointerDown={(e) => {
          if (disabled || drag.current) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          base.current = { x: 0, y: 0 };
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            started: performance.now(),
          };
          setHolding(true);
          update();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const board = document.querySelector('.bar-dartboard') as SVGSVGElement;
          const matrix = board.getScreenCTM();
          if (!matrix) return;
          const radius = 111 * Math.hypot(matrix.a, matrix.b);
          base.current = {
            x: Math.max(-1.05, Math.min(1.05, ((e.clientX - d.x) * 2) / radius)),
            y: Math.max(-1.05, Math.min(1.05, ((e.clientY - d.y) * 2) / radius)),
          };
          update();
        }}
        onPointerUp={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          const point = current.current;
          drag.current = null;
          setHolding(false);
          setMarker(null);
          if (!disabled) throwAt(point);
        }}
        onPointerCancel={cancelAim}
        onLostPointerCapture={cancelAim}
      />
    </>
  );
}
