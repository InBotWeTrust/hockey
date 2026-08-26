import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChannelPollComposerSheet } from '../components/ChannelPollComposerSheet.js';

describe('ChannelPollComposerSheet', () => {
  it('starts with two option inputs and submits filled options only', () => {
    const onSubmit = vi.fn();
    render(<ChannelPollComposerSheet open onSubmit={onSubmit} onClose={() => undefined} />);

    expect(screen.getByRole('textbox', { name: 'Вариант 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Вариант 2' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Вопрос опроса' }), {
      target: { value: 'Кто победит?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Вариант 1' }), {
      target: { value: 'Первые' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(onSubmit).toHaveBeenCalledWith('Кто победит?', ['Первые']);
  });

  it('allows adding a third option', () => {
    render(<ChannelPollComposerSheet open onSubmit={() => undefined} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    expect(screen.getByRole('textbox', { name: 'Вариант 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить вариант' })).not.toBeInTheDocument();
  });
});
