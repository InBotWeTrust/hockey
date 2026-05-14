import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatInput } from '../components/ChatInput.js';

describe('ChatInput', () => {
  it('keeps the send action as an icon-only button', () => {
    render(
      <ChatInput
        replyTo={null}
        onClearReply={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    const button = screen.getByLabelText('Отправить');

    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('');
  });

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

  it('focuses the textarea when reply mode is selected', async () => {
    const props = {
      onClearReply: vi.fn(),
      onSend: vi.fn(),
    };
    const { rerender } = render(<ChatInput replyTo={null} {...props} />);
    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;

    rerender(<ChatInput replyTo={{ id: 'm1', content: 'привет' }} {...props} />);

    await waitFor(() => expect(document.activeElement).toBe(textarea));
  });

  it('prefills and submits edit mode through onEdit', async () => {
    const onEdit = vi.fn();
    render(
      <ChatInput
        replyTo={null}
        editing={{ id: 'm1', content: 'старый текст' }}
        onClearReply={vi.fn()}
        onClearEditing={vi.fn()}
        onSend={vi.fn()}
        onEdit={onEdit}
      />,
    );

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('старый текст'));
    fireEvent.change(textarea, { target: { value: 'новый текст' } });
    fireEvent.click(screen.getByLabelText('Отправить'));

    expect(onEdit).toHaveBeenCalledWith('m1', 'новый текст');
  });
});
