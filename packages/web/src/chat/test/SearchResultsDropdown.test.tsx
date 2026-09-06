import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { SearchResultsDropdown } from '../components/SearchResultsDropdown.js';
import type { ChatDTO } from '../api.js';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const apiFetchMock = vi.fn();
vi.mock('../../api/apiFetch.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

function makeChat(name: string, id = 'chat-1'): ChatDTO {
  return {
    id,
    type: 'group',
    name,
    entityType: null,
    entityId: null,
    lastMessageAt: null,
    unreadCount: 0,
    lastMessage: null,
    lastMessageSenderName: null,
    dmCounterpart: null,
    memberCount: 0,
    pinnedAt: null,
  };
}

function makeDirectChat(name: string, avatarUrl: string): ChatDTO {
  return {
    ...makeChat(name),
    type: 'direct',
    name: null,
    dmCounterpart: {
      userId: 'user-1',
      displayName: name,
      avatarUrl,
      lastSeenAt: null,
      lastReadAt: null,
    },
  };
}

function wrap(ui: JSX.Element): JSX.Element {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SearchResultsDropdown', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    apiFetchMock.mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Чаты section from chatHits prop without any network call', () => {
    apiFetchMock.mockResolvedValue([]);
    render(wrap(<SearchResultsDropdown query="te" chatHits={[makeChat('Team')]} />));
    expect(screen.getByRole('heading', { name: 'Чаты' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team' })).toBeInTheDocument();
  });

  it('renders search results as one flat light list without nested glass cards', () => {
    const { container } = render(
      wrap(<SearchResultsDropdown query="te" chatHits={[makeChat('Team')]} />),
    );

    expect(container.querySelector('.chat-search-results')).toBeInTheDocument();
    expect(container.querySelector('.chat-search-results__list')).toBeInTheDocument();
    expect(container.querySelector('.glass-dark')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team' })).toHaveClass(
      'chat-search-results__item',
    );
  });

  it('shows the counterpart avatar and direct-chat label in a personal chat result', () => {
    render(
      wrap(
        <SearchResultsDropdown
          query="ал"
          chatHits={[makeDirectChat('Александра', 'https://example.com/alex.jpg')]}
        />,
      ),
    );

    expect(screen.getByRole('img', { name: 'Александра' })).toHaveAttribute(
      'src',
      'https://example.com/alex.jpg',
    );
    expect(screen.getByText('Личный чат')).toBeInTheDocument();
  });

  it('does not call /chat/search when query is shorter than 2 chars', async () => {
    render(wrap(<SearchResultsDropdown query="t" chatHits={[]} />));
    await new Promise((r) => setTimeout(r, 0));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('calls /chat/search when query has >=2 chars and renders message hits', async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: 'm1',
        chatId: 'c1',
        content: 'hello world',
        senderName: 'Alice',
        createdAt: new Date().toISOString(),
      },
    ]);
    render(wrap(<SearchResultsDropdown query="hello" chatHits={[]} />));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/chat/search?q=hello'));
    });
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  it('shows empty-state card when search returns no hits', async () => {
    apiFetchMock.mockResolvedValue([]);
    render(wrap(<SearchResultsDropdown query="zzz" chatHits={[]} />));
    expect(await screen.findByText(/Ничего не найдено по «zzz»/)).toBeInTheDocument();
  });

  it('shows error state with retry button on failure; retry refires the query', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    render(wrap(<SearchResultsDropdown query="oops" chatHits={[]} />));
    const retry = await screen.findByRole('button', { name: /Повторить/ });
    fireEvent.click(retry);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
  });

  it('navigates to /chat/{chatId}?goto={messageId} when a message hit is tapped', async () => {
    apiFetchMock.mockResolvedValue([
      {
        id: 'm99',
        chatId: 'c42',
        content: 'tap me',
        senderName: 'Bob',
        createdAt: new Date().toISOString(),
      },
    ]);
    render(wrap(<SearchResultsDropdown query="tap" chatHits={[]} />));
    await screen.findByText('Bob');
    const messageBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('tap me'));
    fireEvent.click(messageBtn!);
    expect(navigateMock).toHaveBeenCalledWith('/chat/c42?goto=m99');
  });

  it('navigates to /chat/{chatId} (no goto) when a chat hit is tapped', () => {
    render(wrap(<SearchResultsDropdown query="te" chatHits={[makeChat('Team', 'cTeam')]} />));
    fireEvent.click(screen.getByRole('button'));
    expect(navigateMock).toHaveBeenCalledWith('/chat/cTeam');
  });
});
