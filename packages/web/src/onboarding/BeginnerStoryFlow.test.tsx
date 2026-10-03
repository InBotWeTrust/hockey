vi.mock('./storyImages.js', () => ({ prepareStoryImages: vi.fn().mockResolvedValue(undefined), storyImagesReady: vi.fn().mockReturnValue(true), storyImageUrl: (url: string) => url }));
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeginnerStoryFlow } from './BeginnerStoryFlow.js';
import { prepareStoryImages, storyImagesReady } from './storyImages.js';
import { beginnerStoryScenes } from './beginnerStory.js';

vi.mock('./TutorialShotStep.js', () => ({
  TutorialShotStep: ({
    onResult,
    tutorialApi,
  }: {
    onResult?: (result: 'goal' | 'miss') => void;
    tutorialApi?: unknown;
  }) => (
    <div data-testid="story-shot" data-local-api={tutorialApi ? 'true' : 'false'}>
      <button type="button" onClick={() => onResult?.('goal')}>Тестовый гол</button>
      <button type="button" onClick={() => onResult?.('miss')}>Тестовый промах</button>
    </div>
  ),
}));

const beginnerRequired = {
  chain: 'beginner' as const,
  versionId: 'beginner-v1',
  steps: [
    {
      id: 'shot-step',
      position: 1,
      kind: 'tutorial_shot' as const,
      title: 'Один бросок',
      description: 'Бросай',
      ctaLabel: 'Дальше',
      tutorial: { shooterFrequency: 0.8, goalieFrequency: 0.65, goalFrequency: 0.55 },
    },
  ],
};

function advanceToShot(): void {
  for (const action of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?', 'Перейти к броску']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(action.replace(/[?]/g, '\\?')) }));
  }
}

describe('BeginnerStoryFlow', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  });

  it('adds decorative snowfall only to the court and arena', () => {
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    expect(screen.getByTestId('story-snow')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Подобрать шайбу' }));
    expect(screen.queryByTestId('story-snow')).not.toBeInTheDocument();
  });

  it('darkens the finale only after the narration cue and keeps snow in the arena', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const action of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?', 'Перейти к броску']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Тестовый гол' }));
    for (const action of ['Узнать, что важно', 'И это всё?', 'А потом?']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    expect(screen.getByTestId('story-snow')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.click(screen.getByRole('button', { name: 'Хм, интересно' }));
    expect(screen.getByTestId('beginner-story')).not.toHaveClass('beginner-story--dark');
    expect(screen.queryByTestId('story-snow')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId('beginner-story')).toHaveClass('beginner-story--dark');
    vi.useRealTimers();
  });

  it('starts the stranger scene with a background plate and reveals the accepted frame at the cue', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const action of ['Подобрать шайбу', 'Интересно, кто это?']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    const story = screen.getByTestId('beginner-story');
    expect(story.querySelectorAll('img')).toHaveLength(2);
    expect(story).not.toHaveClass('beginner-story--stranger-visible');
    act(() => vi.advanceTimersByTime(4_000));
    expect(story).toHaveClass('beginner-story--stranger-visible');
    vi.useRealTimers();
  });

  it('reveals the raised-finger mentor frame at the final advice', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const action of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    const story = screen.getByTestId('beginner-story');
    expect(story.querySelectorAll('img')).toHaveLength(2);
    expect(story).not.toHaveClass('beginner-story--mentor-gesture');
    act(() => vi.advanceTimersByTime(10_000));
    expect(story).toHaveClass('beginner-story--mentor-gesture');
    vi.useRealTimers();
  });

  it.each(['Тестовый гол', 'Тестовый промах'])('reveals the puck after the first result sentence for %s', action => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const label of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?', 'Перейти к броску']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    fireEvent.click(screen.getByRole('button', { name: action }));
    const story = screen.getByTestId('beginner-story');
    expect(story.querySelectorAll('img')).toHaveLength(2);
    expect(story).not.toHaveClass('beginner-story--puck-visible');
    act(() => vi.advanceTimersByTime(3_000));
    expect(story).toHaveClass('beginner-story--puck-visible');
    vi.useRealTimers();
  });

  it('reveals the over-shoulder frame only at the turn cue', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const action of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?', 'Перейти к броску']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Тестовый гол' }));
    act(() => vi.advanceTimersByTime(30_000));
    const previousMedia = screen.getByTestId('beginner-story').querySelector('.beginner-story__media');
    fireEvent.click(screen.getByRole('button', { name: 'Узнать, что важно' }));
    expect(screen.getByTestId('beginner-story').querySelector('.beginner-story__media')).not.toBe(previousMedia);
    const story = screen.getByTestId('beginner-story');
    expect(story.querySelectorAll('img')).toHaveLength(2);
    expect(story).not.toHaveClass('beginner-story--turned');
    act(() => vi.advanceTimersByTime(6_000));
    expect(story).toHaveClass('beginner-story--turned');
    vi.useRealTimers();
  });

  it('reveals the board number and arena at their narration cues', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const action of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?', 'Перейти к броску']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Тестовый гол' }));
    for (const action of ['Узнать, что важно', 'И это всё?']) {
      act(() => vi.advanceTimersByTime(30_000));
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    const story = screen.getByTestId('beginner-story');
    expect(story.querySelectorAll('img')).toHaveLength(2);
    expect(story).not.toHaveClass('beginner-story--number-visible');
    act(() => vi.advanceTimersByTime(30_000));
    expect(story).toHaveClass('beginner-story--number-visible');
    fireEvent.click(screen.getByRole('button', { name: 'А потом?' }));
    expect(story.querySelectorAll('img')).toHaveLength(2);
    expect(story).not.toHaveClass('beginner-story--arena-visible');
    act(() => vi.advanceTimersByTime(30_000));
    expect(story).toHaveClass('beginner-story--arena-visible');
    vi.useRealTimers();
  });

  it('keeps the current scene while loading and supports retry after failure', async () => {
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    vi.mocked(storyImagesReady).mockReturnValue(false);
    vi.mocked(prepareStoryImages).mockRejectedValueOnce(new Error('offline'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подобрать шайбу' })));
    expect(screen.getByTestId('beginner-story')).toHaveClass('beginner-story--court');
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    vi.mocked(prepareStoryImages).mockResolvedValue(undefined);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' })));
    expect(screen.getByTestId('beginner-story')).toHaveClass('beginner-story--car');
    vi.mocked(storyImagesReady).mockReturnValue(true);
  });

  it('uses compressed WebP artwork for every narrative scene', () => {
    for (const scene of Object.values(beginnerStoryScenes(300))) {
      expect(scene.image).toMatch(/\.webp$/);
    }
  });

  it('keeps the stranger anonymous in all first-series copy and accessible artwork descriptions', () => {
    for (const scene of Object.values(beginnerStoryScenes(475))) {
      expect(`${scene.copy} ${scene.alt} ${scene.action}`).not.toMatch(/Арсенич|Арсений|Ильич/i);
    }
  });

  it('keeps required onboarding non-dismissible', () => {
    render(
      <BeginnerStoryFlow
        mode="required"
        runId="run-1"
        required={beginnerRequired}
        unlockGoalsRequired={300}
        onCompleted={vi.fn()}
      />,
    );

    expect(screen.getByTestId('beginner-story')).toHaveTextContent('Коробка давно опустела.');
    expect(screen.queryByRole('button', { name: 'Закрыть серию' })).not.toBeInTheDocument();
  });

  it('keeps the first scene typing for until the longer opening copy is complete before revealing its action', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(
      <BeginnerStoryFlow
        mode="required"
        runId="run-1"
        required={beginnerRequired}
        unlockGoalsRequired={300}
        onCompleted={vi.fn()}
      />,
    );

    act(() => vi.advanceTimersByTime(3_900));
    expect(screen.getByRole('button', { name: 'Подобрать шайбу' })).toBeDisabled();

    act(() => vi.advanceTimersByTime(6_100));
    expect(screen.getByRole('button', { name: 'Подобрать шайбу' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('switches headlights on over one unchanged car image after the cue', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole('button', { name: /Подобрать шайбу/ }));
    const story = screen.getByTestId('beginner-story');
    expect(story.querySelectorAll('img')).toHaveLength(1);
    const carImage = story.querySelector('img');
    expect(story).not.toHaveClass('beginner-story--headlights');
    act(() => vi.advanceTimersByTime(12_000));
    expect(story).toHaveClass('beginner-story--headlights');
    expect(story.querySelector('img')).toBe(carImage);
    expect(story.querySelector('svg[data-testid="story-headlight-glow"]')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('mounts a hidden fresh action when advancing to the next scene', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole('button', { name: 'Подобрать шайбу' }));
    act(() => vi.advanceTimersByTime(15_000));
    const previousAction = screen.getByRole('button', { name: 'Интересно, кто это?' });
    expect(previousAction).toBeEnabled();
    fireEvent.click(previousAction);
    const nextAction = screen.getByRole('button', { name: 'Что?' });
    expect(nextAction).not.toBe(previousAction);
    expect(nextAction).toBeDisabled();
    expect(nextAction).not.toHaveClass('beginner-story__cta--visible');
    vi.useRealTimers();
  });

  it('styles the mentor action attribution as narration rather than dialogue', () => {
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    for (const action of ['Подобрать шайбу', 'Интересно, кто это?', 'Что?']) {
      fireEvent.click(screen.getByRole('button', { name: action }));
    }
    const words = Array.from(screen.getByTestId('beginner-story').querySelectorAll('.beginner-story__word'));
    expect(words.find(word => word.textContent === 'говорит')).toHaveClass('beginner-story__narration');
    expect(words.find(word => word.textContent === 'Только')).not.toHaveClass('beginner-story__narration');
  });

  it('lays out complete words before revealing their characters', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<BeginnerStoryFlow mode="replay" unlockGoalsRequired={100} onCompleted={vi.fn()} />);
    const paragraph = screen.getByTestId('beginner-story').querySelector('.beginner-story__copy p')!;
    expect(paragraph.textContent).toBe(beginnerStoryScenes(100).court.copy);
    expect(paragraph.querySelectorAll('.beginner-story__word').length).toBeGreaterThan(0);
    expect(paragraph.querySelector('[style*="visibility: hidden"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(paragraph.textContent).toBe(beginnerStoryScenes(100).court.copy);
    vi.useRealTimers();
  });

  it('shows a close action in replay and uses a local shot adapter', () => {
    const onClose = vi.fn();
    render(
      <BeginnerStoryFlow
        mode="replay"
        unlockGoalsRequired={300}
        onCompleted={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть серию' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    advanceToShot();
    expect(screen.getByTestId('story-shot')).toHaveAttribute('data-local-api', 'true');
  });

  it.each([
    ['Тестовый гол', 'Шайба влетает в ворота.', '– Неплохо. Но один бросок не имеет значения. Ведь важно совсем другое.'],
    ['Тестовый промах', 'Шайба проходит рядом с воротами.', '– Бывает. Один бросок всё равно не имеет значения. Важно другое.'],
  ])('branches after %s and converges without revealing the stranger identity', (shotAction, resultCopy, dialogue) => {
    render(
      <BeginnerStoryFlow
        mode="replay"
        unlockGoalsRequired={475}
        onCompleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    advanceToShot();
    fireEvent.click(screen.getByRole('button', { name: shotAction }));
    expect(screen.getByTestId('beginner-story')).toHaveTextContent(resultCopy);
    expect(screen.getByTestId('beginner-story')).toHaveTextContent(dialogue);

    fireEvent.click(screen.getByRole('button', { name: /Узнать, что важно/ }));
    expect(screen.getByTestId('beginner-story')).toHaveTextContent('Важно только то, вернёшься ли ты завтра.');
    expect(screen.getByTestId('beginner-story')).toHaveTextContent('Затем останавливается и смотрит через плечо.');
  });

  it('renders the live threshold and approved final actions', () => {
    const onCompleted = vi.fn();
    render(
      <BeginnerStoryFlow
        mode="replay"
        unlockGoalsRequired={475}
        onCompleted={onCompleted}
        onClose={vi.fn()}
      />,
    );

    advanceToShot();
    fireEvent.click(screen.getByRole('button', { name: 'Тестовый гол' }));
    for (const action of ['Узнать, что важно', 'И это всё?']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(action.replace(/[?]/g, '\\?')) }));
    }
    expect(screen.getByTestId('beginner-story')).toHaveTextContent('475');
    expect(screen.getByTestId('beginner-story')).toHaveTextContent(
      '– Забьёшь 475 шайб, тогда и поговорим.',
    );

    fireEvent.click(screen.getByRole('button', { name: /А потом\?/ }));
    expect(screen.getByTestId('beginner-story')).toHaveTextContent(
      'Вместе вы смотрите куда-то далеко за площадку и представляете большую хоккейную арену...',
    );
    fireEvent.click(screen.getByRole('button', { name: /Хм, интересно/ }));
    expect(screen.getByRole('button', { name: /^Начать путь$/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /^Начать путь$/ }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
});
