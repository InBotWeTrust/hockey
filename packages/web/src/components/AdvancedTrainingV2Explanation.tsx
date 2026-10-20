import { classifyMarksmanshipV6Score, getAdvancedTrainingV2Side,
  type AdvancedTrainingV2Scenario,
  type AdvancedTrainingV2Side, type AdvancedTrainingV2Technique,
  type MarksmanshipV6Measurements, type ShotResult } from '@hockey/game-core';

export const ADVANCED_TRAINING_V2_TITLES: Record<AdvancedTrainingV2Technique, string> = {
  near_goalie: 'Вратарь рядом', counter_direction: 'Противоход',
  complex: 'Сложный', precise: 'Меткий', behind_goalie: 'За вратаря',
  corner: 'Сложный в углу', edge: 'На грани', super_precise: 'Суперметкий',
};

export type TrainingMotionDirection = 'left' | 'right' | 'still';

export function getAdvancedTrainingV2StopHint(scenario: AdvancedTrainingV2Scenario,
  directions: { player: TrainingMotionDirection; goal: TrainingMotionDirection;
    goalie: TrainingMotionDirection }): { situation: string; instruction: string } {
  const motion = (direction: TrainingMotionDirection, plural: boolean) =>
    direction === 'still' ? plural ? 'стоят' : 'стоит' :
      `${plural ? 'движутся' : 'движется'} ${direction === 'left' ? 'влево' : 'вправо'}`;
  const condition: Record<AdvancedTrainingV2Technique, string> = {
    near_goalie: 'К прилёту шайбы вратарь окажется снаружи ворот, но ещё рядом с ними.',
    counter_direction: 'К прилёту шайбы ты и ворота движетесь в противоположные стороны, а вратарь окажется вне ворот.',
    complex: 'К прилёту шайбы вратарь перекроет часть ворот, оставив открытый просвет.',
    precise: 'К прилёту шайбы рядом с вратарём останется узкий просвет.',
    behind_goalie: 'К прилёту шайбы откроется просвет за вратарём.',
    corner: `У ${scenario.side === 'left' ? 'левого' : 'правого'} борта к прилёту шайбы останется просвет в углу.`,
    edge: 'При прилёте шайба пройдёт рядом с вратарём, почти задев его.',
    super_precise: 'К прилёту шайбы рядом с вратарём останется совсем маленький просвет.',
  };
  const playerMotion = directions.player === 'still' ? 'стоишь' :
    `движешься ${directions.player === 'left' ? 'влево' : 'вправо'}`;
  return {
    situation: `Ты ${playerMotion}, ворота ${motion(directions.goal, true)}, вратарь ${motion(directions.goalie, false)}. ${condition[scenario.technique]}`,
    instruction: 'Бросай сейчас: шайбе нужно время долететь до ворот.',
  };
}

type Evaluation = {
  result: ShotResult;
  actualTechnique: AdvancedTrainingV2Technique | 'ordinary' | null;
  actualSide: AdvancedTrainingV2Side | null;
  success: boolean;
  measurements: MarksmanshipV6Measurements | null;
};

export function getAdvancedTrainingV2Explanation(scenario: AdvancedTrainingV2Scenario,
  evaluation: Evaluation): string {
  if (!evaluation.success || evaluation.result.type !== 'goal' || !evaluation.measurements) {
    throw new Error('Demonstration scenario did not produce the selected category');
  }
  const sideCopy = scenario.side === 'left' ? 'слева' : 'справа';
  const scenes: Record<AdvancedTrainingV2Technique, string> = {
    near_goalie: `Пока шайба летела, вратарь оказался ${sideCopy} от ворот. Ты попал в открывшиеся ворота, пока он ещё был рядом.`,
    counter_direction: 'Ты и ворота двигались в противоположную сторону. Вратарь вышел за пределы ворот, и шайба попала в открывшийся створ.',
    complex: `Вратарь закрывал часть ворот, но ${sideCopy} от него оставался открытый участок. Шайба прошла именно туда.`,
    precise: `Вратарь закрывал часть ворот. Ты нашёл узкий проход ${sideCopy} от него и попал в него.`,
    behind_goalie: 'Ты двигался в одну сторону, а ворота и вратарь – в другую. За вратарём открылся проход, и шайба прошла туда.',
    corner: `У ${scenario.side === 'left' ? 'левого' : 'правого'} борта между вратарём и краем ворот остался открытый участок. Шайба попала в него.`,
    edge: 'Шайба прошла совсем рядом с вратарём, почти задев его, и попала в ворота.',
    super_precise: `Вратарь почти закрыл ворота. ${sideCopy === 'слева' ? 'Слева' : 'Справа'} от него остался совсем узкий проход, и ты попал точно в него.`,
  };
  return `Это «${ADVANCED_TRAINING_V2_TITLES[scenario.technique]}». ${scenes[scenario.technique]}`;
}

export function getAdvancedTrainingV2FailureExplanation(scenario: AdvancedTrainingV2Scenario,
  actual: AdvancedTrainingV2Technique | 'ordinary' | null,
  m: MarksmanshipV6Measurements | null): string {
  const actualName = actual === 'ordinary' ? 'Простой бросок' : actual
    ? ADVANCED_TRAINING_V2_TITLES[actual] : 'Другая ситуация';
  const targetName = ADVANCED_TRAINING_V2_TITLES[scenario.technique];
  if (!m) return `Получился «${actualName}», но положение ворот и вратаря не удалось разобрать.\n\nПопробуй ещё раз, чтобы получился «${targetName}».`;
  const overlaps = m.goalieMax >= m.goalMin && m.goalieMin <= m.goalMax;
  const outerGap = overlaps ? 0 : Math.max(m.goalMin - m.goalieMax, m.goalieMin - m.goalMax);
  const actualReason: Record<AdvancedTrainingV2Technique | 'ordinary', string> = {
    ordinary: overlaps ? 'положение вратаря не подошло под нужную ситуацию'
      : outerGap > 75 ? 'вратарь уже был далеко от ворот'
        : 'вратарь стоял вплотную к воротам',
    near_goalie: 'вратарь вышел за пределы ворот, но ещё был рядом',
    counter_direction: 'ты и ворота двигались в разные стороны, а вратарь был рядом с воротами',
    complex: 'вратарь закрывал часть ворот, оставив открытый участок',
    precise: 'шайба прошла через узкий проход рядом с вратарём',
    behind_goalie: 'ты бросил в проход за вратарём на встречном движении',
    corner: 'проход открылся у борта площадки',
    edge: 'шайба прошла почти вплотную к вратарю',
    super_precise: 'шайба прошла в совсем узкий проход рядом с вратарём',
  };
  const firstParagraph = `Получился «${actualName}», ${actualReason[actual ?? 'ordinary']}.`;
  const condition: Record<AdvancedTrainingV2Technique, string> = {
    near_goalie: 'Дождись, когда вратарь выйдет за пределы ворот, но будет около них, чтобы вышел «Вратарь рядом».',
    counter_direction: 'Бросай, когда ты и ворота движетесь в разные стороны, а вратарь находится около ворот, чтобы вышел «Противоход».',
    complex: 'Дождись, когда вратарь закроет часть ворот, оставив открытый участок, чтобы вышел «Сложный».',
    precise: 'Найди узкий проход между вратарём и краем ворот, чтобы вышел «Меткий».',
    behind_goalie: 'Двигайся против ворот и вратаря и бросай в проход за ним, чтобы вышел «За вратаря».',
    corner: 'Дождись положения у борта, когда между вратарём и краем ворот останется открытый участок, чтобы вышел «Сложный в углу».',
    edge: 'Проведи шайбу как можно ближе к вратарю, но не задень его, чтобы вышел «На грани».',
    super_precise: 'Дождись совсем узкого прохода между вратарём и краем ворот, чтобы вышел «Суперметкий».',
  };
  const targetAvailable = classifyMarksmanshipV6Score(m).availableTechniques.includes(scenario.technique);
  const targetSide = targetAvailable ? getAdvancedTrainingV2Side(scenario.technique, m) : null;
  if (targetAvailable && targetSide === scenario.side) {
    return `${firstParagraph} Этот бросок подошёл и для «${targetName}», но другая ситуация получила приоритет.\n\n${condition[scenario.technique]}`;
  }
  if (targetAvailable && targetSide !== scenario.side) {
    const sideDescription = (value: AdvancedTrainingV2Side, future: boolean) => {
      const left = value === 'left';
      if (scenario.technique === 'near_goalie') {
        return `вратарь ${future ? 'окажется' : 'был'} ${left ? 'слева' : 'справа'} от ворот`;
      }
      if (scenario.technique === 'corner') {
        return `ситуация ${future ? 'возникнет' : 'возникла'} у ${left ? 'левого' : 'правого'} борта`;
      }
      if (scenario.technique === 'counter_direction' || scenario.technique === 'behind_goalie') {
        return `ты ${future ? 'будешь двигаться' : 'двигался'} ${left ? 'влево' : 'вправо'}`;
      }
      return `шайба ${future ? 'пройдёт' : 'прошла'} ${left ? 'слева' : 'справа'} от вратаря`;
    };
    return `${firstParagraph} «${targetName}» тоже возник, но ${sideDescription(targetSide!, false)}.\n\nДождись момента, когда ${sideDescription(scenario.side, true)}.`;
  }
  return `${firstParagraph}\n\n${condition[scenario.technique]}`;
}
