import type { ColumnLocation } from './columnNavigationStore.js';
import { isGameLocation } from './gameRoutes.js';
export function appSurface(
  location: ColumnLocation,
): 'venue' | 'panorama' | 'game' | 'chat' | 'contained' {
  const { pathname, search } = location;
  if (isGameLocation(location)) return 'game';
  if (pathname === '/sections' || pathname === '/bar') return 'panorama';
  if (/^\/chat(?:\/|$)/.test(pathname)) return 'chat';
  if (
    ['/daily', '/bonus-games', '/achievements'].includes(pathname) ||
    /^\/(?:profile(?:\/|$)|achievements\/)/.test(pathname)
  )
    return 'venue';
  const view = new URLSearchParams(search).get('view');
  if (pathname === '/' && ['training', 'amateur'].includes(view ?? '')) return 'venue';
  return 'contained';
}
