export interface CompletionComparisonData {
  kind: 'daily' | 'training';
  currentDate: string;
  current: { shots: number; goals: number; limit: number };
  previous: { day: string; shots: number; goals: number; limit: number; comparable: boolean; contextKnown?: boolean } | null;
}

export function completionComparisonCopy(data: CompletionComparisonData): { title: string; text: string } | null {
  const { current, previous, kind } = data;
  if (current.shots < current.limit) return null;
  if (!previous) return { title: 'Первый результат', text: kind === 'daily' ? 'Первая ежедневная игра пройдена!' : 'Первая тренировка пройдена!' };

  const days = Math.round((Date.parse(data.currentDate) - Date.parse(previous.day)) / 86400000);
  const previousLabel = kind === 'daily' ? 'Прошлая игра' : 'Прошлая тренировка';
  const title = days === 1 ? `${previousLabel} · вчера` : days === 2 ? `${previousLabel} · позавчера` : `${previousLabel} · ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...(previous.day.slice(0,4) !== data.currentDate.slice(0,4) ? {year: 'numeric' as const} : {}), timeZone: 'UTC' }).format(new Date(previous.day))}`;
  if (previous.shots < previous.limit) return { title, text: `В прошлый раз – ${previous.shots}/${previous.limit} бросков.\nСегодня – все ${current.limit}!` };
  if (previous.contextKnown === false) return { title: 'Результат сохранён', text: kind === 'daily' ? 'Следующую игру сравним с этой.' : 'Следующую тренировку сравним с этой.' };
  if (!previous.comparable || previous.limit !== current.limit) return { title: 'Новые условия', text: 'Первый полный результат в этих условиях. Следующий сравним с ним.' };
  const before = Math.round(previous.goals / previous.shots * 100);
  const after = Math.round(current.goals / current.shots * 100);
  const delta = after - before;
  return { title, text: delta === 0 ? `Точность на прежнем уровне · ${after}%` : `Точность: ${before}% → ${after}% · ${delta > 0 ? '+' : '–'}${Math.abs(delta)}%` };
}

export function completionComparisonOutcome(data: CompletionComparisonData): 'up' | 'down' | 'same' | 'complete' | 'none' {
  const { current, previous } = data;
  if (current.shots < current.limit) return 'none';
  if (!previous || !previous.comparable || previous.limit !== current.limit || previous.shots < previous.limit) return 'complete';
  const delta = Math.round(current.goals / current.shots * 100) - Math.round(previous.goals / previous.shots * 100);
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
}

export function completionButtonLabel(data: CompletionComparisonData): string {
  switch (completionComparisonOutcome(data)) {
    case 'down': return 'Ок, завтра буду лучше';
    case 'up': return 'Отлично, завтра продолжу';
    case 'complete': return 'Отлично, завтра продолжу';
    case 'same': return 'Ок, завтра улучшу результат';
    default: return 'Ок, вернусь завтра';
  }
}

export function CompletionComparison({ data }: { data: CompletionComparisonData }): JSX.Element | null {
  const copy = completionComparisonCopy(data);
  if (!copy) return null;
  const outcome = completionComparisonOutcome(data);
  const separator = outcome === 'up' || outcome === 'down' ? copy.text.indexOf(' · ') : -1;
  const changeColor = outcome === 'up' ? 'var(--success, #35b77c)' : 'var(--danger, #e46d73)';
  return <section aria-label="Сравнение результата" style={{ marginTop: 20, display: 'grid', gap: 8 }}>
    <div className="section-label" style={{ margin: 0, padding: 0 }}>{copy.title}</div>
    <div style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 650, whiteSpace: 'pre-line', color: 'var(--ink)' }}>{separator < 0 ? copy.text : <>{copy.text.slice(0, separator)}{' '}<span style={{ color: changeColor }}>{copy.text.slice(separator + 3)}</span></>}</div>
  </section>;
}
