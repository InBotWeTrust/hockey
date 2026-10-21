import { InvitationToast } from './InvitationToast.js';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { acceptAmateurDuel, declineAmateurDuel } from '../api/amateurDuel.js';
import { deriveAmateurAccess, guardAmateurMutation } from '../amateur/amateurAccess.js';
import { useAuthStore } from '../auth/authStore.js';
import type { AmateurDuelInviteMessageMetadata, ChatMessageDTO } from '../chat/api.js';
import {
  DUEL_INVITE_RECEIVED_EVENT,
  type DuelInviteReceivedDetail,
} from '../chat/useChatSocket.js';
import { useDailyStore } from '../stores/dailyStore.js';

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

export function DuelInviteToast({ suppressed = false }: { suppressed?: boolean }): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<DuelInviteToastState | null>(null);
  const competitionLevel = useAuthStore((state) => state.user?.competitionLevel ?? null);
  const dailyData = useDailyStore((state) => state.data);
  const amateurAccess = deriveAmateurAccess({
    competitionLevel,
    qualifyingGoals: dailyData?.lifetime_total_goals,
    unlockGoalsRequired: dailyData?.amateur_unlock_goals_required,
  });

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
    if (!toast || suppressed) return;
    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 15_000);
    return () => window.clearTimeout(timeoutId);
  }, [suppressed, toast]);

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

  if (!toast || suppressed) return null;

  const pending = acceptMut.isPending || declineMut.isPending;
  const name = toast.invite.challengerName || toast.message.senderDisplayName || 'Соперник';

  return (
    <InvitationToast name={`${name} вызывает на дуэль`} avatarUrl={toast.message.senderAvatarUrl} description={toast.invite.templateTitle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              guardAmateurMutation(amateurAccess, () => declineMut.mutate(toast.invite.matchId))
            }
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
            onClick={() =>
              guardAmateurMutation(amateurAccess, () => acceptMut.mutate(toast.invite.matchId))
            }
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
    </InvitationToast>
  );
}
