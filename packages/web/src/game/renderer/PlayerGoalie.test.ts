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

describe('temporary ski goalkeeper pose',()=>{
  it('restores the shot save pose correctly after a skid ends',()=>{
    const goalie=new Goalie();const scale={factor:1,offsetX:0,offsetY:0};
    const state={position:{x:286,y:100},width:30,height:40} as Parameters<Goalie['update']>[0];
    goalie.update(state,scale);const idle=goalie.container.children[0]!.width;
    goalie.setSlipPose(true);goalie.update(state,scale);
    expect(goalie.container.children[0]!.width).toBeGreaterThan(idle);
    const saving=goalie.container.children[0]!.width;
    goalie.setSavePose(true);goalie.setSlipPose(false);goalie.update(state,scale);
    expect(goalie.container.children[0]!.width).toBe(saving);
    goalie.setSavePose(false);goalie.update(state,scale);
    expect(goalie.container.children[0]!.width).toBe(idle);
    goalie.destroy();
  });
});
