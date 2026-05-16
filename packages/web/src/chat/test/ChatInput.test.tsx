import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatInput } from '../components/ChatInput.js';

const originalMatchMedia = window.matchMedia;

function mockCoarsePointer(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(hover: none) and (pointer: coarse)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ChatInput', () => {
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

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

  it('renders attachment on the left and voice on the right while the draft is empty', () => {
    const onAttach = vi.fn();
    const onVoice = vi.fn();
    render(
      <ChatInput
        replyTo={null}
        onClearReply={vi.fn()}
        onSend={vi.fn()}
        onAttach={onAttach}
        onVoice={onVoice}
      />,
    );

    const attach = screen.getByRole('button', { name: 'Прикрепить файл' });
    const voice = screen.getByRole('button', { name: 'Записать голосовое' });

    expect(attach).toBeInTheDocument();
    expect(voice).toBeInTheDocument();
    expect(attach.compareDocumentPosition(screen.getByLabelText('Текст сообщения'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(attach);
    fireEvent.click(voice);
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onVoice).toHaveBeenCalledTimes(1);
  });

  it('switches the right-side action from voice to send when text is typed', () => {
    render(
      <ChatInput
        replyTo={null}
        onClearReply={vi.fn()}
        onSend={vi.fn()}
        onAttach={vi.fn()}
        onVoice={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    expect(screen.getByRole('button', { name: 'Записать голосовое' })).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'привет' } });

    expect(screen.queryByRole('button', { name: 'Записать голосовое' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled();
  });

  it('shows a stop action while voice recording is active', () => {
    const onVoice = vi.fn();
    render(
      <ChatInput
        replyTo={null}
        onClearReply={vi.fn()}
        onSend={vi.fn()}
        onVoice={onVoice}
        voiceState="recording"
      />,
    );

    const stop = screen.getByRole('button', { name: 'Остановить запись' });
    expect(stop).toHaveTextContent('');
    fireEvent.click(stop);
    expect(onVoice).toHaveBeenCalledTimes(1);
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

  it('submits with Enter on desktop keyboards', () => {
    mockCoarsePointer(false);
    const onSend = vi.fn();
    render(<ChatInput replyTo={null} onClearReply={vi.fn()} onSend={onSend} />);

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'сообщение' } });

    expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(false);
    expect(onSend).toHaveBeenCalledWith('сообщение', null);
  });

  it('keeps Enter as a line break key on touch phones', () => {
    mockCoarsePointer(true);
    const onSend = vi.fn();
    render(<ChatInput replyTo={null} onClearReply={vi.fn()} onSend={onSend} />);

    const textarea = screen.getByLabelText('Текст сообщения') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'первая строка' } });

    expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
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
