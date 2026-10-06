import { afterEach, describe, expect, it } from 'vitest';
import { Assets, type Sprite, Texture, TextureSource } from 'pixi.js';
import { Fighter, FIGHT_ASSETS, type FighterPose } from './Fighter.js';
import { FIGHT_ART } from './fightArt.js';

const poses: FighterPose[] = [
  'idle',
  'attack_head',
  'attack_body',
  'block_head',
  'block_body',
  'hit',
  'lose',
];
function prepareAtlas() {
  const texture = new Texture({
    source: new TextureSource({ width: FIGHT_ART.source.width, height: FIGHT_ART.source.height }),
  });
  Assets.cache.set(FIGHT_ASSETS[0], texture);
}
afterEach(() => Assets.cache.remove(FIGHT_ASSETS[0]));
describe('prepared fight artwork', () => {
  it('uses a separate complete frame for each of the seven fighting poses', () => {
    prepareAtlas();
    const fighter = new Fighter(0);
    const frames = poses.map((pose) => {
      fighter.update(pose, 240, 300, true);
      const sprite = fighter.view.children[0] as Sprite;
      return [
        sprite.texture.frame.x,
        sprite.texture.frame.y,
        sprite.texture.frame.width,
        sprite.texture.frame.height,
      ];
    });
    expect(new Set(frames.map((frame) => frame.join(','))).size).toBe(7);
    expect(frames.every((frame) => frame[2]! > 0 && frame[3]! > 0)).toBe(true);
  });
  it('keeps the opponent darker in every pose', () => {
    prepareAtlas();
    const left = new Fighter(0);
    const right = new Fighter(1);
    for (const pose of poses) {
      left.update(pose, 240, 300, true);
      right.update(pose, 240, 300, true);
      expect((right.view.children[0] as Sprite).tint).not.toEqual(
        (left.view.children[0] as Sprite).tint,
      );
    }
  });
  it('recoils after contact while reduced motion keeps the body still', () => {
    prepareAtlas();
    const fighter = new Fighter(1);
    const sprite = fighter.view.children[0] as Sprite;
    fighter.update('hit', 240, 300, false, { kind: 'hit', progress: 0.5 });
    expect(sprite.x).toBeGreaterThan(0);
    fighter.update('hit', 240, 300, true, { kind: 'hit', progress: 0.5 });
    expect(sprite.x).toBe(0);
    expect(sprite.y).toBe(0);
    fighter.update('idle', 240, 300, false);
    expect(sprite.x).toBe(0);
  });
  it('anchors hit feedback to the leaning head and mirrors the landmark for the opponent', () => {
    prepareAtlas();
    const left = new Fighter(0);
    const right = new Fighter(1);
    left.update('hit', 384, 512, true);
    right.update('hit', 384, 512, true);
    expect(left.targets.head).toEqual({ x: -83, y: -334 });
    expect(right.targets.head).toEqual({ x: 83, y: -334 });
    left.update('attack_head', 384, 512, true);
    expect(left.contact).toEqual({ x: 163, y: -324 });
    left.update('attack_body', 384, 512, true);
    expect(left.contact).toEqual({ x: 120, y: -202 });
  });
  it('faces opponents toward each other and preserves the skate baseline across poses', () => {
    prepareAtlas();
    const left = new Fighter(0);
    const right = new Fighter(1);
    for (const pose of poses) {
      left.update(pose, 240, 300, true);
      right.update(pose, 240, 300, true);
      const a = left.view.children[0] as Sprite;
      const b = right.view.children[0] as Sprite;
      expect(a.scale.x).toBeGreaterThan(0);
      expect(b.scale.x).toBeLessThan(0);
      expect(a.anchor.y).toBe(0.9);
      expect(b.anchor.y).toBe(0.9);
      expect(a.rotation).toBe(0);
      expect(b.rotation).toBe(0);
    }
  });
});
