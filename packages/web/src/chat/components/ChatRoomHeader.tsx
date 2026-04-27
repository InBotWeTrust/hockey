import { ArrowLeft, Search, X } from 'lucide-react';

interface Props {
  title: string;
  avatarUrl: string | null;
  onBack: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
}

function avatarInitial(title: string): string {
  return (title.trim() || '?').charAt(0).toUpperCase();
}

export function ChatRoomHeader({
  title,
  avatarUrl,
  onBack,
  searchOpen,
  onToggleSearch,
}: Props): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: 'calc(10px + env(safe-area-inset-top, 0px) / 2) 12px 0',
      }}
    >
      <button
        type="button"
        className="icon-btn glass"
        aria-label="К списку чатов"
        onClick={onBack}
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

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {avatarInitial(title)}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '18px',
          }}
        >
          {title}
        </div>
      </div>

      <button
        type="button"
        className="icon-btn glass"
        aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск по чату'}
        aria-pressed={searchOpen}
        onClick={onToggleSearch}
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
        {searchOpen ? <X size={16} /> : <Search size={16} />}
      </button>
    </div>
  );
}
