export function RhythmProgress({
  remaining,
  series,
}: {
  remaining: number;
  series: number;
}): JSX.Element {
  const left = Math.max(0, Math.min(2, remaining));
  return (
    <div className="rhythm-progress" role="group" aria-label="Ритм голов">
      <div
        className="rhythm-progress__segments"
        role="progressbar"
        aria-label="Осталось прокатов"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={left}
      >
        {[1, 0].map((offset) => (
          <span key={offset}>
            <i style={{ width: `${Math.max(0, Math.min(1, left - offset)) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="rhythm-progress__caption">
        {left > 0 ? `Серия ${series} · успей забить` : 'Вне ритма · забей для нового отсчёта'}
      </div>
    </div>
  );
}
