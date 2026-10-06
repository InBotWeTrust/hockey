import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { FIGHT_ART } from './fightArt.js';
export type FighterPose =
  | 'idle'
  | 'attack_head'
  | 'attack_body'
  | 'block_head'
  | 'block_body'
  | 'hit'
  | 'lose';
export const FIGHT_ASSETS = ['/sprites/fight/jersey-atlas-v1.png'] as const;

/** Prepared pose frames share a canvas and skate baseline. The opponent is mirrored. */
export class Fighter {
  readonly view = new Container();
  private readonly sprite: Sprite;
  private readonly textures: Record<FighterPose, Texture>;
  private pose: FighterPose = 'idle';

  constructor(private readonly side: 0 | 1) {
    const atlas = Assets.get<Texture>(FIGHT_ASSETS[0]);
    this.textures = Object.fromEntries(
      Object.entries(FIGHT_ART.frames).map(([pose, frame]) => [
        pose,
        new Texture({
          source: atlas.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
          orig: new Rectangle(0, 0, FIGHT_ART.canvas.width, FIGHT_ART.canvas.height),
          trim: new Rectangle(
            frame.offsetX,
            FIGHT_ART.canvas.height * 0.9 - frame.height,
            frame.width,
            frame.height,
          ),
        }),
      ]),
    ) as Record<FighterPose, Texture>;
    this.sprite = new Sprite(this.textures.idle);
    this.sprite.anchor.set(0.5, 0.9);
    this.view.addChild(this.sprite);
    this.view.on('destroyed', () => {
      for (const texture of Object.values(this.textures)) texture.destroy(false);
    });
  }

  get size(): { width: number; height: number } {
    return { width: this.sprite.width, height: this.sprite.height };
  }

  private project(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.sprite.x + point.x * this.sprite.scale.x,
      y: this.sprite.y + point.y * this.sprite.scale.y,
    };
  }
  get targets(): { head: { x: number; y: number }; body: { x: number; y: number } } {
    const points = FIGHT_ART.landmarks[this.pose];
    return { head: this.project(points.head), body: this.project(points.body) };
  }
  get contact(): { x: number; y: number } {
    return this.project(FIGHT_ART.landmarks[this.pose].contact);
  }

  update(
    pose: FighterPose,
    width: number,
    height: number,
    reducedMotion: boolean,
    reaction?: { kind: 'hit' | 'guard' | 'strike' | 'blocked'; progress: number },
    preparation?: number,
  ): void {
    this.pose = pose;
    this.sprite.texture = this.textures[pose];
    const scale = Math.min(width / FIGHT_ART.canvas.width, height / FIGHT_ART.canvas.height);
    this.sprite.scale.set(this.side === 0 ? scale : -scale, scale);
    const tint = pose === 'hit' ? 0xffb0a6 : pose === 'lose' ? 0xb9c6d0 : 0xffffff;
    const brightness = this.side === 1 ? 0.66 : 1;
    this.sprite.tint =
      (Math.round(((tint >> 16) & 255) * brightness) << 16) |
      (Math.round(((tint >> 8) & 255) * brightness) << 8) |
      Math.round((tint & 255) * brightness);
    const pulse = reaction ? Math.sin(Math.PI * Math.min(1, reaction.progress)) : 0;
    const direction = this.side === 0 ? 1 : -1;
    const recoil =
      reaction?.kind === 'hit'
        ? -12
        : reaction?.kind === 'blocked'
          ? -7
          : reaction?.kind === 'strike'
            ? 8
            : -3;
    this.sprite.x = reducedMotion
      ? 0
      : direction *
        (preparation !== undefined ? 8 * Math.sin((Math.PI * preparation) / 2) : recoil * pulse);
    this.sprite.y = reducedMotion ? 0 : -2 * pulse;
    // Actions use authored arm poses rather than rotating the entire body.
    this.sprite.rotation = 0;
  }
}
