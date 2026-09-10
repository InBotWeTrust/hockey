import { apiFetch } from './apiFetch.js';

export interface HomeArena {
  id: string;
  selection_id: string | null;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
}

export interface HomeArenasResponse {
  arenas: HomeArena[];
  selected_arena: HomeArena;
}

export interface HomeArenaSelectionResponse {
  selected_arena: HomeArena;
}

export function fetchHomeArenas(): Promise<HomeArenasResponse> {
  return apiFetch<HomeArenasResponse>('/me/home-arenas');
}

export function selectHomeArena(arenaThemeId: string | null): Promise<HomeArenaSelectionResponse> {
  return apiFetch<HomeArenaSelectionResponse>('/me/home-arena', {
    method: 'PATCH',
    body: JSON.stringify({ arena_theme_id: arenaThemeId }),
  });
}
