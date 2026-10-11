import { useRef, useLayoutEffect } from 'react';
import type { MarksmanshipScoringRules, MarksmanshipDifficultyCode, MarksmanshipV3Reason, MarksmanshipV4Technique, MarksmanshipV5Technique, MarksmanshipV6Technique } from '@hockey/game-core';
import type { MarksmanshipScoreDetails } from '../api/bonusGames.js';
import type { PlayResultPresentation } from '../game/PlayView.js';

function formatPoints(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value).replaceAll('\u00a0', ' ');
}

export function formatMarksmanshipPoints(value: number, scoring: MarksmanshipScoringRules): string {
  if (scoring.version !== 4 && scoring.version !== 5 && scoring.version !== 6) return formatPoints(value);
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 10)
    .replaceAll('\u00a0', ' ');
}

function marksmanshipV5TechniqueLabel(technique: MarksmanshipV5Technique): string {
  switch (technique) {
    case 'ordinary': return 'Простой';
    case 'near_goalie': return 'Вратарь рядом';
    case 'counter_direction': return 'Противоход';
    case 'precise': return 'Меткий';
    case 'behind_goalie': return 'За вратаря';
    case 'corner': return 'Сложный в углу';
    case 'edge': return 'На грани';
    case 'super_precise': return 'Суперметкий';
  }
}

export function marksmanshipV6TechniqueLabel(technique: MarksmanshipV6Technique): string {
  return technique === 'complex' ? 'Сложный' : marksmanshipV5TechniqueLabel(technique);
}

function marksmanshipV4TechniqueLabel(technique: MarksmanshipV4Technique): string {
  switch (technique) {
    case 'ordinary': return 'Простой';
    case 'near_goalie': return 'Рядом с вратарём';
    case 'board_side': return 'У борта';
    case 'counter_direction': return 'Противоход';
    case 'precise': return 'Меткий';
    case 'behind_goalie': return 'За вратаря';
    case 'super_precise': return 'Суперметкий';
  }
}

function marksmanshipDifficultyLabel(code: MarksmanshipDifficultyCode): string {
  switch (code) {
    case 'open':
      return 'Открытое окно';
    case 'timed':
      return 'Точный момент';
    case 'precise':
      return 'Точное окно';
    case 'narrow':
      return 'Узкое окно';
    case 'very_narrow':
      return 'Очень узкое окно';
    case 'instant':
      return 'Мгновенное окно';
  }
}

function marksmanshipV3ReasonLabel(reason: MarksmanshipV3Reason): string {
  switch (reason) {
    case 'ordinary': return 'Обычный гол';
    case 'timed': return 'Точный момент';
    case 'narrow': return 'Узкий момент';
    case 'instant': return 'Мгновенный момент';
    case 'goalie_covers_goal': return 'Вратарь прикрывает ворота';
    case 'near_goalie': return 'Рядом с вратарём';
    case 'left_board': return 'От левого борта';
    case 'right_board': return 'От правого борта';
    case 'counter_direction': return 'Противоход';
    case 'close_counter_direction': return 'Рядом с уходящим вратарём';
  }
}

export function marksmanshipResultPresentation(input: {
  serverResult: 'goal' | 'save' | 'miss';
  awardedPoints: number;
  difficultyCode: MarksmanshipDifficultyCode | null;
  counterDirection: boolean;
  scoreDetails?: MarksmanshipScoreDetails | null;
  scoring: MarksmanshipScoringRules;
}): PlayResultPresentation | null {
  const details = input.scoreDetails;
  if (input.serverResult !== 'goal') return null;
  if (input.awardedPoints <= 0) return null;
  if (details?.version === 4 || details?.version === 5 || details?.version === 6) {
    if (details.result !== 'goal' || details.technique === null ||
      details.pointsTenths !== input.awardedPoints) return null;
    return {
      breakdown: [{ points: details.pointsTenths, label: details.version === 6
        ? marksmanshipV6TechniqueLabel(details.technique)
        : details.version === 5 ? marksmanshipV5TechniqueLabel(details.technique)
          : marksmanshipV4TechniqueLabel(details.technique) }],
    };
  }
  if (input.difficultyCode === null) return null;
  if (details?.version === 3) {
    if (details.reason === null || details.category !== input.awardedPoints) return null;
    return {
      breakdown: [{ points: input.awardedPoints, label: marksmanshipV3ReasonLabel(details.reason) }],
    };
  }
  if (details?.version === 2) {
    const geometry = details.geometry;
    const breakdown = [
      {
        points: input.awardedPoints - details.seriesBonus - details.situationBonus,
        label: marksmanshipDifficultyLabel(details.difficultyCode ?? input.difficultyCode),
      },
      ...(details.series.type === 'double'
        ? [{ points: details.seriesBonus, label: 'Два за секунду' }]
        : details.series.type === 'triple'
          ? [{ points: details.seriesBonus, label: 'Три за прокат' }]
          : []),
      ...(geometry.counterDirection
        ? [{ points: input.scoring.counterDirectionBonus, label: 'Противоход' }]
        : []),
      ...(geometry.closeToGoalie
        ? [{ points: input.scoring.closeGoalieBonus, label: 'Рядом с вратарём' }]
        : []),
      ...(geometry.behindGoalie
        ? [{ points: input.scoring.behindGoalieBonus, label: 'За вратаря' }]
        : []),
      ...(geometry.boardSide && details.windowDurationMs !== null && details.windowDurationMs < 160
        ? [{ points: input.scoring.boardNarrowBonus, label: 'У борта · узкое окно' }]
        : []),
    ].filter((part) => part.points > 0);
    return { breakdown };
  }
  const technique = input.counterDirection
    ? 'Точный момент · противоход'
    : marksmanshipDifficultyLabel(input.difficultyCode);
  return { breakdown: [{ points: input.awardedPoints, label: technique }] };
}

export function MarksmanshipScoreNotice({
  parts,
  scoring,
}: {
  parts: readonly { points: number; label: string }[];
  scoring: MarksmanshipScoringRules;
}): JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const scoreboard = outer?.parentElement;
    if (!outer || !inner || !scoreboard) return;

    const fit = () => {
      inner.style.setProperty('--marksmanship-label-size', '8px');
      inner.style.setProperty('--marksmanship-value-size', '18px');
      inner.style.setProperty('--marksmanship-part-padding', '10px');
      inner.style.setProperty('--marksmanship-part-gap', '4px');
      const availableWidth = scoreboard.clientWidth - parts.length - 2;
      const naturalWidth = inner.scrollWidth;
      if (availableWidth <= 0 || naturalWidth <= 0) return;
      const scale = Math.min(1, availableWidth / naturalWidth);
      inner.style.setProperty('--marksmanship-label-size', `${8 * scale}px`);
      inner.style.setProperty('--marksmanship-value-size', `${18 * scale}px`);
      inner.style.setProperty('--marksmanship-part-padding', `${10 * scale}px`);
      inner.style.setProperty('--marksmanship-part-gap', `${4 * scale}px`);
    };

    fit();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    resizeObserver?.observe(scoreboard);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(fit);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [parts]);

  return (
    <div
      ref={outerRef}
      className="game-scoreboard game-scoreboard--stable-surface bonus-game-marksmanship-score"
      role="status"
      aria-label="Очки за бросок"
    >
      <div ref={innerRef} className="bonus-game-marksmanship-score__inner">
        {parts.map((part) => (
          <div className="bonus-game-marksmanship-score__part" key={part.label}>
            <span className="game-scoreboard__label">{part.label}</span>
            <strong className="game-scoreboard__value">+{formatMarksmanshipPoints(part.points, scoring)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
