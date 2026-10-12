/** Display precision only; record comparisons use unrounded server values. */
export function formatRecordDuration(ms: number): string {
  const hundredths = Math.round(ms / 10);
  const seconds = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (hundredths < 6000) return `${seconds.format(hundredths / 100)} сек`;
  return `${Math.floor(hundredths / 6000)} мин ${seconds.format((hundredths % 6000) / 100)} сек`;
}
