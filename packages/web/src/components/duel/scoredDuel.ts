import { projectRhythm, type RhythmShot } from '@hockey/game-core';
import type {
  AmateurDuelKind,
  AmateurDuelParticipant,
  AmateurDuelRules,
} from '../../api/amateurDuel.js';
export function duelDisplayScore(
  kind: AmateurDuelKind,
  player: Pick<AmateurDuelParticipant, 'goals' | 'format_score'>,
): number {
  return kind === 'sniper' || kind === 'marathon' || kind === 'rhythm' ? (player.format_score ?? 0) : player.goals;
}
export function duelFormatLabel(
  rules: Pick<AmateurDuelRules, 'duelKind' | 'marathonWindowMs'>,
): string {
  const labels: Record<AmateurDuelKind, string> = {
    express: 'Экспресс',
    express_plus: 'Микс',
    classic: 'Классика',
    sniper: 'Снайпер',
    marathon: 'Марафон',
    rhythm: 'Ритм',
  };
  return (
    labels[rules.duelKind] +
    (rules.duelKind === 'marathon' ? ` · ${(rules.marathonWindowMs ?? 7000) / 1000} сек` : '')
  );
}

export function duelScoreText(
  kind: AmateurDuelKind,
  player: Pick<AmateurDuelParticipant, 'goals' | 'format_score'>,
): string {
  return duelDisplayScore(kind, player).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

export function duelScorePairText(
  kind: AmateurDuelKind,
  me: Pick<AmateurDuelParticipant, 'goals' | 'format_score'>,
  opponent: Pick<AmateurDuelParticipant, 'goals' | 'format_score'>,
): string {
  return [duelScoreText(kind, me), duelScoreText(kind, opponent)].join(kind === 'sniper' ? '\u2009:\u2009' : ':');
}

export function rhythmGoalDetails(shots: readonly RhythmShot[], version: 1 | 2 | 3, travel?: number): string[] {
  const latest = shots.at(-1);
  if (!latest?.goal) return [];
  const result = projectRhythm({shots, travel:travel ?? latest.travel, version});
  if (!result.currentSeries) return [];
  return [result.currentSeries >= 2 ? `Серия ${result.currentSeries}` : 'Серия началась'];
}
