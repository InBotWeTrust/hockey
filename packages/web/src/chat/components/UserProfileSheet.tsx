import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  fetchUserProfile,
  findOrCreateDM,
  type UserPickerItem,
  type UserPublicProfileDTO,
} from '../api.js';
import { chatKeys, userKeys } from '../../lib/queryKeys.js';
import { UserAvatar } from './UserAvatar.js';
import type { ProfileAchievement } from '../../screens/profileTypes.js';
import {
  AchievementDetailsSheet,
  EMPTY_PROFILE_STATS,
  getLevelLabel,
  ProfileAchievementsSection,
  ProfileStatsGrid,
} from '../../screens/profileSections.js';
import { useAuthStore } from '../../auth/authStore.js';

interface UserProfileSheetProps {
  sender: UserPickerItem | null;
  onClose: () => void;
}

export function UserProfileSheet({ sender, onClose }: UserProfileSheetProps): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const senderId = sender?.userId ?? '';
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);

  // Slide-up: render off-screen on first frame, then animate in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setSelectedAchievement(null);
    if (sender) {
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    return undefined;
  }, [sender]);

  const { mutate, isPending } = useMutation({
    mutationFn: (otherUserId: string) => findOrCreateDM(otherUserId),
    onSuccess: ({ chatId, created }) => {
      if (created) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      }
      navigate(`/chat/${chatId}`);
      onClose();
    },
  });

  const { data: profile } = useQuery<UserPublicProfileDTO>({
    queryKey: userKeys.profile(senderId),
    queryFn: () => fetchUserProfile(senderId),
    enabled: senderId.length > 0,
    staleTime: 60_000,
  });

  if (!sender) return null;

  const displayName = profile?.displayName ?? sender.displayName;
  const avatarUrl = profile?.avatarUrl ?? sender.avatarUrl;
  const isSelf = sender.userId === meId;

  return createPortal(
    <div
      data-testid="profile-sheet-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="glass"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '80dvh',
          overflowY: 'auto',
          padding: '16px 16px calc(16px + var(--app-safe-bottom))',
          borderRadius: '24px 24px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'rgba(15,23,42,0.2)',
            margin: '0 auto 14px',
          }}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Закрыть"
          style={{ position: 'absolute', top: 12, right: 12 }}
        >
          <X size={14} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <UserAvatar
            avatarUrl={avatarUrl}
            name={displayName}
            size={88}
            fontSize={32}
            style={{ boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)' }}
          />
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', minWidth: 0 }}>
              {displayName}
            </div>
            {profile && (
              <span className="pill pill--dark">
                <small>Уровень</small> {getLevelLabel(profile.competitionLevel)}
              </span>
            )}
          </div>
        </div>

        <div className="section-label" style={{ margin: '18px 0 6px', padding: '2px 6px' }}>
          Статистика
        </div>
        {profile ? (
          <ProfileStatsGrid stats={profile.stats ?? EMPTY_PROFILE_STATS} columns={2} />
        ) : (
          <div
            className="glass"
            style={{
              minHeight: 74,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              fontSize: 13,
            }}
          >
            Загрузка...
          </div>
        )}

        {profile && (
          <ProfileAchievementsSection
            achievements={profile.achievements ?? []}
            onOpenAchievement={setSelectedAchievement}
            labelStyle={{ margin: '18px 0 6px', padding: '2px 6px' }}
            style={{ margin: 0 }}
          />
        )}

        {isSelf ? (
          <div
            className="btn btn--ghost"
            style={{
              marginTop: 14,
              padding: '14px 0',
              fontSize: 15,
              fontWeight: 600,
              justifyContent: 'center',
            }}
          >
            Это ваш профиль
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--cta"
            onClick={() => mutate(sender.userId)}
            disabled={isPending}
            style={{ marginTop: 14, padding: '14px 0', fontSize: 15, fontWeight: 600 }}
          >
            {isPending ? 'Открываем чат…' : 'Написать в личку'}
          </button>
        )}
        {selectedAchievement !== null && (
          <AchievementDetailsSheet
            achievement={selectedAchievement}
            onClose={() => setSelectedAchievement(null)}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
