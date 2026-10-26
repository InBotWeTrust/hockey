export function enduranceTimerTone(remainingMs: number): 'danger' | 'warning' | 'success' {
  return remainingMs <= 4000 ? 'danger' : remainingMs <= 10000 ? 'warning' : 'success';
}

export function EnduranceTimer({ remainingMs, tone, windowMs }: {
  remainingMs: number;
  windowMs?: number;
  tone: 'danger' | 'warning' | 'success';
}): JSX.Element {
  return <div className={`game-scoreboard game-scoreboard--stable-surface bonus-game-endurance-timer bonus-game-endurance-timer--${tone}`}
    role="timer" aria-label="До обязательного гола">
    <span className="game-scoreboard__label">ТАЙМЕР</span>
    <span className="game-scoreboard__value bonus-game-endurance-timer__value">
      {(Math.ceil(Math.max(0, Math.min(windowMs ?? remainingMs, remainingMs)) / 100) / 10).toFixed(1).replace('.', ',')}
    </span>
  </div>;
}
