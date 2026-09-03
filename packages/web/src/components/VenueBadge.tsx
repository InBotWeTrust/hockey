export type VenueRole = 'home' | 'away' | 'neutral';

const VENUE_LABELS: Record<VenueRole, string> = {
  home: 'Дома',
  away: 'В гостях',
  neutral: 'Нейтральное поле',
};

export function venueRoleLabel(role: VenueRole): string {
  return VENUE_LABELS[role];
}

export function VenueBadge({
  role,
  tone = 'light',
}: {
  role: VenueRole;
  tone?: 'light' | 'dark';
}): JSX.Element {
  const label = venueRoleLabel(role);
  return (
    <span
      className={`venue-badge venue-badge--${role}${tone === 'dark' ? ' venue-badge--dark' : ''}`}
      aria-label={`Площадка: ${label}`}
    >
      {label}
    </span>
  );
}
