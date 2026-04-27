import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReactionBar } from '../components/ReactionBar.js';
import type { ReactionGroupDTO } from '../api.js';

describe('ReactionBar', () => {
  it('returns null when reactions are empty', () => {
    const { container } = render(<ReactionBar reactions={[]} onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one button per reaction with emoji + count', () => {
    const reactions: ReactionGroupDTO[] = [
      { emoji: '🔥', count: 3, reactedByMe: true },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ];
    render(<ReactionBar reactions={reactions} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /🔥 3/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /❤️ 1/ })).toBeInTheDocument();
  });

  it('my reaction uses pill--dark, others use plain pill', () => {
    const reactions: ReactionGroupDTO[] = [
      { emoji: '🔥', count: 3, reactedByMe: true },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ];
    render(<ReactionBar reactions={reactions} onToggle={() => {}} />);
    const mine = screen.getByRole('button', { name: /🔥 3/ });
    const theirs = screen.getByRole('button', { name: /❤️ 1/ });
    expect(mine.className).toMatch(/pill--dark/);
    expect(theirs.className).toMatch(/\bpill\b/);
    expect(theirs.className).not.toMatch(/pill--dark/);
  });

  it('clicking a pill calls onToggle with that emoji', () => {
    const reactions: ReactionGroupDTO[] = [{ emoji: '🔥', count: 1, reactedByMe: true }];
    const onToggle = vi.fn();
    render(<ReactionBar reactions={reactions} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /🔥 1/ }));
    expect(onToggle).toHaveBeenCalledWith('🔥');
  });
});
