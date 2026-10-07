import { ClassicSections } from '../components/ClassicSections.js';
import { SectionsView } from '../components/SectionsView.js';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CityMap } from '../components/CityMap.js';
import '../app/global.css';
import '../app/design-system.css';
// Isolated visual preview with synthetic data; no authenticated application state.
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <div style={{ height: '100dvh', maxWidth: 430, margin: '0 auto' }}>
      <SectionsView
        initialMap
        map={
          <CityMap
            amateur
            onNavigate={(path) => window.location.assign(path)}
            dailyMeta="30/90"
            trainingMeta="0/100"
            tasksMeta="Награды: 10/52 · Уровни: 86/273"
            bonusMeta="Пройдено: 27/50"
            attention={false}
          />
        }
        cards={
          <ClassicSections
            dailyMeta="30/90"
            trainingMeta="0/100 бросков"
            achievementsMeta={['Награды: 10/52', 'Уровни: 86/273']}
            sectionTasksActionCount={0}
            bonusGamesMeta="Пройдено: 27/50"
            isAmateurUnlocked
            amateurGoalsRemaining={0}
            navigate={(path) => window.location.assign(path)}
          />
        }
      />
    </div>
  </MemoryRouter>,
);
