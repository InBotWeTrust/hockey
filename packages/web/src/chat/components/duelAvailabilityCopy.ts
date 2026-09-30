import type { AmateurDuelKind, checkAmateurDuelChallengeAvailability } from '../../api/amateurDuel.js';

type Availability = NonNullable<Awaited<ReturnType<typeof checkAmateurDuelChallengeAvailability>>['formats']>[AmateurDuelKind];

export function duelAvailabilityCopy(format: Availability): string {
  const who = format.player === 'opponent' ? 'У соперника' : 'У вас';
  if (format.reason === 'tournament') return `${who} сейчас недоступны обычные дуэли из-за турнира.`;
  if (format.reason === 'open_slots') return `${who} уже две открытые дуэли.`;
  if (format.reason === 'outgoing') return 'У вас уже два ожидающих приглашения.';
  const limit = format.reason === 'daily' ? 'дневной лимит дуэлей'
    : format.reason === 'weekly' ? 'недельный лимит дуэлей'
      : format.reason === 'monthly' ? 'месячный лимит дуэлей'
        : format.reason === 'format' ? 'месячный лимит этого формата' : null;
  return limit ? `${who} исчерпан ${limit}.` : 'Этот формат сейчас недоступен.';
}

export function allFormatsBlockedCopy(
  formats: Awaited<ReturnType<typeof checkAmateurDuelChallengeAvailability>>['formats'],
): string {
  const reasons = [...new Set(Object.values(formats ?? {})
    .filter((format) => !format.available)
    .map(duelAvailabilityCopy))];
  if (reasons.length === 0) return 'Сейчас нет доступных форматов дуэли.';
  return reasons.length === 1 ? reasons[0]! : `Нет доступных форматов. ${reasons.join(' ')}`;
}
