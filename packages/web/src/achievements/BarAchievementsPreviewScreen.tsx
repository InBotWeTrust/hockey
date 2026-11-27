import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { AchievementsScreen } from '../screens/AchievementsScreen.js';
import { createBarPreviewSource } from './barPreviewSource.js';
import type { PreviewLevel } from './barCatalog.js';
import './barPreview.css';
export function BarAchievementsPreviewScreen(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const level: PreviewLevel = params.get('level') === 'amateur' ? 'amateur' : 'beginner';
  const [demo, setDemo] = useState(false);
  const [revision, setRevision] = useState(0);
  const source = useMemo(() => createBarPreviewSource(level, demo), [level, demo, revision]);
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    [source],
  );
  return (
    <div className="bar-preview">
      <header className="bar-preview__controls">
        <div>
          <strong>Локальный просмотр</strong>
          <span>Задания бара · тестовые данные</span>
        </div>
        <SegmentedTabs
          items={[
            { id: 'beginner' as const, label: 'Новичок' },
            { id: 'amateur' as const, label: 'Любитель' },
          ]}
          activeTab={level}
          ariaLabel="Статус игрока"
          onChange={(next) => setParams({ level: next, filter: 'bar' })}
        />
        <div className="bar-preview__scenario">
          <button
            type="button"
            className={'btn ' + (!demo ? 'btn--cta' : 'btn--ghost')}
            onClick={() => setDemo(false)}
          >
            Сначала
          </button>
          <button
            type="button"
            className={'btn ' + (demo ? 'btn--cta' : 'btn--ghost')}
            onClick={() => setDemo(true)}
          >
            Пример прогресса
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setRevision((x) => x + 1)}
          >
            Сбросить
          </button>
        </div>
        <p>Награды здесь меняют только тестовый экран. Реальные аккаунты не затрагиваются.</p>
      </header>
      <QueryClientProvider client={client}>
        <AchievementsScreen key={level + '-' + demo + '-' + revision} dataSource={source} />
      </QueryClientProvider>
    </div>
  );
}
