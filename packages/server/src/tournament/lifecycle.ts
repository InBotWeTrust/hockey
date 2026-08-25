import type { TournamentStatus } from './types.js';

const transitions: Readonly<Record<TournamentStatus, readonly TournamentStatus[]>> = {
  draft: ['registration', 'cancelled'],
  registration: ['registration_blocked', 'scheduling', 'cancelled', 'paused'],
  registration_blocked: ['registration', 'scheduling', 'cancelled', 'paused'],
  scheduling: ['regular', 'cancelled', 'paused'],
  regular: ['playoff', 'completed', 'cancelled', 'paused'],
  playoff: ['completed', 'cancelled', 'paused'],
  paused: ['registration', 'registration_blocked', 'scheduling', 'regular', 'playoff', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

export function canTransitionTournament(from: TournamentStatus, to: TournamentStatus): boolean {
  return transitions[from].includes(to);
}

