const keyFor = (owner?: string) => `chat-return-v1:${owner ?? 'anonymous'}`;
export function rememberChatReturn(owner: string | undefined, route: string): void {
  try { sessionStorage.setItem(keyFor(owner), route); } catch { /* Navigation works without storage. */ }
}
export function chatReturnRoute(owner?: string): string {
  try {
    const route=sessionStorage.getItem(keyFor(owner));
    return route?.startsWith('/') && !route.startsWith('//') && !/^\/chat(?:[/?#]|$)/.test(route) ? route : '/sections';
  } catch { return '/sections'; }
}
