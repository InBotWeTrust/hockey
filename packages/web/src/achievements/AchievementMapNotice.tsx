import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { acknowledgeAchievementNotifications, fetchAchievementNotifications, type AchievementNotificationsResponse } from '../api/achievements.js';

export function AchievementMapNotice({userId, enabled, onHighlight}: {
  userId: string; enabled: boolean; onHighlight: (value: boolean) => void;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [batch, setBatch] = useState<AchievementNotificationsResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const query = useQuery({queryKey: ['achievement-notifications',userId], queryFn: fetchAchievementNotifications,
    enabled: enabled && Boolean(userId), retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false});
  useEffect(() => {
    if (enabled && !batch && query.data?.notifications?.length) setBatch(query.data);
  }, [enabled, batch, query.data]);
  useEffect(() => {
    if (!enabled || !batch || dismissed) return;
    onHighlight(batch.highlightTasks);
    // Confirm only after the mounted notice has had a visible animation frame.
    let frame = 0;
    let sent = false;
    const confirm = () => {
      if (document.visibilityState !== 'visible' || sent) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (document.visibilityState !== 'visible') return;
          sent = true;
          void acknowledgeAchievementNotifications(batch.notifications.map(item => item.id)).then(() => {
            client.setQueryData(['achievement-notifications',userId], {notifications: [], highlightTasks: false});
          }).catch(() => { /* Unacknowledged items remain durable for the next map visit. */ });
        });
      });
    };
    confirm();
    document.addEventListener('visibilitychange', confirm);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange',confirm); onHighlight(false); };
  }, [enabled,batch,dismissed,onHighlight,client,userId]);
  useEffect(() => {
    if (!enabled || !batch || dismissed) return;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = window.setTimeout(() => setDismissed(true), 5000);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); };
  }, [enabled, batch, dismissed]);
  if (!enabled || !batch || dismissed) return null;
  return createPortal(<AchievementMapToast count={batch.notifications.length} onOpen={() => {setDismissed(true);navigate('/achievements?filter=claimable');}} onDismiss={() => setDismissed(true)}/>, document.body);
}

export function AchievementMapToast({count,onOpen,onDismiss}: {count:number;onOpen:()=>void;onDismiss:()=>void}) {
  return <div role="status" className="duel-challenge-toast achievement-map-notice">
    <button type="button" className="achievement-map-notice__action" onClick={onOpen}>
      Новые достижения – {count}
    </button>
    <button type="button" className="icon-btn" aria-label="Скрыть уведомление о достижениях" onClick={onDismiss}><X aria-hidden="true" size={18}/></button>
  </div>;
}
