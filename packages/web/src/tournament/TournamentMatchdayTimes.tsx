export function TournamentMatchdayTimes(props: { start: string; end: string }) {
  return (
    <div className="tournament-matchday-times">
      <span>
        <b>Начало</b>
        <span>{props.start}</span>
      </span>
      <span>
        <b>Конец</b>
        <span>{props.end}</span>
      </span>
    </div>
  );
}

type MatchdayState = 'past' | 'current' | 'upcoming';

function matchdayState(startsAt: string, endsAt: string, now = Date.now()): MatchdayState {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'upcoming';
  if (now >= end) return 'past';
  if (now >= start) return 'current';
  return 'upcoming';
}

export function TournamentMatchdayRow(props: {
  number: number;
  startsAt: string;
  endsAt: string;
  startLabel: string;
  endLabel: string;
}) {
  const state = matchdayState(props.startsAt, props.endsAt);
  return (
    <article className={`tournament-matchday-row tournament-matchday-row--${state}`}>
      <div className="tournament-matchday-row__heading">
        <strong>{props.number}-й тур</strong>
        {state === 'past' && <span className="tournament-matchday-row__status">Завершён</span>}
        {state === 'current' && <span className="tournament-matchday-row__status">Сейчас</span>}
      </div>
      <TournamentMatchdayTimes start={props.startLabel} end={props.endLabel} />
    </article>
  );
}
