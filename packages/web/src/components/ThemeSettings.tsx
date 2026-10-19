import './theme-settings.css';
import { setTheme, useThemePreference } from '../app/theme.js';
import { SegmentedTabs } from './SegmentedTabs.js';

export function ThemeSettings(): JSX.Element {
  const theme = useThemePreference();
  const description = {
    auto: 'Днём светлая, с 22:00 до 08:00 тёмная.',
    light: 'Светлая тема в любое время суток.',
    dark: 'Тёмная тема в любое время суток.',
  }[theme];
  return (
    <section className="profile-theme-section" aria-label="Тема приложения">
      <div className="section-label">Тема приложения</div>
      <div className="glass profile-theme-settings">
        <SegmentedTabs
          items={[
            { id: 'auto', label: 'Автоматически' },
            { id: 'light', label: 'Светлая' },
            { id: 'dark', label: 'Тёмная' },
          ]}
          activeTab={theme}
          ariaLabel="Выбор темы"
          onChange={setTheme}
        />
        <p title={theme === 'auto' ? 'По местному времени устройства' : undefined}>{description}</p>
      </div>
    </section>
  );
}
