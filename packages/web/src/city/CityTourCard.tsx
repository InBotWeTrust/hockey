import { cityTourPlaces, type TourState } from './cityTour.js';
import './city-tour.css';
export function CityTourCard({
  state,
  mode,
  location,
  onYard,
  onExplore,
  onNext,
  syncError,
  onRetry,
}: {
  state: TourState;
  mode: 'intro' | 'tour' | 'complete' | 'compact' | 'resume';
  location: string;
  onYard: () => void;
  onExplore: () => void;
  onNext: () => void;
  syncError: boolean;
  onRetry: () => void;
}) {
  const index = Math.max(
    0,
    cityTourPlaces.findIndex((p) => p.id === location),
  );
  const place = cityTourPlaces[index]!;
  const allSeen = cityTourPlaces.every((p) => state.viewed.includes(p.id));
  if (mode === 'resume')
    return (
      <aside className="city-tour-resume">
        <button className="btn btn--ghost" onClick={onExplore}>
          Осмотреть город · пройдено{' '}
          {cityTourPlaces.filter((p) => state.viewed.includes(p.id)).length}/{cityTourPlaces.length}
        </button>
      </aside>
    );
  if (mode === 'compact')
    return (
      <aside className="city-tour city-tour--compact" aria-label="Первая игра во дворе">
        <strong>Первая игра во дворе</strong>
        <p>{cityTourPlaces[0].copy.replaceAll('{target}', String(state.target))}</p>
        <div className="city-tour-actions">
          <button className="btn btn--cta" onClick={onYard}>
            Во двор
          </button>
          <button className="btn btn--ghost" onClick={onExplore}>
            {state.completed ? 'Знакомство с городом' : 'Продолжить знакомство'}
          </button>
        </div>
      </aside>
    );
  return (
    <aside className="city-tour" aria-label="Знакомство с городом">
      {mode === 'intro' && <div className="city-tour-eyebrow">Начни тут</div>}
      <div className="city-tour-heading">
        <h2>
          {mode === 'complete'
            ? state.gameStarted
              ? 'Город осмотрен!'
              : 'Пора на лёд!'
            : place.title}
        </h2>
        {mode !== 'complete' && (
          <span className="city-tour-counter">
            {index + 1}/{cityTourPlaces.length}
          </span>
        )}
      </div>
      <p>
        {mode === 'complete'
          ? state.gameStarted
            ? 'Знакомство завершено. Можешь вернуться к игре или продолжить прогулку.'
            : 'Ты познакомился с городом. Вернись во двор и начни свой первый период.'
          : place.copy.replaceAll('{target}', String(state.target))}
      </p>
      {mode === 'tour' && (
        <div className="city-tour-pagination">
          <button className="btn btn--ghost" onClick={onYard}>
            {state.gameStarted ? (
              'Во двор'
            ) : (
              <>
                Во двор –<br />
                начать игру
              </>
            )}
          </button>
          <button className="btn btn--cta" onClick={onNext}>
            {index === cityTourPlaces.length - 1 && allSeen ? 'Вернуться во двор' : 'Далее'}
          </button>
        </div>
      )}
      {mode !== 'tour' && (
        <div className="city-tour-actions">
          <button className="btn btn--cta" onClick={onYard}>
            {state.gameStarted ? 'Во двор' : mode === 'intro' ? 'Во двор' : 'Во двор – начать игру'}
          </button>
          {mode === 'intro' && (
            <button className="btn btn--ghost" onClick={onExplore}>
              Осмотреть город
            </button>
          )}
        </div>
      )}
      {syncError && (
        <p className="city-tour-sync" role="status">
          Не удалось синхронизировать прогресс. <button onClick={onRetry}>Повторить</button>
        </p>
      )}
    </aside>
  );
}
