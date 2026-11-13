import { useState } from 'react';

/** Preview-only appearance control; does not change account preferences. */
export function LocalPreviewThemeSwitch(): JSX.Element {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const choose = (next: 'light' | 'dark'): void => {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    const url = new URL(window.location.href);
    url.searchParams.set('theme', next);
    window.history.replaceState(window.history.state, '', url);
    setTheme(next);
  };
  return (
    <div
      role="group"
      aria-label="Тема локального просмотра"
      style={{
        height: 36,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '3px 8px',
        background: '#292d2b',
        color: '#fff',
        fontSize: 11,
      }}
    >
      <span>Локальный просмотр</span>
      {(['light', 'dark'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => choose(value)}
          style={{
            border: '1px solid #ffffff40',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
            background: theme === value ? '#f3f4ec' : 'transparent',
            color: theme === value ? '#24332b' : '#fff',
          }}
        >
          {value === 'light' ? 'Светлая' : 'Тёмная'}
        </button>
      ))}
    </div>
  );
}
