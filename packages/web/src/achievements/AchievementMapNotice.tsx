import { useEffect, useState } from 'react';
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
  if (!enabled || !batch || dismissed) return null;
  return <div role="status" className="achievement-map-notice">
    <button className="btn btn--ghost" onClick={() => {setDismissed(true);navigate('/achievements?filter=claimable');}}>
      Новые достижения — {batch.notifications.length}
    </button>
    <button className="icon-btn" aria-label="Скрыть уведомление о достижениях" onClick={() => setDismissed(true)}><X aria-hidden="true" size={16}/></button>
  </div>;
}
