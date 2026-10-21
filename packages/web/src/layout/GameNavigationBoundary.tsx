import { useContext, type ReactNode } from 'react';
import { UNSAFE_NavigationContext, useLocation, type To } from 'react-router-dom';
import { captureGameReturn, consumeGameReturn } from './gameReturn.js';
import { isGameLocation } from './gameRoutes.js';
import { toLocation } from './ColumnNavigation.js';
import { appSurface } from './appSurface.js';
export function GameNavigationBoundary({
  owner,
  children,
}: {
  owner: string | null;
  children: ReactNode;
}) {
  const outer = useContext(UNSAFE_NavigationContext),
    location = useLocation();
  const navigate = (to: To, state: unknown, replace: boolean) => {
    let next =
      typeof to === 'string'
        ? toLocation(to, location)
        : {
            pathname: to.pathname ?? location.pathname,
            search: to.search ?? '',
            hash: to.hash ?? '',
          };
    if (owner) {
      if (isGameLocation(next) && !isGameLocation(location)) captureGameReturn(owner, location);
      if (
        isGameLocation(location) &&
        !isGameLocation(next) &&
        ['venue', 'panorama'].includes(appSurface(next))
      )
        next = consumeGameReturn(owner) ?? next;
    }
    if (replace) outer.navigator.replace(next, state);
    else outer.navigator.push(next, state);
  };
  return (
    <UNSAFE_NavigationContext.Provider
      value={{
        ...outer,
        navigator: {
          ...outer.navigator,
          push: (to, state) => navigate(to, state, false),
          replace: (to, state) => navigate(to, state, true),
        },
      }}
    >
      {children}
    </UNSAFE_NavigationContext.Provider>
  );
}
