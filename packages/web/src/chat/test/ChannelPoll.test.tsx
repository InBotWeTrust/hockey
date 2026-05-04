import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChannelPoll } from '../components/ChannelPoll.js';
import type { ChannelPollDTO } from '../api.js';

const poll: ChannelPollDTO = {
  totalVotes: 2,
  myOptionId: 'option-2',
  options: [
    {
      id: 'option-1',
      text: 'Первые',
      voteCount: 1,
      percent: 50,
      selectedByMe: false,
    },
    {
      id: 'option-2',
      text: 'Вторые',
      voteCount: 1,
      percent: 50,
      selectedByMe: true,
    },
  ],
};

describe('ChannelPoll', () => {
  it('renders vote percentages after voting and lets the user change vote', () => {
    const onVote = vi.fn();
    render(
      <ChannelPoll postId="post-1" poll={poll} onVote={onVote} onClearVote={() => undefined} />,
    );

    expect(screen.getAllByText('50%')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Вариант: Первые' }));
    expect(onVote).toHaveBeenCalledWith('post-1', 'option-1');

    fireEvent.click(screen.getByRole('button', { name: 'Вариант: Вторые' }));
    expect(onVote).toHaveBeenCalledTimes(1);
  });

  it('opens clear vote action from context menu', () => {
    const onClearVote = vi.fn();
    render(
      <ChannelPoll
        postId="post-1"
        poll={poll}
        onVote={() => undefined}
        onClearVote={onClearVote}
      />,
    );

    fireEvent.contextMenu(screen.getByText('2 голоса').parentElement!);
    const menu = screen.getByRole('menu', { name: 'Действия с голосом' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Отменить голос' }));
    expect(onClearVote).toHaveBeenCalledWith('post-1');
  });
});
