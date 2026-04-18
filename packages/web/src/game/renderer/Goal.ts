import { Container, Graphics } from 'pixi.js';
import { GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Goal {
  readonly container = new Container();
  private readonly net = new Graphics();
  private readonly posts = new Graphics();

  constructor() {
    this.container.addChild(this.net);
    this.container.addChild(this.posts);
  }

  update(scale: Scale): void {
    const toX = (x: number): number => x * scale.factor;
    const toY = (y: number): number => y * scale.factor;

    this.net.clear();
    this.net
      .rect(toX(GOAL.x), toY(GOAL.y), toX(GOAL.width), toY(GOAL.height))
      .fill({ color: 0xffffff, alpha: 0.55 })
      .stroke({ color: 0x0b2e5c, width: 2 * scale.factor });

    this.posts.clear();
    for (const post of [GOAL.leftPost, GOAL.rightPost]) {
      this.posts
        .rect(toX(post.x), toY(post.y), toX(post.width), toY(post.height))
        .fill(0xff0000);
    }

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
