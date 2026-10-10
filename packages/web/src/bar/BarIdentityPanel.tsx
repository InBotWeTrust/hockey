import { useState } from 'react';
import { ChevronUp, ChevronRight } from 'lucide-react';
import { isBarAssetPath, type BarProfile, type BarAction } from '@hockey/game-core';
export function BarIdentityPanel({
  profile,
  actions,
  onAction,
  onTalk,
  conversationStarted = false,
}: {
  profile: BarProfile;
  actions: BarAction[];
  onAction: (action: BarAction) => void;
  onTalk?: () => void;
  conversationStarted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  return (
    <>
      <div className="bar-identity-row">
      <button
        className="bar-identity"
        onClick={() => setExpanded(v => !v)}
        aria-label={`О персонаже: ${profile.name}`}
        aria-expanded={expanded}
      >
        <span className="bar-identity__avatar">
          {isBarAssetPath(profile.avatar) && failedAvatar !== profile.avatar ? (
            <img src={profile.avatar} alt="" onError={() => setFailedAvatar(profile.avatar)} />
          ) : (
            profile.name.slice(0, 1)
          )}
        </span>
        <span className="bar-identity__text">
          <span className="bar-identity__name" role="heading" aria-level={2}>
            {profile.name}
          </span>
          {profile.role && <span className="bar-identity__role">{profile.role}</span>}
        </span>
      </button>
      <button className="bar-identity__toggle" aria-label={expanded ? "Скрыть действия" : "Показать действия"} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        {expanded ? <ChevronUp size={18} /> : <ChevronRight size={18} />}
      </button>
      </div>
      {expanded && <div className="bar-identity__expanded">
      {profile.description && <p className="bar-identity__description">{profile.description}</p>}
      {(actions.length > 0 || onTalk) && (
        <div className="bar-identity__actions">
          {onTalk && (
            <button className="btn btn--cta" onClick={onTalk}>
              {conversationStarted ? 'Продолжить разговор' : 'Поговорить'}
            </button>
          )}
          {actions.map((action) => (
            <button key={action} className="btn btn--cta" onClick={() => onAction(action)}>
              {action === 'cards'
                ? 'Сыграть в карты'
                : action === 'online'
                  ? 'Найти соперников'
                  : 'Смотреть трансляции'}
            </button>
          ))}
        </div>
      )}
      </div>}

    </>
  );
}
