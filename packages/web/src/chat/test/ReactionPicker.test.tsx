import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReactionPicker } from '../components/ReactionPicker.js';
import { EMOJI_WHITELIST } from '../reactions.js';

const anchor: DOMRect = {
  top: 100, left: 100, right: 200, bottom: 200, width: 100, height: 100,
  x: 100, y: 100, toJSON: () => ({}),
};

describe('ReactionPicker', () => {
  it('renders nothing when not open', () => {
    const { container } = render(
      <ReactionPicker open={false} anchorRect={null} onPick={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders all 24 whitelist emojis when open', () => {
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={() => {}} onClose={() => {}} />,
    );
    for (const e of EMOJI_WHITELIST) {
      expect(screen.getByRole('button', { name: e })).toBeInTheDocument();
    }
  });

  it('clicking an emoji calls onPick + onClose', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={onPick} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    expect(onPick).toHaveBeenCalledWith('🔥');
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={() => {}} onClose={onClose} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('pointerdown on the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(
      <ReactionPicker open={true} anchorRect={anchor} onPick={() => {}} onClose={onClose} />,
    );
    const backdrop = document.querySelector('[data-reaction-picker-backdrop]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
