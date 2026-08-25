function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

export function formatRussianCount(value: number, one: string, few: string, many: string): string {
  const normalized = Math.abs(Math.trunc(value));
  const mod100 = normalized % 100;
  const mod10 = normalized % 10;
  const word =
    mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${numberText(value)} ${word}`;
}
