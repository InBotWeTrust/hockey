import { Container, Graphics } from 'pixi.js';
import { GOAL } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const POST_RED = 0xe23636;
const POST_SHADOW = 0xa8212a;
const NET_BG = 0xf1f5f9;
const NET_LINE = 0x94a3b8;

export class Goal {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly net = new Graphics();
  private readonly frame = new Graphics();

  constructor() {
    this.container.addChild(this.shadow);
    this.container.addChild(this.net);
    this.container.addChild(this.frame);
  }

  update(scale: Scale, offsetRinkX = 0): void {
    const s = scale.factor;
    const x = (GOAL.x + offsetRinkX) * s;
    const y = GOAL.y * s;
    const w = GOAL.width * s;
    const h = GOAL.height * s;
    const postW = GOAL.leftPost.width * s;
    const crossbarH = 5 * s;

    this.shadow.clear();
    this.shadow
      .roundRect(x + 2 * s, y + h + 2 * s, w, 6 * s, 3 * s)
      .fill({ color: 0x0f172a, alpha: 0.12 });

    this.net.clear();
    const netX = x + postW;
    const netY = y + crossbarH;
    const netW = w - postW * 2;
    const netH = h - crossbarH;
    this.net.rect(netX, netY, netW, netH).fill(NET_BG);

    const step = 8 * s;
    for (let vx = netX + step; vx < netX + netW; vx += step) {
      this.net
        .moveTo(vx, netY)
        .lineTo(vx, netY + netH)
        .stroke({ color: NET_LINE, width: 1 * s, alpha: 0.7 });
    }
    for (let vy = netY + step; vy < netY + netH; vy += step) {
      this.net
        .moveTo(netX, vy)
        .lineTo(netX + netW, vy)
        .stroke({ color: NET_LINE, width: 1 * s, alpha: 0.7 });
    }

    this.frame.clear();
    this.frame.rect(x, y, w, crossbarH).fill(POST_RED);
    this.frame
      .rect(x, y + crossbarH, postW, h - crossbarH)
      .fill(POST_RED)
      .rect(x + w - postW, y + crossbarH, postW, h - crossbarH)
      .fill(POST_RED);
    this.frame
      .rect(x + postW, y + crossbarH - 1 * s, w - postW * 2, 1.5 * s)
      .fill(POST_SHADOW);

    this.container.position.set(scale.offsetX, scale.offsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
