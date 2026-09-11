import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExperienceRatingModal } from './ExperienceRatingModal.js';
import { useAuthStore } from '../auth/authStore.js';

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  targets: Set<Element>;
};

const observerRecords: ObserverRecord[] = [];

class TestIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [0];
  private readonly record: ObserverRecord;

  constructor(callback: IntersectionObserverCallback) {
    this.record = { callback, targets: new Set() };
    observerRecords.push(this.record);
  }

  observe = (target: Element) => this.record.targets.add(target);
  unobserve = (target: Element) => this.record.targets.delete(target);
  disconnect = () => this.record.targets.clear();
  takeRecords = () => [];
}

function intersect(testId: string, isIntersecting: boolean): void {
  for (const record of observerRecords) {
    for (const target of record.targets) {
      if (target.getAttribute('data-testid') !== testId) continue;
      act(() => {
        record.callback(
          [{ target, isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    }
  }
}

function renderModal(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ExperienceRatingModal currentUserId="u9" onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('ExperienceRatingModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    observerRecords.length = 0;
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'u9', displayName: 'Я игрок' },
    });
  });

  it('loads pages and pins the current player only while their normal row is not visible', async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      requests.push(url);
      const secondPage = url.includes('cursor=next-page');
      return new Response(
        JSON.stringify(
          secondPage
            ? {
                rows: [
                  {
                    place: 31,
                    userId: 'u9',
                    displayName: 'Я игрок',
                    avatarUrl: null,
                    experience: 777,
                  },
                ],
                nextCursor: null,
                currentUser: {
                  place: 31,
                  userId: 'u9',
                  displayName: 'Я игрок',
                  avatarUrl: null,
                  experience: 777,
                },
              }
            : {
                rows: [
                  {
                    place: 1,
                    userId: 'u1',
                    displayName: 'Лидер',
                    avatarUrl: '/broken.webp',
                    experience: 12_345,
                  },
                ],
                nextCursor: 'next-page',
                currentUser: {
                  place: 31,
                  userId: 'u9',
                  displayName: 'Я игрок',
                  avatarUrl: null,
                  experience: 777,
                },
              },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    renderModal();

    const dialog = await screen.findByRole('dialog', { name: 'Рейтинг по опыту' });
    expect(
      await within(dialog).findByRole('columnheader', { name: 'Место' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('experience-rating-title-icon')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('table')[0]).toHaveClass(
      'tournament-standing-table--experience-rating',
    );
    expect(within(dialog).getByText('12 345')).toBeInTheDocument();
    expect(within(dialog).getByRole('row', { name: /^1 Лидер Лидер 12\s345$/ })).not.toHaveClass(
      'tournament-standing-table__medal-place--gold',
    );
    expect(within(dialog).getByTestId('experience-rating-pinned-current')).toHaveTextContent(
      '31Я игрок777',
    );

    const leaderImage = within(dialog).getByRole('img', { name: 'Лидер' });
    fireEvent.error(leaderImage);
    expect(
      within(dialog).getByTitle('Лидер').previousElementSibling?.querySelector('[data-initial="Л"]'),
    ).toBeInTheDocument();

    intersect('experience-rating-sentinel', true);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toContain('cursor=next-page');
    expect(await within(dialog).findByTestId('experience-rating-current-row')).toHaveTextContent(
      '31Я игрок777',
    );
    expect(within(dialog).getByTestId('experience-rating-current-row')).toHaveClass(
      'tournament-standing-table__current-user',
    );
    expect(within(dialog).getByTestId('experience-rating-pinned-current')).toBeInTheDocument();

    intersect('experience-rating-current-row', true);
    await waitFor(() =>
      expect(within(dialog).queryByTestId('experience-rating-pinned-current')).toBeNull(),
    );
  });

  it('keeps loaded rows and offers retry when a later page fails', async () => {
    let attempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('cursor=next-page')) {
        attempts += 1;
        return attempts === 1
          ? new Response('error', { status: 500 })
          : new Response(
              JSON.stringify({
                rows: [],
                nextCursor: null,
                currentUser: {
                  place: 10,
                  userId: 'u9',
                  displayName: 'Я игрок',
                  avatarUrl: null,
                  experience: 777,
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
      }
      return new Response(
        JSON.stringify({
          rows: [
            {
              place: 1,
              userId: 'u1',
              displayName: 'Лидер',
              avatarUrl: null,
              experience: 12_345,
            },
          ],
          nextCursor: 'next-page',
          currentUser: {
            place: 10,
            userId: 'u9',
            displayName: 'Я игрок',
            avatarUrl: null,
            experience: 777,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    renderModal();
    expect(await screen.findByText('Лидер')).toBeInTheDocument();
    intersect('experience-rating-sentinel', true);
    expect(await screen.findByRole('button', { name: 'Повторить загрузку' })).toBeInTheDocument();
    expect(screen.getByText('Лидер')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    await waitFor(() => expect(attempts).toBe(2));
  });
});
