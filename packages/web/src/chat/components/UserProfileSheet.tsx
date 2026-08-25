import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  fetchUserProfile,
  findOrCreateDM,
  type UserPickerItem,
  type UserPublicProfileDTO,
} from '../api.js';
import { fetchAmateurMatches } from '../../api/amateurDuel.js';
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
import { DuelChallengeModal, hasOpenDuelWithUser } from './DuelChallengeModal.js';
import { Sheet } from '../../components/Sheet.js';

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
  const [duelPickerOpen, setDuelPickerOpen] = useState(false);

  useEffect(() => {
    setSelectedAchievement(null);
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
  const { data: myProfile } = useQuery<UserPublicProfileDTO>({
    queryKey: userKeys.profile(meId ?? ''),
    queryFn: () => fetchUserProfile(meId ?? ''),
    enabled: meId !== null,
    staleTime: 60_000,
  });

  const isSelf = sender?.userId === meId;
  const canCurrentUserDuel =
    myProfile?.competitionLevel === 'amateur' || myProfile?.competitionLevel === 'professional';
  const canDuel =
    !isSelf &&
    canCurrentUserDuel &&
    (profile?.competitionLevel === 'amateur' || profile?.competitionLevel === 'professional');
  const openMatchesQuery = useQuery({
    queryKey: ['amateur-duel', 'matches'],
    queryFn: fetchAmateurMatches,
    enabled: canDuel,
    staleTime: 10_000,
  });
  const hasOpenDuel = hasOpenDuelWithUser(openMatchesQuery.data?.matches ?? [], senderId);

  if (!sender) return null;

  const displayName = profile?.displayName ?? sender.displayName;
  const avatarUrl = profile?.avatarUrl ?? sender.avatarUrl;

  return (
    <Sheet
      open
      title="Профиль игрока"
      onRequestClose={() => onClose()}
      maxHeight="80dvh"
      backdropTestId="profile-sheet-backdrop"
      headerAction={
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <X size={14} />
        </button>
      }
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
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
          <>
            {canDuel && (
              <button
                type="button"
                className="btn btn--cta"
                onClick={() => setDuelPickerOpen(true)}
                disabled={hasOpenDuel}
                style={{ marginTop: 14, padding: '14px 0', fontSize: 15, fontWeight: 600 }}
              >
                {hasOpenDuel ? 'Дуэль уже открыта' : 'Вызвать на дуэль'}
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => mutate(sender.userId)}
              disabled={isPending}
              style={{
                marginTop: canDuel ? 8 : 14,
                padding: '14px 0',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {isPending ? 'Открываем чат…' : 'Написать в личку'}
            </button>
          </>
        )}
        {selectedAchievement !== null && (
          <AchievementDetailsSheet
            achievement={selectedAchievement}
            onClose={() => setSelectedAchievement(null)}
          />
        )}
        {duelPickerOpen && (
          <DuelChallengeModal
            opponentUserId={senderId}
            opponentName={displayName}
            onClose={() => setDuelPickerOpen(false)}
            onCreated={() => {
              setDuelPickerOpen(false);
            }}
          />
        )}
      </div>
    </Sheet>
  );
}
