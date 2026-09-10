import { useState } from 'react';

interface UserAvatarProps {
  avatarUrl: string | null | undefined;
  name: string | null | undefined;
  size: number;
  /** Override font-size for the initial letter. Defaults to size * 0.4. */
  fontSize?: number;
  alt?: string;
  style?: React.CSSProperties;
}

export function UserAvatar({
  avatarUrl,
  name,
  size,
  fontSize,
  alt = '',
  style,
}: UserAvatarProps): JSX.Element {
  const [imgError, setImgError] = useState(false);
  const initial = (name?.trim() || '?').charAt(0).toUpperCase();
  const fs = fontSize ?? Math.round(size * 0.4);

  return (
    <div
      aria-hidden={!avatarUrl || imgError || !alt ? true : undefined}
      className="user-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fs,
        fontWeight: 800,
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <span className="user-avatar__initial" data-initial={initial} aria-hidden />
      {avatarUrl && !imgError && (
        <img
          src={avatarUrl}
          alt={alt}
          onError={() => setImgError(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      )}
    </div>
  );
}
