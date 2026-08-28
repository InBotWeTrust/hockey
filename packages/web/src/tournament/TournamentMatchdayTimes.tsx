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
