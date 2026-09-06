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
  return (
    <div className="chat-room-header">
      <button
        type="button"
        className="icon-btn glass-dock-icon chat-room-header__control"
        aria-label="К списку чатов"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
      </button>

      {(() => {
        const avatarNode = <UserAvatar avatarUrl={avatarUrl} name={title} size={40} />;
        const titleNode = (
          <div className="chat-room-header__identity">
            <div className="chat-room-header__title">
              {title}
            </div>
            {subtitle && (
              <div className="chat-room-header__subtitle">
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
              aria-label={onTitleClickLabel ?? 'Открыть информацию о чате'}
              className="chat-room-header__profile"
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
        className="icon-btn glass-dock-icon chat-room-header__control"
        aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск по чату'}
        aria-pressed={searchOpen}
        onClick={onToggleSearch}
      >
        {searchOpen ? <X size={16} /> : <Search size={16} />}
      </button>
    </div>
  );
}
