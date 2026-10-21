import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ColumnNavigationProvider, type ColumnLocation } from '../../layout/ColumnNavigation.js';
interface Presentation {
  embedded: boolean;
  visible: boolean;
}
const Context = createContext<Presentation>({ embedded: false, visible: true });
export const ChatDraftContext = createContext<{ owner: string | null; chatId: string } | null>(
  null,
);
export function ChatDraftScope({
  owner,
  chatId,
  children,
}: {
  owner: string | null;
  chatId: string;
  children: ReactNode;
}) {
  return (
    <ChatDraftContext.Provider value={{ owner, chatId }}>{children}</ChatDraftContext.Provider>
  );
}
export function useChatPresentation(): Presentation {
  const context = useContext(Context);
  const [foreground, setForeground] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setForeground(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return { ...context, visible: context.visible && foreground };
}
export function ChatPresentationProvider({
  owner,
  location,
  visible,
  onNavigate,
  onOutside,
  children,
}: {
  owner: string;
  location: ColumnLocation;
  visible: boolean;
  onNavigate: (location: ColumnLocation) => void;
  onOutside: (location: ColumnLocation) => void;
  children: ReactNode;
}) {
  return (
    <Context.Provider value={{ embedded: true, visible }}>
      <ColumnNavigationProvider
        pageKey={{ owner, venueId: 'chat', pageId: 'window' }}
        initialLocation={location}
        active
        showBack={false}
        onActivate={(next) =>
          /^\/chat(?:\/|$)/.test(next.pathname) ? onNavigate(next) : onOutside(next)
        }
        onGame={onOutside}
      >
        {children}
      </ColumnNavigationProvider>
    </Context.Provider>
  );
}
