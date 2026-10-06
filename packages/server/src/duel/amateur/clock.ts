export interface DuelClockParticipant {
  state: string;
  period_started_at: Date | null;
  active_duration_ms: number;
  period_paused_ms?: number;
  period_paused_at?: Date | null;
}
export interface ParticipantClock {
  periodElapsedMs: number;
  totalActiveMs: number;
  remainingMs: number;
  running: boolean;
}
export function getParticipantClock(
  participant: DuelClockParticipant,
  durationMs: number,
  nowMs: number,
  pausedAt: Date | null = participant.period_paused_at ?? null,
): ParticipantClock {
  const active = participant.state === 'period_active' && participant.period_started_at !== null;
  const periodElapsedMs = active
    ? Math.min(
        durationMs,
        Math.max(
          0,
          Math.min(nowMs, pausedAt?.getTime() ?? nowMs) -
            participant.period_started_at!.getTime() -
            Number(participant.period_paused_ms ?? 0),
        ),
      )
    : 0;
  return {
    periodElapsedMs,
    totalActiveMs: Number(participant.active_duration_ms) + periodElapsedMs,
    remainingMs: Math.max(0, durationMs - periodElapsedMs),
    running: active && pausedAt === null && periodElapsedMs < durationMs,
  };
}

export function getEffectivePeriodStart(
  participant: DuelClockParticipant,
  nowMs: number,
): Date | null {
  if (!participant.period_started_at) return null;
  const paused = participant.period_paused_at
    ? Math.max(0, nowMs - participant.period_paused_at.getTime())
    : 0;
  return new Date(
    participant.period_started_at.getTime() + Number(participant.period_paused_ms ?? 0) + paused,
  );
}
