import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { CardPlayerName } from './FittedMenuLabel.js';

export function DurakOpponentSeat({
  name,
  avatarUrl,
  count,
  active,
  status,
  description,
  avatarSize = 36,
  showCount = true,
  seatLabel,
  self = false,
  taking = false,
}: {
  name: string;
  avatarUrl: string | null;
  count: number;
  active: boolean;
  status: string;
  description: string;
  avatarSize?: number;
  showCount?: boolean;
  seatLabel?: string;
  self?: boolean;
  taking?: boolean;
}) {
  return (
    <div
      className="durak-multi-seat game-scoreboard game-scoreboard--stable-surface"
      data-active={active}
      data-status={status}
      data-self={self}
      data-taking={taking}
    >
      {seatLabel && <span className="durak-seat-position">{seatLabel}</span>}
      <UserAvatar name={name} avatarUrl={avatarUrl} size={avatarSize} />
      <CardPlayerName name={name} count={showCount ? count : undefined} />
      <span>{description}</span>
    </div>
  );
}
