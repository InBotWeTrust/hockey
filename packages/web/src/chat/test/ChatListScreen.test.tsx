import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatListScreen } from '../screens/ChatListScreen.js';
import { useAuthStore, type AuthUser } from '../../auth/authStore.js';
import * as api from '../api.js';

function renderScreen(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="/chat" element={<ChatListScreen />} />
          <Route path="/chat/:chatId" element={<div>room</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ChatListScreen — global search dropdown', () => {
  beforeEach(() => {
    const user: AuthUser = {
      id: '00000000-0000-0000-0000-00000000aaaa',
      displayName: 'Me',
      grip: 'right',
    };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    vi.spyOn(api, 'fetchChatList').mockResolvedValue([]);
    vi.spyOn(api, 'searchMessagesApi').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not render the dropdown when filter has fewer than 2 chars', async () => {
    renderScreen();
    const input = await screen.findByLabelText(/Поиск чатов/);
    fireEvent.change(input, { target: { value: 'a' } });
    expect(screen.queryByText('Сообщения')).toBeNull();
    expect(api.searchMessagesApi).not.toHaveBeenCalled();
  });

  it('renders the dropdown when filter reaches 2 chars and debounces /chat/search', async () => {
    renderScreen();
    const input = await screen.findByLabelText(/Поиск чатов/);

    fireEvent.change(input, { target: { value: 'ab' } });
    // Heading mounts synchronously because dropdownOpen is computed from filter (no debounce).
    // Loader spinner with aria-label may be inside the h3, so match by text not by accessible name.
    await waitFor(() => expect(screen.getByText('Сообщения')).toBeInTheDocument());

    // Eventually, after the 300ms debounce, /chat/search fires with the trimmed query.
    await waitFor(
      () => expect(api.searchMessagesApi).toHaveBeenCalledWith('ab', 50),
      { timeout: 1500 },
    );
  });
});
