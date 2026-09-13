const MAX_DESTINATION_LENGTH = 1024;
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const CHAT_PATH = new RegExp(`^/chat/${UUID_PATTERN}$`, 'i');
const DUEL_PATH = /^\/duel\/[a-z0-9][a-z0-9_-]{0,63}$/i;
const STATIC_PATHS = new Set([
  '/bonus-games',
  '/achievements',
  '/achievements/weekly-challenge',
  '/daily',
  '/sections',
  '/inventory',
  '/profile',
  '/admin',
]);

function isSafeDecodedValue(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value);
    return !hasControlCharacters(decoded) && !/^(?:https?:)?\/\//i.test(decoded);
  } catch {
    return false;
  }
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function isAllowedRootQuery(params: URLSearchParams): boolean {
  const entries = [...params.entries()];
  if (entries.length === 0) return true;
  if (entries.some(([key, value]) => !isSafeDecodedValue(key) || !isSafeDecodedValue(value))) {
    return false;
  }

  const view = params.get('view');
  if (view === 'hub' || view === 'daily' || view === 'training' || view === 'tournaments') {
    return entries.length === 1;
  }
  if (view !== 'amateur') return false;

  const allowedKeys = new Set(['view', 'section', 'tournament', 'tab', 'from', 'match', 'play']);
  if (entries.some(([key]) => !allowedKeys.has(key))) return false;
  if (params.getAll('view').length !== 1) return false;
  const section = params.get('section');
  if (section !== null && section !== 'tournaments' && section !== 'duels') return false;
  const tournament = params.get('tournament');
  if (tournament !== null && !new RegExp(`^${UUID_PATTERN}$`, 'i').test(tournament)) return false;
  const match = params.get('match');
  if (match !== null && !new RegExp(`^${UUID_PATTERN}$`, 'i').test(match)) return false;
  const tab = params.get('tab');
  if (tab !== null && tab !== 'overview' && tab !== 'schedule') return false;
  const from = params.get('from');
  if (from !== null && from !== 'sections') return false;
  const play = params.get('play');
  return play === null || play === '1';
}

export function resolveInternalDestination(value: string): string {
  if (
    value.length === 0 ||
    value.length > MAX_DESTINATION_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    hasControlCharacters(value) ||
    !isSafeDecodedValue(value)
  ) {
    return '/';
  }

  try {
    const parsed = new URL(value, 'https://app.internal');
    if (parsed.origin !== 'https://app.internal' || parsed.hash) return '/';
    if (parsed.pathname === '/') return isAllowedRootQuery(parsed.searchParams) ? value : '/';
    if (parsed.search) return '/';
    if (
      STATIC_PATHS.has(parsed.pathname) ||
      CHAT_PATH.test(parsed.pathname) ||
      DUEL_PATH.test(parsed.pathname)
    ) {
      return value;
    }
  } catch {
    return '/';
  }
  return '/';
}
