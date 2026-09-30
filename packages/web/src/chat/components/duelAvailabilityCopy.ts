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
  if (limit && format.reason !== 'format') {
    return format.player === 'opponent'
      ? `Соперник исчерпал ${limit}. Пригласите его после обновления лимита.`
      : `Вы исчерпали ${limit}.`;
  }
  return limit ? `${who} исчерпан ${limit}.` : 'Этот формат сейчас недоступен.';
}

export function allFormatsBlockedCopy(
  formats: Awaited<ReturnType<typeof checkAmateurDuelChallengeAvailability>>['formats'],
): string {
  const blockedFormats = Object.values(formats ?? {}).filter((format) => !format.available);
  const isGlobalLimit = (format: Availability) =>
    format.reason === 'daily' || format.reason === 'weekly' || format.reason === 'monthly';
  const selfGlobalLimit = blockedFormats.find((format) =>
    format.player === 'self' && isGlobalLimit(format));
  if (selfGlobalLimit) return duelAvailabilityCopy(selfGlobalLimit);

  const opponentGlobalLimit = blockedFormats.find((format) =>
    format.player === 'opponent' && isGlobalLimit(format));
  if (opponentGlobalLimit) return duelAvailabilityCopy(opponentGlobalLimit);

  if (blockedFormats.length > 0 && blockedFormats.every((format) => format.reason === 'format')) {
    return 'Нет общих доступных форматов дуэли.';
  }

  const reasons = [...new Set(blockedFormats.map(duelAvailabilityCopy))];
  if (reasons.length === 0) return 'Сейчас нет доступных форматов дуэли.';
  return reasons.length === 1 ? reasons[0]! : `Нет доступных форматов. ${reasons.join(' ')}`;
}
