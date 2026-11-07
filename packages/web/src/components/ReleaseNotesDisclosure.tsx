import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function ReleaseNotesDisclosure({ items, initiallyExpanded = false }: {
  items: readonly string[];
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const id = useId();
  const visibleItems = items.length ? items : ['Описание обновления недоступно.'];
  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(value => !value)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          width: '100%', minHeight: 44, padding: '10px 0', border: 0, background: 'transparent',
          color: 'var(--ink)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Что нового
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
      </button>
      {expanded && (
        <div id={id} role="region" aria-label="Что нового" style={{ fontSize: 13, lineHeight: 1.6 }}>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {visibleItems.map((item, index) => <li key={index} style={{ marginBottom: 8, whiteSpace: 'pre-line' }}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
