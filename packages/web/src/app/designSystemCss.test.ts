import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/design-system.css', 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end + 2);
}

describe('design system toast positioning', () => {
  it('anchors inventory purchase notifications to the shared centered top position', () => {
    const inventoryToast = rule('.inventory-purchase-toast');
    expect(inventoryToast).toContain('top: calc(var(--app-safe-top) + 14px)');
    expect(inventoryToast).toContain('left: 50%');
    expect(inventoryToast).not.toContain('bottom:');
    expect(inventoryToast).toContain('animation: duel-challenge-toast-in');
  });
});

describe('initial training scoreboard hint', () => {
  it('centers a content-width notice without exceeding the scoreboard or leaving an orphan word', () => {
    const notice = rule('.initial-training-feedback-notice--scoreboard');
    expect(notice).toContain('width: max-content');
    expect(notice).toContain('max-width: min(86%, 404px)');
    expect(notice).toContain('text-wrap: pretty');
    expect(notice).toContain('white-space: pre-line');
  });
});

describe('duel inventory notices', () => {
  it('uses the same under-scoreboard placement as beginner training feedback', () => {
    const playView = readFileSync('src/game/PlayView.tsx', 'utf8');
    expect(playView).toContain('duel-stumble-notice initial-training-feedback-notice--scoreboard');
    expect(playView).toContain('duel-fatigue-notice initial-training-feedback-notice--scoreboard');
  });

  it('keeps a long fatigue label within the game menu and scales its font on narrow screens', () => {
    const notice = rule('.duel-fatigue-notice.initial-training-feedback-notice--scoreboard');
    expect(notice).toContain('max-width: min(calc(100% - 40px), 316px)');
    expect(notice).toContain('font-size: clamp(9px, 2.75vw, 12px)');
    expect(notice).toContain('white-space: nowrap');
  });
});

describe('bonus game first-clear reward heading', () => {
  it('uses the primary dark ink color to separate it from descriptive copy', () => {
    expect(css).toMatch(/\.bonus-game-card__reward-title\s*\{\s*color: var\(--ink\);\s*\}/);
  });
});

describe('bonus game progress and endurance timer surfaces', () => {
  it('caps the marksmanship breakdown at scoreboard width without horizontal scrolling', () => {
    const notice = rule('.game-scoreboard.bonus-game-marksmanship-score');
    const part = rule('.bonus-game-marksmanship-score__part');
    expect(notice).toContain('max-width: 100%');
    expect(notice).toContain('overflow: hidden');
    expect(notice).not.toContain('overflow-x: auto');
    expect(part).not.toContain('min-width: max-content');
    expect(css).toContain('.bonus-game-marksmanship-score__inner {');
  });

  it('uses the featured bonus card surface for the progress container', () => {
    const progress = rule('.bonus-games-attempt-progress');

    expect(progress).toContain('border: 1px solid rgba(255, 255, 255, 0.94)');
    expect(progress).toContain('border-radius: 22px');
    expect(progress).toContain('background: rgba(237, 244, 250, 0.84)');
    expect(progress).toContain('0 18px 42px rgba(15, 23, 42, 0.18)');
    expect(progress).toContain('0 0 0 2px rgba(74, 144, 226, 0.12)');
    expect(progress).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.9)');
  });

  it('leaves the endurance timer surface to the shared scoreboard class', () => {
    const timer = rule('.bonus-game-endurance-timer');
    const warning = rule('.bonus-game-endurance-timer--warning');
    const danger = rule('.bonus-game-endurance-timer--danger');

    expect(timer).toContain('width: auto');
    expect(timer).toContain('min-width: clamp(120px, 34%, 180px)');
    expect(timer).not.toContain('background:');
    expect(timer).not.toContain('background-color:');
    expect(timer).not.toContain('box-shadow:');
    expect(timer).not.toContain('backdrop-filter:');
    expect(timer).not.toContain('border:');
    expect(warning).toContain('color: #d9ae3d');
    expect(warning).not.toContain('background:');
    expect(warning).not.toContain('box-shadow:');
    expect(danger).toContain('color: #df6b6b');
    expect(danger).not.toContain('background:');
    expect(danger).not.toContain('box-shadow:');
  });
});

describe('bonus game modal depth', () => {
  it('avoids composited card-shaped ghosts while retaining the shared modal geometry', () => {
    const preview = rule('.modal-card.bonus-game-preview-modal');
    const result = rule('.modal-card.bonus-game-result-modal');

    for (const bonusModal of [preview, result]) {
      expect(bonusModal).toContain('background: rgba(226, 233, 241, 0.94)');
      expect(bonusModal).toContain('box-shadow: none');
      expect(bonusModal).toContain('backdrop-filter: none');
    }
  });
});

describe('experience rating scroll containment', () => {
  it('disables scroll chaining and gives the sticky header an opaque surface', () => {
    const viewport = rule('.experience-rating__viewport');
    const header = rule('.tournament-standing-table--experience-rating th');

    expect(viewport).toContain('overscroll-behavior: none');
    expect(header).toContain('background: rgb(186, 195, 208)');
    expect(header).not.toContain('background: transparent');
  });
});

describe('profile story section heading alignment', () => {
  it('keeps story series headings on the shared page-label offset', () => {
    const heading = rule('.profile-story-series > h2');

    expect(heading).toContain('margin: 0 0 -2px -14px');
  });
});

describe('profile story image treatment', () => {
  it('uses the same white image border as other profile cards', () => {
    const image = rule('.profile-story-card > img');

    expect(image).toContain('border: 1px solid rgba(255, 255, 255, 0.88)');
  });
});

describe('profile community and story layout', () => {
  it('keeps the story square while making room for a taller profile card', () => {
    const storyCard = rule('.profile-story-card');
    const communityCard = rule('.profile-community-icon-card');
    const communityGrid = rule('.profile-community-icon-grid');

    expect(storyCard).toContain('aspect-ratio: 1 / 1');
    expect(communityCard).toContain('min-height: 50px');
    expect(communityGrid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(communityGrid).toContain('border-top: 1px solid rgba(100, 116, 139, 0.24)');
    expect(communityGrid).toContain('padding: 12px 2px 0');
  });

  it('gives the profile settings card and its icon one larger size step', () => {
    const settingsCard = rule('.profile-utility-card--settings');
    const settingsIcon = rule('.profile-utility-card--settings .profile-utility-card__visual');

    expect(settingsCard).toContain('min-height: 70px');
    expect(settingsCard).toContain('grid-template-columns: 50px minmax(0, 1fr) 14px');
    expect(settingsIcon).toContain('width: 50px');
    expect(settingsIcon).toContain('height: 50px');
  });

  it('keeps community logos centered and proportional inside their cards', () => {
    const icon = rule('.profile-community-card__icon');
    const vkImage = rule('.profile-community-card__icon--vk img');
    const telegramImage = rule('.profile-community-card__icon--telegram img');

    expect(icon).toContain('width: 50px');
    expect(icon).toContain('height: 50px');
    expect(icon).toContain('aspect-ratio: 1');
    expect(icon).not.toContain('height: 88%');
    expect(icon).toContain('aspect-ratio: 1');
    expect(vkImage).toContain('object-fit: contain');
    expect(vkImage).toContain('object-position: center');
    expect(telegramImage).toContain('object-fit: contain');
    expect(telegramImage).toContain('object-position: center');
  });
});

describe('completed weekly challenge details', () => {
  it('uses the same 10px rhythm above and below the description', () => {
    const details = rule('.weekly-challenge-card__details');
    const detailsDescription = rule(
      '.weekly-challenge-card__details > .weekly-challenge-card__description',
    );

    expect(details).toContain('padding: 10px 16px 16px');
    expect(details).toContain('gap: 10px');
    expect(detailsDescription).toContain('margin-top: 0');
  });
});

describe('completed challenge history modal', () => {
  it('keeps its header fixed while the list scrolls inside an 80% viewport cap', () => {
    const modal = rule('.modal-card.profile-trophy-history-modal');
    const viewport = rule('.profile-trophy-history-modal > div:last-child');

    expect(modal).toContain('80dvh');
    expect(modal).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(modal).toContain('overflow: hidden');
    expect(viewport).toContain('overflow-y: auto');
    expect(viewport).toContain('overscroll-behavior: contain');
  });

  it('uses the duel-style divider below an expanded challenge summary', () => {
    const expandedSummary = rule(
      ".profile-trophy-history__challenge-toggle[aria-expanded='true']",
    );

    expect(expandedSummary).toContain('border-bottom: 1px solid rgba(15, 23, 42, 0.08)');
  });
});
