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

function avatarInitial(name: string | null): string {
  return (name?.trim() || '?').charAt(0).toUpperCase();
}

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
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) / 2)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: 'calc(10px + env(safe-area-inset-top, 0px) / 2) 12px 4px',
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
            {data.avatarUrl ? (
              <img
                src={data.avatarUrl}
                alt=""
                style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                aria-hidden
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                  fontWeight: 800,
                }}
              >
                {avatarInitial(data.displayName)}
              </div>
            )}
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {data.displayName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              В лиге с {formatJoined(data.createdAt)}
            </div>
          </div>

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
        </>
      )}
    </main>
  );
}
