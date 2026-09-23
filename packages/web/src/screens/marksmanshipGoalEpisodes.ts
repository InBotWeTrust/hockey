export interface GoalSample {
  timeMs: number;
  points: number;
  technique: string | null;
}

export interface GoalEpisode extends GoalSample {
  startMs: number;
  endMs: number;
}

export function groupGoalEpisodes(samples: readonly GoalSample[]): GoalEpisode[] {
  const episodes: GoalEpisode[] = [];
  let current: GoalEpisode | null = null;
  for (const sample of samples) {
    if (sample.points <= 0) {
      if (current) episodes.push(current);
      current = null;
      continue;
    }
    if (!current) {
      current = { ...sample, startMs: sample.timeMs, endMs: sample.timeMs };
    } else {
      current.endMs = sample.timeMs;
      if (sample.points > current.points) {
        current.timeMs = sample.timeMs;
        current.points = sample.points;
        current.technique = sample.technique;
      }
    }
  }
  if (current) episodes.push(current);
  return episodes;
}
