import { useState } from 'react';
import { AmateurStoryFlow } from './AmateurStoryFlow.js';
/** Local narrative review uses replay without account or onboarding writes. */
export function AmateurOnboardingPreviewScreen(): JSX.Element {
  const [run, setRun] = useState(0);
  return (
    <div
      style={{
        maxWidth: 430,
        margin: '0 auto',
        height: 'var(--app-viewport-height, 100dvh)',
        transform: 'translateZ(0)',
      }}
    >
      <AmateurStoryFlow
        key={run}
        mode="replay"
        onClose={() => setRun((value) => value + 1)}
        onCompleted={() => setRun((value) => value + 1)}
      />
    </div>
  );
}
