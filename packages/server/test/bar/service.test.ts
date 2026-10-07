import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { getBarBoard, getBarLive, isVisibleEntry, projectPlayer } from '../../src/bar/service.js';
const now = new Date('2026-10-07T12:00:00Z');
const row = {
  id: 'match',
  kind: 'duel' as const,
  title: null,
  match_id: 'match',
  home_user_id: 'a',
  away_user_id: 'b',
  status: 'invited',
  duel_status: 'invited',
  starts_at: now,
  ends_at: new Date(now.getTime() + 60000),
  ready_expires_at: new Date(now.getTime() + 10000),
  match_group: 'upcoming' as const,
  home_score: 0,
  away_score: 0,
  rules_snapshot: {
    goalieId: 'rookie',
    periodDurationMs: 60000,
    breakDurationMs: 10000,
    totalPeriods: 3,
  },
  fight_paused_at: null,
};
const player = {
  user_id: 'a',
  match_id: 'match',
  display_name: 'Игрок',
  avatar_url: null,
  grip: 'left' as const,
  goals: 2,
  state: 'period_active',
  current_period: 1,
  period_started_at: now,
  break_started_at: null,
  period_paused_ms: 0,
  period_paused_at: null,
};
describe('public bar projections', () => {
  it('hides declined/expired invites including expiry exactly at the boundary', () => {
    expect(isVisibleEntry(row, now)).toBe(true);
    expect(isVisibleEntry({ ...row, status: 'cancelled' }, now)).toBe(false);
    expect(isVisibleEntry({ ...row, ready_expires_at: now }, now)).toBe(false);
    expect(isVisibleEntry({ ...row, ends_at: now }, now)).toBe(false);
  });
  it('projects period pauses and elapsed breaks without mutating gameplay', () => {
    expect(projectPlayer(player, row, now).state).toBe('period_active');
    expect(projectPlayer({ ...player, period_paused_at: now }, row, now).state).toBe('paused');
    expect(
      projectPlayer(
        { ...player, state: 'break_active', break_started_at: new Date(now.getTime() - 11000) },
        row,
        now,
      ).state,
    ).toBe('waiting');
  });
  it('keeps a scheduled fixture out of another match state and allowlists payloads', async () => {
    const fixture = {
      ...row,
      id: 'fixture',
      kind: 'tournament' as const,
      match_id: null,
      status: 'scheduled',
      duel_status: null,
      ready_expires_at: null,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [fixture] })
      .mockResolvedValueOnce({ rows: [player, { ...player, user_id: 'b' }] });
    const data = await getBarBoard({ query } as unknown as Pool, 0, now);
    expect(data.upcoming[0]?.players.map((p) => p.goals)).toEqual([0, 0]);
    expect(data.upcoming[0]?.players[0].state).toBe('waiting');
    expect(JSON.stringify(data)).not.toMatch(/rules_snapshot|match_seed|period_started_at/);
    expect(query.mock.calls[0]?.[0]).toContain('t.visibility');
    expect(query.mock.calls[0]?.[0]).toContain('not exists');
  });
  it('reads only delayed, bounded committed shots and never exposes seeds', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ ...row, status: 'active', duel_status: 'active', match_group: 'online' }],
      })
      .mockResolvedValueOnce({ rows: [player, { ...player, user_id: 'b' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'shot',
            user_id: 'a',
            period_number: 1,
            shot_index: 1,
            server_result: 'goal',
            created_at: new Date(now.getTime() - 4000),
            input_payload: { tapTime: 1000 },
            seed: 'shot-private',
            match_seed: 'match-private',
          },
        ],
      });
    const live = await getBarLive({ query } as unknown as Pool, 'duel', 'match', now);
    expect(live.shots[0]?.result).toBe('goal');
    expect(live.shots[0]?.shooterX).toBeGreaterThan(0);
    expect(JSON.stringify(live)).not.toContain('private');
    expect(query.mock.calls[2]?.[1][1]).toEqual(new Date(now.getTime() - 3000));
    expect(query.mock.calls[2]?.[0]).toContain('limit 40');
    expect(query.mock.calls[1]?.[1][2]).toEqual(new Date(now.getTime() - 3000));
    expect(query.mock.calls[1]?.[0]).toContain('recent.server_result');
    expect(query.mock.calls.every((c) => !String(c[0]).match(/\b(insert|update|delete)\b/i))).toBe(
      true,
    );
  });
  it('does not replay an old attempt when the fixture is scheduled for a new one', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...row,
            kind: 'tournament',
            status: 'scheduled',
            duel_status: 'settled',
            match_group: 'upcoming',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [player, { ...player, user_id: 'b' }] })
      .mockResolvedValueOnce({ rows: [] });
    const live = await getBarLive({ query } as unknown as Pool, 'tournament', 'match', now);
    expect(live.shots).toEqual([]);
    expect(live.playbackId).toBeNull();
    expect(live.match?.players.map((p) => p.goals)).toEqual([0, 0]);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('keeps the final score when an active duel window ends before settlement runs', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...row,
            status: 'active',
            duel_status: 'active',
            ends_at: new Date(now.getTime() - 1000),
            match_group: 'upcoming',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [player, { ...player, user_id: 'b' }] })
      .mockResolvedValueOnce({ rows: [] });
    const live = await getBarLive({ query } as unknown as Pool, 'duel', 'match', now);
    expect(live.match?.group).toBe('finished');
    expect(live.match?.players.map((p) => p.goals)).toEqual([2, 2]);
    expect(live.complete).toBe(true);
  });
});
