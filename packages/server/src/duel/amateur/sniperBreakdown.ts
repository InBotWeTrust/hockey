export interface SniperCategory {
  category: string;
  count: number;
  points: number;
}

/** Primary goal categories only; accepted points remain authoritative. */
export function sniperBreakdown(goals: readonly {technique: string | null; points:number}[]): SniperCategory[] {
  const groups = new Map<string, {category:string; count:number; points:number}>();
  for (const goal of goals) {
    const category = goal.technique ?? 'unclassified';
    const key = `${category}:${goal.points}`;
    const group = groups.get(key) ?? {category,count:0,points:0};
    group.count++;
    group.points += goal.points;
    groups.set(key,group);
  }
  return Array.from(groups.values(), group => ({category:group.category,count:group.count,points:group.points / 10}));
}
