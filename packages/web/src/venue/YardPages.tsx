import { Suspense } from 'react';
import { DailyOverviewScreen as DailyOverview } from '../screens/DailyOverviewScreen.js';
import { TrainingOverview } from '../screens/DailyScreen.js';
export function YardPage({ id }: { id: 'daily' | 'open' | 'course' | 'advanced' }) {
  return (
    <Suspense fallback={<p role="status">Загрузка…</p>}>
      {id === 'daily' ? <DailyOverview /> : <TrainingOverview />}
    </Suspense>
  );
}
