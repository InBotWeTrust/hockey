import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MARKSMANSHIP_V6_SCORING_RULES,
  GAME_CORE_VERSION,
  classifyMarksmanshipV6Score,
  deriveShotSeed,
  getAdvancedTrainingV2Side,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  resolveMarksmanshipShotContext,
  type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side,
  type AdvancedTrainingV2Technique,
  type AdvancedTrainingV2Stage,
} from '../packages/game-core/src/index.js';

const techniques: readonly AdvancedTrainingV2Technique[] = [
  'near_goalie', 'counter_direction', 'complex', 'precise',
  'behind_goalie', 'corner', 'edge', 'super_precise',
];
const sides: readonly AdvancedTrainingV2Side[] = ['left', 'right'];
const stages: readonly AdvancedTrainingV2Stage[] = [
  'demonstration', 'practice', 'assessment', 'assessment',
];
const speeds = getDailyPeriodSpeedPreset(1);
const speedSnapshot = {
  shooterFrequency: speeds.shooterFrequency,
  goalieFrequency: speeds.goalieFrequency,
  goalFrequency: speeds.goalFrequency,
  puckSpeedPerMs: speeds.puckSpeedPerMs,
};
const goalieId = 'rookie';
const goalie = getGoalie(goalieId);
const bankVersion = 1;
const found = new Map<string, AdvancedTrainingV2Scenario[]>();
for (const technique of techniques) for (const side of sides) found.set(`${technique}:${side}`, []);

for (let seedIndex = 0; seedIndex < 500 && [...found.values()].some((items) => items.length < stages.length);
  seedIndex += 1) {
  const sessionSeed = `advanced-training-v2:bank-${bankVersion}:scene-${seedIndex}`;
  const shotSeed = deriveShotSeed(sessionSeed, 1, 1);
  const phaseOffsets = getSessionPhaseOffsets(sessionSeed);
  const seenInSeed = new Set<string>();
  for (let targetTapTimeMs = 4_000; targetTapTimeMs <= 30_000; targetTapTimeMs += 20) {
    const context = resolveMarksmanshipShotContext({
      shotInput: { tapTime: targetTapTimeMs, shooterTapTime: targetTapTimeMs, ...speedSnapshot },
      goalie, seed: shotSeed, shotIndex: 1, phaseOffsets,
      earliestTapTime: 0, scoring: DEFAULT_MARKSMANSHIP_V6_SCORING_RULES,
    });
    if (context.result.type !== 'goal' || !context.v6Measurements) continue;
    const technique = classifyMarksmanshipV6Score(context.v6Measurements).technique;
    if (technique === 'ordinary') continue;
    const side = getAdvancedTrainingV2Side(technique, context.v6Measurements);
    if (!side) continue;
    const key = `${technique}:${side}`;
    const items = found.get(key)!;
    if (items.length >= stages.length || seenInSeed.has(key)) continue;
    const halfTraverseMs = 500 / speeds.shooterFrequency;
    const turnNumber = Math.floor((targetTapTimeMs + phaseOffsets.shooter) / halfTraverseMs);
    const sceneStartMs = (turnNumber - 4) * halfTraverseMs - phaseOffsets.shooter;
    if (sceneStartMs < 0) continue;
    const stage = stages[items.length]!;
    items.push({
      id: `${technique}-${side}-${stage}-${items.length}`,
      technique, side, stage, sessionSeed, shotSeed, shotIndex: 1,
      goalieId, speeds: speedSnapshot, sceneStartMs, targetTapTimeMs,
      gameCoreVersion: GAME_CORE_VERSION, bankVersion,
    });
    seenInSeed.add(key);
  }
}

const missing = [...found.entries()].filter(([, items]) => items.length !== stages.length);
if (missing.length > 0) {
  throw new Error(`Unable to build advanced training V2 bank: ${missing.map(([key, items]) =>
    `${key}=${items.length}`).join(', ')}`);
}
const scenarios = [...found.values()].flat();
const destination = fileURLToPath(new URL('../packages/game-core/src/advancedTrainingV2Scenarios.ts', import.meta.url));
writeFileSync(destination,
  `import type { AdvancedTrainingV2Scenario } from './advancedTrainingV2.js';\n\n` +
  `export const ADVANCED_TRAINING_V2_BANK_VERSION = ${bankVersion};\n` +
  `export const ADVANCED_TRAINING_V2_SCENARIOS: readonly AdvancedTrainingV2Scenario[] = ` +
  `${JSON.stringify(scenarios, null, 2)};\n`);
process.stdout.write(`Generated ${scenarios.length} validated advanced training V2 scenarios.\n`);
