import { describe, expect, it } from 'vitest';
import { Goalie } from './Goalie.js';
import { Player } from './Player.js';

describe('rink character shadows', () => {
  it('renders the player without a separate shadow layer in every configuration', () => {
    const legacyOptions = { spriteWidth: 66, shadow: true };
    const player = new Player('right', legacyOptions);

    expect(player.container.children).toHaveLength(1);
  });

  it('renders the goalie without a separate shadow layer in every configuration', () => {
    const legacyOptions = { sizeScale: 1, shadow: true };
    const goalie = new Goalie(legacyOptions);

    expect(goalie.container.children).toHaveLength(1);
  });
});
