import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { acceptAmateurDuel, declineAmateurDuel } from '../api/amateurDuel.js';
import type { AmateurDuelInviteMessageMetadata, ChatMessageDTO } from '../chat/api.js';
import {
  DUEL_INVITE_RECEIVED_EVENT,
  type DuelInviteReceivedDetail,
} from '../chat/useChatSocket.js';

interface DuelInviteToastState {
  chatId: string;
  message: ChatMessageDTO;
  invite: AmateurDuelInviteMessageMetadata;
}

function parseInvite(message: ChatMessageDTO): AmateurDuelInviteMessageMetadata | null {
  const metadata = message.metadata;
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    metadata.type !== 'amateur_duel_invite' ||
    typeof metadata.matchId !== 'string'
  ) {
    return null;
  }
  return metadata as AmateurDuelInviteMessageMetadata;
}

export function DuelInviteToast(): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<DuelInviteToastState | null>(null);

  useEffect(() => {
    const onInvite = (event: Event): void => {
      const detail = (event as CustomEvent<DuelInviteReceivedDetail>).detail;
      const invite = parseInvite(detail.message);
      if (!invite) return;
      setToast({ chatId: detail.chatId, message: detail.message, invite });
    };
    window.addEventListener(DUEL_INVITE_RECEIVED_EVENT, onInvite);
    return () => window.removeEventListener(DUEL_INVITE_RECEIVED_EVENT, onInvite);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 15_000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const acceptMut = useMutation({
    mutationFn: (matchId: string) => acceptAmateurDuel(matchId),
    onSuccess: (_res, matchId) => {
      setToast(null);
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      navigate(`/?view=amateur&match=${encodeURIComponent(matchId)}&play=1`);
    },
    onError: () => {
      setToast(null);
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  const declineMut = useMutation({
    mutationFn: (matchId: string) => declineAmateurDuel(matchId),
    onSuccess: () => {
      setToast(null);
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
    onError: () => {
      setToast(null);
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
    },
  });

  if (!toast) return null;

  const pending = acceptMut.isPending || declineMut.isPending;
  const name = toast.invite.challengerName || toast.message.senderDisplayName || 'Соперник';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(402px, calc(100vw - 24px))',
        zIndex: 700,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="glass"
        style={{
          borderRadius: 22,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 10,
          boxShadow: '0 18px 44px rgba(15, 23, 42, 0.22)',
          border: '1px solid rgba(255,255,255,0.82)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>
            {name} вызывает на дуэль
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 760, marginTop: 2 }}>
            {toast.invite.templateTitle}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => declineMut.mutate(toast.invite.matchId)}
            style={{
              minHeight: 38,
              fontSize: 12,
              background: '#dc2626',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.72)',
              boxShadow: '0 8px 20px rgba(220, 38, 38, 0.22)',
              opacity: pending ? 0.68 : 1,
            }}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => acceptMut.mutate(toast.invite.matchId)}
            style={{
              minHeight: 38,
              fontSize: 12,
              background: '#16a34a',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.72)',
              boxShadow: '0 8px 20px rgba(22, 163, 74, 0.22)',
              opacity: pending ? 0.68 : 1,
            }}
          >
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}
