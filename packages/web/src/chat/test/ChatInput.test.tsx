import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatInput } from '../components/ChatInput.js';

describe('ChatInput', () => {
  it('wraps selected channel post text with rich text markers', async () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        replyTo={null}
        formattingTools
        onClearReply={vi.fn()}
        onSend={onSend}
      />,
    );

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'важно' } });
    textarea.setSelectionRange(0, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));

    await waitFor(() => expect(textarea.value).toBe('**важно**'));
    fireEvent.click(screen.getByLabelText('Отправить'));

    expect(onSend).toHaveBeenCalledWith('**важно**', null);
  });

  it('keeps marker-only drafts unsendable', () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        replyTo={null}
        formattingTools
        onClearReply={vi.fn()}
        onSend={onSend}
      />,
    );

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('button', { name: 'Курсив' }));

    expect(textarea.value).toBe('____');
    expect(screen.getByLabelText('Отправить')).toBeDisabled();
  });
});
