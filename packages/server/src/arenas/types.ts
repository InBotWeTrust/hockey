import type { Pool, PoolClient } from 'pg';

export type Queryable = Pool | PoolClient;

export type MatchmakingVenuePolicy =
  | 'neutral_default'
  | 'random_participant_home'
  | 'random_unselected';

export interface ArenaSnapshot {
  id: string;
  slug: string;
  title: string;
  artworkUrl: string;
  thumbnailUrl: string;
}

export interface ResolvedDuelVenue {
  policy: MatchmakingVenuePolicy | 'direct_challenge';
  homeUserId: string | null;
  arenaThemeId: string;
  arena: ArenaSnapshot;
}

export interface UserArenaDTO {
  id: string;
  selection_id: string | null;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
}

export interface UserArenaListResponse {
  arenas: UserArenaDTO[];
  selected_arena: UserArenaDTO;
}

export interface UserArenaSelectionResponse {
  selected_arena: UserArenaDTO;
}
