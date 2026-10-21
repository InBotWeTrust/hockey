export function trainingPeriodFromSearch(search: string): 1 | 2 | 3 | null {
  const value = new URLSearchParams(search).get('period');
  return value === '1' ? 1 : value === '2' ? 2 : value === '3' ? 3 : null;
}
