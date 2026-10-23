import { afterEach, expect, it, vi } from 'vitest';
import { chatResumeRoute, rememberChatScreen } from './chatResume.js';
afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
it('isolates accounts and retains the dialog when opening its info or comments', () => {
  rememberChatScreen('one', '/chat/dialog-123');
  expect(chatResumeRoute('one')).toBe('/chat/dialog-123');
  expect(chatResumeRoute('two')).toBe('/chat');
  rememberChatScreen('one', '/chat/dialog-123/info');
  expect(chatResumeRoute('one')).toBe('/chat/dialog-123');
  rememberChatScreen('one', '/chat/dialog-123/posts/post-456/comments');
  expect(chatResumeRoute('one')).toBe('/chat/dialog-123');
  rememberChatScreen('one', '/chat/new');
  expect(chatResumeRoute('one')).toBe('/chat/dialog-123');
  rememberChatScreen('one', '/chat');
  expect(chatResumeRoute('one')).toBe('/chat');
});
it('rejects invalid saved routes and works when browser storage is blocked', () => {
  for (const value of ['https://example.com', '//example.com', '/inventory', '/chat?new=1']) {
    sessionStorage.setItem('chat-resume-v1:one', value);
    expect(chatResumeRoute('one')).toBe('/chat');
  }
  vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => rememberChatScreen('one', '/chat/dialog')).not.toThrow();
  expect(chatResumeRoute('one')).toBe('/chat');
});
