import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmateurStoryFlow } from './AmateurStoryFlow.js';
import { amateurStoryScenes } from './amateurStory.js';
import { prepareStoryImages, storyImagesReady } from './storyImages.js';
vi.mock('./storyImages.js', () => ({
  prepareStoryImages: vi.fn().mockResolvedValue(undefined),
  storyImagesReady: vi.fn().mockReturnValue(true),
  storyImageUrl: (url: string) => url,
}));
describe('AmateurStoryFlow', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    vi.mocked(storyImagesReady).mockReturnValue(true);
    vi.mocked(prepareStoryImages).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('renders the configured amateur threshold in the congratulation', () => {
    render(<AmateurStoryFlow mode="replay" unlockGoalsRequired={175} onCompleted={vi.fn()} />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', expect.stringContaining('Выбить 175 не каждый может.'));
  });
  it('keeps required playback unclosable and replay local', () => {
    const onCompleted = vi.fn();
    const view = render(<AmateurStoryFlow mode="required" onCompleted={onCompleted} />);
    expect(screen.queryByRole('button', { name: 'Закрыть серию' })).not.toBeInTheDocument();
    for (const scene of amateurStoryScenes)
      fireEvent.click(screen.getByRole('button', { name: scene.action }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
    view.unmount();
    const close = vi.fn();
    render(<AmateurStoryFlow mode="replay" onCompleted={onCompleted} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть серию' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('reveals the gesture only after its cue and resets before the next scene first paint', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-frame', 'a');
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-frame', 'b');
    fireEvent.click(screen.getByRole('button', { name: amateurStoryScenes[0]!.action }));
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-frame', 'a');
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-typed', '0');
    expect(screen.getByRole('button', { name: amateurStoryScenes[1]!.action })).toBeDisabled();
  });
  it('keeps the current scene on decode failure and retries without flashing the next frame', async () => {
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    vi.mocked(storyImagesReady).mockReturnValue(false);
    vi.mocked(prepareStoryImages).mockRejectedValueOnce(new Error('offline'));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: amateurStoryScenes[0]!.action })),
    );
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-scene', 'greeting');
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    vi.mocked(prepareStoryImages).mockResolvedValue(undefined);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' })),
    );
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-scene', 'memory');
  });
  it('does not disclose the name before the introduction or duplicate section tutorials', () => {
    expect(
      amateurStoryScenes
        .slice(0, 2)
        .map((s) => s.copy)
        .join(' '),
    ).not.toMatch(/Арсен/);
    expect(amateurStoryScenes[2]!.copy).toContain('Арсений Ильич');
    expect(amateurStoryScenes.map((s) => s.copy).join(' ')).not.toMatch(
      /—|тренер|асинхрон|инвентарь/,
    );
  });
});
