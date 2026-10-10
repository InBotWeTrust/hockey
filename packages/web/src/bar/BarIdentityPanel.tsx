import { useState } from 'react';
import { X } from 'lucide-react';
import { isBarAssetPath, type BarProfile, type BarAction } from '@hockey/game-core';
import { AccessibleModal } from '../components/AccessibleModal.js';
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
  const [details, setDetails] = useState(false);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  return (
    <>
      <button
        className="bar-identity"
        onClick={() => setDetails(true)}
        aria-label={`О персонаже: ${profile.name}`}
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
      {details && (
        <AccessibleModal
          title={profile.name}
          onClose={() => setDetails(false)}
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" onClick={() => setDetails(false)}>
              <X size={16} />
            </button>
          }
        >
          {profile.role && <p className="modal-copy">{profile.role}</p>}
          <p className="modal-copy">
            {profile.description || 'Больше о персонаже расскажем позже.'}
          </p>
        </AccessibleModal>
      )}
    </>
  );
}
