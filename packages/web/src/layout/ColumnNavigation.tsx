import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  NavigationType,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  UNSAFE_RouteContext,
  createPath,
  matchPath,
  useLocation,
  useNavigate,
  type To,
} from 'react-router-dom';
import {
  readColumnHistory,
  writeColumnHistory,
  type ColumnKey,
  type ColumnLocation,
} from './columnNavigationStore.js';
export type { ColumnKey, ColumnLocation } from './columnNavigationStore.js';
type Navigate = (location: ColumnLocation, options?: { replace?: boolean }) => void;
interface ColumnNavigation {
  location: ColumnLocation;
  navigate: Navigate;
  back: () => void;
  canGoBack: boolean;
  activate: () => void;
}
const Context = createContext<ColumnNavigation | null>(null);
const same = (a: ColumnLocation, b: ColumnLocation) => createPath(a) === createPath(b);
export function ColumnNavigationProvider({
  pageKey,
  initialLocation,
  active,
  onActivate,
  onGame,
  isGame = () => false,
  children,
}: {
  pageKey: ColumnKey;
  initialLocation: ColumnLocation;
  active: boolean;
  onActivate: Navigate;
  onGame: (location: ColumnLocation) => void;
  isGame?: (location: ColumnLocation) => boolean;
  children: ReactNode;
}) {
  const outer = useContext(UNSAFE_NavigationContext);
  const [history, setHistory] = useState(() => readColumnHistory(pageKey, initialLocation));
  const location = history[history.length - 1]!;
  const initialPath = createPath(initialLocation);
  useEffect(() => {
    if (!active) return;
    setHistory((previous) => {
      if (same(previous[previous.length - 1]!, initialLocation)) return previous;
      const index = previous.findIndex((item) => same(item, initialLocation));
      const next = index < 0 ? [...previous, initialLocation] : previous.slice(0, index + 1);
      writeColumnHistory(pageKey, next);
      return next;
    });
    // Only a changed external location should synchronize this column.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, initialPath]);
  const navigate: Navigate = (next, options = {}) => {
    if (isGame(next)) {
      onGame(next);
      return;
    }
    setHistory((previous) => {
      const updated = options.replace
        ? [...previous.slice(0, -1), next]
        : same(previous[previous.length - 1]!, next)
          ? previous
          : [...previous, next];
      writeColumnHistory(pageKey, updated);
      return updated;
    });
    onActivate(next, { replace: options.replace ?? false });
  };
  const back = () => {
    if (history.length < 2) return;
    const next = history.slice(0, -1);
    writeColumnHistory(pageKey, next);
    setHistory(next);
    onActivate(next[next.length - 1]!, { replace: true });
  };
  const value: ColumnNavigation = {
    location,
    navigate,
    back,
    canGoBack: history.length > 1,
    activate: () => onActivate(location, { replace: true }),
  };
  const navigator = {
    ...outer.navigator,
    push: (to: To) =>
      navigate(
        typeof to === 'string'
          ? toLocation(to, location)
          : {
              pathname: to.pathname ?? location.pathname,
              search: to.search ?? '',
              hash: to.hash ?? '',
            },
      ),
    replace: (to: To) =>
      navigate(
        typeof to === 'string'
          ? toLocation(to, location)
          : {
              pathname: to.pathname ?? location.pathname,
              search: to.search ?? '',
              hash: to.hash ?? '',
            },
        { replace: true },
      ),
    go: (delta: number) => {
      if (delta === -1 && history.length > 1) back();
      else outer.navigator.go(delta);
    },
  };
  const matches = useMemo(
    () => [
      {
        params: matchPath('/chat/:chatId/*', location.pathname)?.params ?? {},
        pathname: location.pathname,
        pathnameBase: location.pathname,
        route: { path: location.pathname },
      },
    ],
    [location.pathname],
  );
  return (
    <Context.Provider value={value}>
      <UNSAFE_NavigationContext.Provider value={{ ...outer, navigator }}>
        <UNSAFE_LocationContext.Provider
          value={{
            location: { ...location, state: null, key: initialPath },
            navigationType: NavigationType.Push,
          }}
        >
          <UNSAFE_RouteContext.Provider value={{ outlet: null, matches, isDataRoute: false }}>
            {children}
          </UNSAFE_RouteContext.Provider>
        </UNSAFE_LocationContext.Provider>
      </UNSAFE_NavigationContext.Provider>
    </Context.Provider>
  );
}
export function toLocation(
  href: string,
  base: ColumnLocation = { pathname: '/', search: '', hash: '' },
): ColumnLocation {
  const url = new URL(href, 'https://hockey.invalid' + createPath(base));
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}
export function useColumnNavigation(): ColumnNavigation {
  const context = useContext(Context),
    location = useLocation(),
    navigate = useNavigate();
  return (
    context ?? {
      location,
      navigate: (next, options) => navigate(next, options),
      back: () => navigate(-1),
      canGoBack: false,
      activate: () => undefined,
    }
  );
}
