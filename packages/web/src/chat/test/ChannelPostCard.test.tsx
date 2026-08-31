import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelPostCard } from '../components/ChannelPostCard.js';

describe('ChannelPostCard', () => {
  it('renders a tournament action under an official announcement', () => {
    render(
      <ChannelPostCard
        post={{
          id: 'post-1',
          chatId: 'news',
          senderId: 'official',
          senderDisplayName: 'Ультимейт Хоккей',
          senderAvatarUrl: null,
          content: 'Регистрация открыта.',
          replyToId: null,
          isDeleted: false,
          createdAt: '2026-08-31T10:00:00.000Z',
          reactions: [],
          metadata: {
            type: 'tournament_announcement',
            action: {
              type: 'tournament',
              label: 'Перейти в турнир',
              url: '/?view=amateur&section=tournaments&tournament=cup-1&tab=overview&from=sections',
            },
          },
        }}
        showViews={false}
        onReact={vi.fn()}
        onOpenReactionPicker={vi.fn()}
        onOpenComments={vi.fn()}
        onPollVote={vi.fn()}
        onPollClearVote={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Перейти в турнир' })).toHaveAttribute(
      'href',
      '/?view=amateur&section=tournaments&tournament=cup-1&tab=overview&from=sections',
    );
  });
});
