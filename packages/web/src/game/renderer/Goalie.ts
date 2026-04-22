import { Container, Graphics } from 'pixi.js';
import type { GoalieState } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const RED = 0xe23636;
const RED_DARK = 0xb52828;
const WHITE = 0xffffff;
const HELMET = 0xf5f5f5;
const CAGE = 0x1f2937;
const STICK = 0x6d4a1e;
const GLOVE = 0x9a1f1f;

export class Goalie {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();

  constructor() {
    this.container.addChild(this.shadow);
    this.container.addChild(this.body);
  }

  update(state: GoalieState, scale: Scale, offsetRinkX = 0): void {
    const s = scale.factor;
    const w = state.width * s;
    const h = state.height * s;

    this.shadow.clear();
    this.shadow
      .ellipse(0, h / 2 + 3 * s, w * 0.42, 4 * s)
      .fill({ color: 0x0f172a, alpha: 0.2 });

    this.body.clear();

    const padW = w * 0.78;
    const padH = h * 0.95;
    this.body
      .roundRect(-padW / 2, -padH / 2, padW, padH, 6 * s)
      .fill(RED)
      .stroke({ color: RED_DARK, width: 1.5 * s });

    this.body
      .rect(-padW / 2 + 2 * s, -padH / 4, padW - 4 * s, padH / 8)
      .fill(WHITE);

    const helmetR = h * 0.42;
    this.body
      .circle(0, -padH / 2 - helmetR * 0.2, helmetR)
      .fill(HELMET)
      .stroke({ color: CAGE, width: 1.2 * s });
    this.body
      .rect(-helmetR * 0.8, -padH / 2 - helmetR * 0.45, helmetR * 1.6, helmetR * 0.5)
      .fill(CAGE);

    const gloveR = h * 0.36;
    this.body
      .circle(-padW / 2 - gloveR * 0.4, 0, gloveR)
      .fill(GLOVE)
      .stroke({ color: RED_DARK, width: 1 * s });
    this.body
      .roundRect(padW / 2 - 2 * s, -gloveR * 0.9, gloveR * 1.1, gloveR * 1.8, 3 * s)
      .fill(RED_DARK);

    this.body
      .moveTo(-padW / 2 - gloveR * 0.2, gloveR * 0.2)
      .lineTo(-padW / 2 - gloveR * 1.4, padH / 2 + 12 * s)
      .stroke({ color: STICK, width: 3 * s, cap: 'round' });
    this.body
      .rect(-padW / 2 - gloveR * 1.55, padH / 2 + 10 * s, 18 * s, 4 * s)
      .fill(STICK);

    this.container.position.set(
      (state.position.x + offsetRinkX) * scale.factor + scale.offsetX,
      state.position.y * scale.factor + scale.offsetY,
    );
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
