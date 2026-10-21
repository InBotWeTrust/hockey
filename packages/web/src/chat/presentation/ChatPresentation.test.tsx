import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useParams } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatPresentationProvider, useChatPresentation } from './ChatPresentationContext.js';
import { useChatDraftStore } from './chatDraftStore.js';
function Room() {
  const location = useLocation(),
    navigate = useNavigate(),
    { chatId, postId } = useParams(),
    { visible } = useChatPresentation();
  return (
    <>
      <output>{location.pathname}</output>
      <span>
        {chatId}:{postId}
      </span>
      <span>{visible ? 'visible' : 'hidden'}</span>
      <button onClick={() => navigate('/chat/b')}>Open</button>
    </>
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  useChatDraftStore.getState().clear();
});
it('scopes chat routes and parameters without replacing the main route', () => {
  const change = vi.fn();
  render(
    <MemoryRouter initialEntries={['/daily']}>
      <ChatPresentationProvider
        owner="a"
        location={{ pathname: '/chat/a/posts/p/comments', search: '', hash: '' }}
        visible={false}
        onNavigate={change}
        onOutside={vi.fn()}
      >
        <Room />
      </ChatPresentationProvider>
    </MemoryRouter>,
  );
  expect(screen.getByText('a:p')).toBeVisible();
  expect(screen.getByText('hidden')).toBeVisible();
  fireEvent.click(screen.getByText('Open'));
  expect(change).toHaveBeenCalledWith({ pathname: '/chat/b', search: '', hash: '' });
});
it('does not expose an open dialog as visible while the browser tab is hidden', () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  render(
    <MemoryRouter>
      <ChatPresentationProvider
        owner="a"
        location={{ pathname: '/chat/a', search: '', hash: '' }}
        visible
        onNavigate={vi.fn()}
        onOutside={vi.fn()}
      >
        <Room />
      </ChatPresentationProvider>
    </MemoryRouter>,
  );
  expect(screen.getByText('hidden')).toBeVisible();
});
it('keeps drafts in memory and clears them on an account transition', () => {
  const store = useChatDraftStore.getState();
  store.set('a', 'chat', 'draft');
  expect(useChatDraftStore.getState().read('a', 'chat')).toBe('draft');
  store.switchOwner('b');
  expect(useChatDraftStore.getState().read('b', 'chat')).toBe('');
  expect(useChatDraftStore.getState().read('a', 'chat')).toBe('');
});
