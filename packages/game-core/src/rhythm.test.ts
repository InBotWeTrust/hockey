import { getDuelPlayerCondition } from './duelInventory.js';
import { describe, it, expect } from 'vitest';
import { countRhythmBoardContacts, projectRhythm, compareRhythmSeries, createRhythmMovementSampler } from './rhythm.js';
describe('Rhythm goal windows', () => {
  it('accepts the exact boundary and rejects a late goal', () => {
    expect(projectRhythm({ version: 1, shots: [{ travel: 2, goal: true }], travel: 2 }).score).toBe(1);
    expect(projectRhythm({ version: 1, shots: [{ travel: 2.001, goal: true }], travel: 2.001 }).score).toBe(0);
  });
  it('preserves windows across misses and scores across broken series', () => {
    expect(
      projectRhythm({ version: 1,
        shots: [
          { travel: 1, goal: true },
          { travel: 2, goal: false },
          { travel: 3, goal: true },
        ],
        travel: 3,
      }),
    ).toMatchObject({ score: 2, currentSeries: 2 });
    expect(
      projectRhythm({ version: 1,
        shots: [
          { travel: 1, goal: true },
          { travel: 3.1, goal: true },
          { travel: 4, goal: true },
        ],
        travel: 4,
      }),
    ).toMatchObject({ score: 2, currentSeries: 1, series: [1, 1] });
  });
  it('compares all sorted series', () => {
    expect(compareRhythmSeries([4, 1, 1], [3, 3])).toBe(1);
    expect(compareRhythmSeries([4, 2, 1], [4, 3])).toBe(-1);
    expect(compareRhythmSeries([1, 4], [4, 1])).toBe(0);
  });
});

describe('Rhythm confirmed series', () => {
  it('keeps the first goal pending even after the initial two traversals', () => {
    expect(projectRhythm({ shots: [{ travel: 5, goal: true }], travel: 5 }))
      .toMatchObject({ score: 0, currentSeries: 1, series: [], remainingTraversals: 2 });
  });
  it('credits both goals when the second shot starts at the two-traversal boundary', () => {
    expect(projectRhythm({ shots: [{ travel: 5, goal: true }, { travel: 7, goal: true }], travel: 7 }))
      .toMatchObject({ score: 2, currentSeries: 2, series: [2] });
  });
  it('discards an unconfirmed goal on expiry and starts a new pending pair', () => {
    expect(projectRhythm({ shots: [{ travel: 1, goal: true }], travel: 3.001 }))
      .toMatchObject({ score: 0, currentSeries: 0, series: [] });
    const shots = [{ travel: 1, goal: true }, { travel: 3.001, goal: true }];
    expect(projectRhythm({ shots, travel: 3.001 })).toMatchObject({ score: 0, currentSeries: 1, series: [] });
    expect(projectRhythm({ shots: [...shots, { travel: 4, goal: true }], travel: 4 }))
      .toMatchObject({ score: 2, currentSeries: 2, series: [2] });
  });
  it('preserves confirmed points through a miss, expiry and an unconfirmed last goal', () => {
    expect(projectRhythm({ shots: [
      { travel: 4, goal: true }, { travel: 5, goal: false },
      { travel: 6, goal: true }, { travel: 7, goal: true }, { travel: 10, goal: true },
    ], travel: 13 })).toMatchObject({ score: 3, currentSeries: 0, series: [3] });
  });
  it('preserves the original scoring of version-one match snapshots', () => {
    expect(projectRhythm({ version: 1, shots: [{ travel: 1, goal: true }], travel: 1 }))
      .toMatchObject({ score: 1, currentSeries: 1, series: [1] });
  });
});

describe('Rhythm movement integral', () => {
  const input = {
    seed: 'movement',
    userId: 'local',
    periodNumber: 1,
    elapsedMs: 0,
    movementDistancePx: 0,
    baseLaneWidthPx: 600,
    baselineShooterSpeed: 0.75,
    currentShooterSpeed: 0.75,
    loadout: { stick: null, skates: null, nutrition: null },
  };
  it('measures full widths rather than board touches and excludes flight stops', () => {
    const sample = createRhythmMovementSampler(input);
    expect(sample.travelAt(1000)).toBeCloseTo(1.5, 9);
    expect(sample.travelAt(1000, [{ tapTime: 200, flightMs: 400 }])).toBeCloseTo(0.9, 9);
    expect(sample.travelAt(600, [{ tapTime: 200, flightMs: 400 }])).toBe(
      sample.travelAt(200, [{ tapTime: 200, flightMs: 400 }]),
    );
  });
  it('is independent of sampling order, repeated calls and frame rate', () => {
    const a = createRhythmMovementSampler(input),
      b = createRhythmMovementSampler(input);
    const pauses = [
      { tapTime: 400, flightMs: 350 },
      { tapTime: 1700, flightMs: 500 },
    ];
    for (let ms = 0; ms < 5000; ms += 17) a.travelAt(ms, pauses);
    expect(a.travelAt(5000, pauses)).toBe(b.travelAt(5000, pauses));
    a.travelAt(150000, pauses);
    expect(a.travelAt(1500, pauses)).toBe(b.travelAt(1500, pauses));
  });
  it('integrates fatigue and rest instead of time multiplied by starting speed', () => {
    const sample = createRhythmMovementSampler(input);
    const late = sample.travelAt(120000) - sample.travelAt(110000);
    expect(late).toBeLessThan(15);
    expect(sample.travelAt(120000)).toBeGreaterThan(sample.travelAt(110000));
  });
  it('keeps the existing visible stumble hold frozen before resuming', () => {
    const sample = createRhythmMovementSampler(input);
    let seen = false,
      end = 0;
    for (let t = 0; t < 30000; t += 10) {
      const raw = getDuelPlayerCondition({
        ...input,
        elapsedMs: t,
        movementDistancePx: (t * 0.75 * 2 * 600) / 1000,
      });
      if (raw.stumbleActive) seen = true;
      else if (seen) {
        end = t;
        break;
      }
    }
    expect(end).toBeGreaterThan(0);
    expect(sample.motionAt(end + 300)).toBe(sample.motionAt(end));
  });
});

it('credits a configurable minimum series retroactively without changing duel defaults', () => {
  const shots = [0,1,2,3,4,5,6].map(travel => ({travel, goal:true}));
  expect(projectRhythm({shots:shots.slice(0,6),travel:5,minimumSeries:7}).score).toBe(0);
  expect(projectRhythm({shots,travel:6,minimumSeries:7}).score).toBe(7);
  expect(projectRhythm({shots:[...shots,{travel:6.5,goal:false}],travel:6.5,minimumSeries:7}).currentSeries).toBe(7);
  expect(projectRhythm({shots,travel:8.01,minimumSeries:7}).series).toEqual([7]);
  expect(projectRhythm({shots:shots.slice(0,2),travel:1}).score).toBe(2);
});

it('breaks strict bonus series on any non-goal without losing credited points',()=>{
 const goals=[{travel:0,goal:true},{travel:.5,goal:true}];
 const missed=[...goals,{travel:.7,goal:false}];
 expect(projectRhythm({shots:missed,travel:.7,breakOnMiss:true})).toMatchObject({score:2,currentSeries:0,series:[2]});
 expect(projectRhythm({shots:[...missed,{travel:.8,goal:true}],travel:.8,breakOnMiss:true})).toMatchObject({score:2,currentSeries:1,series:[2]});
 expect(projectRhythm({shots:goals,travel:2.5,breakOnMiss:true}).currentSeries).toBe(2);
 expect(projectRhythm({shots:goals,travel:2.501,breakOnMiss:true}).currentSeries).toBe(0);
 expect(projectRhythm({shots:missed,travel:.7}).currentSeries).toBe(2);
});

it('uses strict consecutive goals for duel version three while preserving older match snapshots',()=>{
 const goals=Array.from({length:6},(_,i)=>({travel:i*.2,goal:true}));
 const shots=[...goals,{travel:1.2,goal:false},{travel:1.4,goal:true}];
 expect(projectRhythm({shots,travel:1.4,version:3})).toMatchObject({score:6,currentSeries:1,series:[6]});
 expect(projectRhythm({shots,travel:1.4,version:2})).toMatchObject({score:7,currentSeries:7});
});

it('credits duel v4 at four consecutive goals and resets exactly at the third contact',()=>{
 const shots=[0,1,2,3,4].map((boardContacts,i)=>({travel:i*.4,boardContacts,goal:true}));
 expect(projectRhythm({shots:shots.slice(0,3),travel:.8,currentBoardContacts:2,version:4}).score).toBe(0);
 expect(projectRhythm({shots:shots.slice(0,4),travel:1.2,currentBoardContacts:3,version:4})).toMatchObject({score:4,currentSeries:4});
 expect(projectRhythm({shots,travel:1.6,currentBoardContacts:4,version:4}).score).toBe(5);
 expect(projectRhythm({shots,travel:3.8,currentBoardContacts:6,version:4}).currentSeries).toBe(5);
 expect(projectRhythm({shots,travel:4,currentBoardContacts:7,version:4})).toMatchObject({score:5,currentSeries:0});
 expect(projectRhythm({shots:[...shots,{travel:4,boardContacts:7,goal:true}],travel:4,currentBoardContacts:7,version:4})).toMatchObject({score:5,currentSeries:1});
});
it('uses actual contact counts for bonus thresholds instead of two travelled widths',()=>{
 const shots=[{travel:.1,boardContacts:1,goal:true},{travel:2.2,boardContacts:3,goal:true}];
 expect(projectRhythm({shots,travel:2.2,currentBoardContacts:3,boardContactLimit:3,minimumSeries:2,breakOnMiss:true}).score).toBe(2);
 expect(projectRhythm({shots,travel:2.3,currentBoardContacts:6,boardContactLimit:3,minimumSeries:2,breakOnMiss:true}).currentSeries).toBe(0);
});

it('counts phase-aligned contacts once at exact boundaries, excluding the starting position',()=>{
 expect(countRhythmBoardContacts(0,.5,250)).toBe(0);
 expect(countRhythmBoardContacts(749.99,.5,250)).toBe(0);
 expect(countRhythmBoardContacts(750,.5,250)).toBe(1);
 expect(countRhythmBoardContacts(1750,.5,250)).toBe(2);
 expect(countRhythmBoardContacts(2750,.5,250)).toBe(3);
 expect(countRhythmBoardContacts(0,.5,1000)).toBe(0);
 expect(countRhythmBoardContacts(1000,.5,1000)).toBe(1);
});

it('does not create contacts while the shooter is stopped during a flight',()=>{
 const sampler=createRhythmMovementSampler({seed:'board-contact-flight',userId:'player',periodNumber:1,elapsedMs:0,movementDistancePx:0,baseLaneWidthPx:600,baselineShooterSpeed:.75,currentShooterSpeed:.75,loadout:{stick:null,skates:null,nutrition:null}});
 const pauses=[{tapTime:200,flightMs:2000}];
 const atLaunch=sampler.boardContactsAt(200,pauses);
 expect(sampler.boardContactsAt(2100,pauses)).toBe(atLaunch);
 expect(sampler.boardContactsAt(4000,pauses)).toBeGreaterThan(atLaunch);
});
