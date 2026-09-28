import { writeFileSync } from 'node:fs';
import { scanOpenWindows } from '../dist/openWindowTraining.js';
import { getDailyPeriodSpeedPreset } from '../dist/balance/periods.js';
import { OPEN_WINDOW_STEPS } from '../dist/openWindowTrainingScenes.js';
import { GAME_CORE_VERSION } from '../dist/version.js';

const bankVersion = 1;
const scenes = [];
const traversalMs = 500 / getDailyPeriodSpeedPreset(1).shooterFrequency;

for (const step of OPEN_WINDOW_STEPS) {
  const goalieId = step.stage === 'pace' ? 'wall' : 'rookie';
  for (let variant = 0; variant < 7; variant += 1) {
    const later = step.stage === 'decide' || step.stage === 'pace';
    const minimumWidth = step.stage === 'notice' ? 200
      : step.stage === 'anticipate' ? 160
        : variant === 3 || variant === 6 ? 120
          : variant === 4 ? 80 : 200;
    const maximumWidth = later && (variant === 3 || variant === 6) ? 199
      : later && variant === 4 ? 119 : Infinity;
    let selected = null;
    for (let candidate = 0; candidate < 160 && selected === null; candidate += 1) {
      const sessionSeed = `open-window:v${bankVersion}:${step.key}:${variant}:${candidate}`;
      const probe = { id: 'probe', sessionSeed, shotIndex: 1, goalieId,
        startMs: 0, endMs: 14_000, targetMs: 8_000,
        bankVersion, gameCoreVersion: GAME_CORE_VERSION };
      const windows = scanOpenWindows(probe, 6_000, 12_000)
        .filter((window) => {
          const width = window.endMs - window.startMs + 1;
          return width >= minimumWidth && width <= maximumWidth;
        });
      const targetWindow = windows.find((window) => window.startMs > 6_000 &&
        window.endMs < 12_000);
      if (!targetWindow) continue;
      const skipSegment = step.key === 'decide_skip' ? {
        startMs: Math.floor(targetWindow.startMs - 2 * traversalMs),
        endMs: Math.floor(targetWindow.startMs - traversalMs),
      } : null;
      if (skipSegment && (skipSegment.startMs < 0 ||
        scanOpenWindows(probe, skipSegment.startMs, skipSegment.endMs)
          .some((window) => window.endMs - window.startMs + 1 >= 160))) continue;
      const targetMs = Math.floor((targetWindow.startMs + targetWindow.endMs) / 2);
      selected = {
        id: `open-window-v${bankVersion}:${step.key}:${variant}`,
        stepKey: step.key,
        role: variant === 0 ? 'demonstration' : variant === 1 ? 'practice' : 'check',
        sessionSeed, shotIndex: 1, goalieId,
        startMs: targetMs - 6_000,
        endMs: step.key === 'pace_three_minutes' ? targetMs - 6_000 + 180_000
          : step.key === 'pace_faster' ? targetMs - 6_000 + 60_000
            : step.key === 'pace_short' ? targetMs - 6_000 + 30_000
              : targetMs + 2_000,
        targetMs, targetWindow,
        ...(skipSegment ? { skipSegment } : {}),
        bankVersion, gameCoreVersion: GAME_CORE_VERSION,
      };
    }
    if (!selected) throw new Error(`No first-period scene found for ${step.key} variant ${variant}`);
    scenes.push(selected);
  }
}

const destination = new URL('../src/openWindowTrainingBank.json', import.meta.url);
writeFileSync(destination, `${JSON.stringify(scenes, null, 2)}\n`);
process.stdout.write(`Generated ${scenes.length} first-period open-window scenes\n`);
