import { useEffect, useMemo, useState } from 'react';
import { NovicePushPrompt } from './NovicePushPrompt.js';
import { NoviceResultProgress } from './NoviceResultProgress.js';
import { useQuery } from '@tanstack/react-query';
import type { DailyStateResponse } from '../api/duel.js';
import { claimInitialTrainingInvitation, type InitialTrainingExerciseKey } from '../api/initialTraining.js';

export function DailyResultFollowUp({ state, userId, novice, now, onOpenCourse }: {
  state: DailyStateResponse;
  userId: string;
  novice: boolean;
  now: number;
  onOpenCourse: (key: InitialTrainingExerciseKey) => void;
}) {
  // The parent rink intentionally keeps its active-period snapshot until this
  // result is dismissed. Its wall-clock state may therefore be stale here.
  const clock = useMemo(() => {
    const serverTime = Date.parse(state.server_now);
    return { server: Number.isFinite(serverTime) ? serverTime : now,
      received: state.received_at_performance_ms ?? performance.now() };
  }, [state]);
  const [tick, setTick] = useState(() => performance.now());
  useEffect(() => {
    setTick(performance.now());
    if (state.state !== 'break_active') return;
    const timer = window.setInterval(() => setTick(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, [state]);
  const currentServerTime = clock.server + Math.max(0, tick - clock.received);
  const exercisesEnabled = import.meta.env.DEV || import.meta.env.VITE_TRAINING_EXERCISES_ENABLED === true;
  const breakRemaining = state.break_ends_at ? Math.max(0, Date.parse(state.break_ends_at) - currentServerTime) : 0;
  const invitation = useQuery({
    queryKey: ['training', 'initial-invitation', userId, state.recent_periods.at(-1)?.ended_at],
    queryFn: claimInitialTrainingInvitation,
    enabled: Boolean(userId) && novice && exercisesEnabled && state.state === 'break_active' && breakRemaining > 0,
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const goals = state.amateur_qualifying_goals;
  const target = state.amateur_unlock_goals_required;
  const seconds = Math.ceil(breakRemaining / 1000);
  const exercise = invitation.data?.exercise;
  return <section className="daily-result-follow-up" aria-label="Что дальше">
    {novice && goals !== undefined && target !== undefined && <NoviceResultProgress
      key={state.recent_periods.at(-1)?.ended_at ?? 'result'}
      goals={goals} target={target} periodGoals={state.recent_periods.at(-1)?.goals ?? 0}
    />}
    {state.state === 'break_active' && <p>{seconds > 0
      ? <>Следующий период через: <strong className="daily-result-follow-up__timer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></>
      : 'Перерыв завершён'}</p>}
    {novice && state.state === 'break_active' && breakRemaining > 0 && state.recent_periods.at(-1)?.period_number === 1 && <NovicePushPrompt userId={userId}/>}
    {state.state === 'closed' && <p>На сегодня игра завершена.</p>}
    {novice && exercise && breakRemaining > 0 && state.state === 'break_active' && <div className="daily-result-follow-up__invitation">
      <p>Используй перерыв для тренировки: пройди упражнение «{exercise.title}» и отработай броски перед следующим периодом.</p>
      <button type="button" className="btn btn--cta" style={{ width: '100%', padding: '12px 0', fontSize: 14 }} onClick={() => onOpenCourse(exercise.key)}>Перейти к упражнению</button>
    </div>}
  </section>;
}
