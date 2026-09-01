import type { Pool } from 'pg';

export interface PushPreferences {
  chatNewDialogMessage: boolean;
  dailyGame: boolean;
  trainingAvailable: boolean;
  duelEvents: boolean;
  tournamentEvents: boolean;
  gameNews: boolean;
}

export type PushPreferencePatch = Partial<PushPreferences>;

export type PushEventType =
  | 'chat.new_dialog_message'
  | 'daily.available'
  | 'daily.unlocked_after_training'
  | 'daily.period_ending'
  | 'daily.break_finished'
  | 'training.available'
  | 'duel.challenge_received'
  | 'duel.result_ready'
  | 'tournament.application_approved'
  | 'tournament.schedule_published'
  | 'tournament.fixture_opened'
  | 'tournament.live_soon'
  | 'tournament.fixture_deadline'
  | 'tournament.opponent_ready'
  | 'tournament.readiness_ending'
  | 'tournament.result_ready'
  | 'tournament.rescheduled'
  | 'tournament.playoff_started'
  | 'tournament.series_next_game'
  | 'tournament.completed'
  | 'tournament.manual'
  | 'news.posted';

export interface PushPreferencesRow {
  chat_new_dialog_message: boolean | null;
  daily_game: boolean | null;
  training_available: boolean | null;
  duel_events: boolean | null;
  tournament_events: boolean | null;
  game_news: boolean | null;
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  chatNewDialogMessage: true,
  dailyGame: true,
  trainingAvailable: true,
  duelEvents: true,
  tournamentEvents: true,
  gameNews: true,
};

export function mapPushPreferencesRow(row: PushPreferencesRow | undefined): PushPreferences {
  if (!row) return DEFAULT_PUSH_PREFERENCES;
  return {
    chatNewDialogMessage:
      row.chat_new_dialog_message ?? DEFAULT_PUSH_PREFERENCES.chatNewDialogMessage,
    dailyGame: row.daily_game ?? DEFAULT_PUSH_PREFERENCES.dailyGame,
    trainingAvailable: row.training_available ?? DEFAULT_PUSH_PREFERENCES.trainingAvailable,
    duelEvents: row.duel_events ?? DEFAULT_PUSH_PREFERENCES.duelEvents,
    tournamentEvents: row.tournament_events ?? DEFAULT_PUSH_PREFERENCES.tournamentEvents,
    gameNews: row.game_news ?? DEFAULT_PUSH_PREFERENCES.gameNews,
  };
}

export async function getPushPreferences(pool: Pool, userId: string): Promise<PushPreferences> {
  const { rows } = await pool.query<PushPreferencesRow>(
    `select chat_new_dialog_message, daily_game, training_available, duel_events,
            tournament_events, game_news
       from user_push_preferences
      where user_id = $1`,
    [userId],
  );
  return mapPushPreferencesRow(rows[0]);
}

export async function savePushPreferences(
  pool: Pool,
  userId: string,
  patch: PushPreferencePatch,
): Promise<PushPreferences> {
  const { rows } = await pool.query<PushPreferencesRow>(
    `insert into user_push_preferences (
       user_id, chat_new_dialog_message, daily_game, training_available, duel_events,
       tournament_events, game_news
     )
     values (
       $1,
       coalesce($2, true),
       coalesce($3, true),
       coalesce($4, true),
       coalesce($5, true),
       coalesce($6, true),
       coalesce($7, true)
     )
     on conflict (user_id) do update
       set chat_new_dialog_message =
             coalesce($2, user_push_preferences.chat_new_dialog_message),
           daily_game = coalesce($3, user_push_preferences.daily_game),
           training_available = coalesce($4, user_push_preferences.training_available),
           duel_events = coalesce($5, user_push_preferences.duel_events),
           tournament_events = coalesce($6, user_push_preferences.tournament_events),
           game_news = coalesce($7, user_push_preferences.game_news),
           updated_at = now()
     returning chat_new_dialog_message, daily_game, training_available, duel_events,
               tournament_events, game_news`,
    [
      userId,
      patch.chatNewDialogMessage ?? null,
      patch.dailyGame ?? null,
      patch.trainingAvailable ?? null,
      patch.duelEvents ?? null,
      patch.tournamentEvents ?? null,
      patch.gameNews ?? null,
    ],
  );
  return mapPushPreferencesRow(rows[0]);
}

export function isPushEventAllowed(
  preferences: PushPreferences,
  eventType: PushEventType,
): boolean {
  switch (eventType) {
    case 'chat.new_dialog_message':
      return preferences.chatNewDialogMessage;
    case 'daily.available':
    case 'daily.unlocked_after_training':
    case 'daily.period_ending':
    case 'daily.break_finished':
      return preferences.dailyGame;
    case 'training.available':
      return preferences.trainingAvailable;
    case 'duel.challenge_received':
    case 'duel.result_ready':
      return preferences.duelEvents;
    case 'tournament.application_approved':
    case 'tournament.schedule_published':
    case 'tournament.fixture_opened':
    case 'tournament.live_soon':
    case 'tournament.fixture_deadline':
    case 'tournament.opponent_ready':
    case 'tournament.readiness_ending':
    case 'tournament.result_ready':
    case 'tournament.rescheduled':
    case 'tournament.playoff_started':
    case 'tournament.series_next_game':
    case 'tournament.completed':
    case 'tournament.manual':
      return preferences.tournamentEvents;
    case 'news.posted':
      return preferences.gameNews;
  }
}
