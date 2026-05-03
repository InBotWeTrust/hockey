import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import {
  fetchUserProfile,
  findOrCreateDM,
  type UserPublicProfileDTO,
  type FindOrCreateDMResult,
} from '../api.js';
import { userKeys } from '../../lib/queryKeys.js';
import { useAuthStore } from '../../auth/authStore.js';
import { formatLastSeen } from '../lastSeen.js';
import { UserAvatar } from '../components/UserAvatar.js';
import type { ProfileAchievement } from '../../screens/profileTypes.js';
import {
  AchievementDetailsSheet,
  EMPTY_PROFILE_STATS,
  getLevelLabel,
  ProfileAchievementsSection,
  ProfileStatsGrid,
} from '../../screens/profileSections.js';

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function UserProfileScreen(): JSX.Element {
  const params = useParams<{ userId: string }>();
  const userId = params.userId ?? '';
  const navigate = useNavigate();
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<UserPublicProfileDTO>({
    queryKey: userKeys.profile(userId),
    queryFn: () => fetchUserProfile(userId),
    enabled: userId.length > 0,
    staleTime: 60_000,
  });

  const dmMut = useMutation<FindOrCreateDMResult, Error, string>({
    mutationFn: (otherUserId) => findOrCreateDM(otherUserId),
    onSuccess: (res) => {
      navigate(`/chat/${res.chatId}`);
    },
  });

  const isSelf = meId !== null && data?.id === meId;

  return (
    <main
      className="screen"
      style={{
        height: '100%',
        minHeight: 0,
        paddingTop: 'var(--app-safe-top)',
        paddingBottom: 24,
        overflowY: 'auto',
        overscrollBehaviorY: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: '10px 12px 4px',
        }}
      >
        <button
          type="button"
          className="icon-btn glass"
          aria-label="Назад"
          onClick={() => navigate(-1)}
          style={{
            width: 40,
            height: 40,
            minWidth: 40,
            minHeight: 40,
            borderRadius: 999,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Профиль</div>
      </div>

      {isLoading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Загрузка...
        </div>
      )}
      {isError && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
            Не удалось загрузить
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      )}

      {data && (
        <>
          <div
            className="glass"
            style={{
              margin: '12px 14px',
              padding: 20,
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 10,
            }}
          >
            <UserAvatar
              avatarUrl={data.avatarUrl}
              name={data.displayName}
              size={96}
              fontSize={36}
            />
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {data.displayName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              В лиге с {formatJoined(data.createdAt)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formatLastSeen(data.lastSeenAt)}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 2 }}>
              <span className="pill pill--dark">
                <small>Уровень</small> {getLevelLabel(data.competitionLevel)}
              </span>
            </div>
          </div>

          <div className="section-label" style={{ marginBottom: 6 }}>
            Статистика
          </div>
          <ProfileStatsGrid
            stats={data.stats ?? EMPTY_PROFILE_STATS}
            style={{ margin: '0 14px 14px' }}
          />

          <ProfileAchievementsSection
            achievements={data.achievements ?? []}
            onOpenAchievement={setSelectedAchievement}
          />

          {!isSelf && (
            <div style={{ padding: '4px 14px 0' }}>
              <button
                type="button"
                className="btn btn--cta"
                disabled={dmMut.isPending}
                onClick={() => dmMut.mutate(data.id)}
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 14,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                <MessageSquare size={16} />
                {dmMut.isPending ? 'Открываем…' : 'Написать сообщение'}
              </button>
            </div>
          )}
          {selectedAchievement !== null && (
            <AchievementDetailsSheet
              achievement={selectedAchievement}
              onClose={() => setSelectedAchievement(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
