// Filter unrevealed authored characters, including Russian name inflections.
const hiddenName =
  /(?:арсенич[а-яё]*|тимофе[а-яё]*|мари[яиюей][а-яё]*|элин[а-яё]*|arsenich|timofey|maria|elina)/iu;
export const containsNoviceSpoiler = (value: unknown): boolean =>
  hiddenName.test(typeof value === 'string' ? value : (JSON.stringify(value) ?? ''));
export const noviceReply = (text: string): string =>
  containsNoviceSpoiler(text)
    ? 'Давай пока поговорим о твоей игре. Как прошёл последний период?'
    : text;
export function noviceContextData<T>(value: T): T {
  if (typeof value === 'string')
    return value
      .split(/\n\s*\n|(?<=[.!?])\s+/u)
      .filter((part) => !containsNoviceSpoiler(part))
      .join('\n') as T;
  if (Array.isArray(value))
    return value
      .filter((item) => !containsNoviceSpoiler(item))
      .map((item) => noviceContextData(item)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, noviceContextData(item)]),
    ) as T;
  return value;
}

// Preserve turn IDs and ordering so filtering cannot break conversation revisions.
export function noviceResponseData(value: unknown): unknown {
  if (typeof value === 'string') return noviceReply(value);
  if (Array.isArray(value)) return value.map(noviceResponseData);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'user' ? item : noviceResponseData(item),
      ]),
    );
  return value;
}
