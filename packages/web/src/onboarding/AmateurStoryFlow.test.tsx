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
  it('visits the garage and equips the player before the amateur stadium', () => {
    const ids = amateurStoryScenes.map(scene => scene.id);
    expect(ids.slice(4, 7)).toEqual(['garage-trip', 'uniform-gift', 'equipment-gift']);
    expect(ids.slice(7)).toEqual(['amateur-stadium', 'invitation']);
    expect(amateurStoryScenes[5]!.copy).toContain('красно-синюю форму');
    expect(amateurStoryScenes[6]!.copy).toContain('дуэлях и турнирах');
  });
  it('shows progress dots in required onboarding and updates the active screen', () => {
    render(<AmateurStoryFlow mode="required" onCompleted={vi.fn()} />);
    expect(screen.getByRole('status', { name: 'Экран 1 из 9' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: amateurStoryScenes[0]!.action }));
    expect(screen.getByRole('status', { name: 'Экран 2 из 9' })).toBeInTheDocument();
  });
  it('allows replay navigation in both directions but hides it in required onboarding', () => {
    const view = render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Предыдущий экран' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Следующий экран' }));
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', expect.stringContaining('Да, спрашивай'));
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий экран' }));
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', expect.stringContaining('Logan'));
    view.unmount();
    render(<AmateurStoryFlow mode="required" onCompleted={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Следующий экран' })).toBeNull();
  });
  it('shows initial loading as a neutral status rather than an error', () => {
    vi.mocked(storyImagesReady).mockReturnValue(false);
    vi.mocked(prepareStoryImages).mockReturnValue(new Promise(() => {}));
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    const status = screen.getByText('Загружаем сюжет…');
    expect(status).toHaveTextContent('Загружаем сюжет');
    expect(status).not.toHaveClass('beginner-story__completion-error');
  });
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    vi.mocked(storyImagesReady).mockReturnValue(true);
    vi.mocked(prepareStoryImages).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('distinguishes player replies from mentor dialogue', () => {
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: amateurStoryScenes[0]!.action }));
    const region = screen.getByRole('region');
    const player = region.querySelector('[data-speaker="player"]');
    const mentor = region.querySelector('[data-speaker="mentor"]');
    expect(player).toHaveTextContent('– А почему вы тогда остановились?');
    expect(player).not.toHaveClass('beginner-story__dialogue');
    expect(mentor).toHaveClass('beginner-story__dialogue');
  });
  it('reveals the arena and shoulder pat at their exact text cues', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    for (const scene of amateurStoryScenes.slice(0, 3)) {
      act(() => vi.advanceTimersByTime(30000));
      fireEvent.click(screen.getByRole('button', { name: scene.action }));
    }
    const story = screen.getByTestId('amateur-story');
    expect(story).toHaveAttribute('data-frame', 'a');
    const advanceTo = (count: number) => {
      while (Number(story.getAttribute('data-typed')) < count) {
        act(() => vi.advanceTimersToNextTimer());
      }
    };
    advanceTo('Ты вспоминаешь'.length - 1);
    expect(story).toHaveAttribute('data-frame', 'a');
    advanceTo('Ты вспоминаешь'.length);
    expect(story).toHaveAttribute('data-frame', 'b');
    const copy = amateurStoryScenes[3]!.copy;
    const pat = copy.indexOf('тебе пока рано') + 'тебе пока рано'.length;
    advanceTo(pat - 1);
    expect(story).toHaveAttribute('data-frame', 'b');
    advanceTo(pat);
    expect(story).toHaveAttribute('data-frame', 'c');
    expect(prepareStoryImages).toHaveBeenCalledWith(expect.arrayContaining(['/onboarding/amateur/scene-04-c.webp']));
    act(() => vi.advanceTimersByTime(30000));
    fireEvent.click(screen.getByRole('button', { name: amateurStoryScenes[3]!.action }));
    expect(screen.getByTestId('amateur-story')).toHaveAttribute('data-frame', 'a');
  });
  it('renders the configured amateur threshold in the congratulation', () => {
    render(<AmateurStoryFlow mode="replay" unlockGoalsRequired={175} onCompleted={vi.fn()} />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', expect.stringContaining('Выбить 175 не каждый может.'));
  });
  it('uses two invitation frames and reveals the open wicket at the cue', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    for (const scene of amateurStoryScenes.slice(0, -1)) {
      act(() => vi.advanceTimersByTime(30000));
      fireEvent.click(screen.getByRole('button', { name: scene.action }));
    }
    const story = screen.getByTestId('amateur-story');
    const scene = amateurStoryScenes[amateurStoryScenes.length - 1]!;
    const advanceTo = (cue: string, offset = 0) => {
      const count = scene.copy.indexOf(cue) + cue.length + offset;
      while (Number(story.getAttribute('data-typed')) < count) {
        act(() => vi.advanceTimersToNextTimer());
      }
    };
    expect(story).toHaveAttribute('data-frame', 'a');
    advanceTo(scene.cue, -1);
    expect(story).toHaveAttribute('data-frame', 'a');
    advanceTo(scene.cue);
    expect(story).toHaveAttribute('data-frame', 'b');
    expect(scene.imageC).toBeUndefined();
    act(() => vi.advanceTimersByTime(30000));
    expect(story).toHaveAttribute('data-frame', 'b');
  });
  it('adds stronger copy shading for long scenes only', () => {
    render(<AmateurStoryFlow mode="replay" onCompleted={vi.fn()} />);
    expect(screen.getByTestId('amateur-story')).not.toHaveClass('amateur-story--long-copy');
    fireEvent.click(screen.getByRole('button', { name: amateurStoryScenes[0]!.action }));
    expect(screen.getByTestId('amateur-story')).toHaveClass('amateur-story--long-copy');
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
    expect(amateurStoryScenes[2]!.copy).toContain('Владимир Арсеньевич');
    expect(amateurStoryScenes.map((s) => s.copy).join(' ')).not.toMatch(
      /—|тренер|асинхрон|инвентарь/,
    );
  });
});
