import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccessibleModal } from './AccessibleModal.js';
import './CityMap.css';
export interface CityMapProps {
  amateur: boolean;
  dailyMeta: string;
  trainingMeta: string;
  tasksMeta: string;
  bonusMeta: string;
  attention: boolean;
  onNavigate?: (path: string) => void;
}
export function CityMap({
  amateur,
  dailyMeta,
  trainingMeta,
  tasksMeta,
  bonusMeta,
  attention,
  onNavigate,
}: CityMapProps): JSX.Element {
  const routerNavigate = useNavigate();
  const navigate = onNavigate ?? routerNavigate;
  const [selected, setSelected] = useState<string | null>(null);
  const training = (): void => {
    setSelected(null);
    navigate('/?view=training&from=sections');
  };
  const places = [
    {
      title: 'Дворовый каток',
      x: 16,
      y: 40,
      meta: amateur ? `Тренировка · ${trainingMeta}` : `Ежедневная игра · ${dailyMeta}`,
      action: () => (amateur ? training() : setSelected('Дворовый каток')),
    },
    {
      title: 'Задания',
      x: 11,
      y: 64,
      meta: tasksMeta,
      action: () => navigate('/achievements'),
      attention,
    },
    {
      title: 'Любительский стадион',
      x: 29,
      y: 22,
      meta: amateur ? `Ежедневная игра · ${dailyMeta}` : 'Дуэли и турниры',
      action: () => setSelected('Любительский стадион'),
    },
    {
      title: 'Магазин',
      x: 31,
      y: 49,
      meta: 'Инвентарь и валюта',
      action: () => navigate('/inventory'),
    },
    {
      title: 'Спортзал',
      x: 50,
      y: 23,
      meta: 'В разработке',
      action: () => setSelected('Спортзал'),
    },
    { title: 'Бар', x: 50, y: 46, meta: 'Трансляции и обсуждения', action: () => navigate('/bar') },
    {
      title: 'Зал Славы',
      x: 69,
      y: 24,
      meta: 'Достижения',
      action: () => navigate('/profile/achievements'),
    },
    {
      title: 'Бонусные игры',
      x: 80,
      y: 51,
      meta: bonusMeta,
      action: () => navigate('/bonus-games'),
    },
    {
      title: 'Профи-арена',
      x: 92,
      y: 16,
      meta: 'В разработке',
      disabled: true,
      action: () => undefined,
    },
  ];
  const open = (path: string): void => {
    setSelected(null);
    navigate(path);
  };
  return (
    <section className="city-map" aria-label="Хоккейный район">
      <div
        className="city-map__viewport"
        tabIndex={0}
        aria-label="Карта района, листайте вправо и влево"
      >
        <div className="city-map__canvas">
          <img
            className="city-map__image"
            src="/maps/winter-city-e1d7eb043f80.webp"
            alt="Зимний хоккейный район: от дворового катка до современной профессиональной арены"
            draggable={false}
          />
          {places.map((place) => (
            <button
              key={place.title}
              type="button"
              className={`city-map__label${place.attention ? ' city-map__label--attention' : ''}`}
              style={{ left: `${place.x}%`, top: `${place.y}%` }}
              disabled={place.disabled ?? false}
              onClick={place.action}
            >
              <strong>{place.title}</strong>
              {(place.title === 'Задания' ? place.meta.split(' · ') : [place.meta]).map(
                (line, index) => (
                  <span key={index}>{line}</span>
                ),
              )}
            </button>
          ))}
        </div>
      </div>
      {selected !== null && (
        <AccessibleModal
          title={selected}
          onClose={() => setSelected(null)}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          }
        >
          {selected === 'Дворовый каток' || selected === 'Любительский стадион' ? (
            <div className="city-map__actions">
              {((selected === 'Дворовый каток' && !amateur) ||
                (selected === 'Любительский стадион' && amateur)) && (
                <button className="btn btn--cta" onClick={() => open('/daily')}>
                  Ежедневная игра · {dailyMeta}
                </button>
              )}
              {selected === 'Дворовый каток' && (
                <button className="btn btn--ghost" onClick={training}>
                  Тренировка · {trainingMeta}
                </button>
              )}
              {selected === 'Любительский стадион' && (
                <button
                  className="btn btn--ghost"
                  onClick={() => open('/?view=amateur&from=sections')}
                >
                  Дуэли и турниры
                </button>
              )}
            </div>
          ) : (
            <p className="modal-copy">Раздел в разработке.</p>
          )}
        </AccessibleModal>
      )}
    </section>
  );
}
