export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  attention?: boolean;
  attentionSize?: 'default' | 'small';
}

export function SegmentedTabs<T extends string>({
  items,
  activeTab,
  ariaLabel,
  onChange,
  scrollable = false,
  disabled = false,
}: {
  items: Array<SegmentedTabItem<T>>;
  activeTab: T;
  ariaLabel: string;
  onChange: (tab: T) => void;
  scrollable?: boolean;
  disabled?: boolean;
}): JSX.Element {
  const isCompact = items.length >= 4;
  const columns = isCompact
    ? items.map((item) => `${Math.min(1.35, Math.max(0.78, item.label.length / 7))}fr`).join(' ')
    : `repeat(${items.length}, minmax(0, 1fr))`;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`segmented-tabs${isCompact ? ' segmented-tabs--compact' : ''}${scrollable ? ' segmented-tabs--scrollable' : ''}`}
      style={scrollable ? undefined : { gridTemplateColumns: columns }}
    >
      {items.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => {
              if (active) return;
              onChange(tab.id);
            }}
            className={
              active ? 'segmented-tabs__item segmented-tabs__item--active' : 'segmented-tabs__item'
            }
          >
            {tab.label}
            {tab.attention && (
              <span
                aria-label="Требуется действие"
                aria-hidden={tab.attentionSize === 'small' ? true : undefined}
                className={`segmented-tabs__attention${
                  tab.attentionSize === 'small' ? ' segmented-tabs__attention--small' : ''
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
