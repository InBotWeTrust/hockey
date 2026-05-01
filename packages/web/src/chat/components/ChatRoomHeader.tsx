import { ArrowLeft, Search, X } from 'lucide-react';
import { UserAvatar } from './UserAvatar.js';

interface Props {
  title: string;
  subtitle?: string;
  avatarUrl: string | null;
  onBack: () => void;
  // Optional: when provided, the avatar+title cluster becomes a button that
  // navigates to the chat info screen. Skipped for DMs (no info screen yet).
  onTitleClick?: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
}

export function ChatRoomHeader({
  title,
  subtitle,
  avatarUrl,
  onBack,
  onTitleClick,
  searchOpen,
  onToggleSearch,
}: Props): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '10px 12px 0',
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

      {(() => {
        const avatarNode = <UserAvatar avatarUrl={avatarUrl} name={title} size={40} />;
        const titleNode = (
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
            {subtitle && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: '14px',
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        );
        if (onTitleClick) {
          return (
            <button
              type="button"
              onClick={onTitleClick}
              aria-label="Открыть информацию о чате"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 0,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
              }}
            >
              {avatarNode}
              {titleNode}
            </button>
          );
        }
        return (
          <>
            {avatarNode}
            {titleNode}
          </>
        );
      })()}

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
