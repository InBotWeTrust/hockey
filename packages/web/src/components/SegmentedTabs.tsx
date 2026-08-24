export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  attention?: boolean;
}

export function SegmentedTabs<T extends string>({
  items,
  activeTab,
  ariaLabel,
  onChange,
}: {
  items: Array<SegmentedTabItem<T>>;
  activeTab: T;
  ariaLabel: string;
  onChange: (tab: T) => void;
}): JSX.Element {
  const isCompact = items.length >= 4;
  const columns = isCompact
    ? items.map((item) => `${Math.min(1.35, Math.max(0.78, item.label.length / 7))}fr`).join(' ')
    : `repeat(${items.length}, minmax(0, 1fr))`;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`segmented-tabs${isCompact ? ' segmented-tabs--compact' : ''}`}
      style={{ gridTemplateColumns: columns }}
    >
      {items.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (active) return;
              triggerHaptic('selection');
              onChange(tab.id);
            }}
            className={active ? 'segmented-tabs__item segmented-tabs__item--active' : 'segmented-tabs__item'}
          >
            {tab.label}
            {tab.attention && (
              <span
                aria-label="Требуется действие"
                className="segmented-tabs__attention"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
import { triggerHaptic } from '../feedback/haptics.js';
