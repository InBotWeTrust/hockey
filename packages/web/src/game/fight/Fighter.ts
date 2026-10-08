import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { FIGHT_ART } from './fightArt.js';
export type FighterPose =
  | 'crouch'
  | 'crouch_block'
  | 'crouch_attack'
  | 'idle'
  | 'windup_head'
  | 'windup_body'
  | 'attack_head'
  | 'attack_body'
  | 'block_head'
  | 'block_body'
  | 'hit'
  | 'lose';
export const FIGHT_ASSETS = ['/sprites/fight/jersey-atlas-v1.png','/sprites/fight/crouch-atlas-v1.webp'] as const;

/** Prepared pose frames share a canvas and skate baseline. The opponent is mirrored. */
export class Fighter {
  readonly view = new Container();
  private readonly sprite: Sprite;
  private readonly fallSprite: Sprite;
  private readonly transitionSprite: Sprite;
  private readonly textures: Record<Exclude<FighterPose, 'windup_head' | 'windup_body'>, Texture>;
  private pose: Exclude<FighterPose, 'windup_head' | 'windup_body'> = 'idle';

  constructor(private readonly side: 0 | 1) {
    const atlas = Assets.get<Texture>(FIGHT_ASSETS[0]);
    const crouchAtlas = Assets.get<Texture>(FIGHT_ASSETS[1]);
    this.textures = Object.fromEntries(
      Object.entries(FIGHT_ART.frames).map(([pose, frame]) => [
        pose,
        new Texture({
          source: (pose.startsWith('crouch') ? crouchAtlas : atlas).source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
          orig: new Rectangle(0, 0, FIGHT_ART.canvas.width, FIGHT_ART.canvas.height),
          trim: new Rectangle(
            frame.offsetX,
            'offsetY' in frame ? frame.offsetY : FIGHT_ART.canvas.height * 0.9 - frame.height,
            frame.width,
            frame.height,
          ),
        }),
      ]),
    ) as Record<Exclude<FighterPose, 'windup_head' | 'windup_body'>, Texture>;
    this.sprite = new Sprite(this.textures.idle);
    this.sprite.anchor.set(0.5, 0.9);
    this.view.addChild(this.sprite);
    this.fallSprite = new Sprite(this.textures.hit);
    this.fallSprite.anchor.set(0.5, 0.9);
    this.fallSprite.visible = false;
    this.view.addChild(this.fallSprite);
    this.transitionSprite = new Sprite(this.textures.block_head);
    this.transitionSprite.anchor.set(0.5,0.9);
    this.transitionSprite.visible=false;
    this.view.addChild(this.transitionSprite);
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
    fallProgress?: number,
    motion?: number,
    recovery?: number,
  ): void {
    const windup = pose === 'windup_head' || pose === 'windup_body';
    this.pose = windup ? (pose === 'windup_head' ? 'block_head' : 'block_body') : pose;
    this.sprite.texture = this.textures[this.pose];
    const scale = Math.min(width / FIGHT_ART.canvas.width, height / FIGHT_ART.canvas.height);
    this.sprite.scale.set(this.side === 0 ? scale : -scale, scale);
    const tint =
      pose === 'hit' ? 0xffb0a6 : pose === 'lose' ? 0xb9c6d0 : windup ? 0xffe2ac : 0xffffff;
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
        (preparation !== undefined ? -10 * Math.sin((Math.PI * preparation) / 2) : recoil * pulse);
    if (!reducedMotion && motion !== undefined) this.sprite.x += direction * motion * scale;
    this.sprite.y = reducedMotion ? 0 : -2 * pulse;
    // Actions use authored arm poses rather than rotating the entire body.
    this.sprite.rotation = 0;
    const falling =
      pose === 'lose' && fallProgress !== undefined && fallProgress < 1 && !reducedMotion;
    this.sprite.alpha = falling ? fallProgress! : 1;
    this.fallSprite.visible = falling;
    const retracting=recovery!==undefined&&recovery>0&&recovery<1&&!reducedMotion&&(pose==='attack_head'||pose==='attack_body'||pose==='crouch_attack');
    this.transitionSprite.visible=retracting;
    if(retracting){
      this.transitionSprite.texture=this.textures[pose==='crouch_attack'?'crouch_block':pose==='attack_head'?'block_head':'block_body'];
      this.transitionSprite.scale.copyFrom(this.sprite.scale);this.transitionSprite.tint=this.sprite.tint;
      this.transitionSprite.position.copyFrom(this.sprite.position);this.transitionSprite.alpha=recovery!;this.sprite.alpha=1-recovery!;
    }
    if (falling) {
      this.fallSprite.scale.copyFrom(this.sprite.scale);
      this.fallSprite.tint = this.sprite.tint;
      this.fallSprite.position.set(this.sprite.x, fallProgress! * 24 * scale);
      this.fallSprite.alpha = 1 - fallProgress!;
    }
  }
}
