import { useState, type ReactNode } from 'react';
import './CityMap.css';
export function SectionsView({
  initialMap,
  map,
  cards,
}: {
  initialMap: boolean;
  map: ReactNode;
  cards: ReactNode;
}): JSX.Element {
  const [showMap, setShowMap] = useState(initialMap);
  return (
    <div className="sections-view">
      <div className="sections-view__switch" role="group" aria-label="Вид разделов">
        <button type="button" aria-pressed={showMap} onClick={() => setShowMap(true)}>
          Карта
        </button>
        <button type="button" aria-pressed={!showMap} onClick={() => setShowMap(false)}>
          Карточки
        </button>
      </div>
      {showMap ? map : <div className="sections-view__cards">{cards}</div>}
    </div>
  );
}
