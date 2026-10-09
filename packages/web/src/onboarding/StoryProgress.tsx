interface Props { index: number; count: number; }
export function StoryProgress({ index, count }: Props): JSX.Element {
  return <div className="story-progress" role="status" aria-label={`Экран ${index + 1} из ${count}`}>
    {Array.from({ length: count }, (_, position) => <span key={position} className={`story-progress__dot${position === index ? ' story-progress__dot--active' : ''}`} aria-hidden="true" />)}
  </div>;
}
