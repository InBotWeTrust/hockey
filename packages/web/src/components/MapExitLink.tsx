import type { ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

export function MapExitLink({ className, children }: { className: string; children: ReactNode }) {
  const routed = useInRouterContext();
  const props = { className, 'aria-label': 'На карту', title: 'На карту', children };
  return routed ? <Link {...props} to="/sections" /> : <a {...props} href="/sections" />;
}
