import { describe, expect, it } from 'vitest';
import {
  deriveDuelFormatFeats,
  isCompletedDuelFormat,
  type DuelFormatObservationInput,
  type DuelFormatShot,
} from '../../src/achievements/duelFormatObservations.js';
const shot = (input: Partial<DuelFormatShot> = {}): DuelFormatShot => ({
  result: 'goal',
  points: 10,
  technique: 'ordinary',
  startedMs: 0,
  flightMs: 100,
  travel: 0,
  boardContacts: 0,
  ...input,
});
const player = (userId: string, shots: DuelFormatShot[]) => ({
  userId,
  goals: shots.filter((s) => s.result === 'goal').length,
  shots,
});
const input = (data: Partial<DuelFormatObservationInput> = {}): DuelFormatObservationInput => ({
  format: 'sniper',
  durationMs: 8000,
  scoredClockVersion: 2,
  rhythmVersion: 4,
  winnerUserId: 'a',
  participants: [player('a', []), player('b', [])],
  ...data,
});
const goals = (count: number, contacts = 0) =>
  Array.from({ length: count }, () => shot({ boardContacts: contacts }));

describe('trusted duel feat observations', () => {
  it('accepts two completed players after the lazy match deadline, but not a technical win',()=>{
    expect(isCompletedDuelFormat('window_end',['completed','completed'])).toBe(true);
    expect(isCompletedDuelFormat('window_end',['completed','forfeit'])).toBe(false);
    expect(isCompletedDuelFormat('completed',['completed','forfeit'])).toBe(false);
    expect(isCompletedDuelFormat('forfeit',['completed','completed'])).toBe(false);
  });
  it('counts two actual two-point goals in one match, ignoring saves and other prices', () => {
    const result = deriveDuelFormatFeats(
      input({
        participants: [
          player('a', [
            shot({ points: 20 }),
            shot({ points: 20 }),
            shot({ points: 20, result: 'save' }),
          ]),
          player('b', []),
        ],
      }),
    );
    expect(result.a?.['duel-sniper-jeweler']).toBe(2);
    const partial = deriveDuelFormatFeats(
      input({
        participants: [
          player('a', [
            shot({ points: 20 }),
            shot({ points: 19 }),
            shot({ points: 20, result: 'miss' }),
          ]),
          player('b', []),
        ],
      }),
    );
    expect(partial.a?.['duel-sniper-jeweler']).toBe(1);
  });
  it('awards quality only on an actual win with fewer goals and strictly more points', () => {
    const players = [
      player('a', [shot({ points: 20 }), shot({ points: 20 })]),
      player('b', goals(3)),
    ];
    expect(deriveDuelFormatFeats(input({ participants: players })).a?.['duel-sniper-quality']).toBe(
      1,
    );
    expect(
      deriveDuelFormatFeats(input({ participants: players, winnerUserId: 'b' })).a?.[
        'duel-sniper-quality'
      ],
    ).toBeUndefined();
    players[0] = player('a', [shot({ points: 20 }), shot({ points: 10 })]);
    expect(
      deriveDuelFormatFeats(input({ participants: players })).a?.['duel-sniper-quality'],
    ).toBeUndefined();
  });
  it('counts distinct recognized goal techniques, not shots, misses or unknown labels', () => {
    const shots = [
      shot(),
      shot(),
      shot({ technique: 'corner' }),
      shot({ technique: 'edge' }),
      shot({ technique: 'super_precise', result: 'save' }),
      shot({ technique: 'invented' }),
    ];
    expect(
      deriveDuelFormatFeats(input({ participants: [player('a', shots), player('b', [])] })).a?.[
        'duel-sniper-arsenal'
      ],
    ).toBe(3);
  });
  it.each([
    ['ordinary','board_side','near_goalie'],
    ['category_1','category_2','category_3'],
    ['open','timed','narrow'],
  ])('counts supported legacy Sniper techniques %s/%s/%s', (...techniques) => {
    const result=deriveDuelFormatFeats(input({participants:[player('a',techniques.map(technique=>shot({technique}))),player('b',[])]}));
    expect(result.a?.['duel-sniper-arsenal']).toBe(3);
  });

  it('keeps Marathon goal runs across misses but resets them on actual timer penalties', () => {
    const shots = [
      shot({ startedMs: 0 }),
      shot({ result: 'miss', startedMs: 1000 }),
      shot({ startedMs: 6000 }),
      shot({ startedMs: 12000 }),
    ];
    expect(
      deriveDuelFormatFeats(
        input({
          format: 'marathon-4',
          durationMs: 18000,
          participants: [player('a', shots), player('b', [])],
        }),
      ).a?.['duel-marathon-4-tempo'],
    ).toBe(2);
    expect(
      deriveDuelFormatFeats(
        input({
          format: 'marathon-7',
          durationMs: 18000,
          participants: [player('a', shots), player('b', [])],
        }),
      ).a?.['duel-marathon-7-tempo'],
    ).toBe(3);
  });
  it('does not count shots beyond the authoritative Marathon period', () => {
    const shots = [
      shot({ startedMs: 0 }),
      ...Array.from({ length: 6 }, (_, i) => shot({ startedMs: 9000 + i * 1000 })),
    ];
    const result = deriveDuelFormatFeats(
      input({
        format: 'marathon-4',
        durationMs: 8000,
        participants: [player('a', shots), player('b', [])],
      }),
    );
    expect(result.a?.['duel-marathon-4-tempo']).toBe(1);
  });

  it('uses penalties during a missed flight and the final clock deadline', () => {
    const shots = [
      shot({ startedMs: 0 }),
      shot({ result: 'miss', startedMs: 5000, flightMs: 500 }),
      shot({ startedMs: 6500 }),
    ];
    const a = deriveDuelFormatFeats(
      input({ format: 'marathon-4', participants: [player('a', shots), player('b', [])] }),
    ).a;
    expect(a?.['duel-marathon-4-tempo']).toBe(1);
    expect(a?.['duel-marathon-4-clean']).toBeUndefined();
    const clean = [shot({ startedMs: 0 }), shot({ startedMs: 4000 }), shot({ startedMs: 7000 })];
    expect(
      deriveDuelFormatFeats(
        input({ format: 'marathon-4', participants: [player('a', clean), player('b', [])] }),
      ).a?.['duel-marathon-4-clean'],
    ).toBe(1);
    expect(
      deriveDuelFormatFeats(
        input({
          format: 'marathon-4',
          durationMs: 12100,
          participants: [player('a', clean), player('b', [])],
        }),
      ).a?.['duel-marathon-4-clean'],
    ).toBeUndefined();
  });
  it('does not require a win for skill feats, but does require it for clean Marathon', () => {
    const result = deriveDuelFormatFeats(
      input({
        format: 'marathon-7',
        winnerUserId: 'b',
        participants: [player('a', goals(5)), player('b', [])],
      }),
    );
    expect(result.a?.['duel-marathon-7-tempo']).toBe(5);
    expect(result.a?.['duel-marathon-7-clean']).toBeUndefined();
  });
  it('detects Rhythm recovery after misses and third board contacts, but not after a short series', () => {
    for (const shots of [
      [...goals(4), shot({ result: 'miss' }), ...goals(4)],
      [...goals(4), ...goals(4, 3)],
    ]) {
      const a = deriveDuelFormatFeats(
        input({ format: 'rhythm', participants: [player('a', shots), player('b', [])] }),
      ).a;
      expect(a?.['duel-rhythm-wave']).toBe(4);
      expect(a?.['duel-rhythm-recovery']).toBe(4);
    }
    expect(
      deriveDuelFormatFeats(
        input({
          format: 'rhythm',
          participants: [
            player('a', [...goals(3), shot({ result: 'miss' }), ...goals(4)]),
            player('b', []),
          ],
        }),
      ).a?.['duel-rhythm-recovery'],
    ).toBeUndefined();
  });
  it('retains a fifty-goal single series and awards a real equal-score series tie-break', () => {
    expect(
      deriveDuelFormatFeats(
        input({ format: 'rhythm', participants: [player('a', goals(50)), player('b', [])] }),
      ).a?.['duel-rhythm-wave'],
    ).toBe(50);
    const players = [
      player('a', goals(8)),
      player('b', [...goals(4), shot({ result: 'miss' }), ...goals(4)]),
    ];
    expect(
      deriveDuelFormatFeats(input({ format: 'rhythm', participants: players })).a?.[
        'duel-rhythm-longer'
      ],
    ).toBe(1);
    expect(
      deriveDuelFormatFeats(input({ format: 'rhythm', participants: players, winnerUserId: 'b' }))
        .b?.['duel-rhythm-longer'],
    ).toBeUndefined();
    players[1] = player('b', goals(7));
    expect(
      deriveDuelFormatFeats(input({ format: 'rhythm', participants: players })).a?.[
        'duel-rhythm-longer'
      ],
    ).toBeUndefined();
  });
});
