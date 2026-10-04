import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { ArsenichDestinationKey } from '../api/arsenich.js';
import { DestinationIntroduction } from './DestinationIntroduction.js';

const INTRODUCTION_DELAY_MS = 1_200;

export function destinationForLocation(
  pathname: string,
  search: string,
): ArsenichDestinationKey | null {
  const view = new URLSearchParams(search).get('view');
  if (pathname === '/') {
    if (view === 'training') return 'training';
    if (view === 'amateur') return 'amateur';
    if (view === 'pro') return null;
    return 'main';
  }
  if (pathname === '/daily') return 'daily';
  if (pathname === '/sections') return 'sections';
  if (pathname === '/achievements' || pathname.startsWith('/achievements/')) return 'tasks';
  if (pathname === '/inventory') return 'shop';
  if (pathname === '/bonus-games') return 'bonus-games';
  if (pathname === '/chat') return 'chat';
  if (pathname === '/profile') return 'profile-main';
  return null;
}

export function DestinationIntroductionGate(): JSX.Element | null {
  const location = useLocation();
  const destination = destinationForLocation(location.pathname, location.search);
  return destination ? (
    <DelayedDestinationIntroduction key={destination} destination={destination} />
  ) : null;
}

function DelayedDestinationIntroduction({
  destination,
}: {
  destination: ArsenichDestinationKey;
}): JSX.Element | null {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReady(true);
    }, INTRODUCTION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return ready ? <DestinationIntroduction destination={destination} /> : null;
}
