import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';

export function NoviceResultProgress({goals,target,periodGoals}: {
  goals: number; target: number; periodGoals: number;
}) {
  const end = Math.max(0, Math.min(goals,target));
  const start = Math.max(0, Math.min(target,goals-Math.max(0,periodGoals)));
  const [value,setValue] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? end : start);
  const [settled,setSettled] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let delay = 0;
    const finish = () => {
      window.clearTimeout(delay);
      cancelAnimationFrame(frame);
      setValue(end);
      setSettled(false);
    };
    const onPreferenceChange = () => { if (preference?.matches) finish(); };
    setSettled(false);
    if (preference?.matches || start === end) {
      setValue(end);
      return;
    }
    setValue(start);
    delay = window.setTimeout(() => {
      let beganAt: number | undefined;
      const tick = (timestamp: number) => {
        beganAt ??= timestamp;
        const fraction = Math.max(0,Math.min(1,(timestamp-beganAt)/700));
        const eased = 1-Math.pow(1-fraction,3);
        setValue(start+(end-start)*eased);
        if (fraction < 1) frame = requestAnimationFrame(tick);
        else setSettled(true);
      };
      frame = requestAnimationFrame(tick);
    },200);
    preference?.addEventListener('change',onPreferenceChange);
    return () => {
      window.clearTimeout(delay);
      cancelAnimationFrame(frame);
      preference?.removeEventListener('change',onPreferenceChange);
    };
  },[start,end]);
  const count = Math.round(value);
  return <div>
    <strong className="daily-result-follow-up__heading"><Target aria-hidden="true"/>Путь в Любители</strong>
    <div className="daily-result-follow-up__numbers"><span>{count}/{target}</span><span>осталось шайб: {Math.max(0,target-count)}</span></div>
    <div className={`daily-result-follow-up__progress novice-result-progress${settled ? ' novice-result-progress--settled' : ''}`} role="progressbar" aria-label="Путь в Любители" aria-valuemin={0} aria-valuemax={target} aria-valuenow={end}>
      <div style={{width:`${target > 0 ? value/target*100 : 0}%`}}/>
    </div>
  </div>;
}
