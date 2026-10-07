import type { TournamentResultDetails } from '../api/tournament.js';

function activeTime(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function tournamentTieBreakPresentation(
  details: TournamentResultDetails | undefined,
  tied: boolean,
  technical: boolean,
): { home: string | null; away: string | null; reason: string | null } {
  if (!details || !tied || technical) return { home: null, away: null, reason: null };
  const accuracy = details.duelKind === 'express';
  const time = ['classic', 'mix', 'express_plus'].includes(details.duelKind ?? '');
  if (!accuracy && !time) return { home: null, away: null, reason: null };
  const format = (value: number | null): string | null => {
    if (value === null || !Number.isFinite(value)) return null;
    return accuracy
      ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100)}%`
      : activeTime(value);
  };
  return {
    home: format(accuracy ? details.homeAccuracy : details.homeActiveTimeMs),
    away: format(accuracy ? details.awayAccuracy : details.awayActiveTimeMs),
    reason: accuracy ? 'по точности' : 'по времени',
  };
}

export function tournamentTechnicalReason(
  reason: string | null | undefined,
  homeName: string | null | undefined,
  awayName: string | null | undefined,
): string | null {
  switch (reason) {
    case 'tournament_attempt_home_no_show': return `${homeName ?? 'Хозяин'} не подтвердил участие`;
    case 'tournament_attempt_away_no_show': return `${awayName ?? 'Гость'} не подтвердил участие`;
    case 'tournament_attempt_home_incomplete': return `${homeName ?? 'Хозяин'} не завершил игру`;
    case 'tournament_attempt_away_incomplete': return `${awayName ?? 'Гость'} не завершил игру`;
    default: return null;
  }
}
