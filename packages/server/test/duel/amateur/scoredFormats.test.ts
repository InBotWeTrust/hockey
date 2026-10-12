import { describe, it, expect } from 'vitest';
import {
  scoredElapsedFromShots,
  projectMarathon as project,
  compareScoredDuel as compare,
} from '../../../src/duel/amateur/scoredFormats.js';

describe('Marathon chronological scoring', () => {
  it('does not bank penalties at zero before a later goal', () => {
    expect(
      project({
        durationMs: 240000,
        windowMs: 7000,
        elapsedMs: 18000,
        shots: [{ startedMs: 15000, flightMs: 500, goal: true }],
      }),
    ).toMatchObject({
      score: 1,
      goals: 1,
      penalties: 2,
      windowEndsMs: 22500,
    });
  });
  it('resolves a timely goal after its deadline without a penalty', () => {
    expect(
      project({
        durationMs: 240000,
        windowMs: 4000,
        elapsedMs: 4500,
        shots: [{ startedMs: 4000, flightMs: 500, goal: true }],
      }),
    ).toMatchObject({
      score: 1,
      goals: 1,
      penalties: 0,
      windowEndsMs: 8500,
    });
  });
  it('penalizes a timely miss and catches up all elapsed windows', () => {
    expect(
      project({
        durationMs: 240000,
        windowMs: 4000,
        elapsedMs: 12500,
        shots: [{ startedMs: 3990, flightMs: 500, goal: false }],
      }),
    ).toMatchObject({
      score: 0,
      penalties: 3,
      windowEndsMs: 16000,
    });
  });
  it('keeps goal, penalty, goal in chronological order',()=> {
    expect(project({durationMs:240000,windowMs:4000,elapsedMs:7000,shots:[
      {startedMs:1000,flightMs:500,goal:true},
      {startedMs:5400,flightMs:500,goal:false},
      {startedMs:6500,flightMs:500,goal:true},
    ]})).toMatchObject({goals:2,penalties:1,score:1,windowEndsMs:11000});
  });
  it('counts the last timely goal and not an unfinished final window', () => {
    expect(
      project({
        durationMs: 240000,
        windowMs: 7000,
        elapsedMs: 250000,
        shots: [{ startedMs: 239900, flightMs: 600, goal: true }],
      }),
    ).toMatchObject({
      score: 1,
      goals: 1,
      penalties: 34,
    });
  });
  it('uses raw goals for the average-time tiebreaker, and draws on no goals', () => {
    expect(
      compare({
        kind: 'marathon',
        a: { score: 10, goals: 20, shots: 40 },
        b: { score: 10, goals: 15, shots: 20 },
      }),
    ).toBe(1);
    expect(
      compare({
        kind: 'marathon',
        a: { score: 0, goals: 0, shots: 4 },
        b: { score: 0, goals: 0, shots: 8 },
      }),
    ).toBe(0);
  });
  it('compares Sniper points before exact accuracy and never adds a time tiebreaker', () => {
    expect(
      compare({
        kind: 'sniper',
        a: { score: 100, goals: 10, shots: 20 },
        b: { score: 100, goals: 8, shots: 10 },
      }),
    ).toBe(-1);
    expect(
      compare({
        kind: 'sniper',
        a: { score: 101, goals: 10, shots: 20 },
        b: { score: 100, goals: 8, shots: 10 },
      }),
    ).toBe(1);
  });
});


describe('delayed scored duel clocks', () => {
  const shots = [{startedMs:5000,flightMs:200,goal:true},{startedMs:8000,flightMs:200,goal:false}];
  it('freezes during the current result without subtracting a future result', () => {
    expect(scoredElapsedFromShots(5700,shots,1000)).toBe(5200);
  });
  it('excludes each completed result once after background time', () => {
    expect(scoredElapsedFromShots(10500,shots,1000)).toBe(8500);
  });
});
