export type GameplayLockReason = 'recent_gameplay' | 'scheduled_tournament' | 'active_classic';

export interface GameplayLockDTO {
  blocked: boolean;
  reason: GameplayLockReason;
  ends_at: string | null;
  tournament_starts_at: string | null;
}

export function ordinaryDuelLockCopy(lock: GameplayLockDTO): string {
  if (lock.reason === 'active_classic')
    return 'Завершите текущую турнирную игру, чтобы играть в обычные дуэли.';
  if (lock.reason === 'scheduled_tournament') {
    const startsAt = lock.tournament_starts_at ? Date.parse(lock.tournament_starts_at) : NaN;
    return startsAt > Date.now()
      ? `Обычные дуэли недоступны перед турнирной игрой. Начало: ${new Date(startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`
      : 'Обычные дуэли будут доступны после завершения текущего турнирного блока.';
  }
  return 'Обычные дуэли временно недоступны. Дождитесь окончания восстановления.';
}
