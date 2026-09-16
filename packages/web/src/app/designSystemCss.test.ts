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
