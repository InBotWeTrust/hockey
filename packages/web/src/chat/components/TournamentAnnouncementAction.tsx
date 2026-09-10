interface TournamentAnnouncementActionValue {
  url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tournamentAnnouncementAction(metadata: unknown): TournamentAnnouncementActionValue | null {
  if (!isRecord(metadata) || metadata.type !== 'tournament_announcement') return null;
  if (!isRecord(metadata.action) || metadata.action.type !== 'tournament') return null;
  if (metadata.action.label !== 'Перейти в турнир' || typeof metadata.action.url !== 'string') {
    return null;
  }
  if (!metadata.action.url.startsWith('/?view=amateur&section=tournaments&tournament=')) {
    return null;
  }
  return { url: metadata.action.url };
}

export function TournamentAnnouncementAction({
  metadata,
}: {
  metadata: unknown;
}): JSX.Element | null {
  const action = tournamentAnnouncementAction(metadata);
  if (action === null) return null;
  return (
    <a className="btn btn--cta tournament-announcement-action" href={action.url}>
      Перейти в турнир
    </a>
  );
}
