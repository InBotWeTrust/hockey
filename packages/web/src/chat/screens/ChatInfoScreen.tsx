import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { fetchChatInfo, type ChatInfoDTO } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { UserAvatar } from '../components/UserAvatar.js';

function formatMemberCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}

function avatarInitial(name: string | null): string {
  return (name?.trim() || '?').charAt(0).toUpperCase();
}

function chatTitle(info: ChatInfoDTO): string {
  return info.name ?? (info.type === 'system' ? 'Системный канал' : 'Чат');
}

export function ChatInfoScreen(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery<ChatInfoDTO>({
    queryKey: chatKeys.info(chatId),
    queryFn: () => fetchChatInfo(chatId),
    enabled: chatId.length > 0,
    staleTime: 30_000,
  });

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
      <div className="chat-edge-top glass-edge-fade glass-edge-fade--top">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '0 12px',
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
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Информация</div>
        </div>
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
              padding: 16,
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 8,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              {avatarInitial(chatTitle(data))}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
              {chatTitle(data)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formatMemberCount(data.memberCount)}
            </div>
            {data.description && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {data.description}
              </div>
            )}
          </div>

          <div style={{ padding: '4px 14px 0', fontSize: 12, color: 'var(--muted)' }}>
            Участники
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '8px 14px',
            }}
          >
            {data.members.map((m) => (
              <button
                key={m.userId}
                type="button"
                className="glass"
                onClick={() => navigate(`/users/${m.userId}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                }}
              >
                <UserAvatar avatarUrl={m.avatarUrl} name={m.displayName} size={40} />
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {m.displayName}
                </div>
              </button>
            ))}
            {data.memberCount > data.members.length && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  textAlign: 'center',
                  padding: '8px 0',
                }}
              >
                и ещё {data.memberCount - data.members.length}…
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
