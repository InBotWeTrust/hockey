import { ArrowLeft, Search, X } from 'lucide-react';
import { UserAvatar } from './UserAvatar.js';

interface Props {
  title: string;
  subtitle?: string;
  avatarUrl: string | null;
  onBack: () => void;
  // Optional: when provided, the avatar+title cluster becomes a button.
  // Group/system/channel chats use it for chat info, DMs use it for counterpart profile.
  onTitleClick?: () => void;
  onTitleClickLabel?: string;
  searchOpen: boolean;
  onToggleSearch: () => void;
}

export function ChatRoomHeader({
  title,
  subtitle,
  avatarUrl,
  onBack,
  onTitleClick,
  onTitleClickLabel,
  searchOpen,
  onToggleSearch,
}: Props): JSX.Element {
  const identity = (
    <div className="chat-room-header__identity">
      <span className="chat-room-header__avatar">
        <UserAvatar avatarUrl={avatarUrl} name={title} size={38} />
      </span>
      <span className="chat-room-header__copy">
        <span className="chat-room-header__title">{title}</span>
        {subtitle && <span className="chat-room-header__subtitle">{subtitle}</span>}
      </span>
    </div>
  );

  return (
    <div className="chat-room-header">
      <button
        type="button"
        className="icon-btn glass-dock-icon chat-room-header__control chat-room-header__control--surface"
        aria-label="К списку чатов"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
      </button>

      {onTitleClick ? (
        <button
          type="button"
          onClick={onTitleClick}
          aria-label={onTitleClickLabel ?? 'Открыть информацию о чате'}
          className="chat-room-header__profile"
        >
          {identity}
        </button>
      ) : (
        identity
      )}

      <button
        type="button"
        className="icon-btn glass-dock-icon chat-room-header__control chat-room-header__control--surface"
        aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск по чату'}
        aria-pressed={searchOpen}
        onClick={onToggleSearch}
      >
        {searchOpen ? <X size={16} /> : <Search size={16} />}
      </button>
    </div>
  );
}
