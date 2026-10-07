import { describe, expect, it } from 'vitest';
import { createSkiAttemptSampler } from './skiEnvironment.js';
import { createCyberpunkSchedule, cyberpunkEnvironmentForHistory } from './cyberpunkEnvironment.js';

describe('challenge level feature gates', () => {
  const rules = { version: 1 as const, seed: 'level-gates', durationMs: 180000 };
  it('keeps magnets without scheduling outages on level one', () => {
    const legacy = createCyberpunkSchedule(rules);
    const gated = createCyberpunkSchedule({ ...rules, outagesEnabled: false });
    expect(gated).toEqual(legacy.filter((event) => event.kind === 'strip'));
  });
  it('does not regenerate cyberpunk stumbles when fatigue is disabled', () => {
    const environment = { cyberpunk: { ...rules, fatigueEnabled: false } };
    expect(cyberpunkEnvironmentForHistory(environment, []).stumbleWindows ?? []).toEqual([]);
  });
  it('keeps ski slope without slips or progressive fatigue on level one', () => {
    const sampler = createSkiAttemptSampler({ ...rules, slipsEnabled: false, fatigueEnabled: false },
      { goal: 0.5, goalie: 0.6, player: 0.75 });
    expect(sampler.events([])).toEqual([]);
    for (const time of [0, 5000, 25000, 60000, 150000]) {
      const player = sampler.player(time, []);
      expect(player.uphillMultiplier).toBe(0.65);
      expect(player.restRemaining).toBe(0);
      expect(player.canShoot).toBe(true);
      expect(player.notice).toBe('');
    }
  });
  it('schedules level-two player slips against movement without fatigue', () => {
    const sampler = createSkiAttemptSampler({ ...rules, fatigueEnabled: false },
      { goal: 0.5, goalie: 0.6, player: 0.75 });
    const events = sampler.events([]).filter((event) => event.target === 'player');
    expect(events.length).toBeGreaterThan(3);
    for (const event of events) {
      expect(sampler.player(event.startMs + 1, []).slip).not.toBeNull();
    }
  });
});
