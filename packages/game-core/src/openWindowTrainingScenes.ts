import bank from './openWindowTrainingBank.json' with { type: 'json' };
import { resolveOpenWindowShot, scanOpenWindows, type OpenWindowScene,
  type OpenWindowInterval } from './openWindowTraining.js';
import { GAME_CORE_VERSION } from './version.js';

export type OpenWindowStage = 'notice' | 'anticipate' | 'decide' | 'pace';
export type OpenWindowStepKey =
  | 'notice_frame' | 'notice_motion' | 'notice_independent'
  | 'anticipate_direction' | 'anticipate_opening' | 'anticipate_timing'
  | 'decide_risk' | 'decide_skip' | 'decide_sequence'
  | 'pace_short' | 'pace_faster' | 'pace_three_minutes';
export interface CuratedOpenWindowScene extends OpenWindowScene {
  stepKey: OpenWindowStepKey;
  role: 'demonstration' | 'practice' | 'check';
  targetWindow: OpenWindowInterval;
  skipSegment?: OpenWindowInterval;
}

export const OPEN_WINDOW_BANK_VERSION = 1;
export const OPEN_WINDOW_STEPS: readonly {
  key: OpenWindowStepKey;
  stage: OpenWindowStage;
  title: string;
  objective: string;
}[] = [
  { key: 'notice_frame', stage: 'notice', title: 'Найди просвет',
    objective: 'Увидь открытый путь к воротам на стоп-кадре.' },
  { key: 'notice_motion', stage: 'notice', title: 'Заметь в движении',
    objective: 'Замечай открытый путь, пока все движутся.' },
  { key: 'notice_independent', stage: 'notice', title: 'Брось сам',
    objective: 'Самостоятельно выбери открытый момент в разных ситуациях.' },
  { key: 'anticipate_direction', stage: 'anticipate', title: 'Прочитай движение',
    objective: 'Увидь, куда движутся игрок, ворота и вратарь.' },
  { key: 'anticipate_opening', stage: 'anticipate', title: 'Поймай открытие',
    objective: 'Брось, когда путь только открывается.' },
  { key: 'anticipate_timing', stage: 'anticipate', title: 'Не рано и не поздно',
    objective: 'Выбирай момент без подсказки во время игры.' },
  { key: 'decide_risk', stage: 'decide', title: 'Разумный риск',
    objective: 'Отличай доступный рискованный бросок от закрытого пути.' },
  { key: 'decide_skip', stage: 'decide', title: 'Пропусти проход',
    objective: 'Пропускай плохой момент, но не жди только идеального.' },
  { key: 'decide_sequence', stage: 'decide', title: 'Выбери в серии',
    objective: 'Чередуй простые и рискованные возможности по ситуации.' },
  { key: 'pace_short', stage: 'pace', title: 'Короткая серия',
    objective: 'Сохраняй хорошие решения в короткой серии.' },
  { key: 'pace_faster', stage: 'pace', title: 'Быстрее без спешки',
    objective: 'Ускоряйся без потока бросков в закрытый путь.' },
  { key: 'pace_three_minutes', stage: 'pace', title: 'Три минуты',
    objective: 'Держи темп в полной трёхминутной игре.' },
];

export function getOpenWindowScene(_stepKey: OpenWindowStepKey,
  variant: number): CuratedOpenWindowScene {
  const stepIndex = OPEN_WINDOW_STEPS.findIndex((step) => step.key === _stepKey);
  if (stepIndex < 0 || !Number.isInteger(variant) || variant < 0 || variant > 6) {
    throw new RangeError('Unknown open-window scene');
  }
  const scene = bank[stepIndex * 7 + variant] as CuratedOpenWindowScene | undefined;
  if (!scene || scene.stepKey !== _stepKey) throw new Error('Open-window scene bank is incomplete');
  return scene;
}

export function validateOpenWindowScene(scene: CuratedOpenWindowScene): void {
  const step = OPEN_WINDOW_STEPS.find((candidate) => candidate.key === scene.stepKey);
  if (!step || scene.gameCoreVersion !== GAME_CORE_VERSION ||
    scene.bankVersion !== OPEN_WINDOW_BANK_VERSION ||
    scene.targetWindow.startMs < scene.startMs || scene.targetWindow.endMs > scene.endMs ||
    scene.targetMs < scene.targetWindow.startMs || scene.targetMs > scene.targetWindow.endMs) {
    throw new Error(`Stale or invalid open-window scene ${scene.id}`);
  }
  const width = scene.targetWindow.endMs - scene.targetWindow.startMs + 1;
  const minimumWidth = step.stage === 'notice' ? 200 : step.stage === 'anticipate' ? 160 : 80;
  if (width < minimumWidth ||
    resolveOpenWindowShot(scene, scene.targetWindow.startMs).type !== 'goal' ||
    resolveOpenWindowShot(scene, scene.targetWindow.endMs).type !== 'goal' ||
    resolveOpenWindowShot(scene, scene.targetWindow.startMs - 1).type === 'goal' ||
    resolveOpenWindowShot(scene, scene.targetWindow.endMs + 1).type === 'goal') {
    throw new Error(`Open-window scene ${scene.id} does not reproduce its window`);
  }
  const reproduced = scanOpenWindows(scene, scene.targetWindow.startMs,
    scene.targetWindow.endMs);
  if (reproduced.length !== 1 || reproduced[0]?.startMs !== scene.targetWindow.startMs ||
    reproduced[0].endMs !== scene.targetWindow.endMs) {
    throw new Error(`Open-window scene ${scene.id} does not reproduce its window`);
  }
  if (scene.stepKey === 'decide_skip') {
    const skip = scene.skipSegment;
    if (!skip || skip.startMs < scene.startMs || skip.endMs >= scene.targetWindow.startMs ||
      scanOpenWindows(scene, skip.startMs, skip.endMs).some((interval) =>
        interval.endMs - interval.startMs + 1 >= 160)) {
      throw new Error(`Open-window scene ${scene.id} does not reproduce its skip`);
    }
  }
}
