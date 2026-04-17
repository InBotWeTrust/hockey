import { describe, it, expect, beforeEach } from 'vitest';
import { useTrainingStore } from './trainingStore.js';
import { GOALIES } from '@hockey/game-core';

describe('trainingStore', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
  });

  it('starts empty before startDuel', () => {
    const s = useTrainingStore.getState();
    expect(s.currentGoalieId).toBeNull();
    expect(s.hpLeft).toBe(0);
    expect(s.shotIndex).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.sessionGoals).toBe(0);
    expect(s.sessionMisses).toBe(0);
    expect(s.lastResult).toBeNull();
  });

  it('startDuel seeds hp from goalie config and resets counters', () => {
    const rookie = GOALIES[0]!;
    useTrainingStore.getState().startDuel(rookie.id);
    const s = useTrainingStore.getState();
    expect(s.currentGoalieId).toBe(rookie.id);
    expect(s.hpLeft).toBe(rookie.hp);
    expect(s.shotIndex).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.seed).toMatch(/^training:rookie:/);
  });

  it('applyResult goal decrements hp, increments streak and goals', () => {
    useTrainingStore.getState().startDuel('rookie');
    useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    const s = useTrainingStore.getState();
    expect(s.hpLeft).toBe(4);
    expect(s.streak).toBe(1);
    expect(s.sessionGoals).toBe(1);
    expect(s.shotIndex).toBe(1);
    expect(s.lastResult?.type).toBe('goal');
  });

  it('applyResult save resets streak but keeps hp', () => {
    useTrainingStore.getState().startDuel('rookie');
    useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    useTrainingStore.getState().applyResult({ type: 'save', goalieContact: { x: 195, y: 30 } });
    const s = useTrainingStore.getState();
    expect(s.hpLeft).toBe(4);
    expect(s.streak).toBe(0);
    expect(s.sessionGoals).toBe(1);
    expect(s.shotIndex).toBe(2);
  });

  it('applyResult miss resets streak and counts as miss', () => {
    useTrainingStore.getState().startDuel('rookie');
    useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    useTrainingStore.getState().applyResult({ type: 'miss', reason: 'wide' });
    const s = useTrainingStore.getState();
    expect(s.streak).toBe(0);
    expect(s.sessionMisses).toBe(1);
  });

  it('clamps hp at zero when boss is defeated', () => {
    useTrainingStore.getState().startDuel('rookie');
    for (let i = 0; i < 7; i++) {
      useTrainingStore.getState().applyResult({ type: 'goal', hitPoint: { x: 195, y: 60 } });
    }
    expect(useTrainingStore.getState().hpLeft).toBe(0);
    expect(useTrainingStore.getState().isCleared).toBe(true);
  });
});
