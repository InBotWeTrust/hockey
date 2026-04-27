import type { ReactionGroupDTO } from '../api.js';

interface Props {
  reactions: ReactionGroupDTO[];
  onToggle: (emoji: string) => void;
}

export function ReactionBar({ reactions, onToggle }: Props): JSX.Element | null {
  if (reactions.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
      }}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-label={`${r.emoji} ${r.count}`}
          className={r.reactedByMe ? 'pill pill--dark' : 'pill'}
          onClick={() => onToggle(r.emoji)}
          style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 14 }}>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
}
