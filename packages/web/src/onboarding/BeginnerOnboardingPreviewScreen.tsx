import { useState } from 'react';
import { BeginnerStoryFlow } from './BeginnerStoryFlow.js';
import './onboarding.css';

/** Local artwork review uses the existing replay adapter without account writes. */
export function BeginnerOnboardingPreviewScreen(): JSX.Element {
  const [run, setRun] = useState(0);
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', height: 'var(--app-viewport-height, 100dvh)', transform: 'translateZ(0)' }}>
      <BeginnerStoryFlow
        key={run}
        mode="replay"
        unlockGoalsRequired={100}
        onCompleted={() => setRun((value) => value + 1)}
        onClose={() => setRun((value) => value + 1)}
      />
    </div>
  );
}
