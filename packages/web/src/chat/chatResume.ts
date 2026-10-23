const keyFor = (owner?: string) => `chat-resume-v1:${owner ?? 'anonymous'}`;
function resumeRoute(pathname: string): string | null {
  if (pathname === '/chat') return pathname;
  const match = /^\/chat\/([a-zA-Z0-9_-]+)(?:\/info|\/posts\/[a-zA-Z0-9_-]+\/comments)?$/.exec(pathname);
  return match && match[1] !== 'new' ? `/chat/${match[1]}` : null;
}
export function rememberChatScreen(owner: string | undefined, pathname: string): void {
  const route = resumeRoute(pathname);
  if (!route) return;
  try { sessionStorage.setItem(keyFor(owner), route); } catch { /* Chat works without persistence. */ }
}
export function chatResumeRoute(owner?: string): string {
  try { return resumeRoute(sessionStorage.getItem(keyFor(owner)) ?? '') ?? '/chat'; }
  catch { return '/chat'; }
}
