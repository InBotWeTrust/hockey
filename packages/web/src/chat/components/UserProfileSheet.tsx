import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { findOrCreateDM, type UserPickerItem } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { StatCard } from '../../components/StatCard.js';
import { UserAvatar } from './UserAvatar.js';

interface UserProfileSheetProps {
  sender: UserPickerItem | null;
  onClose: () => void;
}

export function UserProfileSheet({ sender, onClose }: UserProfileSheetProps): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Slide-up: render off-screen on first frame, then animate in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
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

  if (!sender) return null;

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
          padding: '16px 16px calc(16px + var(--app-safe-bottom))',
          borderRadius: '24px 24px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
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
            margin: '0 auto',
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
            avatarUrl={sender.avatarUrl}
            name={sender.displayName}
            size={88}
            fontSize={32}
            style={{ boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)' }}
          />
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', minWidth: 0 }}>
            {sender.displayName}
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 4 }}>
          Статистика
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatCard label="Всего бросков" value="—" />
          <StatCard label="Голов" value="—" />
          <StatCard label="Точность" value="—" />
          <StatCard label="Ранг" value="—" />
        </div>

        <button
          type="button"
          className="btn btn--cta"
          onClick={() => mutate(sender.userId)}
          disabled={isPending}
          style={{ marginTop: 6, padding: '14px 0', fontSize: 15, fontWeight: 600 }}
        >
          {isPending ? 'Открываем чат…' : 'Написать в личку'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
