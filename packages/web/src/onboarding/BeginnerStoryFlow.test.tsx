import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeginnerStoryFlow } from './BeginnerStoryFlow.js';
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
  for (const action of ['Сделать бросок', 'Кто там?', 'Что?', 'Я готов']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(action.replace(/[?]/g, '\\?')) }));
  }
}

describe('BeginnerStoryFlow', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  });

  it('uses compressed WebP artwork for every narrative scene', () => {
    for (const scene of Object.values(beginnerStoryScenes(300))) {
      expect(scene.image).toMatch(/\.webp$/);
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
    ['Тестовый гол', 'Шайба влетает в ворота.', '– Неплохо. Только один бросок ничего не значит.'],
    ['Тестовый промах', 'Шайба проходит рядом с воротами.', '– Бывает. Один бросок всё равно ничего не значит.'],
  ])('branches after %s and converges on the name scene', (shotAction, resultCopy, dialogue) => {
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

    fireEvent.click(screen.getByRole('button', { name: /А что значит\?/ }));
    expect(screen.getByTestId('beginner-story')).toHaveTextContent('– А как вас зовут?');
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
    for (const action of ['А что значит?', 'И всё?']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(action.replace(/[?]/g, '\\?')) }));
    }
    expect(screen.getByTestId('beginner-story')).toHaveTextContent('475');
    expect(screen.getByTestId('beginner-story')).toHaveTextContent(
      '– Забьёшь 475 – тогда и поговорим.',
    );

    fireEvent.click(screen.getByRole('button', { name: /Триста шайб\?/ }));
    expect(screen.getByTestId('beginner-story')).toHaveTextContent(
      'И они оба представили себе большую арену где-то над городом.',
    );
    fireEvent.click(screen.getByRole('button', { name: /Хм, интересно\.\.\./ }));
    expect(screen.getByRole('button', { name: /^Начать путь$/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /^Начать путь$/ }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
});
