import { projectRhythm, compareRhythmSeries } from '@hockey/game-core';
import { projectMarathon } from '../duel/amateur/scoredFormats.js';
import type { DuelFormatKey } from './duelFormatCatalog.js';
export interface DuelFormatShot {
  result: 'goal' | 'save' | 'miss';
  points: number;
  technique: string;
  startedMs: number;
  flightMs: number;
  travel: number;
  boardContacts: number;
}
export interface DuelFormatObservationInput {
  format: DuelFormatKey;
  durationMs: number;
  scoredClockVersion: number;
  rhythmVersion: 1 | 2 | 3 | 4;
  winnerUserId: string | null;
  participants: Array<{ userId: string; goals: number; shots: DuelFormatShot[] }>;
}
export function isCompletedDuelFormat(reason: string | null, states: readonly string[]): boolean {
  return (
    (reason === 'completed' || reason === 'window_end') &&
    states.length === 2 &&
    states.every((state) => state === 'completed')
  );
}
const TECHNIQUES = new Set([
  'super_precise',
  'edge',
  'corner',
  'behind_goalie',
  'precise',
  'complex',
  'counter_direction',
  'near_goalie',
  'ordinary',
  'board_side',
  'category_1',
  'category_2',
  'category_3',
  'category_4',
  'open',
  'timed',
  'narrow',
  'very_narrow',
  'instant',
]);
export function deriveDuelFormatFeats(
  input: DuelFormatObservationInput,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const rhythms = new Map<string, ReturnType<typeof projectRhythm>>();
  for (const participant of input.participants) {
    const feats: Record<string, number> = {};
    result[participant.userId] = feats;
    const add = (id: string, value: number) => {
      if (value > 0) feats[id] = value;
    };
    const goals = participant.shots.filter((s) => s.result === 'goal');
    if (input.format === 'sniper') {
      add('duel-sniper-jeweler', goals.filter((s) => s.points === 20).length);
      add(
        'duel-sniper-arsenal',
        new Set(goals.filter((s) => TECHNIQUES.has(s.technique)).map((s) => s.technique)).size,
      );
      const opponent = input.participants.find((p) => p.userId !== participant.userId);
      if (
        participant.userId === input.winnerUserId &&
        opponent &&
        participant.goals < opponent.goals &&
        goals.reduce((sum, s) => sum + s.points, 0) >
          opponent.shots.filter((s) => s.result === 'goal').reduce((sum, s) => sum + s.points, 0)
      )
        add('duel-sniper-quality', 1);
    }
    if (input.format === 'marathon-4' || input.format === 'marathon-7') {
      const settings = {
        durationMs: input.durationMs,
        windowMs: input.format === 'marathon-4' ? (4000 as const) : (7000 as const),
        ...(input.scoredClockVersion === 2 ? { resetAfterShotPauseMs: 1000 } : {}),
      };
      const history: Array<{ startedMs: number; flightMs: number; goal: boolean }> = [];
      let run = 0,
        best = 0,
        penalties = 0;
      for (const shot of participant.shots) {
        if (shot.startedMs > input.durationMs) continue;
        history.push({
          startedMs: shot.startedMs,
          flightMs: shot.flightMs,
          goal: shot.result === 'goal',
        });
        const projection = projectMarathon({
          ...settings,
          shots: history,
          elapsedMs: shot.startedMs,
        });
        if (projection.penalties > penalties) run = 0;
        if (shot.result === 'goal') run++;
        penalties = projection.penalties;
        best = Math.max(best, run);
      }
      add(`duel-${input.format}-tempo`, best);
      const final = projectMarathon({ ...settings, shots: history, elapsedMs: input.durationMs });
      if (participant.userId === input.winnerUserId && goals.length > 0 && final.penalties === 0)
        add(`duel-${input.format}-clean`, 1);
    }
    if (input.format === 'rhythm') {
      const history: Array<{
        tapTime: number;
        flightMs: number;
        travel: number;
        boardContacts: number;
        goal: boolean;
      }> = [];
      let previous = 0,
        best = 0,
        recovery = 0,
        broken = false;
      for (const shot of participant.shots) {
        history.push({
          tapTime: shot.startedMs,
          flightMs: shot.flightMs,
          travel: shot.travel,
          boardContacts: shot.boardContacts,
          goal: shot.result === 'goal',
        });
        const projection = projectRhythm({
          shots: history,
          travel: shot.travel,
          currentBoardContacts: shot.boardContacts,
          version: input.rhythmVersion,
        });
        if (previous >= 4 && projection.currentSeries <= 1) broken = true;
        if (broken && projection.currentSeries >= 4)
          recovery = Math.max(recovery, projection.currentSeries);
        best = Math.max(best, projection.currentSeries);
        previous = projection.currentSeries;
        rhythms.set(participant.userId, projection);
      }
      add('duel-rhythm-wave', best);
      add('duel-rhythm-recovery', recovery);
    }
  }
  if (input.format === 'rhythm' && input.winnerUserId) {
    const winner = rhythms.get(input.winnerUserId);
    const other = input.participants.find((p) => p.userId !== input.winnerUserId);
    const loser = other && rhythms.get(other.userId);
    if (
      winner &&
      loser &&
      winner.score > 0 &&
      winner.score === loser.score &&
      compareRhythmSeries(winner.series, loser.series) > 0
    )
      result[input.winnerUserId]!['duel-rhythm-longer'] = 1;
  }
  return result;
}
