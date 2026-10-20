import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { computerOpponents, type ComputerOpponentId } from './computerOpponents.js';

const names = { daria: 'Дарьей', grigory: 'Григорием', maria: 'Марией', arsenich: 'Арсеничем' };

export function ComputerOpponentCarousel({
  disabled,
  onPlay,
  index,
  onSelect,
}: {
  disabled: boolean;
  onPlay: (id: ComputerOpponentId) => void;
  index: number;
  onSelect: (index: number) => void;
}) {
  useEffect(() => {
    computerOpponents.forEach((hero) => {
      const image = new Image();
      image.src = `/bar/cards/${hero.id}-composition-v1.webp`;
    });
  }, []);
  const start = useRef<{ x: number; y: number } | null>(null);
  const opponent = computerOpponents[index]!;
  const move = (direction: number) =>
    onSelect(Math.max(0, Math.min(computerOpponents.length-1, index + direction)));
  const finish = (x: number, y: number) => {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const dx = x - origin.x;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(y - origin.y) * 1.3) move(dx < 0 ? 1 : -1);
  };
  return (
    <section
      className="durak-character"
      role="region"
      aria-label="Выбор персонажа"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (touch) finish(touch.clientX, touch.clientY);
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse') return;
        start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        if (event.pointerType === 'mouse') finish(event.clientX, event.clientY);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <div className="durak-character__scene">
        <button
          type="button"
          className="icon-btn durak-character__nav durak-character__nav--previous"
          aria-label="Предыдущий персонаж"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn durak-character__nav durak-character__nav--next"
          aria-label="Следующий персонаж"
          disabled={index >= computerOpponents.length-1}
          onClick={() => move(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="durak-character__identity" aria-live="polite">
        <h2>{opponent.name}</h2>
        <div className="durak-character__pages" aria-label="Персонажи">
          {computerOpponents.map((hero, page) => (
            <button
              key={hero.id}
              type="button"
              aria-label={`Выбрать: ${hero.name}`}
              aria-pressed={page === index}
              onClick={() => onSelect(page)}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="btn btn--cta"
        disabled={disabled}
        onClick={() => onPlay(opponent.id)}
      >
        Сыграть с {names[opponent.id]}
      </button>
    </section>
  );
}
