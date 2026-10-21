import { createContext, useContext } from 'react';
export const ChatOverlayContext = createContext(false);
export const useChatOverlayOpen = () => useContext(ChatOverlayContext);
