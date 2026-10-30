import { Target } from 'lucide-react';
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
  const exercisesEnabled = import.meta.env.DEV || import.meta.env.VITE_TRAINING_EXERCISES_ENABLED === true;
  const breakRemaining = state.break_ends_at ? Math.max(0, Date.parse(state.break_ends_at) - now) : 0;
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
    {novice && goals !== undefined && target !== undefined && <div>
      <strong className="daily-result-follow-up__heading"><Target aria-hidden="true" />Путь в Любители</strong>
      <div className="daily-result-follow-up__numbers"><span>{Math.min(goals, target)}/{target}</span><span>осталось шайб: {Math.max(0, target - goals)}</span></div>
      <div className="daily-result-follow-up__progress" role="progressbar" aria-label="Путь в Любители" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.max(0, Math.min(goals, target))}>
        <div style={{ width: `${target > 0 ? Math.max(0, Math.min(100, goals / target * 100)) : 0}%` }} />
      </div>
    </div>}
    {state.state === 'break_active' && <p>{seconds > 0
      ? <>Следующий период через: <strong className="daily-result-follow-up__timer">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></>
      : 'Перерыв завершён'}</p>}
    {state.state === 'closed' && <p>На сегодня игра завершена.</p>}
    {novice && exercise && breakRemaining > 0 && state.state === 'break_active' && <div className="daily-result-follow-up__invitation">
      <p>Используй перерыв для тренировки: пройди упражнение «{exercise.title}» и отработай броски перед следующим периодом.</p>
      <button type="button" className="btn btn--cta" style={{ width: '100%', padding: '12px 0', fontSize: 14 }} onClick={() => onOpenCourse(exercise.key)}>Перейти к упражнению</button>
    </div>}
  </section>;
}
