import { Container, Graphics } from 'pixi.js';
import type { GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

export class Goalie {
  readonly container = new Container();
  private readonly body = new Graphics();

  constructor() {
    this.container.addChild(this.body);
  }

  update(state: GoalieState, scale: Scale): void {
    const w = state.width * scale.factor;
    const h = state.height * scale.factor;

    this.body.clear();
    this.body
      .roundRect(-w / 2, -h / 2, w, h, 6 * scale.factor)
      .fill(0x0b2e5c)
      .stroke({ color: 0xffffff, width: 2 * scale.factor });

    this.container.position.set(
      state.position.x * scale.factor + scale.offsetX,
      state.position.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
