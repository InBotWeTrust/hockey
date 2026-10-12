export function EnduranceTimer({ remainingMs, tone }: {
  remainingMs: number;
  tone: 'danger' | 'warning' | 'success';
}): JSX.Element {
  return <div className={`game-scoreboard game-scoreboard--stable-surface bonus-game-endurance-timer bonus-game-endurance-timer--${tone}`}
    role="timer" aria-label="До обязательного гола">
    <span className="game-scoreboard__label">ТАЙМЕР</span>
    <span className="bonus-game-endurance-timer__value">
      {(Math.ceil(Math.max(0, remainingMs) / 100) / 10).toFixed(1).replace('.', ',')}
    </span>
  </div>;
}
